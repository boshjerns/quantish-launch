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
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';

// Pump.fun Program ID
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Global config PDA
const PUMP_GLOBAL = PublicKey.findProgramAddressSync(
  [Buffer.from('global')],
  PUMP_FUN_PROGRAM_ID
)[0];

// Event authority PDA
const PUMP_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

// Global volume accumulator PDA
const GLOBAL_VOLUME_ACCUMULATOR = PublicKey.findProgramAddressSync(
  [Buffer.from('global_volume_accumulator')],
  PUMP_FUN_PROGRAM_ID
)[0];

// Fee recipient program
const PUMP_FEE_RECIPIENT = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');

// Fee recipient vault (owned by fee recipient program)
const PUMP_FEE_RECIPIENT_VAULT = new PublicKey('8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt');

// Fee SOL vault for Token-2022 (from global config offset 322)
const FEE_SOL_VAULT_TOKEN_2022 = new PublicKey('FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz');

// Fee SOL vault for SPL Token (from global config offset 41)
const FEE_SOL_VAULT_SPL = new PublicKey('62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV');

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
 * Derives the user volume accumulator PDA
 */
export function deriveUserVolumeAccumulatorPDA(user: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('user_volume_accumulator'), user.toBuffer()],
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
    // Bonding curve layout:
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
 * Creates the buy instruction with the NEW discriminator and account order
 * Based on successful transaction analysis from Dec 2024
 * 
 * Discriminator: [139, 141, 214, 121, 64, 70, 40, 14]
 * 
 * Account order:
 * 0: global
 * 1: fee_sol_vault (Token-2022 or SPL based on token type)
 * 2: mint
 * 3: bonding_curve
 * 4: associated_bonding_curve
 * 5: associated_user
 * 6: user
 * 7: system_program
 * 8: token_program
 * 9: coin_creator
 * 10: event_authority
 * 11: program
 * 12: global_volume_accumulator
 * 13: user_volume_accumulator (derived from user pubkey)
 * 14: fee_recipient_vault
 * 15: fee_recipient
 */
function createBuyInstructionV3(
  user: PublicKey,
  tokenInfo: PumpTokenInfo,
  associatedUser: PublicKey,
  solAmount: bigint,
  minTokensOut: bigint
): TransactionInstruction {
  // Buy discriminator from IDL
  const discriminator = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);
  
  // Args: amount (u64), min_sol_output (u64)
  const data = Buffer.alloc(8 + 8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(minTokensOut, 8);  // min tokens out
  data.writeBigUInt64LE(solAmount, 16);    // max sol in
  
  // Select fee sol vault based on token program
  const isToken2022 = tokenInfo.tokenProgram.equals(TOKEN_2022_PROGRAM_ID);
  const feeSolVault = isToken2022 ? FEE_SOL_VAULT_TOKEN_2022 : FEE_SOL_VAULT_SPL;
  
  // Derive user volume accumulator PDA
  const userVolumeAccumulator = deriveUserVolumeAccumulatorPDA(user);
  
  const keys = [
    { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },                    // 0: global
    { pubkey: feeSolVault, isSigner: false, isWritable: true },                     // 1: fee_sol_vault
    { pubkey: tokenInfo.mint, isSigner: false, isWritable: false },                 // 2: mint
    { pubkey: tokenInfo.bondingCurve, isSigner: false, isWritable: true },          // 3: bonding_curve
    { pubkey: tokenInfo.associatedBondingCurve, isSigner: false, isWritable: true },// 4: associated_bonding_curve
    { pubkey: associatedUser, isSigner: false, isWritable: true },                  // 5: associated_user
    { pubkey: user, isSigner: true, isWritable: true },                             // 6: user
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },        // 7: system_program
    { pubkey: tokenInfo.tokenProgram, isSigner: false, isWritable: false },         // 8: token_program
    { pubkey: tokenInfo.creatorVault, isSigner: false, isWritable: true },          // 9: creator_vault (PDA, not raw creator)
    { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },           // 10: event_authority
    { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },            // 11: program
    { pubkey: GLOBAL_VOLUME_ACCUMULATOR, isSigner: false, isWritable: true },       // 12: global_volume_accumulator
    { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },           // 13: user_volume_accumulator
    { pubkey: PUMP_FEE_RECIPIENT_VAULT, isSigner: false, isWritable: true },        // 14: fee_recipient_vault
    { pubkey: PUMP_FEE_RECIPIENT, isSigner: false, isWritable: false },             // 15: fee_recipient
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
 * Executes a buy on pump.fun bonding curve (V3 - new instruction format)
 */
export async function buyOnPumpFunV3(
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
    console.log(`  Token program: ${tokenInfo.tokenProgram.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'SPL Token'}`);
    
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
    tx.add(createBuyInstructionV3(
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
export async function multiBuyOnPumpFunV3(
  wallets: Keypair[],
  tokenMint: string,
  solAmounts: number[],
  slippageBps: number = config.defaultSlippageBps,
  onProgress?: (result: BuyResult) => void
): Promise<BuyResult[]> {
  const results: BuyResult[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    console.log(`\n  [Wallet ${i}] Buying ${solAmounts[i]} SOL...`);
    
    const result = await buyOnPumpFunV3(
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

// =============================================================================
// SELL FUNCTIONALITY
// =============================================================================

export interface SellResult {
  success: boolean;
  signature?: string;
  tokensSold?: number;
  solReceived?: number;
  error?: string;
  walletIndex?: number;
}

/**
 * Calculate SOL out for tokens in
 */
export function calculateSolOut(
  tokenAmount: bigint,
  virtualSolReserves: bigint,
  virtualTokenReserves: bigint
): bigint {
  const k = virtualSolReserves * virtualTokenReserves;
  const newTokenReserves = virtualTokenReserves + tokenAmount;
  const newSolReserves = k / newTokenReserves;
  return virtualSolReserves - newSolReserves;
}

/**
 * Creates the sell instruction
 * Based on successful sell transaction analysis - 14 accounts only!
 * Discriminator: [230, 52, 92, 141, 216, 177, 69, 64]
 * 
 * Account order:
 * 0: global
 * 1: fee_sol_vault (uses main vault, not Token-2022 specific)
 * 2: mint
 * 3: bonding_curve
 * 4: associated_bonding_curve
 * 5: associated_user
 * 6: user
 * 7: system_program
 * 8: creator_vault
 * 9: token_program
 * 10: event_authority
 * 11: program
 * 12: fee_recipient_vault
 * 13: fee_recipient
 */
function createSellInstructionV3(
  user: PublicKey,
  tokenInfo: PumpTokenInfo,
  associatedUser: PublicKey,
  tokenAmount: bigint,
  minSolOut: bigint
): TransactionInstruction {
  // Sell discriminator from IDL
  const discriminator = Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]);
  
  // Args: amount (u64), min_sol_output (u64)
  const data = Buffer.alloc(8 + 8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(tokenAmount, 8);   // tokens to sell
  data.writeBigUInt64LE(minSolOut, 16);    // min SOL out
  
  // Sell uses the main fee_sol_vault (from global config offset 41)
  const feeSolVault = FEE_SOL_VAULT_SPL;
  
  const keys = [
    { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },                    // 0: global
    { pubkey: feeSolVault, isSigner: false, isWritable: true },                     // 1: fee_sol_vault
    { pubkey: tokenInfo.mint, isSigner: false, isWritable: false },                 // 2: mint
    { pubkey: tokenInfo.bondingCurve, isSigner: false, isWritable: true },          // 3: bonding_curve
    { pubkey: tokenInfo.associatedBondingCurve, isSigner: false, isWritable: true },// 4: associated_bonding_curve
    { pubkey: associatedUser, isSigner: false, isWritable: true },                  // 5: associated_user
    { pubkey: user, isSigner: true, isWritable: true },                             // 6: user
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },        // 7: system_program
    { pubkey: tokenInfo.creatorVault, isSigner: false, isWritable: true },          // 8: creator_vault
    { pubkey: tokenInfo.tokenProgram, isSigner: false, isWritable: false },         // 9: token_program
    { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },           // 10: event_authority
    { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },            // 11: program
    { pubkey: PUMP_FEE_RECIPIENT_VAULT, isSigner: false, isWritable: true },        // 12: fee_recipient_vault
    { pubkey: PUMP_FEE_RECIPIENT, isSigner: false, isWritable: false },             // 13: fee_recipient
  ];
  
  return new TransactionInstruction({
    programId: PUMP_FUN_PROGRAM_ID,
    keys,
    data,
  });
}

/**
 * Gets token balance for a wallet
 */
export async function getTokenBalance(
  connection: Connection,
  wallet: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey
): Promise<bigint> {
  try {
    const ata = getAssociatedTokenAddressSync(mint, wallet, false, tokenProgram);
    const accountInfo = await connection.getTokenAccountBalance(ata);
    return BigInt(accountInfo.value.amount);
  } catch {
    return BigInt(0);
  }
}

/**
 * Sells tokens on pump.fun bonding curve
 */
export async function sellOnPumpFunV3(
  wallet: Keypair,
  tokenMint: string,
  tokenAmount: bigint | 'all' | 'half',
  slippageBps: number = config.defaultSlippageBps,
  walletIndex?: number
): Promise<SellResult> {
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
        error: 'Token has graduated from bonding curve - use Jupiter to sell',
        walletIndex,
      };
    }
    
    // Get user's token balance
    const balance = await getTokenBalance(
      connection,
      wallet.publicKey,
      tokenInfo.mint,
      tokenInfo.tokenProgram
    );
    
    if (balance === BigInt(0)) {
      return {
        success: false,
        error: 'No tokens to sell',
        walletIndex,
      };
    }
    
    // Determine amount to sell
    let sellAmount: bigint;
    if (tokenAmount === 'all') {
      sellAmount = balance;
    } else if (tokenAmount === 'half') {
      sellAmount = balance / BigInt(2);
    } else {
      sellAmount = tokenAmount;
    }
    
    if (sellAmount > balance) {
      return {
        success: false,
        error: `Insufficient balance. Have ${balance}, want to sell ${sellAmount}`,
        walletIndex,
      };
    }
    
    // Calculate expected SOL
    const expectedSol = calculateSolOut(
      sellAmount,
      tokenInfo.virtualSolReserves,
      tokenInfo.virtualTokenReserves
    );
    
    // Apply slippage
    const minSolOut = expectedSol * BigInt(10000 - slippageBps) / BigInt(10000);
    
    console.log(`  Selling ${Number(sellAmount) / 1e6} tokens...`);
    console.log(`  Expected: ~${Number(expectedSol) / LAMPORTS_PER_SOL} SOL`);
    
    // Get user's ATA
    const userAta = getAssociatedTokenAddressSync(
      tokenInfo.mint,
      wallet.publicKey,
      false,
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
    
    // Sell instruction
    tx.add(createSellInstructionV3(
      wallet.publicKey,
      tokenInfo,
      userAta,
      sellAmount,
      minSolOut
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
      tokensSold: Number(sellAmount),
      solReceived: Number(expectedSol) / LAMPORTS_PER_SOL,
      walletIndex,
    };
  } catch (error: any) {
    let errorMsg = error instanceof Error ? error.message : String(error);
    
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
 * Multi-wallet sell
 */
export async function multiSellOnPumpFunV3(
  wallets: Keypair[],
  tokenMint: string,
  sellMode: 'all' | 'half',
  slippageBps: number = config.defaultSlippageBps,
  onProgress?: (result: SellResult) => void
): Promise<SellResult[]> {
  const results: SellResult[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    console.log(`\n  [Wallet ${i}] Selling ${sellMode}...`);
    
    const result = await sellOnPumpFunV3(
      wallets[i],
      tokenMint,
      sellMode,
      slippageBps,
      i
    );
    
    results.push(result);
    onProgress?.(result);
    
    if (i < wallets.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  
  return results;
}

// =============================================================================
// TOKEN TRANSFER FUNCTIONALITY
// =============================================================================

import {
  createTransferCheckedInstruction,
  getMint,
} from '@solana/spl-token';

export interface TransferResult {
  success: boolean;
  signature?: string;
  amount?: number;
  error?: string;
  walletIndex?: number;
}

/**
 * Transfer tokens from one wallet to another
 */
export async function transferTokens(
  fromWallet: Keypair,
  toWallet: PublicKey,
  tokenMint: string,
  amount: bigint | 'all' | 'half',
  walletIndex?: number
): Promise<TransferResult> {
  const connection = createConnection();
  
  try {
    const mint = new PublicKey(tokenMint);
    
    // Detect token program
    const mintAccount = await connection.getAccountInfo(mint);
    if (!mintAccount) throw new Error('Mint not found');
    const tokenProgram = mintAccount.owner;
    
    // Get decimals
    const mintInfo = await getMint(connection, mint, 'confirmed', tokenProgram);
    const decimals = mintInfo.decimals;
    
    // Get source ATA
    const sourceAta = getAssociatedTokenAddressSync(mint, fromWallet.publicKey, false, tokenProgram);
    
    // Get balance
    const balanceInfo = await connection.getTokenAccountBalance(sourceAta);
    const balance = BigInt(balanceInfo.value.amount);
    
    if (balance === BigInt(0)) {
      return { success: false, error: 'No tokens to transfer', walletIndex };
    }
    
    // Determine transfer amount
    let transferAmount: bigint;
    if (amount === 'all') {
      transferAmount = balance;
    } else if (amount === 'half') {
      transferAmount = balance / BigInt(2);
    } else {
      transferAmount = amount;
    }
    
    // Get or create destination ATA
    const destAta = getAssociatedTokenAddressSync(mint, toWallet, false, tokenProgram);
    const destAtaInfo = await connection.getAccountInfo(destAta);
    
    const tx = new Transaction();
    
    // Priority fee
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: config.priorityFeeMicroLamports,
    }));
    
    // Create destination ATA if needed
    if (!destAtaInfo) {
      tx.add(createAssociatedTokenAccountInstruction(
        fromWallet.publicKey,
        destAta,
        toWallet,
        mint,
        tokenProgram
      ));
    }
    
    // Transfer
    tx.add(createTransferCheckedInstruction(
      sourceAta,
      mint,
      destAta,
      fromWallet.publicKey,
      transferAmount,
      decimals,
      [],
      tokenProgram
    ));
    
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = fromWallet.publicKey;
    
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [fromWallet],
      { commitment: 'confirmed' }
    );
    
    return {
      success: true,
      signature,
      amount: Number(transferAmount),
      walletIndex,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      walletIndex,
    };
  }
}

/**
 * Aggregate tokens from multiple wallets to a destination
 */
export async function aggregateTokens(
  fromWallets: Keypair[],
  toWallet: PublicKey,
  tokenMint: string,
  mode: 'all' | 'half',
  onProgress?: (result: TransferResult) => void
): Promise<TransferResult[]> {
  const results: TransferResult[] = [];
  
  for (let i = 0; i < fromWallets.length; i++) {
    console.log(`\n  [Wallet ${i}] Transferring ${mode}...`);
    
    const result = await transferTokens(
      fromWallets[i],
      toWallet,
      tokenMint,
      mode,
      i
    );
    
    results.push(result);
    onProgress?.(result);
    
    if (i < fromWallets.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
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
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';

// Pump.fun Program ID
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Global config PDA
const PUMP_GLOBAL = PublicKey.findProgramAddressSync(
  [Buffer.from('global')],
  PUMP_FUN_PROGRAM_ID
)[0];

// Event authority PDA
const PUMP_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

// Global volume accumulator PDA
const GLOBAL_VOLUME_ACCUMULATOR = PublicKey.findProgramAddressSync(
  [Buffer.from('global_volume_accumulator')],
  PUMP_FUN_PROGRAM_ID
)[0];

// Fee recipient program
const PUMP_FEE_RECIPIENT = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');

// Fee recipient vault (owned by fee recipient program)
const PUMP_FEE_RECIPIENT_VAULT = new PublicKey('8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt');

// Fee SOL vault for Token-2022 (from global config offset 322)
const FEE_SOL_VAULT_TOKEN_2022 = new PublicKey('FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz');

// Fee SOL vault for SPL Token (from global config offset 41)
const FEE_SOL_VAULT_SPL = new PublicKey('62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV');

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
 * Derives the user volume accumulator PDA
 */
export function deriveUserVolumeAccumulatorPDA(user: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('user_volume_accumulator'), user.toBuffer()],
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
    // Bonding curve layout:
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
 * Creates the buy instruction with the NEW discriminator and account order
 * Based on successful transaction analysis from Dec 2024
 * 
 * Discriminator: [139, 141, 214, 121, 64, 70, 40, 14]
 * 
 * Account order:
 * 0: global
 * 1: fee_sol_vault (Token-2022 or SPL based on token type)
 * 2: mint
 * 3: bonding_curve
 * 4: associated_bonding_curve
 * 5: associated_user
 * 6: user
 * 7: system_program
 * 8: token_program
 * 9: coin_creator
 * 10: event_authority
 * 11: program
 * 12: global_volume_accumulator
 * 13: user_volume_accumulator (derived from user pubkey)
 * 14: fee_recipient_vault
 * 15: fee_recipient
 */
function createBuyInstructionV3(
  user: PublicKey,
  tokenInfo: PumpTokenInfo,
  associatedUser: PublicKey,
  solAmount: bigint,
  minTokensOut: bigint
): TransactionInstruction {
  // Buy discriminator from IDL
  const discriminator = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);
  
  // Args: amount (u64), min_sol_output (u64)
  const data = Buffer.alloc(8 + 8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(minTokensOut, 8);  // min tokens out
  data.writeBigUInt64LE(solAmount, 16);    // max sol in
  
  // Select fee sol vault based on token program
  const isToken2022 = tokenInfo.tokenProgram.equals(TOKEN_2022_PROGRAM_ID);
  const feeSolVault = isToken2022 ? FEE_SOL_VAULT_TOKEN_2022 : FEE_SOL_VAULT_SPL;
  
  // Derive user volume accumulator PDA
  const userVolumeAccumulator = deriveUserVolumeAccumulatorPDA(user);
  
  const keys = [
    { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },                    // 0: global
    { pubkey: feeSolVault, isSigner: false, isWritable: true },                     // 1: fee_sol_vault
    { pubkey: tokenInfo.mint, isSigner: false, isWritable: false },                 // 2: mint
    { pubkey: tokenInfo.bondingCurve, isSigner: false, isWritable: true },          // 3: bonding_curve
    { pubkey: tokenInfo.associatedBondingCurve, isSigner: false, isWritable: true },// 4: associated_bonding_curve
    { pubkey: associatedUser, isSigner: false, isWritable: true },                  // 5: associated_user
    { pubkey: user, isSigner: true, isWritable: true },                             // 6: user
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },        // 7: system_program
    { pubkey: tokenInfo.tokenProgram, isSigner: false, isWritable: false },         // 8: token_program
    { pubkey: tokenInfo.creatorVault, isSigner: false, isWritable: true },          // 9: creator_vault (PDA, not raw creator)
    { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },           // 10: event_authority
    { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },            // 11: program
    { pubkey: GLOBAL_VOLUME_ACCUMULATOR, isSigner: false, isWritable: true },       // 12: global_volume_accumulator
    { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },           // 13: user_volume_accumulator
    { pubkey: PUMP_FEE_RECIPIENT_VAULT, isSigner: false, isWritable: true },        // 14: fee_recipient_vault
    { pubkey: PUMP_FEE_RECIPIENT, isSigner: false, isWritable: false },             // 15: fee_recipient
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
 * Executes a buy on pump.fun bonding curve (V3 - new instruction format)
 */
export async function buyOnPumpFunV3(
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
    console.log(`  Token program: ${tokenInfo.tokenProgram.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'SPL Token'}`);
    
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
    tx.add(createBuyInstructionV3(
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
export async function multiBuyOnPumpFunV3(
  wallets: Keypair[],
  tokenMint: string,
  solAmounts: number[],
  slippageBps: number = config.defaultSlippageBps,
  onProgress?: (result: BuyResult) => void
): Promise<BuyResult[]> {
  const results: BuyResult[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    console.log(`\n  [Wallet ${i}] Buying ${solAmounts[i]} SOL...`);
    
    const result = await buyOnPumpFunV3(
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

// =============================================================================
// SELL FUNCTIONALITY
// =============================================================================

export interface SellResult {
  success: boolean;
  signature?: string;
  tokensSold?: number;
  solReceived?: number;
  error?: string;
  walletIndex?: number;
}

/**
 * Calculate SOL out for tokens in
 */
export function calculateSolOut(
  tokenAmount: bigint,
  virtualSolReserves: bigint,
  virtualTokenReserves: bigint
): bigint {
  const k = virtualSolReserves * virtualTokenReserves;
  const newTokenReserves = virtualTokenReserves + tokenAmount;
  const newSolReserves = k / newTokenReserves;
  return virtualSolReserves - newSolReserves;
}

/**
 * Creates the sell instruction
 * Based on successful sell transaction analysis - 14 accounts only!
 * Discriminator: [230, 52, 92, 141, 216, 177, 69, 64]
 * 
 * Account order:
 * 0: global
 * 1: fee_sol_vault (uses main vault, not Token-2022 specific)
 * 2: mint
 * 3: bonding_curve
 * 4: associated_bonding_curve
 * 5: associated_user
 * 6: user
 * 7: system_program
 * 8: creator_vault
 * 9: token_program
 * 10: event_authority
 * 11: program
 * 12: fee_recipient_vault
 * 13: fee_recipient
 */
function createSellInstructionV3(
  user: PublicKey,
  tokenInfo: PumpTokenInfo,
  associatedUser: PublicKey,
  tokenAmount: bigint,
  minSolOut: bigint
): TransactionInstruction {
  // Sell discriminator from IDL
  const discriminator = Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]);
  
  // Args: amount (u64), min_sol_output (u64)
  const data = Buffer.alloc(8 + 8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(tokenAmount, 8);   // tokens to sell
  data.writeBigUInt64LE(minSolOut, 16);    // min SOL out
  
  // Sell uses the main fee_sol_vault (from global config offset 41)
  const feeSolVault = FEE_SOL_VAULT_SPL;
  
  const keys = [
    { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },                    // 0: global
    { pubkey: feeSolVault, isSigner: false, isWritable: true },                     // 1: fee_sol_vault
    { pubkey: tokenInfo.mint, isSigner: false, isWritable: false },                 // 2: mint
    { pubkey: tokenInfo.bondingCurve, isSigner: false, isWritable: true },          // 3: bonding_curve
    { pubkey: tokenInfo.associatedBondingCurve, isSigner: false, isWritable: true },// 4: associated_bonding_curve
    { pubkey: associatedUser, isSigner: false, isWritable: true },                  // 5: associated_user
    { pubkey: user, isSigner: true, isWritable: true },                             // 6: user
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },        // 7: system_program
    { pubkey: tokenInfo.creatorVault, isSigner: false, isWritable: true },          // 8: creator_vault
    { pubkey: tokenInfo.tokenProgram, isSigner: false, isWritable: false },         // 9: token_program
    { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },           // 10: event_authority
    { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },            // 11: program
    { pubkey: PUMP_FEE_RECIPIENT_VAULT, isSigner: false, isWritable: true },        // 12: fee_recipient_vault
    { pubkey: PUMP_FEE_RECIPIENT, isSigner: false, isWritable: false },             // 13: fee_recipient
  ];
  
  return new TransactionInstruction({
    programId: PUMP_FUN_PROGRAM_ID,
    keys,
    data,
  });
}

/**
 * Gets token balance for a wallet
 */
export async function getTokenBalance(
  connection: Connection,
  wallet: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey
): Promise<bigint> {
  try {
    const ata = getAssociatedTokenAddressSync(mint, wallet, false, tokenProgram);
    const accountInfo = await connection.getTokenAccountBalance(ata);
    return BigInt(accountInfo.value.amount);
  } catch {
    return BigInt(0);
  }
}

/**
 * Sells tokens on pump.fun bonding curve
 */
export async function sellOnPumpFunV3(
  wallet: Keypair,
  tokenMint: string,
  tokenAmount: bigint | 'all' | 'half',
  slippageBps: number = config.defaultSlippageBps,
  walletIndex?: number
): Promise<SellResult> {
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
        error: 'Token has graduated from bonding curve - use Jupiter to sell',
        walletIndex,
      };
    }
    
    // Get user's token balance
    const balance = await getTokenBalance(
      connection,
      wallet.publicKey,
      tokenInfo.mint,
      tokenInfo.tokenProgram
    );
    
    if (balance === BigInt(0)) {
      return {
        success: false,
        error: 'No tokens to sell',
        walletIndex,
      };
    }
    
    // Determine amount to sell
    let sellAmount: bigint;
    if (tokenAmount === 'all') {
      sellAmount = balance;
    } else if (tokenAmount === 'half') {
      sellAmount = balance / BigInt(2);
    } else {
      sellAmount = tokenAmount;
    }
    
    if (sellAmount > balance) {
      return {
        success: false,
        error: `Insufficient balance. Have ${balance}, want to sell ${sellAmount}`,
        walletIndex,
      };
    }
    
    // Calculate expected SOL
    const expectedSol = calculateSolOut(
      sellAmount,
      tokenInfo.virtualSolReserves,
      tokenInfo.virtualTokenReserves
    );
    
    // Apply slippage
    const minSolOut = expectedSol * BigInt(10000 - slippageBps) / BigInt(10000);
    
    console.log(`  Selling ${Number(sellAmount) / 1e6} tokens...`);
    console.log(`  Expected: ~${Number(expectedSol) / LAMPORTS_PER_SOL} SOL`);
    
    // Get user's ATA
    const userAta = getAssociatedTokenAddressSync(
      tokenInfo.mint,
      wallet.publicKey,
      false,
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
    
    // Sell instruction
    tx.add(createSellInstructionV3(
      wallet.publicKey,
      tokenInfo,
      userAta,
      sellAmount,
      minSolOut
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
      tokensSold: Number(sellAmount),
      solReceived: Number(expectedSol) / LAMPORTS_PER_SOL,
      walletIndex,
    };
  } catch (error: any) {
    let errorMsg = error instanceof Error ? error.message : String(error);
    
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
 * Multi-wallet sell
 */
export async function multiSellOnPumpFunV3(
  wallets: Keypair[],
  tokenMint: string,
  sellMode: 'all' | 'half',
  slippageBps: number = config.defaultSlippageBps,
  onProgress?: (result: SellResult) => void
): Promise<SellResult[]> {
  const results: SellResult[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    console.log(`\n  [Wallet ${i}] Selling ${sellMode}...`);
    
    const result = await sellOnPumpFunV3(
      wallets[i],
      tokenMint,
      sellMode,
      slippageBps,
      i
    );
    
    results.push(result);
    onProgress?.(result);
    
    if (i < wallets.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  
  return results;
}

// =============================================================================
// TOKEN TRANSFER FUNCTIONALITY
// =============================================================================

import {
  createTransferCheckedInstruction,
  getMint,
} from '@solana/spl-token';

export interface TransferResult {
  success: boolean;
  signature?: string;
  amount?: number;
  error?: string;
  walletIndex?: number;
}

/**
 * Transfer tokens from one wallet to another
 */
export async function transferTokens(
  fromWallet: Keypair,
  toWallet: PublicKey,
  tokenMint: string,
  amount: bigint | 'all' | 'half',
  walletIndex?: number
): Promise<TransferResult> {
  const connection = createConnection();
  
  try {
    const mint = new PublicKey(tokenMint);
    
    // Detect token program
    const mintAccount = await connection.getAccountInfo(mint);
    if (!mintAccount) throw new Error('Mint not found');
    const tokenProgram = mintAccount.owner;
    
    // Get decimals
    const mintInfo = await getMint(connection, mint, 'confirmed', tokenProgram);
    const decimals = mintInfo.decimals;
    
    // Get source ATA
    const sourceAta = getAssociatedTokenAddressSync(mint, fromWallet.publicKey, false, tokenProgram);
    
    // Get balance
    const balanceInfo = await connection.getTokenAccountBalance(sourceAta);
    const balance = BigInt(balanceInfo.value.amount);
    
    if (balance === BigInt(0)) {
      return { success: false, error: 'No tokens to transfer', walletIndex };
    }
    
    // Determine transfer amount
    let transferAmount: bigint;
    if (amount === 'all') {
      transferAmount = balance;
    } else if (amount === 'half') {
      transferAmount = balance / BigInt(2);
    } else {
      transferAmount = amount;
    }
    
    // Get or create destination ATA
    const destAta = getAssociatedTokenAddressSync(mint, toWallet, false, tokenProgram);
    const destAtaInfo = await connection.getAccountInfo(destAta);
    
    const tx = new Transaction();
    
    // Priority fee
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: config.priorityFeeMicroLamports,
    }));
    
    // Create destination ATA if needed
    if (!destAtaInfo) {
      tx.add(createAssociatedTokenAccountInstruction(
        fromWallet.publicKey,
        destAta,
        toWallet,
        mint,
        tokenProgram
      ));
    }
    
    // Transfer
    tx.add(createTransferCheckedInstruction(
      sourceAta,
      mint,
      destAta,
      fromWallet.publicKey,
      transferAmount,
      decimals,
      [],
      tokenProgram
    ));
    
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = fromWallet.publicKey;
    
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [fromWallet],
      { commitment: 'confirmed' }
    );
    
    return {
      success: true,
      signature,
      amount: Number(transferAmount),
      walletIndex,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      walletIndex,
    };
  }
}

/**
 * Aggregate tokens from multiple wallets to a destination
 */
export async function aggregateTokens(
  fromWallets: Keypair[],
  toWallet: PublicKey,
  tokenMint: string,
  mode: 'all' | 'half',
  onProgress?: (result: TransferResult) => void
): Promise<TransferResult[]> {
  const results: TransferResult[] = [];
  
  for (let i = 0; i < fromWallets.length; i++) {
    console.log(`\n  [Wallet ${i}] Transferring ${mode}...`);
    
    const result = await transferTokens(
      fromWallets[i],
      toWallet,
      tokenMint,
      mode,
      i
    );
    
    results.push(result);
    onProgress?.(result);
    
    if (i < fromWallets.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  return results;
}

