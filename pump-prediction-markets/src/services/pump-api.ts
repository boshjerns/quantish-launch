/**
 * Pump.fun API functions - No SQLite dependency
 * 
 * Pure API/on-chain fetching without database operations.
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from '../config/index.js';

const PUMP_FUN_PROGRAM_ID = new PublicKey(config.pumpFun.programId);
const PUMP_FUN_API = 'https://frontend-api.pump.fun';

/** Raw token data from pump.fun API */
export interface PumpFunToken {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image_uri: string;
  bonding_curve: string;
  associated_bonding_curve: string;
  creator: string;
  created_timestamp: number;
  complete: boolean;
  virtual_sol_reserves: number;
  virtual_token_reserves: number;
  total_supply: number;
  twitter?: string;
  telegram?: string;
  website?: string;
  market_cap: number;
  usd_market_cap: number;
}

/** On-chain bonding curve state */
export interface BondingCurveState {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
}

/**
 * Fetch tokens from pump.fun API
 */
export async function fetchPumpFunTokens(
  sort: 'created_timestamp' | 'last_trade_timestamp' | 'market_cap' = 'last_trade_timestamp',
  limit: number = 50,
  includeGraduated: boolean = false
): Promise<PumpFunToken[]> {
  try {
    const params = new URLSearchParams({
      offset: '0',
      limit: limit.toString(),
      sort,
      order: 'DESC',
      includeNsfw: 'false',
    });
    
    const response = await fetch(`${PUMP_FUN_API}/coins?${params}`);
    
    if (!response.ok) {
      console.error(`Pump.fun API error: ${response.status}`);
      return [];
    }
    
    const tokens: PumpFunToken[] = await response.json();
    
    if (!includeGraduated) {
      return tokens.filter(t => !t.complete);
    }
    
    return tokens;
  } catch (error) {
    console.error('Error fetching pump.fun tokens:', error);
    return [];
  }
}

/**
 * Parse bonding curve account data
 */
function parseBondingCurveData(data: Buffer): BondingCurveState | null {
  if (data.length < 49) return null;
  
  try {
    return {
      virtualTokenReserves: data.readBigUInt64LE(8),
      virtualSolReserves: data.readBigUInt64LE(16),
      realTokenReserves: data.readBigUInt64LE(24),
      realSolReserves: data.readBigUInt64LE(32),
      tokenTotalSupply: data.readBigUInt64LE(40),
      complete: data[48] === 1,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch bonding curve state from chain
 */
export async function fetchBondingCurveState(
  connection: Connection,
  mintAddress: string
): Promise<BondingCurveState | null> {
  try {
    const mint = new PublicKey(mintAddress);
    
    // Derive bonding curve PDA
    const [bondingCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), mint.toBuffer()],
      PUMP_FUN_PROGRAM_ID
    );
    
    const accountInfo = await connection.getAccountInfo(bondingCurve);
    if (!accountInfo) return null;
    
    return parseBondingCurveData(accountInfo.data);
  } catch (error) {
    console.error(`Error fetching bonding curve for ${mintAddress}:`, error);
    return null;
  }
}

