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
  SYSVAR_RENT_PUBKEY,
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

// Pump.fun Program ID and PDAs
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Global config PDA - seeds: ["global"]
const PUMP_GLOBAL = PublicKey.findProgramAddressSync(
  [Buffer.from('global')],
  PUMP_FUN_PROGRAM_ID
)[0];

// Fee SOL vaults (different for Token vs Token-2022)
// Regular SPL Token fee vault (System-owned with data)
const PUMP_FEE_SOL_VAULT_TOKEN = new PublicKey('6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs');
// Token-2022 fee vault (System-owned, holds protocol fees)
const PUMP_FEE_SOL_VAULT_TOKEN_2022 = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');

// Fee recipient (pump.fun fee wallet)
const PUMP_FEE_RECIPIENT = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');

// Fee recipient SOL vault - account owned by fee recipient program
const PUMP_FEE_RECIPIENT_VAULT = new PublicKey('8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt');

// Event authority PDA
const PUMP_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

// Global volume accumulator PDA - seeds: ["global_volume_accumulator"]
const GLOBAL_VOLUME_ACCUMULATOR = PublicKey.findProgramAddressSync(
  [Buffer.from('global_volume_accumulator')],
  PUMP_FUN_PROGRAM_ID
)[0];

export interface BuyResult {
  success: boolean;
  signature?: string;
  tokenAmount?: number;
  solSpent?: number;
  error?: string;
  walletIndex?: number;
}

export interface PumpTokenInfo {
  mint: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  coinCreator: PublicKey;
  creatorVault: PublicKey;
  tokenProgram: PublicKey;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  complete: boolean;
}

/**
 * Derives the bonding curve PDA for a mint
 */
export function deriveBondingCurvePDA(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMP_FUN_PROGRAM_ID
  )[0];
}

/**
 * Derives the creator vault PDA
 */
export function deriveCreatorVaultPDA(creator: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('creator-vault'), creator.toBuffer()],
    PUMP_FUN_PROGRAM_ID
  )[0];
}

/**
 * Detects token program (Token vs Token-2022)
 */
async function detectTokenProgram(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const mintAccount = await connection.getAccountInfo(mint);
  if (!mintAccount) throw new Error('Mint account not found');
  
  if (mintAccount.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    return TOKEN_2022_PROGRAM_ID;
  }
  return TOKEN_PROGRAM_ID;
}

/**
 * Fetches and parses bonding curve data
 */
async function fetchBondingCurveData(connection: Connection, bondingCurve: PublicKey): Promise<{
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  creator: PublicKey;
} | null> {
  const account = await connection.getAccountInfo(bondingCurve);
  if (!account || account.data.length < 100) return null;
  
  try {
    const data = account.data;
    // Bonding curve layout (approximate based on reverse engineering):
    // 8 bytes: discriminator
    // 8 bytes: virtual_token_reserves
    // 8 bytes: virtual_sol_reserves  
    // 8 bytes: real_token_reserves
    // 8 bytes: real_sol_reserves
    // 8 bytes: token_total_supply
    // 1 byte: complete
    // 32 bytes: creator pubkey
    
    const virtualTokenReserves = data.readBigUInt64LE(8);
    const virtualSolReserves = data.readBigUInt64LE(16);
    const realTokenReserves = data.readBigUInt64LE(24);
    const realSolReserves = data.readBigUInt64LE(32);
    const tokenTotalSupply = data.readBigUInt64LE(40);
    const complete = data.readUInt8(48) === 1;
    
    // Creator pubkey starts at offset 49 (after complete flag)
    const creatorBytes = data.slice(49, 81);
    const creator = new PublicKey(creatorBytes);
    
    return {
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      tokenTotalSupply,
      complete,
      creator,
    };
  } catch (e) {
    console.error('Error parsing bonding curve:', e);
    return null;
  }
}

/**
 * Fetches complete token info from on-chain
 */
export async function fetchPumpTokenInfo(
  connection: Connection,
  mintAddress: string
): Promise<PumpTokenInfo | null> {
  try {
    const mint = new PublicKey(mintAddress);
    const tokenProgram = await detectTokenProgram(connection, mint);
    const bondingCurve = deriveBondingCurvePDA(mint);
    
    const curveData = await fetchBondingCurveData(connection, bondingCurve);
    if (!curveData) return null;
    
    const associatedBondingCurve = getAssociatedTokenAddressSync(
      mint,
      bondingCurve,
      true,
      tokenProgram
    );
    
    const creatorVault = deriveCreatorVaultPDA(curveData.creator);
    
    return {
      mint,
      bondingCurve,
      associatedBondingCurve,
      coinCreator: curveData.creator,
      creatorVault,
      tokenProgram,
      virtualSolReserves: curveData.virtualSolReserves,
      virtualTokenReserves: curveData.virtualTokenReserves,
      complete: curveData.complete,
    };
  } catch (error) {
    console.error('Error fetching pump token info:', error);
    return null;
  }
}

/**
 * Calculate tokens out for SOL in
 */
export function calculateTokensOut(
  solAmount: number,
  virtualSolReserves: bigint,
  virtualTokenReserves: bigint
): bigint {
  const solLamports = BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));
  const k = virtualSolReserves * virtualTokenReserves;
  const newSolReserves = virtualSolReserves + solLamports;
  const newTokenReserves = k / newSolReserves;
  return virtualTokenReserves - newTokenReserves;
}

/**
 * Creates the buy instruction with all 16 required accounts
 * Account order based on actual successful transaction analysis:
 * 0: global (PDA config)
 * 1: fee_sol_vault (global SOL fee pool - System owned)
 * 2: mint
 * 3: bonding_curve (writable)
 * 4: associated_bonding_curve (token vault for bonding curve - writable)
 * 5: associated_user (user's token ATA - writable)
 * 6: user (signer, writable)
 * 7: system_program
 * 8: token_program
 * 9: coin_creator
 * 10: event_authority
 * 11: program (self)
 * 12: global_volume_accumulator (writable)
 * 13: creator_vault (writable)
 * 14: fee_recipient_vault (owned by fee recipient program)
 * 15: fee_recipient (fee program)
 */
function createBuyInstruction(
  user: PublicKey,
  tokenInfo: PumpTokenInfo,
  associatedUser: PublicKey,
  solAmount: bigint,
  minTokensOut: bigint
): TransactionInstruction {
  // Buy discriminator from IDL: [102, 6, 61, 18, 1, 218, 235, 234]
  const discriminator = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);
  
  // Args: amount (u64), min_sol_output (u64)
  const data = Buffer.alloc(8 + 8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(minTokensOut, 8);  // min tokens out
  data.writeBigUInt64LE(solAmount, 16);    // max sol in
  
  // Select fee sol vault based on token program (Token vs Token-2022)
  const isToken2022 = tokenInfo.tokenProgram.equals(TOKEN_2022_PROGRAM_ID);
  const feeSolVault = isToken2022 ? PUMP_FEE_SOL_VAULT_TOKEN_2022 : PUMP_FEE_SOL_VAULT_TOKEN;
  
  const keys = [
    { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },                    // 0: global config
    { pubkey: feeSolVault, isSigner: false, isWritable: true },                     // 1: fee_sol_vault (Token or Token-2022)
    { pubkey: tokenInfo.mint, isSigner: false, isWritable: false },                 // 2: mint
    { pubkey: tokenInfo.bondingCurve, isSigner: false, isWritable: true },          // 3: bonding_curve
    { pubkey: tokenInfo.associatedBondingCurve, isSigner: false, isWritable: true },// 4: associated_bonding_curve
    { pubkey: associatedUser, isSigner: false, isWritable: true },                  // 5: associated_user
    { pubkey: user, isSigner: true, isWritable: true },                             // 6: user
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },        // 7: system_program
    { pubkey: tokenInfo.tokenProgram, isSigner: false, isWritable: false },         // 8: token_program
    { pubkey: tokenInfo.coinCreator, isSigner: false, isWritable: false },          // 9: coin_creator
    { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },           // 10: event_authority
    { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },            // 11: program
    { pubkey: GLOBAL_VOLUME_ACCUMULATOR, isSigner: false, isWritable: true },       // 12: global_volume_accumulator
    { pubkey: tokenInfo.creatorVault, isSigner: false, isWritable: true },          // 13: creator_vault
    { pubkey: PUMP_FEE_RECIPIENT_VAULT, isSigner: false, isWritable: true },        // 14: fee_recipient_vault
    { pubkey: PUMP_FEE_RECIPIENT, isSigner: false, isWritable: false },             // 15: fee_recipient (program)
  ];
  
  return new TransactionInstruction({
    programId: PUMP_FUN_PROGRAM_ID,
    keys,
    data,
  });
}

/**
 * Gets or creates ATA
 */
async function getOrCreateATA(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram: PublicKey
): Promise<{ address: PublicKey; instruction?: TransactionInstruction }> {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, tokenProgram);
  
  const accountInfo = await connection.getAccountInfo(ata);
  if (accountInfo) {
    return { address: ata };
  }
  
  return {
    address: ata,
    instruction: createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      owner,
      mint,
      tokenProgram
    ),
  };
}

/**
 * Executes a buy on pump.fun bonding curve
 */
export async function buyOnPumpFunV2(
  wallet: Keypair,
  tokenMint: string,
  solAmount: number,
  slippageBps: number = config.defaultSlippageBps,
  walletIndex?: number
): Promise<BuyResult> {
  const connection = createConnection();
  
  try {
    console.log(`  Fetching token info for ${tokenMint.slice(0, 8)}...`);
    const tokenInfo = await fetchPumpTokenInfo(connection, tokenMint);
    
    if (!tokenInfo) {
      return {
        success: false,
        error: 'Token not found or not a pump.fun bonding curve token',
        walletIndex,
      };
    }
    
    if (tokenInfo.complete) {
      return {
        success: false,
        error: 'Token has graduated from bonding curve',
        walletIndex,
      };
    }
    
    // Calculate expected tokens
    const expectedTokens = calculateTokensOut(
      solAmount,
      tokenInfo.virtualSolReserves,
      tokenInfo.virtualTokenReserves
    );
    
    // Apply slippage
    const minTokensOut = expectedTokens * BigInt(10000 - slippageBps) / BigInt(10000);
    const solLamports = BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));
    
    console.log(`  Expected: ~${Number(expectedTokens) / 1e6} tokens`);
    
    // Get or create user ATA
    const { address: userAta, instruction: ataInstruction } = await getOrCreateATA(
      connection,
      wallet,
      tokenInfo.mint,
      wallet.publicKey,
      tokenInfo.tokenProgram
    );
    
    // Build transaction
    const tx = new Transaction();
    
    // Priority fee
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: config.priorityFeeMicroLamports,
    }));
    
    // Compute units
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({
      units: 400000,
    }));
    
    // Create ATA if needed
    if (ataInstruction) {
      tx.add(ataInstruction);
    }
    
    // Buy instruction
    tx.add(createBuyInstruction(
      wallet.publicKey,
      tokenInfo,
      userAta,
      solLamports,
      minTokensOut
    ));
    
    // Get blockhash and send
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [wallet],
      { commitment: 'confirmed', maxRetries: config.maxTxRetries }
    );
    
    return {
      success: true,
      signature,
      tokenAmount: Number(expectedTokens),
      solSpent: solAmount,
      walletIndex,
    };
  } catch (error: any) {
    let errorMsg = error instanceof Error ? error.message : String(error);
    
    // Extract logs if available
    if (error.logs) {
      console.log('  Transaction logs:');
      error.logs.slice(-5).forEach((log: string) => console.log(`    ${log}`));
    }
    
    return {
      success: false,
      error: errorMsg,
      walletIndex,
    };
  }
}

/**
 * Multi-wallet buy (sequential for rate limits)
 */
export async function multiBuyOnPumpFunV2(
  wallets: Keypair[],
  tokenMint: string,
  solAmounts: number[],
  slippageBps: number = config.defaultSlippageBps,
  onProgress?: (result: BuyResult) => void
): Promise<BuyResult[]> {
  const results: BuyResult[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    console.log(`\n  [Wallet ${i}] Buying ${solAmounts[i]} SOL...`);
    
    const result = await buyOnPumpFunV2(
      wallets[i],
      tokenMint,
      solAmounts[i],
      slippageBps,
      i
    );
    
    results.push(result);
    onProgress?.(result);
    
    // Delay between transactions
    if (i < wallets.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  
  return results;
}


  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY,
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

// Pump.fun Program ID and PDAs
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Global config PDA - seeds: ["global"]
const PUMP_GLOBAL = PublicKey.findProgramAddressSync(
  [Buffer.from('global')],
  PUMP_FUN_PROGRAM_ID
)[0];

// Fee SOL vaults (different for Token vs Token-2022)
// Regular SPL Token fee vault (System-owned with data)
const PUMP_FEE_SOL_VAULT_TOKEN = new PublicKey('6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs');
// Token-2022 fee vault (System-owned, holds protocol fees)
const PUMP_FEE_SOL_VAULT_TOKEN_2022 = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');

// Fee recipient (pump.fun fee wallet)
const PUMP_FEE_RECIPIENT = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');

// Fee recipient SOL vault - account owned by fee recipient program
const PUMP_FEE_RECIPIENT_VAULT = new PublicKey('8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt');

// Event authority PDA
const PUMP_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

// Global volume accumulator PDA - seeds: ["global_volume_accumulator"]
const GLOBAL_VOLUME_ACCUMULATOR = PublicKey.findProgramAddressSync(
  [Buffer.from('global_volume_accumulator')],
  PUMP_FUN_PROGRAM_ID
)[0];

export interface BuyResult {
  success: boolean;
  signature?: string;
  tokenAmount?: number;
  solSpent?: number;
  error?: string;
  walletIndex?: number;
}

export interface PumpTokenInfo {
  mint: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  coinCreator: PublicKey;
  creatorVault: PublicKey;
  tokenProgram: PublicKey;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  complete: boolean;
}

/**
 * Derives the bonding curve PDA for a mint
 */
export function deriveBondingCurvePDA(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMP_FUN_PROGRAM_ID
  )[0];
}

/**
 * Derives the creator vault PDA
 */
export function deriveCreatorVaultPDA(creator: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('creator-vault'), creator.toBuffer()],
    PUMP_FUN_PROGRAM_ID
  )[0];
}

/**
 * Detects token program (Token vs Token-2022)
 */
async function detectTokenProgram(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const mintAccount = await connection.getAccountInfo(mint);
  if (!mintAccount) throw new Error('Mint account not found');
  
  if (mintAccount.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    return TOKEN_2022_PROGRAM_ID;
  }
  return TOKEN_PROGRAM_ID;
}

/**
 * Fetches and parses bonding curve data
 */
async function fetchBondingCurveData(connection: Connection, bondingCurve: PublicKey): Promise<{
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  creator: PublicKey;
} | null> {
  const account = await connection.getAccountInfo(bondingCurve);
  if (!account || account.data.length < 100) return null;
  
  try {
    const data = account.data;
    // Bonding curve layout (approximate based on reverse engineering):
    // 8 bytes: discriminator
    // 8 bytes: virtual_token_reserves
    // 8 bytes: virtual_sol_reserves  
    // 8 bytes: real_token_reserves
    // 8 bytes: real_sol_reserves
    // 8 bytes: token_total_supply
    // 1 byte: complete
    // 32 bytes: creator pubkey
    
    const virtualTokenReserves = data.readBigUInt64LE(8);
    const virtualSolReserves = data.readBigUInt64LE(16);
    const realTokenReserves = data.readBigUInt64LE(24);
    const realSolReserves = data.readBigUInt64LE(32);
    const tokenTotalSupply = data.readBigUInt64LE(40);
    const complete = data.readUInt8(48) === 1;
    
    // Creator pubkey starts at offset 49 (after complete flag)
    const creatorBytes = data.slice(49, 81);
    const creator = new PublicKey(creatorBytes);
    
    return {
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      tokenTotalSupply,
      complete,
      creator,
    };
  } catch (e) {
    console.error('Error parsing bonding curve:', e);
    return null;
  }
}

/**
 * Fetches complete token info from on-chain
 */
export async function fetchPumpTokenInfo(
  connection: Connection,
  mintAddress: string
): Promise<PumpTokenInfo | null> {
  try {
    const mint = new PublicKey(mintAddress);
    const tokenProgram = await detectTokenProgram(connection, mint);
    const bondingCurve = deriveBondingCurvePDA(mint);
    
    const curveData = await fetchBondingCurveData(connection, bondingCurve);
    if (!curveData) return null;
    
    const associatedBondingCurve = getAssociatedTokenAddressSync(
      mint,
      bondingCurve,
      true,
      tokenProgram
    );
    
    const creatorVault = deriveCreatorVaultPDA(curveData.creator);
    
    return {
      mint,
      bondingCurve,
      associatedBondingCurve,
      coinCreator: curveData.creator,
      creatorVault,
      tokenProgram,
      virtualSolReserves: curveData.virtualSolReserves,
      virtualTokenReserves: curveData.virtualTokenReserves,
      complete: curveData.complete,
    };
  } catch (error) {
    console.error('Error fetching pump token info:', error);
    return null;
  }
}

/**
 * Calculate tokens out for SOL in
 */
export function calculateTokensOut(
  solAmount: number,
  virtualSolReserves: bigint,
  virtualTokenReserves: bigint
): bigint {
  const solLamports = BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));
  const k = virtualSolReserves * virtualTokenReserves;
  const newSolReserves = virtualSolReserves + solLamports;
  const newTokenReserves = k / newSolReserves;
  return virtualTokenReserves - newTokenReserves;
}

/**
 * Creates the buy instruction with all 16 required accounts
 * Account order based on actual successful transaction analysis:
 * 0: global (PDA config)
 * 1: fee_sol_vault (global SOL fee pool - System owned)
 * 2: mint
 * 3: bonding_curve (writable)
 * 4: associated_bonding_curve (token vault for bonding curve - writable)
 * 5: associated_user (user's token ATA - writable)
 * 6: user (signer, writable)
 * 7: system_program
 * 8: token_program
 * 9: coin_creator
 * 10: event_authority
 * 11: program (self)
 * 12: global_volume_accumulator (writable)
 * 13: creator_vault (writable)
 * 14: fee_recipient_vault (owned by fee recipient program)
 * 15: fee_recipient (fee program)
 */
function createBuyInstruction(
  user: PublicKey,
  tokenInfo: PumpTokenInfo,
  associatedUser: PublicKey,
  solAmount: bigint,
  minTokensOut: bigint
): TransactionInstruction {
  // Buy discriminator from IDL: [102, 6, 61, 18, 1, 218, 235, 234]
  const discriminator = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);
  
  // Args: amount (u64), min_sol_output (u64)
  const data = Buffer.alloc(8 + 8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(minTokensOut, 8);  // min tokens out
  data.writeBigUInt64LE(solAmount, 16);    // max sol in
  
  // Select fee sol vault based on token program (Token vs Token-2022)
  const isToken2022 = tokenInfo.tokenProgram.equals(TOKEN_2022_PROGRAM_ID);
  const feeSolVault = isToken2022 ? PUMP_FEE_SOL_VAULT_TOKEN_2022 : PUMP_FEE_SOL_VAULT_TOKEN;
  
  const keys = [
    { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },                    // 0: global config
    { pubkey: feeSolVault, isSigner: false, isWritable: true },                     // 1: fee_sol_vault (Token or Token-2022)
    { pubkey: tokenInfo.mint, isSigner: false, isWritable: false },                 // 2: mint
    { pubkey: tokenInfo.bondingCurve, isSigner: false, isWritable: true },          // 3: bonding_curve
    { pubkey: tokenInfo.associatedBondingCurve, isSigner: false, isWritable: true },// 4: associated_bonding_curve
    { pubkey: associatedUser, isSigner: false, isWritable: true },                  // 5: associated_user
    { pubkey: user, isSigner: true, isWritable: true },                             // 6: user
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },        // 7: system_program
    { pubkey: tokenInfo.tokenProgram, isSigner: false, isWritable: false },         // 8: token_program
    { pubkey: tokenInfo.coinCreator, isSigner: false, isWritable: false },          // 9: coin_creator
    { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },           // 10: event_authority
    { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },            // 11: program
    { pubkey: GLOBAL_VOLUME_ACCUMULATOR, isSigner: false, isWritable: true },       // 12: global_volume_accumulator
    { pubkey: tokenInfo.creatorVault, isSigner: false, isWritable: true },          // 13: creator_vault
    { pubkey: PUMP_FEE_RECIPIENT_VAULT, isSigner: false, isWritable: true },        // 14: fee_recipient_vault
    { pubkey: PUMP_FEE_RECIPIENT, isSigner: false, isWritable: false },             // 15: fee_recipient (program)
  ];
  
  return new TransactionInstruction({
    programId: PUMP_FUN_PROGRAM_ID,
    keys,
    data,
  });
}

/**
 * Gets or creates ATA
 */
async function getOrCreateATA(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram: PublicKey
): Promise<{ address: PublicKey; instruction?: TransactionInstruction }> {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, tokenProgram);
  
  const accountInfo = await connection.getAccountInfo(ata);
  if (accountInfo) {
    return { address: ata };
  }
  
  return {
    address: ata,
    instruction: createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      owner,
      mint,
      tokenProgram
    ),
  };
}

/**
 * Executes a buy on pump.fun bonding curve
 */
export async function buyOnPumpFunV2(
  wallet: Keypair,
  tokenMint: string,
  solAmount: number,
  slippageBps: number = config.defaultSlippageBps,
  walletIndex?: number
): Promise<BuyResult> {
  const connection = createConnection();
  
  try {
    console.log(`  Fetching token info for ${tokenMint.slice(0, 8)}...`);
    const tokenInfo = await fetchPumpTokenInfo(connection, tokenMint);
    
    if (!tokenInfo) {
      return {
        success: false,
        error: 'Token not found or not a pump.fun bonding curve token',
        walletIndex,
      };
    }
    
    if (tokenInfo.complete) {
      return {
        success: false,
        error: 'Token has graduated from bonding curve',
        walletIndex,
      };
    }
    
    // Calculate expected tokens
    const expectedTokens = calculateTokensOut(
      solAmount,
      tokenInfo.virtualSolReserves,
      tokenInfo.virtualTokenReserves
    );
    
    // Apply slippage
    const minTokensOut = expectedTokens * BigInt(10000 - slippageBps) / BigInt(10000);
    const solLamports = BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));
    
    console.log(`  Expected: ~${Number(expectedTokens) / 1e6} tokens`);
    
    // Get or create user ATA
    const { address: userAta, instruction: ataInstruction } = await getOrCreateATA(
      connection,
      wallet,
      tokenInfo.mint,
      wallet.publicKey,
      tokenInfo.tokenProgram
    );
    
    // Build transaction
    const tx = new Transaction();
    
    // Priority fee
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: config.priorityFeeMicroLamports,
    }));
    
    // Compute units
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({
      units: 400000,
    }));
    
    // Create ATA if needed
    if (ataInstruction) {
      tx.add(ataInstruction);
    }
    
    // Buy instruction
    tx.add(createBuyInstruction(
      wallet.publicKey,
      tokenInfo,
      userAta,
      solLamports,
      minTokensOut
    ));
    
    // Get blockhash and send
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [wallet],
      { commitment: 'confirmed', maxRetries: config.maxTxRetries }
    );
    
    return {
      success: true,
      signature,
      tokenAmount: Number(expectedTokens),
      solSpent: solAmount,
      walletIndex,
    };
  } catch (error: any) {
    let errorMsg = error instanceof Error ? error.message : String(error);
    
    // Extract logs if available
    if (error.logs) {
      console.log('  Transaction logs:');
      error.logs.slice(-5).forEach((log: string) => console.log(`    ${log}`));
    }
    
    return {
      success: false,
      error: errorMsg,
      walletIndex,
    };
  }
}

/**
 * Multi-wallet buy (sequential for rate limits)
 */
export async function multiBuyOnPumpFunV2(
  wallets: Keypair[],
  tokenMint: string,
  solAmounts: number[],
  slippageBps: number = config.defaultSlippageBps,
  onProgress?: (result: BuyResult) => void
): Promise<BuyResult[]> {
  const results: BuyResult[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    console.log(`\n  [Wallet ${i}] Buying ${solAmounts[i]} SOL...`);
    
    const result = await buyOnPumpFunV2(
      wallets[i],
      tokenMint,
      solAmounts[i],
      slippageBps,
      i
    );
    
    results.push(result);
    onProgress?.(result);
    
    // Delay between transactions
    if (i < wallets.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  
  return results;
}

