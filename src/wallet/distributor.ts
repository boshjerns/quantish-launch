import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { config } from '../config/index.js';
import { getAllKeypairs, loadWalletStore } from './generator.js';
import { base58ToKeypair } from './generator.js';

export interface DistributionPlan {
  walletIndex: number;
  publicKey: string;
  amountSol: number;
  amountLamports: bigint;
}

export interface DistributionResult {
  walletIndex: number;
  publicKey: string;
  amountSol: number;
  signature?: string;
  success: boolean;
  error?: string;
}

/**
 * Gets the master wallet keypair from config
 */
export function getMasterKeypair(): Keypair {
  if (!config.masterWalletPrivateKey) {
    throw new Error('Master wallet private key not configured in environment');
  }
  return base58ToKeypair(config.masterWalletPrivateKey);
}

/**
 * Creates a Solana connection
 */
export function createConnection(): Connection {
  return new Connection(config.rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: config.txTimeoutMs,
  });
}

/**
 * Gets the SOL balance of a wallet
 */
export async function getBalance(connection: Connection, publicKey: PublicKey): Promise<number> {
  const balance = await connection.getBalance(publicKey);
  return balance / LAMPORTS_PER_SOL;
}

/**
 * Gets balances for all wallets in the store
 */
export async function getAllBalances(connection: Connection, password: string): Promise<Map<string, number>> {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  const balances = new Map<string, number>();
  
  for (const wallet of store.wallets) {
    const publicKey = new PublicKey(wallet.publicKey);
    const balance = await getBalance(connection, publicKey);
    balances.set(wallet.publicKey, balance);
  }
  
  return balances;
}

/**
 * Creates an equal distribution plan
 */
export function createEqualDistributionPlan(
  totalAmountSol: number,
  walletCount: number,
  password: string
): DistributionPlan[] {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  const amountPerWallet = totalAmountSol / walletCount;
  const amountLamports = BigInt(Math.floor(amountPerWallet * LAMPORTS_PER_SOL));
  
  return store.wallets.slice(0, walletCount).map(wallet => ({
    walletIndex: wallet.index,
    publicKey: wallet.publicKey,
    amountSol: amountPerWallet,
    amountLamports,
  }));
}

/**
 * Creates a custom distribution plan with specific amounts
 */
export function createCustomDistributionPlan(
  amounts: { index: number; amountSol: number }[],
  password: string
): DistributionPlan[] {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  return amounts.map(({ index, amountSol }) => {
    const wallet = store.wallets.find(w => w.index === index);
    
    if (!wallet) {
      throw new Error(`Wallet at index ${index} not found`);
    }
    
    return {
      walletIndex: index,
      publicKey: wallet.publicKey,
      amountSol,
      amountLamports: BigInt(Math.floor(amountSol * LAMPORTS_PER_SOL)),
    };
  });
}

/**
 * Creates a weighted distribution plan (percentages)
 */
export function createWeightedDistributionPlan(
  totalAmountSol: number,
  weights: number[],
  password: string
): DistributionPlan[] {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  
  return store.wallets.slice(0, weights.length).map((wallet, i) => {
    const percentage = weights[i] / totalWeight;
    const amountSol = totalAmountSol * percentage;
    
    return {
      walletIndex: wallet.index,
      publicKey: wallet.publicKey,
      amountSol,
      amountLamports: BigInt(Math.floor(amountSol * LAMPORTS_PER_SOL)),
    };
  });
}

/**
 * Executes a single transfer from master wallet
 */
async function executeTransfer(
  connection: Connection,
  masterKeypair: Keypair,
  destinationPubkey: PublicKey,
  lamports: bigint
): Promise<string> {
  const transaction = new Transaction();
  
  // Add priority fee for faster confirmation
  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: config.priorityFeeMicroLamports,
    })
  );
  
  // Add transfer instruction
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: masterKeypair.publicKey,
      toPubkey: destinationPubkey,
      lamports,
    })
  );
  
  // Send and confirm
  const signature = await sendAndConfirmTransaction(connection, transaction, [masterKeypair], {
    commitment: 'confirmed',
    maxRetries: config.maxTxRetries,
  });
  
  return signature;
}

/**
 * Distributes SOL according to the plan
 */
export async function distributeSOL(
  plan: DistributionPlan[],
  onProgress?: (result: DistributionResult) => void
): Promise<DistributionResult[]> {
  const connection = createConnection();
  const masterKeypair = getMasterKeypair();
  
  // Check master wallet balance
  const masterBalance = await getBalance(connection, masterKeypair.publicKey);
  const totalRequired = plan.reduce((sum, p) => sum + p.amountSol, 0);
  
  // Add buffer for transaction fees (~0.0001 SOL per transaction with priority fees)
  const feeBuffer = plan.length * 0.0005;
  
  if (masterBalance < totalRequired + feeBuffer) {
    throw new Error(
      `Insufficient balance in master wallet. Required: ${(totalRequired + feeBuffer).toFixed(4)} SOL, Available: ${masterBalance.toFixed(4)} SOL`
    );
  }
  
  const results: DistributionResult[] = [];
  
  for (const item of plan) {
    const result: DistributionResult = {
      walletIndex: item.walletIndex,
      publicKey: item.publicKey,
      amountSol: item.amountSol,
      success: false,
    };
    
    try {
      const signature = await executeTransfer(
        connection,
        masterKeypair,
        new PublicKey(item.publicKey),
        item.amountLamports
      );
      
      result.signature = signature;
      result.success = true;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }
    
    results.push(result);
    onProgress?.(result);
    
    // Small delay between transactions to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
}

/**
 * Collects all SOL from sub-wallets back to master wallet
 */
export async function collectToMaster(
  password: string,
  onProgress?: (walletIndex: number, success: boolean, error?: string) => void
): Promise<{ total: number; collected: number; errors: string[] }> {
  const connection = createConnection();
  const masterKeypair = getMasterKeypair();
  const subWallets = getAllKeypairs(password);
  
  let totalCollected = 0;
  const errors: string[] = [];
  
  for (let i = 0; i < subWallets.length; i++) {
    const wallet = subWallets[i];
    
    try {
      const balance = await connection.getBalance(wallet.publicKey);
      
      // Leave enough for transaction fee
      const feeReserve = 5000; // 0.000005 SOL
      const amountToSend = balance - feeReserve;
      
      if (amountToSend <= 0) {
        onProgress?.(i, true);
        continue;
      }
      
      const transaction = new Transaction();
      
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: config.priorityFeeMicroLamports,
        })
      );
      
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: masterKeypair.publicKey,
          lamports: BigInt(amountToSend),
        })
      );
      
      await sendAndConfirmTransaction(connection, transaction, [wallet], {
        commitment: 'confirmed',
        maxRetries: config.maxTxRetries,
      });
      
      totalCollected += amountToSend / LAMPORTS_PER_SOL;
      onProgress?.(i, true);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Wallet ${i}: ${errMsg}`);
      onProgress?.(i, false, errMsg);
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return {
    total: subWallets.length,
    collected: totalCollected,
    errors,
  };
}


  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { config } from '../config/index.js';
import { getAllKeypairs, loadWalletStore } from './generator.js';
import { base58ToKeypair } from './generator.js';

export interface DistributionPlan {
  walletIndex: number;
  publicKey: string;
  amountSol: number;
  amountLamports: bigint;
}

export interface DistributionResult {
  walletIndex: number;
  publicKey: string;
  amountSol: number;
  signature?: string;
  success: boolean;
  error?: string;
}

/**
 * Gets the master wallet keypair from config
 */
export function getMasterKeypair(): Keypair {
  if (!config.masterWalletPrivateKey) {
    throw new Error('Master wallet private key not configured in environment');
  }
  return base58ToKeypair(config.masterWalletPrivateKey);
}

/**
 * Creates a Solana connection
 */
export function createConnection(): Connection {
  return new Connection(config.rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: config.txTimeoutMs,
  });
}

/**
 * Gets the SOL balance of a wallet
 */
export async function getBalance(connection: Connection, publicKey: PublicKey): Promise<number> {
  const balance = await connection.getBalance(publicKey);
  return balance / LAMPORTS_PER_SOL;
}

/**
 * Gets balances for all wallets in the store
 */
export async function getAllBalances(connection: Connection, password: string): Promise<Map<string, number>> {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  const balances = new Map<string, number>();
  
  for (const wallet of store.wallets) {
    const publicKey = new PublicKey(wallet.publicKey);
    const balance = await getBalance(connection, publicKey);
    balances.set(wallet.publicKey, balance);
  }
  
  return balances;
}

/**
 * Creates an equal distribution plan
 */
export function createEqualDistributionPlan(
  totalAmountSol: number,
  walletCount: number,
  password: string
): DistributionPlan[] {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  const amountPerWallet = totalAmountSol / walletCount;
  const amountLamports = BigInt(Math.floor(amountPerWallet * LAMPORTS_PER_SOL));
  
  return store.wallets.slice(0, walletCount).map(wallet => ({
    walletIndex: wallet.index,
    publicKey: wallet.publicKey,
    amountSol: amountPerWallet,
    amountLamports,
  }));
}

/**
 * Creates a custom distribution plan with specific amounts
 */
export function createCustomDistributionPlan(
  amounts: { index: number; amountSol: number }[],
  password: string
): DistributionPlan[] {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  return amounts.map(({ index, amountSol }) => {
    const wallet = store.wallets.find(w => w.index === index);
    
    if (!wallet) {
      throw new Error(`Wallet at index ${index} not found`);
    }
    
    return {
      walletIndex: index,
      publicKey: wallet.publicKey,
      amountSol,
      amountLamports: BigInt(Math.floor(amountSol * LAMPORTS_PER_SOL)),
    };
  });
}

/**
 * Creates a weighted distribution plan (percentages)
 */
export function createWeightedDistributionPlan(
  totalAmountSol: number,
  weights: number[],
  password: string
): DistributionPlan[] {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  
  return store.wallets.slice(0, weights.length).map((wallet, i) => {
    const percentage = weights[i] / totalWeight;
    const amountSol = totalAmountSol * percentage;
    
    return {
      walletIndex: wallet.index,
      publicKey: wallet.publicKey,
      amountSol,
      amountLamports: BigInt(Math.floor(amountSol * LAMPORTS_PER_SOL)),
    };
  });
}

/**
 * Executes a single transfer from master wallet
 */
async function executeTransfer(
  connection: Connection,
  masterKeypair: Keypair,
  destinationPubkey: PublicKey,
  lamports: bigint
): Promise<string> {
  const transaction = new Transaction();
  
  // Add priority fee for faster confirmation
  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: config.priorityFeeMicroLamports,
    })
  );
  
  // Add transfer instruction
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: masterKeypair.publicKey,
      toPubkey: destinationPubkey,
      lamports,
    })
  );
  
  // Send and confirm
  const signature = await sendAndConfirmTransaction(connection, transaction, [masterKeypair], {
    commitment: 'confirmed',
    maxRetries: config.maxTxRetries,
  });
  
  return signature;
}

/**
 * Distributes SOL according to the plan
 */
export async function distributeSOL(
  plan: DistributionPlan[],
  onProgress?: (result: DistributionResult) => void
): Promise<DistributionResult[]> {
  const connection = createConnection();
  const masterKeypair = getMasterKeypair();
  
  // Check master wallet balance
  const masterBalance = await getBalance(connection, masterKeypair.publicKey);
  const totalRequired = plan.reduce((sum, p) => sum + p.amountSol, 0);
  
  // Add buffer for transaction fees (~0.0001 SOL per transaction with priority fees)
  const feeBuffer = plan.length * 0.0005;
  
  if (masterBalance < totalRequired + feeBuffer) {
    throw new Error(
      `Insufficient balance in master wallet. Required: ${(totalRequired + feeBuffer).toFixed(4)} SOL, Available: ${masterBalance.toFixed(4)} SOL`
    );
  }
  
  const results: DistributionResult[] = [];
  
  for (const item of plan) {
    const result: DistributionResult = {
      walletIndex: item.walletIndex,
      publicKey: item.publicKey,
      amountSol: item.amountSol,
      success: false,
    };
    
    try {
      const signature = await executeTransfer(
        connection,
        masterKeypair,
        new PublicKey(item.publicKey),
        item.amountLamports
      );
      
      result.signature = signature;
      result.success = true;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }
    
    results.push(result);
    onProgress?.(result);
    
    // Small delay between transactions to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
}

/**
 * Collects all SOL from sub-wallets back to master wallet
 */
export async function collectToMaster(
  password: string,
  onProgress?: (walletIndex: number, success: boolean, error?: string) => void
): Promise<{ total: number; collected: number; errors: string[] }> {
  const connection = createConnection();
  const masterKeypair = getMasterKeypair();
  const subWallets = getAllKeypairs(password);
  
  let totalCollected = 0;
  const errors: string[] = [];
  
  for (let i = 0; i < subWallets.length; i++) {
    const wallet = subWallets[i];
    
    try {
      const balance = await connection.getBalance(wallet.publicKey);
      
      // Leave enough for transaction fee
      const feeReserve = 5000; // 0.000005 SOL
      const amountToSend = balance - feeReserve;
      
      if (amountToSend <= 0) {
        onProgress?.(i, true);
        continue;
      }
      
      const transaction = new Transaction();
      
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: config.priorityFeeMicroLamports,
        })
      );
      
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: masterKeypair.publicKey,
          lamports: BigInt(amountToSend),
        })
      );
      
      await sendAndConfirmTransaction(connection, transaction, [wallet], {
        commitment: 'confirmed',
        maxRetries: config.maxTxRetries,
      });
      
      totalCollected += amountToSend / LAMPORTS_PER_SOL;
      onProgress?.(i, true);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Wallet ${i}: ${errMsg}`);
      onProgress?.(i, false, errMsg);
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return {
    total: subWallets.length,
    collected: totalCollected,
    errors,
  };
}

