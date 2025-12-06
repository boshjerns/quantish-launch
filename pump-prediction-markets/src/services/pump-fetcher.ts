import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from '../config/index.js';

const PUMP_FUN_PROGRAM_ID = new PublicKey(config.pumpFun.programId);

export interface BondingCurveData {
  mint: string;
  bondingCurve: string;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  realSolReserves: bigint;
  realTokenReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  creator: string;
}

export interface TokenWithProgress extends BondingCurveData {
  name: string;
  symbol: string;
  imageUri: string;
  associatedBondingCurve: string;
  createdAt: number;
  // Calculated values
  currentSolInCurve: number;
  graduationProgress: number;
  impliedProbability: number;
  marketCap: number;
}

/**
 * Parse bonding curve account data
 * Layout (based on pump.fun contract):
 * - discriminator: 8 bytes
 * - virtualTokenReserves: u64 (8 bytes)
 * - virtualSolReserves: u64 (8 bytes)
 * - realTokenReserves: u64 (8 bytes)
 * - realSolReserves: u64 (8 bytes)
 * - tokenTotalSupply: u64 (8 bytes)
 * - complete: bool (1 byte)
 * - creator: pubkey (32 bytes)
 */
function parseBondingCurveData(data: Buffer, bondingCurve: string): Partial<BondingCurveData> | null {
  if (data.length < 73) return null;
  
  try {
    const virtualTokenReserves = data.readBigUInt64LE(8);
    const virtualSolReserves = data.readBigUInt64LE(16);
    const realTokenReserves = data.readBigUInt64LE(24);
    const realSolReserves = data.readBigUInt64LE(32);
    const tokenTotalSupply = data.readBigUInt64LE(40);
    const complete = data[48] === 1;
    const creator = new PublicKey(data.subarray(49, 81)).toBase58();
    
    return {
      bondingCurve,
      virtualSolReserves,
      virtualTokenReserves,
      realSolReserves,
      realTokenReserves,
      tokenTotalSupply,
      complete,
      creator,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Calculate graduation progress (0.0 to 1.0)
 * A token graduates when real_sol_reserves reaches ~85 SOL
 */
function calculateGraduationProgress(realSolReserves: bigint): number {
  const threshold = config.pumpFun.graduationThresholdLamports;
  const progress = Number(realSolReserves) / Number(threshold);
  return Math.min(progress, 1.0);
}

/**
 * Calculate implied probability based on graduation progress
 * Uses a sigmoid-like function to convert progress to probability
 */
function calculateImpliedProbability(progress: number): number {
  // Below 10% progress: very low probability
  if (progress < 0.1) return 0.05 + progress * 0.2;
  
  // 10-50%: linear scaling
  if (progress < 0.5) return 0.07 + (progress - 0.1) * 0.5;
  
  // 50-80%: faster scaling
  if (progress < 0.8) return 0.27 + (progress - 0.5) * 1.2;
  
  // 80-95%: high probability zone
  if (progress < 0.95) return 0.63 + (progress - 0.8) * 2.0;
  
  // 95%+: near certain
  return 0.93 + (progress - 0.95) * 1.0;
}

export class PumpFetcher {
  private connection: Connection;
  
  constructor() {
    this.connection = new Connection(config.rpcUrl, 'confirmed');
  }
  
  /**
   * Fetch bonding curve data for a single token
   */
  async fetchBondingCurve(mintAddress: string): Promise<BondingCurveData | null> {
    try {
      const mint = new PublicKey(mintAddress);
      
      // Derive bonding curve PDA
      const [bondingCurve] = PublicKey.findProgramAddressSync(
        [Buffer.from('bonding-curve'), mint.toBuffer()],
        PUMP_FUN_PROGRAM_ID
      );
      
      const accountInfo = await this.connection.getAccountInfo(bondingCurve);
      if (!accountInfo) return null;
      
      const parsed = parseBondingCurveData(accountInfo.data, bondingCurve.toBase58());
      if (!parsed) return null;
      
      return {
        ...parsed,
        mint: mintAddress,
      } as BondingCurveData;
    } catch (e) {
      console.error(`Error fetching bonding curve for ${mintAddress}:`, e);
      return null;
    }
  }
  
  /**
   * Fetch multiple tokens from pump.fun
   * Uses the pump.fun API to get recently created tokens
   */
  async fetchRecentTokens(limit: number = 50): Promise<TokenWithProgress[]> {
    try {
      // Pump.fun API for recent coins
      const response = await fetch(
        `https://frontend-api.pump.fun/coins?offset=0&limit=${limit}&sort=created_timestamp&order=DESC&includeNsfw=false`
      );
      
      if (!response.ok) {
        console.warn('Pump.fun API unavailable, using fallback');
        return [];
      }
      
      const data = await response.json();
      const tokens: TokenWithProgress[] = [];
      
      for (const coin of data) {
        if (coin.complete) continue; // Skip graduated tokens
        
        try {
          const bondingData = await this.fetchBondingCurve(coin.mint);
          if (!bondingData || bondingData.complete) continue;
          
          const currentSolInCurve = Number(bondingData.realSolReserves) / LAMPORTS_PER_SOL;
          const graduationProgress = calculateGraduationProgress(bondingData.realSolReserves);
          const impliedProbability = calculateImpliedProbability(graduationProgress);
          
          // Calculate market cap
          const price = Number(bondingData.virtualSolReserves) / Number(bondingData.virtualTokenReserves);
          const marketCap = price * Number(bondingData.tokenTotalSupply) / LAMPORTS_PER_SOL;
          
          tokens.push({
            ...bondingData,
            name: coin.name || 'Unknown',
            symbol: coin.symbol || 'UNK',
            imageUri: coin.image_uri || '',
            associatedBondingCurve: coin.associated_bonding_curve || '',
            createdAt: coin.created_timestamp || Date.now(),
            currentSolInCurve,
            graduationProgress,
            impliedProbability,
            marketCap,
          });
        } catch (e) {
          // Skip tokens that fail to fetch
          continue;
        }
      }
      
      return tokens;
    } catch (e) {
      console.error('Error fetching recent tokens:', e);
      return [];
    }
  }
  
  /**
   * Fetch top tokens by volume from pump.fun
   */
  async fetchTopVolumeTokens(limit: number = 50): Promise<TokenWithProgress[]> {
    try {
      const response = await fetch(
        `https://frontend-api.pump.fun/coins?offset=0&limit=${limit}&sort=last_trade_timestamp&order=DESC&includeNsfw=false`
      );
      
      if (!response.ok) {
        return [];
      }
      
      const data = await response.json();
      const tokens: TokenWithProgress[] = [];
      
      for (const coin of data) {
        if (coin.complete) continue;
        
        try {
          const bondingData = await this.fetchBondingCurve(coin.mint);
          if (!bondingData || bondingData.complete) continue;
          
          const currentSolInCurve = Number(bondingData.realSolReserves) / LAMPORTS_PER_SOL;
          const graduationProgress = calculateGraduationProgress(bondingData.realSolReserves);
          const impliedProbability = calculateImpliedProbability(graduationProgress);
          
          const price = Number(bondingData.virtualSolReserves) / Number(bondingData.virtualTokenReserves);
          const marketCap = price * Number(bondingData.tokenTotalSupply) / LAMPORTS_PER_SOL;
          
          tokens.push({
            ...bondingData,
            name: coin.name || 'Unknown',
            symbol: coin.symbol || 'UNK',
            imageUri: coin.image_uri || '',
            associatedBondingCurve: coin.associated_bonding_curve || '',
            createdAt: coin.created_timestamp || Date.now(),
            currentSolInCurve,
            graduationProgress,
            impliedProbability,
            marketCap,
          });
        } catch (e) {
          continue;
        }
      }
      
      return tokens;
    } catch (e) {
      console.error('Error fetching top volume tokens:', e);
      return [];
    }
  }
  
  /**
   * Update bonding curve state for existing markets
   */
  async refreshMarketData(mints: string[]): Promise<Map<string, BondingCurveData>> {
    const results = new Map<string, BondingCurveData>();
    
    // Batch fetch bonding curves
    for (const mint of mints) {
      const data = await this.fetchBondingCurve(mint);
      if (data) {
        results.set(mint, data);
      }
    }
    
    return results;
  }
}

export const pumpFetcher = new PumpFetcher();

import { config } from '../config/index.js';

const PUMP_FUN_PROGRAM_ID = new PublicKey(config.pumpFun.programId);

export interface BondingCurveData {
  mint: string;
  bondingCurve: string;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  realSolReserves: bigint;
  realTokenReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  creator: string;
}

export interface TokenWithProgress extends BondingCurveData {
  name: string;
  symbol: string;
  imageUri: string;
  associatedBondingCurve: string;
  createdAt: number;
  // Calculated values
  currentSolInCurve: number;
  graduationProgress: number;
  impliedProbability: number;
  marketCap: number;
}

/**
 * Parse bonding curve account data
 * Layout (based on pump.fun contract):
 * - discriminator: 8 bytes
 * - virtualTokenReserves: u64 (8 bytes)
 * - virtualSolReserves: u64 (8 bytes)
 * - realTokenReserves: u64 (8 bytes)
 * - realSolReserves: u64 (8 bytes)
 * - tokenTotalSupply: u64 (8 bytes)
 * - complete: bool (1 byte)
 * - creator: pubkey (32 bytes)
 */
function parseBondingCurveData(data: Buffer, bondingCurve: string): Partial<BondingCurveData> | null {
  if (data.length < 73) return null;
  
  try {
    const virtualTokenReserves = data.readBigUInt64LE(8);
    const virtualSolReserves = data.readBigUInt64LE(16);
    const realTokenReserves = data.readBigUInt64LE(24);
    const realSolReserves = data.readBigUInt64LE(32);
    const tokenTotalSupply = data.readBigUInt64LE(40);
    const complete = data[48] === 1;
    const creator = new PublicKey(data.subarray(49, 81)).toBase58();
    
    return {
      bondingCurve,
      virtualSolReserves,
      virtualTokenReserves,
      realSolReserves,
      realTokenReserves,
      tokenTotalSupply,
      complete,
      creator,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Calculate graduation progress (0.0 to 1.0)
 * A token graduates when real_sol_reserves reaches ~85 SOL
 */
function calculateGraduationProgress(realSolReserves: bigint): number {
  const threshold = config.pumpFun.graduationThresholdLamports;
  const progress = Number(realSolReserves) / Number(threshold);
  return Math.min(progress, 1.0);
}

/**
 * Calculate implied probability based on graduation progress
 * Uses a sigmoid-like function to convert progress to probability
 */
function calculateImpliedProbability(progress: number): number {
  // Below 10% progress: very low probability
  if (progress < 0.1) return 0.05 + progress * 0.2;
  
  // 10-50%: linear scaling
  if (progress < 0.5) return 0.07 + (progress - 0.1) * 0.5;
  
  // 50-80%: faster scaling
  if (progress < 0.8) return 0.27 + (progress - 0.5) * 1.2;
  
  // 80-95%: high probability zone
  if (progress < 0.95) return 0.63 + (progress - 0.8) * 2.0;
  
  // 95%+: near certain
  return 0.93 + (progress - 0.95) * 1.0;
}

export class PumpFetcher {
  private connection: Connection;
  
  constructor() {
    this.connection = new Connection(config.rpcUrl, 'confirmed');
  }
  
  /**
   * Fetch bonding curve data for a single token
   */
  async fetchBondingCurve(mintAddress: string): Promise<BondingCurveData | null> {
    try {
      const mint = new PublicKey(mintAddress);
      
      // Derive bonding curve PDA
      const [bondingCurve] = PublicKey.findProgramAddressSync(
        [Buffer.from('bonding-curve'), mint.toBuffer()],
        PUMP_FUN_PROGRAM_ID
      );
      
      const accountInfo = await this.connection.getAccountInfo(bondingCurve);
      if (!accountInfo) return null;
      
      const parsed = parseBondingCurveData(accountInfo.data, bondingCurve.toBase58());
      if (!parsed) return null;
      
      return {
        ...parsed,
        mint: mintAddress,
      } as BondingCurveData;
    } catch (e) {
      console.error(`Error fetching bonding curve for ${mintAddress}:`, e);
      return null;
    }
  }
  
  /**
   * Fetch multiple tokens from pump.fun
   * Uses the pump.fun API to get recently created tokens
   */
  async fetchRecentTokens(limit: number = 50): Promise<TokenWithProgress[]> {
    try {
      // Pump.fun API for recent coins
      const response = await fetch(
        `https://frontend-api.pump.fun/coins?offset=0&limit=${limit}&sort=created_timestamp&order=DESC&includeNsfw=false`
      );
      
      if (!response.ok) {
        console.warn('Pump.fun API unavailable, using fallback');
        return [];
      }
      
      const data = await response.json();
      const tokens: TokenWithProgress[] = [];
      
      for (const coin of data) {
        if (coin.complete) continue; // Skip graduated tokens
        
        try {
          const bondingData = await this.fetchBondingCurve(coin.mint);
          if (!bondingData || bondingData.complete) continue;
          
          const currentSolInCurve = Number(bondingData.realSolReserves) / LAMPORTS_PER_SOL;
          const graduationProgress = calculateGraduationProgress(bondingData.realSolReserves);
          const impliedProbability = calculateImpliedProbability(graduationProgress);
          
          // Calculate market cap
          const price = Number(bondingData.virtualSolReserves) / Number(bondingData.virtualTokenReserves);
          const marketCap = price * Number(bondingData.tokenTotalSupply) / LAMPORTS_PER_SOL;
          
          tokens.push({
            ...bondingData,
            name: coin.name || 'Unknown',
            symbol: coin.symbol || 'UNK',
            imageUri: coin.image_uri || '',
            associatedBondingCurve: coin.associated_bonding_curve || '',
            createdAt: coin.created_timestamp || Date.now(),
            currentSolInCurve,
            graduationProgress,
            impliedProbability,
            marketCap,
          });
        } catch (e) {
          // Skip tokens that fail to fetch
          continue;
        }
      }
      
      return tokens;
    } catch (e) {
      console.error('Error fetching recent tokens:', e);
      return [];
    }
  }
  
  /**
   * Fetch top tokens by volume from pump.fun
   */
  async fetchTopVolumeTokens(limit: number = 50): Promise<TokenWithProgress[]> {
    try {
      const response = await fetch(
        `https://frontend-api.pump.fun/coins?offset=0&limit=${limit}&sort=last_trade_timestamp&order=DESC&includeNsfw=false`
      );
      
      if (!response.ok) {
        return [];
      }
      
      const data = await response.json();
      const tokens: TokenWithProgress[] = [];
      
      for (const coin of data) {
        if (coin.complete) continue;
        
        try {
          const bondingData = await this.fetchBondingCurve(coin.mint);
          if (!bondingData || bondingData.complete) continue;
          
          const currentSolInCurve = Number(bondingData.realSolReserves) / LAMPORTS_PER_SOL;
          const graduationProgress = calculateGraduationProgress(bondingData.realSolReserves);
          const impliedProbability = calculateImpliedProbability(graduationProgress);
          
          const price = Number(bondingData.virtualSolReserves) / Number(bondingData.virtualTokenReserves);
          const marketCap = price * Number(bondingData.tokenTotalSupply) / LAMPORTS_PER_SOL;
          
          tokens.push({
            ...bondingData,
            name: coin.name || 'Unknown',
            symbol: coin.symbol || 'UNK',
            imageUri: coin.image_uri || '',
            associatedBondingCurve: coin.associated_bonding_curve || '',
            createdAt: coin.created_timestamp || Date.now(),
            currentSolInCurve,
            graduationProgress,
            impliedProbability,
            marketCap,
          });
        } catch (e) {
          continue;
        }
      }
      
      return tokens;
    } catch (e) {
      console.error('Error fetching top volume tokens:', e);
      return [];
    }
  }
  
  /**
   * Update bonding curve state for existing markets
   */
  async refreshMarketData(mints: string[]): Promise<Map<string, BondingCurveData>> {
    const results = new Map<string, BondingCurveData>();
    
    // Batch fetch bonding curves
    for (const mint of mints) {
      const data = await this.fetchBondingCurve(mint);
      if (data) {
        results.set(mint, data);
      }
    }
    
    return results;
  }
}

export const pumpFetcher = new PumpFetcher();

