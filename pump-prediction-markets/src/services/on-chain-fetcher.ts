/**
 * On-Chain Fetcher - Directly reads pump.fun data from Solana
 * 
 * Fallback when pump.fun API is unavailable.
 * Uses getProgramAccounts to find active bonding curves.
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from '../config/index.js';
import { calculatePriceFromProgress, lamportsToSol } from '../core/math.js';

const PUMP_FUN_PROGRAM_ID = new PublicKey(config.pumpFun.programId);

export interface OnChainToken {
  mint: string;
  bondingCurve: string;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  realSolReserves: bigint;
  realTokenReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  creator: string;
  progressPercent: number;
  currentSol: number;
}

/**
 * Parse bonding curve account data
 */
function parseBondingCurve(data: Buffer, pubkey: string): OnChainToken | null {
  if (data.length < 81) return null;
  
  try {
    // Skip discriminator (8 bytes)
    const virtualTokenReserves = data.readBigUInt64LE(8);
    const virtualSolReserves = data.readBigUInt64LE(16);
    const realTokenReserves = data.readBigUInt64LE(24);
    const realSolReserves = data.readBigUInt64LE(32);
    const tokenTotalSupply = data.readBigUInt64LE(40);
    const complete = data[48] === 1;
    const creator = new PublicKey(data.subarray(49, 81)).toBase58();
    
    // Derive mint from bonding curve
    // The bonding curve PDA is derived from ["bonding-curve", mint]
    // We can't reverse this, so we'll need to store it when we find it
    
    const priceQuote = calculatePriceFromProgress(realSolReserves);
    const progressPercent = Number(priceQuote.progressBps) / 100;
    
    return {
      mint: '', // Will need to be filled in separately
      bondingCurve: pubkey,
      virtualSolReserves,
      virtualTokenReserves,
      realSolReserves,
      realTokenReserves,
      tokenTotalSupply,
      complete,
      creator,
      progressPercent,
      currentSol: lamportsToSol(realSolReserves),
    };
  } catch (e) {
    return null;
  }
}

/**
 * Fetch active bonding curves from the blockchain
 * 
 * WARNING: This can be slow/expensive as it fetches all program accounts.
 * Use sparingly and cache results.
 */
export async function fetchActiveBondingCurves(
  connection: Connection,
  limit: number = 50
): Promise<OnChainToken[]> {
  console.log('Fetching bonding curves from blockchain...');
  
  try {
    // Get all accounts owned by pump.fun program
    // Filter for accounts that look like bonding curves (by size)
    const accounts = await connection.getProgramAccounts(PUMP_FUN_PROGRAM_ID, {
      filters: [
        { dataSize: 81 + 32 }, // Typical bonding curve size
      ],
      commitment: 'confirmed',
    });
    
    console.log(`Found ${accounts.length} potential bonding curve accounts`);
    
    const tokens: OnChainToken[] = [];
    
    for (const account of accounts) {
      const parsed = parseBondingCurve(account.account.data, account.pubkey.toBase58());
      
      if (parsed && !parsed.complete) {
        tokens.push(parsed);
      }
      
      if (tokens.length >= limit) break;
    }
    
    // Sort by progress (most active first)
    tokens.sort((a, b) => b.progressPercent - a.progressPercent);
    
    return tokens.slice(0, limit);
  } catch (error) {
    console.error('Error fetching bonding curves:', error);
    return [];
  }
}

/**
 * Create mock markets for testing when API is down
 */
export function createMockMarkets(): any[] {
  const mockTokens = [
    {
      mint: 'MOCK1111111111111111111111111111111111111111',
      name: 'Test Token Alpha',
      symbol: 'ALPHA',
      description: 'A test token for demonstrating the prediction market system',
      image_uri: 'https://via.placeholder.com/200/4A90A4/ffffff?text=ALPHA',
      bonding_curve: 'BC111111111111111111111111111111111111111111',
      creator: 'Creator11111111111111111111111111111111111',
      progress_bps: 4520, // 45.2%
      real_sol_lamports: '38420000000', // 38.42 SOL
    },
    {
      mint: 'MOCK2222222222222222222222222222222222222222',
      name: 'Moon Rocket',
      symbol: 'MOON',
      description: 'To the moon!',
      image_uri: 'https://via.placeholder.com/200/FFD700/000000?text=MOON',
      bonding_curve: 'BC222222222222222222222222222222222222222222',
      creator: 'Creator22222222222222222222222222222222222',
      progress_bps: 7830, // 78.3%
      real_sol_lamports: '66555000000', // 66.55 SOL
    },
    {
      mint: 'MOCK3333333333333333333333333333333333333333',
      name: 'Diamond Hands',
      symbol: 'DIAMOND',
      description: 'Hold strong',
      image_uri: 'https://via.placeholder.com/200/00CED1/ffffff?text=DIAMOND',
      bonding_curve: 'BC333333333333333333333333333333333333333333',
      creator: 'Creator33333333333333333333333333333333333',
      progress_bps: 1250, // 12.5%
      real_sol_lamports: '10625000000', // 10.625 SOL
    },
    {
      mint: 'MOCK4444444444444444444444444444444444444444',
      name: 'Degen Play',
      symbol: 'DEGEN',
      description: 'High risk, high reward',
      image_uri: 'https://via.placeholder.com/200/FF6B6B/ffffff?text=DEGEN',
      bonding_curve: 'BC444444444444444444444444444444444444444444',
      creator: 'Creator44444444444444444444444444444444444',
      progress_bps: 9120, // 91.2% - almost graduated!
      real_sol_lamports: '77520000000', // 77.52 SOL
    },
    {
      mint: 'MOCK5555555555555555555555555555555555555555',
      name: 'Slow Grower',
      symbol: 'SLOW',
      description: 'Steady wins the race',
      image_uri: 'https://via.placeholder.com/200/98D8C8/000000?text=SLOW',
      bonding_curve: 'BC555555555555555555555555555555555555555555',
      creator: 'Creator55555555555555555555555555555555555',
      progress_bps: 520, // 5.2%
      real_sol_lamports: '4420000000', // 4.42 SOL
    },
  ];
  
  return mockTokens.map(token => ({
    ...token,
    associated_bonding_curve: token.bonding_curve,
    created_at: Math.floor(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random time in last week
    twitter: null,
    telegram: null,
    website: null,
    is_graduated: 0,
    status: 'active',
    expires_at: Math.floor(Date.now() + 7 * 24 * 60 * 60 * 1000),
    yes_pool: '0',
    no_pool: '0',
    updated_at: Math.floor(Date.now()),
  }));
}
