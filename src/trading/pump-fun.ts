import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';

// Pump.fun Program IDs and Constants
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMP_GLOBAL = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
const PUMP_FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbCJtGU9kBgp6M');
const PUMP_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

// System addresses
const SYSTEM_PROGRAM = SystemProgram.programId;
const RENT_PROGRAM = new PublicKey('SysvarRent111111111111111111111111111111111');

export interface PumpFunTokenInfo {
  mint: string;
  name?: string;
  symbol?: string;
  bondingCurve: string;
  associatedBondingCurve: string;
  complete: boolean;
  virtualSolReserves: number;
  virtualTokenReserves: number;
  realSolReserves: number;
  realTokenReserves: number;
  tokenProgram: PublicKey;
}

export interface BuyResult {
  success: boolean;
  signature?: string;
  tokenAmount?: number;
  solSpent?: number;
  error?: string;
  walletIndex?: number;
}

/**
 * Derives the bonding curve PDA for a token mint
 */
export function deriveBondingCurvePDA(mintPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
    PUMP_FUN_PROGRAM_ID
  );
}

/**
 * Detects which token program a mint uses
 */
async function detectTokenProgram(connection: Connection, mintPubkey: PublicKey): Promise<PublicKey> {
  const mintAccount = await connection.getAccountInfo(mintPubkey);
  if (!mintAccount) {
    throw new Error('Mint account not found');
  }
  
  // Check if owned by Token-2022 or standard Token Program
  if (mintAccount.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    return TOKEN_2022_PROGRAM_ID;
  }
  return TOKEN_PROGRAM_ID;
}

/**
 * Parses bonding curve account data
 */
function parseBondingCurveData(data: Buffer): {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
} | null {
  if (data.length < 49) {
    return null;
  }
  
  try {
    const virtualTokenReserves = data.readBigUInt64LE(8);
    const virtualSolReserves = data.readBigUInt64LE(16);
    const realTokenReserves = data.readBigUInt64LE(24);
    const realSolReserves = data.readBigUInt64LE(32);
    const tokenTotalSupply = data.readBigUInt64LE(40);
    const complete = data.readUInt8(48) === 1;
    
    return {
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      tokenTotalSupply,
      complete,
    };
  } catch (e) {
    console.error('Error parsing bonding curve data:', e);
    return null;
  }
}

/**
 * Fetches token information directly from on-chain data
 */
export async function fetchPumpFunTokenOnChain(
  connection: Connection,
  mintAddress: string
): Promise<PumpFunTokenInfo | null> {
  try {
    const mintPubkey = new PublicKey(mintAddress);
    
    // Detect token program
    const tokenProgram = await detectTokenProgram(connection, mintPubkey);
    console.log(`Token program: ${tokenProgram.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'Token Program'}`);
    
    // Derive bonding curve PDA
    const [bondingCurvePubkey] = deriveBondingCurvePDA(mintPubkey);
    
    // Get associated bonding curve token account
    const associatedBondingCurve = getAssociatedTokenAddressSync(
      mintPubkey,
      bondingCurvePubkey,
      true, // allowOwnerOffCurve
      tokenProgram
    );
    
    // Fetch bonding curve account data
    const bondingCurveAccount = await connection.getAccountInfo(bondingCurvePubkey);
    
    if (!bondingCurveAccount) {
      console.log('Bonding curve account not found');
      return null;
    }
    
    if (!bondingCurveAccount.owner.equals(PUMP_FUN_PROGRAM_ID)) {
      console.log('Account not owned by pump.fun program');
      return null;
    }
    
    const curveData = parseBondingCurveData(bondingCurveAccount.data);
    
    if (!curveData) {
      console.log('Failed to parse bonding curve data');
      return null;
    }
    
    return {
      mint: mintAddress,
      bondingCurve: bondingCurvePubkey.toBase58(),
      associatedBondingCurve: associatedBondingCurve.toBase58(),
      complete: curveData.complete,
      virtualSolReserves: Number(curveData.virtualSolReserves),
      virtualTokenReserves: Number(curveData.virtualTokenReserves),
      realSolReserves: Number(curveData.realSolReserves),
      realTokenReserves: Number(curveData.realTokenReserves),
      tokenProgram,
    };
  } catch (error) {
    console.error('Error fetching pump.fun token on-chain:', error);
    return null;
  }
}

/**
 * Fetches token information - tries API first, falls back to on-chain
 */
export async function fetchPumpFunToken(mintAddress: string): Promise<PumpFunTokenInfo | null> {
  const connection = createConnection();
  
  // Try API first
  try {
    const response = await fetch(`https://frontend-api.pump.fun/coins/${mintAddress}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      const tokenProgram = await detectTokenProgram(connection, new PublicKey(mintAddress));
      
      return {
        mint: data.mint,
        name: data.name,
        symbol: data.symbol,
        bondingCurve: data.bonding_curve,
        associatedBondingCurve: data.associated_bonding_curve,
        complete: data.complete,
        virtualSolReserves: data.virtual_sol_reserves,
        virtualTokenReserves: data.virtual_token_reserves,
        realSolReserves: data.real_sol_reserves,
        realTokenReserves: data.real_token_reserves,
        tokenProgram,
      };
    }
  } catch (e) {
    console.log('API unavailable, using on-chain data...');
  }
  
  return fetchPumpFunTokenOnChain(connection, mintAddress);
}

/**
 * Calculates expected token amount for a given SOL amount
 */
export function calculateExpectedTokens(
  solAmount: number,
  virtualSolReserves: number,
  virtualTokenReserves: number
): number {
  const solLamports = solAmount * LAMPORTS_PER_SOL;
  const k = BigInt(virtualSolReserves) * BigInt(virtualTokenReserves);
  const newSolReserves = BigInt(virtualSolReserves) + BigInt(Math.floor(solLamports));
  const newTokenReserves = k / newSolReserves;
  const tokensOut = BigInt(virtualTokenReserves) - newTokenReserves;
  
  return Number(tokensOut);
}

/**
 * Gets or creates the associated token account with correct program
 */
async function getOrCreateATA(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram: PublicKey
): Promise<{ address: PublicKey; instruction?: TransactionInstruction }> {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, tokenProgram);
  
  try {
    const accountInfo = await connection.getAccountInfo(ata);
    if (accountInfo) {
      return { address: ata };
    }
  } catch {
    // Account doesn't exist
  }
  
  const instruction = createAssociatedTokenAccountInstruction(
    payer.publicKey,
    ata,
    owner,
    mint,
    tokenProgram
  );
  
  return { address: ata, instruction };
}

/**
 * Creates the buy instruction for pump.fun bonding curve
 */
function createBuyInstruction(
  buyer: PublicKey,
  mint: PublicKey,
  bondingCurve: PublicKey,
  associatedBondingCurve: PublicKey,
  associatedUser: PublicKey,
  solAmount: bigint,
  minTokenAmount: bigint,
  tokenProgram: PublicKey
): TransactionInstruction {
  // Buy instruction discriminator
  const discriminator = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);
  
  const data = Buffer.alloc(8 + 8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(minTokenAmount, 8);
  data.writeBigUInt64LE(solAmount, 16);
  
  const keys = [
    { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },
    { pubkey: PUMP_FEE_RECIPIENT, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
    { pubkey: associatedUser, isSigner: false, isWritable: true },
    { pubkey: buyer, isSigner: true, isWritable: true },
    { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: RENT_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  
  return new TransactionInstruction({
    programId: PUMP_FUN_PROGRAM_ID,
    keys,
    data,
  });
}

/**
 * Executes a buy on pump.fun bonding curve
 */
export async function buyOnPumpFun(
  wallet: Keypair,
  tokenMint: string,
  solAmount: number,
  slippageBps: number = config.defaultSlippageBps,
  walletIndex?: number
): Promise<BuyResult> {
  const connection = createConnection();
  const mintPubkey = new PublicKey(tokenMint);
  
  try {
    // Fetch token info
    const tokenInfo = await fetchPumpFunTokenOnChain(connection, tokenMint);
    
    if (!tokenInfo) {
      return {
        success: false,
        error: 'Token not found - not a valid pump.fun token',
        walletIndex,
      };
    }
    
    if (tokenInfo.complete) {
      return {
        success: false,
        error: 'Token graduated from bonding curve. Use Jupiter instead.',
        walletIndex,
      };
    }
    
    // Calculate expected tokens with slippage
    const expectedTokens = calculateExpectedTokens(
      solAmount,
      tokenInfo.virtualSolReserves,
      tokenInfo.virtualTokenReserves
    );
    
    const minTokens = BigInt(Math.floor(expectedTokens * (1 - slippageBps / 10000)));
    
    // Get or create ATA with correct token program
    const { address: ata, instruction: ataInstruction } = await getOrCreateATA(
      connection,
      wallet,
      mintPubkey,
      wallet.publicKey,
      tokenInfo.tokenProgram
    );
    
    // Build transaction
    const transaction = new Transaction();
    
    // Priority fee
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: config.priorityFeeMicroLamports,
      })
    );
    
    // Compute units
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 300000,
      })
    );
    
    // Create ATA if needed
    if (ataInstruction) {
      transaction.add(ataInstruction);
    }
    
    // Buy instruction
    const bondingCurvePubkey = new PublicKey(tokenInfo.bondingCurve);
    const associatedBondingCurvePubkey = new PublicKey(tokenInfo.associatedBondingCurve);
    
    const buyIx = createBuyInstruction(
      wallet.publicKey,
      mintPubkey,
      bondingCurvePubkey,
      associatedBondingCurvePubkey,
      ata,
      BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL)),
      minTokens,
      tokenInfo.tokenProgram
    );
    
    transaction.add(buyIx);
    
    // Get blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;
    
    // Send
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      {
        commitment: 'confirmed',
        maxRetries: config.maxTxRetries,
      }
    );
    
    return {
      success: true,
      signature,
      tokenAmount: expectedTokens,
      solSpent: solAmount,
      walletIndex,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
      walletIndex,
    };
  }
}

/**
 * Executes buys from multiple wallets SEQUENTIALLY (to respect rate limits)
 */
export async function multiBuyOnPumpFun(
  wallets: Keypair[],
  tokenMint: string,
  solAmounts: number[],
  slippageBps: number = config.defaultSlippageBps,
  onProgress?: (result: BuyResult) => void
): Promise<BuyResult[]> {
  if (wallets.length !== solAmounts.length) {
    throw new Error('Wallets and amounts arrays must have the same length');
  }
  
  const results: BuyResult[] = [];
  
  // Execute sequentially to respect Helius free tier (1 tx/sec)
  for (let i = 0; i < wallets.length; i++) {
    const result = await buyOnPumpFun(wallets[i], tokenMint, solAmounts[i], slippageBps, i);
    results.push(result);
    onProgress?.(result);
    
    // Small delay between transactions
    if (i < wallets.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  }
  
  return results;
}

/**
 * Creates sell instruction
 */
function createSellInstruction(
  seller: PublicKey,
  mint: PublicKey,
  bondingCurve: PublicKey,
  associatedBondingCurve: PublicKey,
  associatedUser: PublicKey,
  tokenAmount: bigint,
  minSolOutput: bigint,
  tokenProgram: PublicKey
): TransactionInstruction {
  const discriminator = Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]);
  
  const data = Buffer.alloc(8 + 8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(tokenAmount, 8);
  data.writeBigUInt64LE(minSolOutput, 16);
  
  const keys = [
    { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },
    { pubkey: PUMP_FEE_RECIPIENT, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
    { pubkey: associatedUser, isSigner: false, isWritable: true },
    { pubkey: seller, isSigner: true, isWritable: true },
    { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  
  return new TransactionInstruction({
    programId: PUMP_FUN_PROGRAM_ID,
    keys,
    data,
  });
}

/**
 * Executes a sell on pump.fun bonding curve
 */
export async function sellOnPumpFun(
  wallet: Keypair,
  tokenMint: string,
  tokenAmount: number,
  slippageBps: number = config.defaultSlippageBps,
  walletIndex?: number
): Promise<BuyResult> {
  const connection = createConnection();
  const mintPubkey = new PublicKey(tokenMint);
  
  try {
    const tokenInfo = await fetchPumpFunTokenOnChain(connection, tokenMint);
    
    if (!tokenInfo) {
      return {
        success: false,
        error: 'Token not found on pump.fun',
        walletIndex,
      };
    }
    
    if (tokenInfo.complete) {
      return {
        success: false,
        error: 'Token graduated. Use Jupiter instead.',
        walletIndex,
      };
    }
    
    const ata = getAssociatedTokenAddressSync(
      mintPubkey,
      wallet.publicKey,
      false,
      tokenInfo.tokenProgram
    );
    
    const transaction = new Transaction();
    
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: config.priorityFeeMicroLamports,
      })
    );
    
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 300000,
      })
    );
    
    const bondingCurvePubkey = new PublicKey(tokenInfo.bondingCurve);
    const associatedBondingCurvePubkey = new PublicKey(tokenInfo.associatedBondingCurve);
    
    const minSolOutput = BigInt(0);
    
    const sellIx = createSellInstruction(
      wallet.publicKey,
      mintPubkey,
      bondingCurvePubkey,
      associatedBondingCurvePubkey,
      ata,
      BigInt(Math.floor(tokenAmount)),
      minSolOutput,
      tokenInfo.tokenProgram
    );
    
    transaction.add(sellIx);
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      {
        commitment: 'confirmed',
        maxRetries: config.maxTxRetries,
      }
    );
    
    return {
      success: true,
      signature,
      tokenAmount,
      walletIndex,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      walletIndex,
    };
  }
}

  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';

// Pump.fun Program IDs and Constants
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMP_GLOBAL = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
const PUMP_FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbCJtGU9kBgp6M');
const PUMP_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

// System addresses
const SYSTEM_PROGRAM = SystemProgram.programId;
const RENT_PROGRAM = new PublicKey('SysvarRent111111111111111111111111111111111');

export interface PumpFunTokenInfo {
  mint: string;
  name?: string;
  symbol?: string;
  bondingCurve: string;
  associatedBondingCurve: string;
  complete: boolean;
  virtualSolReserves: number;
  virtualTokenReserves: number;
  realSolReserves: number;
  realTokenReserves: number;
  tokenProgram: PublicKey;
}

export interface BuyResult {
  success: boolean;
  signature?: string;
  tokenAmount?: number;
  solSpent?: number;
  error?: string;
  walletIndex?: number;
}

/**
 * Derives the bonding curve PDA for a token mint
 */
export function deriveBondingCurvePDA(mintPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
    PUMP_FUN_PROGRAM_ID
  );
}

/**
 * Detects which token program a mint uses
 */
async function detectTokenProgram(connection: Connection, mintPubkey: PublicKey): Promise<PublicKey> {
  const mintAccount = await connection.getAccountInfo(mintPubkey);
  if (!mintAccount) {
    throw new Error('Mint account not found');
  }
  
  // Check if owned by Token-2022 or standard Token Program
  if (mintAccount.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    return TOKEN_2022_PROGRAM_ID;
  }
  return TOKEN_PROGRAM_ID;
}

/**
 * Parses bonding curve account data
 */
function parseBondingCurveData(data: Buffer): {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
} | null {
  if (data.length < 49) {
    return null;
  }
  
  try {
    const virtualTokenReserves = data.readBigUInt64LE(8);
    const virtualSolReserves = data.readBigUInt64LE(16);
    const realTokenReserves = data.readBigUInt64LE(24);
    const realSolReserves = data.readBigUInt64LE(32);
    const tokenTotalSupply = data.readBigUInt64LE(40);
    const complete = data.readUInt8(48) === 1;
    
    return {
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      tokenTotalSupply,
      complete,
    };
  } catch (e) {
    console.error('Error parsing bonding curve data:', e);
    return null;
  }
}

/**
 * Fetches token information directly from on-chain data
 */
export async function fetchPumpFunTokenOnChain(
  connection: Connection,
  mintAddress: string
): Promise<PumpFunTokenInfo | null> {
  try {
    const mintPubkey = new PublicKey(mintAddress);
    
    // Detect token program
    const tokenProgram = await detectTokenProgram(connection, mintPubkey);
    console.log(`Token program: ${tokenProgram.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'Token Program'}`);
    
    // Derive bonding curve PDA
    const [bondingCurvePubkey] = deriveBondingCurvePDA(mintPubkey);
    
    // Get associated bonding curve token account
    const associatedBondingCurve = getAssociatedTokenAddressSync(
      mintPubkey,
      bondingCurvePubkey,
      true, // allowOwnerOffCurve
      tokenProgram
    );
    
    // Fetch bonding curve account data
    const bondingCurveAccount = await connection.getAccountInfo(bondingCurvePubkey);
    
    if (!bondingCurveAccount) {
      console.log('Bonding curve account not found');
      return null;
    }
    
    if (!bondingCurveAccount.owner.equals(PUMP_FUN_PROGRAM_ID)) {
      console.log('Account not owned by pump.fun program');
      return null;
    }
    
    const curveData = parseBondingCurveData(bondingCurveAccount.data);
    
    if (!curveData) {
      console.log('Failed to parse bonding curve data');
      return null;
    }
    
    return {
      mint: mintAddress,
      bondingCurve: bondingCurvePubkey.toBase58(),
      associatedBondingCurve: associatedBondingCurve.toBase58(),
      complete: curveData.complete,
      virtualSolReserves: Number(curveData.virtualSolReserves),
      virtualTokenReserves: Number(curveData.virtualTokenReserves),
      realSolReserves: Number(curveData.realSolReserves),
      realTokenReserves: Number(curveData.realTokenReserves),
      tokenProgram,
    };
  } catch (error) {
    console.error('Error fetching pump.fun token on-chain:', error);
    return null;
  }
}

/**
 * Fetches token information - tries API first, falls back to on-chain
 */
export async function fetchPumpFunToken(mintAddress: string): Promise<PumpFunTokenInfo | null> {
  const connection = createConnection();
  
  // Try API first
  try {
    const response = await fetch(`https://frontend-api.pump.fun/coins/${mintAddress}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      const tokenProgram = await detectTokenProgram(connection, new PublicKey(mintAddress));
      
      return {
        mint: data.mint,
        name: data.name,
        symbol: data.symbol,
        bondingCurve: data.bonding_curve,
        associatedBondingCurve: data.associated_bonding_curve,
        complete: data.complete,
        virtualSolReserves: data.virtual_sol_reserves,
        virtualTokenReserves: data.virtual_token_reserves,
        realSolReserves: data.real_sol_reserves,
        realTokenReserves: data.real_token_reserves,
        tokenProgram,
      };
    }
  } catch (e) {
    console.log('API unavailable, using on-chain data...');
  }
  
  return fetchPumpFunTokenOnChain(connection, mintAddress);
}

/**
 * Calculates expected token amount for a given SOL amount
 */
export function calculateExpectedTokens(
  solAmount: number,
  virtualSolReserves: number,
  virtualTokenReserves: number
): number {
  const solLamports = solAmount * LAMPORTS_PER_SOL;
  const k = BigInt(virtualSolReserves) * BigInt(virtualTokenReserves);
  const newSolReserves = BigInt(virtualSolReserves) + BigInt(Math.floor(solLamports));
  const newTokenReserves = k / newSolReserves;
  const tokensOut = BigInt(virtualTokenReserves) - newTokenReserves;
  
  return Number(tokensOut);
}

/**
 * Gets or creates the associated token account with correct program
 */
async function getOrCreateATA(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram: PublicKey
): Promise<{ address: PublicKey; instruction?: TransactionInstruction }> {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, tokenProgram);
  
  try {
    const accountInfo = await connection.getAccountInfo(ata);
    if (accountInfo) {
      return { address: ata };
    }
  } catch {
    // Account doesn't exist
  }
  
  const instruction = createAssociatedTokenAccountInstruction(
    payer.publicKey,
    ata,
    owner,
    mint,
    tokenProgram
  );
  
  return { address: ata, instruction };
}

/**
 * Creates the buy instruction for pump.fun bonding curve
 */
function createBuyInstruction(
  buyer: PublicKey,
  mint: PublicKey,
  bondingCurve: PublicKey,
  associatedBondingCurve: PublicKey,
  associatedUser: PublicKey,
  solAmount: bigint,
  minTokenAmount: bigint,
  tokenProgram: PublicKey
): TransactionInstruction {
  // Buy instruction discriminator
  const discriminator = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);
  
  const data = Buffer.alloc(8 + 8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(minTokenAmount, 8);
  data.writeBigUInt64LE(solAmount, 16);
  
  const keys = [
    { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },
    { pubkey: PUMP_FEE_RECIPIENT, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
    { pubkey: associatedUser, isSigner: false, isWritable: true },
    { pubkey: buyer, isSigner: true, isWritable: true },
    { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: RENT_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  
  return new TransactionInstruction({
    programId: PUMP_FUN_PROGRAM_ID,
    keys,
    data,
  });
}

/**
 * Executes a buy on pump.fun bonding curve
 */
export async function buyOnPumpFun(
  wallet: Keypair,
  tokenMint: string,
  solAmount: number,
  slippageBps: number = config.defaultSlippageBps,
  walletIndex?: number
): Promise<BuyResult> {
  const connection = createConnection();
  const mintPubkey = new PublicKey(tokenMint);
  
  try {
    // Fetch token info
    const tokenInfo = await fetchPumpFunTokenOnChain(connection, tokenMint);
    
    if (!tokenInfo) {
      return {
        success: false,
        error: 'Token not found - not a valid pump.fun token',
        walletIndex,
      };
    }
    
    if (tokenInfo.complete) {
      return {
        success: false,
        error: 'Token graduated from bonding curve. Use Jupiter instead.',
        walletIndex,
      };
    }
    
    // Calculate expected tokens with slippage
    const expectedTokens = calculateExpectedTokens(
      solAmount,
      tokenInfo.virtualSolReserves,
      tokenInfo.virtualTokenReserves
    );
    
    const minTokens = BigInt(Math.floor(expectedTokens * (1 - slippageBps / 10000)));
    
    // Get or create ATA with correct token program
    const { address: ata, instruction: ataInstruction } = await getOrCreateATA(
      connection,
      wallet,
      mintPubkey,
      wallet.publicKey,
      tokenInfo.tokenProgram
    );
    
    // Build transaction
    const transaction = new Transaction();
    
    // Priority fee
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: config.priorityFeeMicroLamports,
      })
    );
    
    // Compute units
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 300000,
      })
    );
    
    // Create ATA if needed
    if (ataInstruction) {
      transaction.add(ataInstruction);
    }
    
    // Buy instruction
    const bondingCurvePubkey = new PublicKey(tokenInfo.bondingCurve);
    const associatedBondingCurvePubkey = new PublicKey(tokenInfo.associatedBondingCurve);
    
    const buyIx = createBuyInstruction(
      wallet.publicKey,
      mintPubkey,
      bondingCurvePubkey,
      associatedBondingCurvePubkey,
      ata,
      BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL)),
      minTokens,
      tokenInfo.tokenProgram
    );
    
    transaction.add(buyIx);
    
    // Get blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;
    
    // Send
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      {
        commitment: 'confirmed',
        maxRetries: config.maxTxRetries,
      }
    );
    
    return {
      success: true,
      signature,
      tokenAmount: expectedTokens,
      solSpent: solAmount,
      walletIndex,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
      walletIndex,
    };
  }
}

/**
 * Executes buys from multiple wallets SEQUENTIALLY (to respect rate limits)
 */
export async function multiBuyOnPumpFun(
  wallets: Keypair[],
  tokenMint: string,
  solAmounts: number[],
  slippageBps: number = config.defaultSlippageBps,
  onProgress?: (result: BuyResult) => void
): Promise<BuyResult[]> {
  if (wallets.length !== solAmounts.length) {
    throw new Error('Wallets and amounts arrays must have the same length');
  }
  
  const results: BuyResult[] = [];
  
  // Execute sequentially to respect Helius free tier (1 tx/sec)
  for (let i = 0; i < wallets.length; i++) {
    const result = await buyOnPumpFun(wallets[i], tokenMint, solAmounts[i], slippageBps, i);
    results.push(result);
    onProgress?.(result);
    
    // Small delay between transactions
    if (i < wallets.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  }
  
  return results;
}

/**
 * Creates sell instruction
 */
function createSellInstruction(
  seller: PublicKey,
  mint: PublicKey,
  bondingCurve: PublicKey,
  associatedBondingCurve: PublicKey,
  associatedUser: PublicKey,
  tokenAmount: bigint,
  minSolOutput: bigint,
  tokenProgram: PublicKey
): TransactionInstruction {
  const discriminator = Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]);
  
  const data = Buffer.alloc(8 + 8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(tokenAmount, 8);
  data.writeBigUInt64LE(minSolOutput, 16);
  
  const keys = [
    { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },
    { pubkey: PUMP_FEE_RECIPIENT, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
    { pubkey: associatedUser, isSigner: false, isWritable: true },
    { pubkey: seller, isSigner: true, isWritable: true },
    { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  
  return new TransactionInstruction({
    programId: PUMP_FUN_PROGRAM_ID,
    keys,
    data,
  });
}

/**
 * Executes a sell on pump.fun bonding curve
 */
export async function sellOnPumpFun(
  wallet: Keypair,
  tokenMint: string,
  tokenAmount: number,
  slippageBps: number = config.defaultSlippageBps,
  walletIndex?: number
): Promise<BuyResult> {
  const connection = createConnection();
  const mintPubkey = new PublicKey(tokenMint);
  
  try {
    const tokenInfo = await fetchPumpFunTokenOnChain(connection, tokenMint);
    
    if (!tokenInfo) {
      return {
        success: false,
        error: 'Token not found on pump.fun',
        walletIndex,
      };
    }
    
    if (tokenInfo.complete) {
      return {
        success: false,
        error: 'Token graduated. Use Jupiter instead.',
        walletIndex,
      };
    }
    
    const ata = getAssociatedTokenAddressSync(
      mintPubkey,
      wallet.publicKey,
      false,
      tokenInfo.tokenProgram
    );
    
    const transaction = new Transaction();
    
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: config.priorityFeeMicroLamports,
      })
    );
    
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 300000,
      })
    );
    
    const bondingCurvePubkey = new PublicKey(tokenInfo.bondingCurve);
    const associatedBondingCurvePubkey = new PublicKey(tokenInfo.associatedBondingCurve);
    
    const minSolOutput = BigInt(0);
    
    const sellIx = createSellInstruction(
      wallet.publicKey,
      mintPubkey,
      bondingCurvePubkey,
      associatedBondingCurvePubkey,
      ata,
      BigInt(Math.floor(tokenAmount)),
      minSolOutput,
      tokenInfo.tokenProgram
    );
    
    transaction.add(sellIx);
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      {
        commitment: 'confirmed',
        maxRetries: config.maxTxRetries,
      }
    );
    
    return {
      success: true,
      signature,
      tokenAmount,
      walletIndex,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      walletIndex,
    };
  }
}
