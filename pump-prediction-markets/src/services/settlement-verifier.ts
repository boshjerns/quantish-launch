/**
 * SETTLEMENT VERIFICATION SYSTEM
 * 
 * Ensures markets are settled correctly by:
 * 1. Double-checking on-chain bonding curve state
 * 2. Verifying graduation status
 * 3. Comparing with expected outcomes
 * 4. Logging all verification attempts
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../config/index.js';
import { getMarketByMintPg, query, execute } from '../db/postgres.js';
import { GRADUATION_THRESHOLD_LAMPORTS, lamportsToSol } from '../core/math.js';

// ============================================================================
// TYPES
// ============================================================================

export interface VerificationResult {
  verified: boolean;
  outcome?: 'yes' | 'no';
  confidence: 'high' | 'medium' | 'low';
  details: {
    expectedOutcome: 'yes' | 'no';
    actualProgress: number;  // 0-100%
    isGraduated: boolean;
    solInCurve: number;
    onChainData?: any;
    discrepancies: string[];
  };
  error?: string;
}

export interface SettlementCandidate {
  mint: string;
  symbol: string;
  expectedOutcome: 'yes' | 'no';
  reason: 'graduated' | 'expired' | 'manual';
  expiresAt: number;
  currentProgress: number;
}

// ============================================================================
// PUMP.FUN BONDING CURVE LAYOUT (for direct deserialization)
// ============================================================================

const BONDING_CURVE_SIZE = 146;

interface BondingCurveState {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
}

function parseBondingCurveAccount(data: Buffer): BondingCurveState | null {
  if (data.length < BONDING_CURVE_SIZE) {
    return null;
  }
  
  try {
    // Skip 8-byte discriminator
    let offset = 8;
    
    const virtualTokenReserves = data.readBigUInt64LE(offset);
    offset += 8;
    
    const virtualSolReserves = data.readBigUInt64LE(offset);
    offset += 8;
    
    const realTokenReserves = data.readBigUInt64LE(offset);
    offset += 8;
    
    const realSolReserves = data.readBigUInt64LE(offset);
    offset += 8;
    
    const tokenTotalSupply = data.readBigUInt64LE(offset);
    offset += 8;
    
    const complete = data.readUInt8(offset) === 1;
    
    return {
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      tokenTotalSupply,
      complete,
    };
  } catch (e) {
    console.error('Failed to parse bonding curve:', e);
    return null;
  }
}

// ============================================================================
// VERIFICATION FUNCTIONS
// ============================================================================

/**
 * Verify a market's settlement outcome by checking on-chain state
 */
export async function verifyMarketOutcome(
  mint: string,
  expectedOutcome: 'yes' | 'no'
): Promise<VerificationResult> {
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const discrepancies: string[] = [];
  
  try {
    // 1. Get market from database
    const market = await getMarketByMintPg(mint);
    if (!market) {
      return {
        verified: false,
        confidence: 'low',
        details: {
          expectedOutcome,
          actualProgress: 0,
          isGraduated: false,
          solInCurve: 0,
          discrepancies: ['Market not found in database'],
        },
        error: 'Market not found',
      };
    }
    
    // 2. Fetch on-chain bonding curve state
    const bondingCurvePubkey = new PublicKey(market.bonding_curve);
    const accountInfo = await connection.getAccountInfo(bondingCurvePubkey);
    
    if (!accountInfo) {
      // Account doesn't exist - might be graduated and closed
      return {
        verified: expectedOutcome === 'yes',
        outcome: 'yes',
        confidence: 'medium',
        details: {
          expectedOutcome,
          actualProgress: 100,
          isGraduated: true,
          solInCurve: 0,
          discrepancies: ['Bonding curve account not found (likely graduated)'],
        },
      };
    }
    
    // 3. Parse on-chain state
    const onChainState = parseBondingCurveAccount(accountInfo.data);
    if (!onChainState) {
      return {
        verified: false,
        confidence: 'low',
        details: {
          expectedOutcome,
          actualProgress: 0,
          isGraduated: false,
          solInCurve: 0,
          discrepancies: ['Failed to parse bonding curve data'],
        },
        error: 'Failed to parse on-chain data',
      };
    }
    
    // 4. Calculate actual progress
    const actualProgress = Number(onChainState.realSolReserves * 10000n / GRADUATION_THRESHOLD_LAMPORTS) / 100;
    const solInCurve = lamportsToSol(onChainState.realSolReserves);
    
    // 5. Determine actual outcome
    let actualOutcome: 'yes' | 'no';
    if (onChainState.complete) {
      actualOutcome = 'yes';
    } else if (Date.now() > market.expires_at) {
      actualOutcome = 'no';
    } else {
      // Market still active - shouldn't be settling yet
      return {
        verified: false,
        confidence: 'high',
        details: {
          expectedOutcome,
          actualProgress,
          isGraduated: onChainState.complete,
          solInCurve,
          onChainData: {
            realSolReserves: onChainState.realSolReserves.toString(),
            complete: onChainState.complete,
          },
          discrepancies: ['Market is still active'],
        },
        error: 'Market is still active, cannot settle yet',
      };
    }
    
    // 6. Check for discrepancies
    const dbProgress = market.progress_bps / 100;
    if (Math.abs(actualProgress - dbProgress) > 5) {
      discrepancies.push(`Progress mismatch: DB=${dbProgress}%, On-chain=${actualProgress}%`);
    }
    
    if (market.is_graduated !== (onChainState.complete ? 1 : 0)) {
      discrepancies.push(`Graduation mismatch: DB=${market.is_graduated}, On-chain=${onChainState.complete}`);
    }
    
    // 7. Verify outcome matches
    const verified = actualOutcome === expectedOutcome;
    
    if (!verified) {
      discrepancies.push(`Outcome mismatch: Expected=${expectedOutcome}, Actual=${actualOutcome}`);
    }
    
    return {
      verified,
      outcome: actualOutcome,
      confidence: discrepancies.length === 0 ? 'high' : discrepancies.length < 2 ? 'medium' : 'low',
      details: {
        expectedOutcome,
        actualProgress,
        isGraduated: onChainState.complete,
        solInCurve,
        onChainData: {
          realSolReserves: onChainState.realSolReserves.toString(),
          virtualSolReserves: onChainState.virtualSolReserves.toString(),
          complete: onChainState.complete,
        },
        discrepancies,
      },
    };
  } catch (error: any) {
    console.error('Verification error:', error);
    return {
      verified: false,
      confidence: 'low',
      details: {
        expectedOutcome,
        actualProgress: 0,
        isGraduated: false,
        solInCurve: 0,
        discrepancies: [`Verification error: ${error.message}`],
      },
      error: error.message,
    };
  }
}

/**
 * Find markets that are ready to be settled
 */
export async function findSettlementCandidates(): Promise<SettlementCandidate[]> {
  const now = Date.now();
  const candidates: SettlementCandidate[] = [];
  
  // Find expired markets
  const expired = await query(`
    SELECT mint, symbol, progress_bps, expires_at, is_graduated
    FROM tokens
    WHERE status = 'active' AND expires_at <= $1
  `, [now]);
  
  for (const market of expired) {
    candidates.push({
      mint: market.mint,
      symbol: market.symbol,
      expectedOutcome: market.is_graduated ? 'yes' : 'no',
      reason: 'expired',
      expiresAt: market.expires_at,
      currentProgress: market.progress_bps / 100,
    });
  }
  
  // Find graduated markets
  const graduated = await query(`
    SELECT mint, symbol, progress_bps, expires_at
    FROM tokens
    WHERE status = 'active' AND is_graduated = 1
  `);
  
  for (const market of graduated) {
    candidates.push({
      mint: market.mint,
      symbol: market.symbol,
      expectedOutcome: 'yes',
      reason: 'graduated',
      expiresAt: market.expires_at,
      currentProgress: market.progress_bps / 100,
    });
  }
  
  return candidates;
}

/**
 * Auto-settle markets that are ready with verification
 */
export async function autoSettleWithVerification(): Promise<{
  processed: number;
  settled: number;
  failed: string[];
}> {
  const candidates = await findSettlementCandidates();
  const failed: string[] = [];
  let settled = 0;
  
  for (const candidate of candidates) {
    console.log(`🔍 Verifying settlement for ${candidate.symbol} (${candidate.mint})`);
    
    const verification = await verifyMarketOutcome(candidate.mint, candidate.expectedOutcome);
    
    // Log verification attempt
    await execute(`
      INSERT INTO audit_log (action, market_mint, details, created_at)
      VALUES ($1, $2, $3, $4)
    `, [
      'SETTLEMENT_VERIFICATION',
      candidate.mint,
      JSON.stringify({
        candidate,
        verification,
      }),
      Date.now(),
    ]);
    
    if (!verification.verified) {
      console.warn(`⚠️  Verification failed for ${candidate.symbol}: ${verification.error}`);
      failed.push(`${candidate.symbol}: ${verification.error || 'Verification failed'}`);
      continue;
    }
    
    if (verification.confidence === 'low') {
      console.warn(`⚠️  Low confidence for ${candidate.symbol}, skipping auto-settle`);
      failed.push(`${candidate.symbol}: Low confidence settlement`);
      continue;
    }
    
    // Proceed with settlement (would call settleMarketSafe here)
    console.log(`✅ Verified ${candidate.symbol} outcome: ${verification.outcome}`);
    settled++;
  }
  
  return {
    processed: candidates.length,
    settled,
    failed,
  };
}

/**
 * Get verification status for all active markets
 */
export async function getMarketHealthReport(): Promise<{
  total: number;
  healthy: number;
  warnings: number;
  issues: { mint: string; symbol: string; issue: string }[];
}> {
  const markets = await query(`
    SELECT mint, symbol, bonding_curve, progress_bps, real_sol_lamports, is_graduated, expires_at
    FROM tokens
    WHERE status = 'active'
  `);
  
  const issues: { mint: string; symbol: string; issue: string }[] = [];
  let warnings = 0;
  
  const connection = new Connection(config.rpcUrl, 'confirmed');
  
  for (const market of markets) {
    try {
      const bondingCurvePubkey = new PublicKey(market.bonding_curve);
      const accountInfo = await connection.getAccountInfo(bondingCurvePubkey);
      
      if (!accountInfo && !market.is_graduated) {
        issues.push({
          mint: market.mint,
          symbol: market.symbol,
          issue: 'Bonding curve account not found but not marked graduated',
        });
        continue;
      }
      
      if (accountInfo) {
        const onChainState = parseBondingCurveAccount(accountInfo.data);
        if (onChainState) {
          const dbSol = BigInt(market.real_sol_lamports);
          const chainSol = onChainState.realSolReserves;
          
          // Check for > 10% discrepancy
          const diff = dbSol > chainSol ? dbSol - chainSol : chainSol - dbSol;
          if (diff * 100n / (chainSol || 1n) > 10n) {
            warnings++;
            issues.push({
              mint: market.mint,
              symbol: market.symbol,
              issue: `SOL mismatch >10%: DB=${lamportsToSol(dbSol)}, Chain=${lamportsToSol(chainSol)}`,
            });
          }
        }
      }
    } catch (e) {
      // Skip individual errors
    }
  }
  
  return {
    total: markets.length,
    healthy: markets.length - issues.length,
    warnings,
    issues,
  };
}

 * SETTLEMENT VERIFICATION SYSTEM
 * 
 * Ensures markets are settled correctly by:
 * 1. Double-checking on-chain bonding curve state
 * 2. Verifying graduation status
 * 3. Comparing with expected outcomes
 * 4. Logging all verification attempts
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../config/index.js';
import { getMarketByMintPg, query, execute } from '../db/postgres.js';
import { GRADUATION_THRESHOLD_LAMPORTS, lamportsToSol } from '../core/math.js';

// ============================================================================
// TYPES
// ============================================================================

export interface VerificationResult {
  verified: boolean;
  outcome?: 'yes' | 'no';
  confidence: 'high' | 'medium' | 'low';
  details: {
    expectedOutcome: 'yes' | 'no';
    actualProgress: number;  // 0-100%
    isGraduated: boolean;
    solInCurve: number;
    onChainData?: any;
    discrepancies: string[];
  };
  error?: string;
}

export interface SettlementCandidate {
  mint: string;
  symbol: string;
  expectedOutcome: 'yes' | 'no';
  reason: 'graduated' | 'expired' | 'manual';
  expiresAt: number;
  currentProgress: number;
}

// ============================================================================
// PUMP.FUN BONDING CURVE LAYOUT (for direct deserialization)
// ============================================================================

const BONDING_CURVE_SIZE = 146;

interface BondingCurveState {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
}

function parseBondingCurveAccount(data: Buffer): BondingCurveState | null {
  if (data.length < BONDING_CURVE_SIZE) {
    return null;
  }
  
  try {
    // Skip 8-byte discriminator
    let offset = 8;
    
    const virtualTokenReserves = data.readBigUInt64LE(offset);
    offset += 8;
    
    const virtualSolReserves = data.readBigUInt64LE(offset);
    offset += 8;
    
    const realTokenReserves = data.readBigUInt64LE(offset);
    offset += 8;
    
    const realSolReserves = data.readBigUInt64LE(offset);
    offset += 8;
    
    const tokenTotalSupply = data.readBigUInt64LE(offset);
    offset += 8;
    
    const complete = data.readUInt8(offset) === 1;
    
    return {
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      tokenTotalSupply,
      complete,
    };
  } catch (e) {
    console.error('Failed to parse bonding curve:', e);
    return null;
  }
}

// ============================================================================
// VERIFICATION FUNCTIONS
// ============================================================================

/**
 * Verify a market's settlement outcome by checking on-chain state
 */
export async function verifyMarketOutcome(
  mint: string,
  expectedOutcome: 'yes' | 'no'
): Promise<VerificationResult> {
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const discrepancies: string[] = [];
  
  try {
    // 1. Get market from database
    const market = await getMarketByMintPg(mint);
    if (!market) {
      return {
        verified: false,
        confidence: 'low',
        details: {
          expectedOutcome,
          actualProgress: 0,
          isGraduated: false,
          solInCurve: 0,
          discrepancies: ['Market not found in database'],
        },
        error: 'Market not found',
      };
    }
    
    // 2. Fetch on-chain bonding curve state
    const bondingCurvePubkey = new PublicKey(market.bonding_curve);
    const accountInfo = await connection.getAccountInfo(bondingCurvePubkey);
    
    if (!accountInfo) {
      // Account doesn't exist - might be graduated and closed
      return {
        verified: expectedOutcome === 'yes',
        outcome: 'yes',
        confidence: 'medium',
        details: {
          expectedOutcome,
          actualProgress: 100,
          isGraduated: true,
          solInCurve: 0,
          discrepancies: ['Bonding curve account not found (likely graduated)'],
        },
      };
    }
    
    // 3. Parse on-chain state
    const onChainState = parseBondingCurveAccount(accountInfo.data);
    if (!onChainState) {
      return {
        verified: false,
        confidence: 'low',
        details: {
          expectedOutcome,
          actualProgress: 0,
          isGraduated: false,
          solInCurve: 0,
          discrepancies: ['Failed to parse bonding curve data'],
        },
        error: 'Failed to parse on-chain data',
      };
    }
    
    // 4. Calculate actual progress
    const actualProgress = Number(onChainState.realSolReserves * 10000n / GRADUATION_THRESHOLD_LAMPORTS) / 100;
    const solInCurve = lamportsToSol(onChainState.realSolReserves);
    
    // 5. Determine actual outcome
    let actualOutcome: 'yes' | 'no';
    if (onChainState.complete) {
      actualOutcome = 'yes';
    } else if (Date.now() > market.expires_at) {
      actualOutcome = 'no';
    } else {
      // Market still active - shouldn't be settling yet
      return {
        verified: false,
        confidence: 'high',
        details: {
          expectedOutcome,
          actualProgress,
          isGraduated: onChainState.complete,
          solInCurve,
          onChainData: {
            realSolReserves: onChainState.realSolReserves.toString(),
            complete: onChainState.complete,
          },
          discrepancies: ['Market is still active'],
        },
        error: 'Market is still active, cannot settle yet',
      };
    }
    
    // 6. Check for discrepancies
    const dbProgress = market.progress_bps / 100;
    if (Math.abs(actualProgress - dbProgress) > 5) {
      discrepancies.push(`Progress mismatch: DB=${dbProgress}%, On-chain=${actualProgress}%`);
    }
    
    if (market.is_graduated !== (onChainState.complete ? 1 : 0)) {
      discrepancies.push(`Graduation mismatch: DB=${market.is_graduated}, On-chain=${onChainState.complete}`);
    }
    
    // 7. Verify outcome matches
    const verified = actualOutcome === expectedOutcome;
    
    if (!verified) {
      discrepancies.push(`Outcome mismatch: Expected=${expectedOutcome}, Actual=${actualOutcome}`);
    }
    
    return {
      verified,
      outcome: actualOutcome,
      confidence: discrepancies.length === 0 ? 'high' : discrepancies.length < 2 ? 'medium' : 'low',
      details: {
        expectedOutcome,
        actualProgress,
        isGraduated: onChainState.complete,
        solInCurve,
        onChainData: {
          realSolReserves: onChainState.realSolReserves.toString(),
          virtualSolReserves: onChainState.virtualSolReserves.toString(),
          complete: onChainState.complete,
        },
        discrepancies,
      },
    };
  } catch (error: any) {
    console.error('Verification error:', error);
    return {
      verified: false,
      confidence: 'low',
      details: {
        expectedOutcome,
        actualProgress: 0,
        isGraduated: false,
        solInCurve: 0,
        discrepancies: [`Verification error: ${error.message}`],
      },
      error: error.message,
    };
  }
}

/**
 * Find markets that are ready to be settled
 */
export async function findSettlementCandidates(): Promise<SettlementCandidate[]> {
  const now = Date.now();
  const candidates: SettlementCandidate[] = [];
  
  // Find expired markets
  const expired = await query(`
    SELECT mint, symbol, progress_bps, expires_at, is_graduated
    FROM tokens
    WHERE status = 'active' AND expires_at <= $1
  `, [now]);
  
  for (const market of expired) {
    candidates.push({
      mint: market.mint,
      symbol: market.symbol,
      expectedOutcome: market.is_graduated ? 'yes' : 'no',
      reason: 'expired',
      expiresAt: market.expires_at,
      currentProgress: market.progress_bps / 100,
    });
  }
  
  // Find graduated markets
  const graduated = await query(`
    SELECT mint, symbol, progress_bps, expires_at
    FROM tokens
    WHERE status = 'active' AND is_graduated = 1
  `);
  
  for (const market of graduated) {
    candidates.push({
      mint: market.mint,
      symbol: market.symbol,
      expectedOutcome: 'yes',
      reason: 'graduated',
      expiresAt: market.expires_at,
      currentProgress: market.progress_bps / 100,
    });
  }
  
  return candidates;
}

/**
 * Auto-settle markets that are ready with verification
 */
export async function autoSettleWithVerification(): Promise<{
  processed: number;
  settled: number;
  failed: string[];
}> {
  const candidates = await findSettlementCandidates();
  const failed: string[] = [];
  let settled = 0;
  
  for (const candidate of candidates) {
    console.log(`🔍 Verifying settlement for ${candidate.symbol} (${candidate.mint})`);
    
    const verification = await verifyMarketOutcome(candidate.mint, candidate.expectedOutcome);
    
    // Log verification attempt
    await execute(`
      INSERT INTO audit_log (action, market_mint, details, created_at)
      VALUES ($1, $2, $3, $4)
    `, [
      'SETTLEMENT_VERIFICATION',
      candidate.mint,
      JSON.stringify({
        candidate,
        verification,
      }),
      Date.now(),
    ]);
    
    if (!verification.verified) {
      console.warn(`⚠️  Verification failed for ${candidate.symbol}: ${verification.error}`);
      failed.push(`${candidate.symbol}: ${verification.error || 'Verification failed'}`);
      continue;
    }
    
    if (verification.confidence === 'low') {
      console.warn(`⚠️  Low confidence for ${candidate.symbol}, skipping auto-settle`);
      failed.push(`${candidate.symbol}: Low confidence settlement`);
      continue;
    }
    
    // Proceed with settlement (would call settleMarketSafe here)
    console.log(`✅ Verified ${candidate.symbol} outcome: ${verification.outcome}`);
    settled++;
  }
  
  return {
    processed: candidates.length,
    settled,
    failed,
  };
}

/**
 * Get verification status for all active markets
 */
export async function getMarketHealthReport(): Promise<{
  total: number;
  healthy: number;
  warnings: number;
  issues: { mint: string; symbol: string; issue: string }[];
}> {
  const markets = await query(`
    SELECT mint, symbol, bonding_curve, progress_bps, real_sol_lamports, is_graduated, expires_at
    FROM tokens
    WHERE status = 'active'
  `);
  
  const issues: { mint: string; symbol: string; issue: string }[] = [];
  let warnings = 0;
  
  const connection = new Connection(config.rpcUrl, 'confirmed');
  
  for (const market of markets) {
    try {
      const bondingCurvePubkey = new PublicKey(market.bonding_curve);
      const accountInfo = await connection.getAccountInfo(bondingCurvePubkey);
      
      if (!accountInfo && !market.is_graduated) {
        issues.push({
          mint: market.mint,
          symbol: market.symbol,
          issue: 'Bonding curve account not found but not marked graduated',
        });
        continue;
      }
      
      if (accountInfo) {
        const onChainState = parseBondingCurveAccount(accountInfo.data);
        if (onChainState) {
          const dbSol = BigInt(market.real_sol_lamports);
          const chainSol = onChainState.realSolReserves;
          
          // Check for > 10% discrepancy
          const diff = dbSol > chainSol ? dbSol - chainSol : chainSol - dbSol;
          if (diff * 100n / (chainSol || 1n) > 10n) {
            warnings++;
            issues.push({
              mint: market.mint,
              symbol: market.symbol,
              issue: `SOL mismatch >10%: DB=${lamportsToSol(dbSol)}, Chain=${lamportsToSol(chainSol)}`,
            });
          }
        }
      }
    } catch (e) {
      // Skip individual errors
    }
  }
  
  return {
    total: markets.length,
    healthy: markets.length - issues.length,
    warnings,
    issues,
  };
}

