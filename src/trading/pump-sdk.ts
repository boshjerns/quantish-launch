import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import BN from 'bn.js';
import idl from 'pump-anchor-idl';
import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';

const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Fee recipients for Token-2022 tokens
const FEE_RECIPIENT_TOKEN_2022 = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');

export interface BuyResult {
  success: boolean;
  signature?: string;
  tokenAmount?: number;
  solSpent?: number;
  error?: string;
  walletIndex?: number;
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
 * Buys tokens using the pump-anchor SDK
 */
export async function buyWithSDK(
  wallet: Keypair,
  tokenMint: string,
  solAmount: number,
  walletIndex?: number
): Promise<BuyResult> {
  const connection = createConnection();
  
  try {
    const mint = new PublicKey(tokenMint);
    
    // Detect token program
    const tokenProgram = await detectTokenProgram(connection, mint);
    const isToken2022 = tokenProgram.equals(TOKEN_2022_PROGRAM_ID);
    
    console.log(`  Token program: ${isToken2022 ? 'Token-2022' : 'SPL Token'}`);
    
    // Create Anchor provider and program
    const walletAdapter = new Wallet(wallet);
    const provider = new AnchorProvider(
      connection,
      walletAdapter,
      { commitment: 'confirmed' }
    );
    
    const program = new Program(idl as any, provider);
    
    // Get/create user's token account
    const userTokenAccount = getAssociatedTokenAddressSync(
      mint,
      wallet.publicKey,
      false,
      tokenProgram
    );
    
    // Check if ATA exists
    const ataInfo = await connection.getAccountInfo(userTokenAccount);
    
    // Calculate amounts
    const maxSolCost = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));
    // For amount, we want to receive tokens worth approximately solAmount SOL
    // The buy function takes amount of tokens to buy and max SOL to spend
    // We'll use a large token amount and let maxSolCost be the actual limit
    const tokenAmount = new BN('1000000000000000'); // Request a lot, maxSolCost limits it
    
    console.log(`  Buying with max ${solAmount} SOL...`);
    
    // Build transaction
    let txBuilder = program.methods
      .buy(tokenAmount, maxSolCost)
      .accounts({
        mint,
        associatedUser: userTokenAccount,
        feeRecipient: FEE_RECIPIENT_TOKEN_2022,
        program: PUMP_FUN_PROGRAM_ID,
      });
    
    // Add ATA creation if needed
    if (!ataInfo) {
      const createAtaIx = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        userTokenAccount,
        wallet.publicKey,
        mint,
        tokenProgram
      );
      txBuilder = txBuilder.preInstructions([createAtaIx]);
    }
    
    // Send transaction
    const signature = await txBuilder
      .signers([wallet])
      .rpc({ commitment: 'confirmed' });
    
    return {
      success: true,
      signature,
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
 * Multi-wallet buy using SDK
 */
export async function multiBuyWithSDK(
  wallets: Keypair[],
  tokenMint: string,
  solAmounts: number[],
  onProgress?: (result: BuyResult) => void
): Promise<BuyResult[]> {
  const results: BuyResult[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    console.log(`\n  [Wallet ${i}] Buying ${solAmounts[i]} SOL...`);
    
    const result = await buyWithSDK(
      wallets[i],
      tokenMint,
      solAmounts[i],
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
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import BN from 'bn.js';
import idl from 'pump-anchor-idl';
import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';

const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Fee recipients for Token-2022 tokens
const FEE_RECIPIENT_TOKEN_2022 = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');

export interface BuyResult {
  success: boolean;
  signature?: string;
  tokenAmount?: number;
  solSpent?: number;
  error?: string;
  walletIndex?: number;
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
 * Buys tokens using the pump-anchor SDK
 */
export async function buyWithSDK(
  wallet: Keypair,
  tokenMint: string,
  solAmount: number,
  walletIndex?: number
): Promise<BuyResult> {
  const connection = createConnection();
  
  try {
    const mint = new PublicKey(tokenMint);
    
    // Detect token program
    const tokenProgram = await detectTokenProgram(connection, mint);
    const isToken2022 = tokenProgram.equals(TOKEN_2022_PROGRAM_ID);
    
    console.log(`  Token program: ${isToken2022 ? 'Token-2022' : 'SPL Token'}`);
    
    // Create Anchor provider and program
    const walletAdapter = new Wallet(wallet);
    const provider = new AnchorProvider(
      connection,
      walletAdapter,
      { commitment: 'confirmed' }
    );
    
    const program = new Program(idl as any, provider);
    
    // Get/create user's token account
    const userTokenAccount = getAssociatedTokenAddressSync(
      mint,
      wallet.publicKey,
      false,
      tokenProgram
    );
    
    // Check if ATA exists
    const ataInfo = await connection.getAccountInfo(userTokenAccount);
    
    // Calculate amounts
    const maxSolCost = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));
    // For amount, we want to receive tokens worth approximately solAmount SOL
    // The buy function takes amount of tokens to buy and max SOL to spend
    // We'll use a large token amount and let maxSolCost be the actual limit
    const tokenAmount = new BN('1000000000000000'); // Request a lot, maxSolCost limits it
    
    console.log(`  Buying with max ${solAmount} SOL...`);
    
    // Build transaction
    let txBuilder = program.methods
      .buy(tokenAmount, maxSolCost)
      .accounts({
        mint,
        associatedUser: userTokenAccount,
        feeRecipient: FEE_RECIPIENT_TOKEN_2022,
        program: PUMP_FUN_PROGRAM_ID,
      });
    
    // Add ATA creation if needed
    if (!ataInfo) {
      const createAtaIx = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        userTokenAccount,
        wallet.publicKey,
        mint,
        tokenProgram
      );
      txBuilder = txBuilder.preInstructions([createAtaIx]);
    }
    
    // Send transaction
    const signature = await txBuilder
      .signers([wallet])
      .rpc({ commitment: 'confirmed' });
    
    return {
      success: true,
      signature,
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
 * Multi-wallet buy using SDK
 */
export async function multiBuyWithSDK(
  wallets: Keypair[],
  tokenMint: string,
  solAmounts: number[],
  onProgress?: (result: BuyResult) => void
): Promise<BuyResult[]> {
  const results: BuyResult[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    console.log(`\n  [Wallet ${i}] Buying ${solAmounts[i]} SOL...`);
    
    const result = await buyWithSDK(
      wallets[i],
      tokenMint,
      solAmounts[i],
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

