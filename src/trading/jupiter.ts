import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';

// Jupiter Ultra API (new) - requires API key from portal.jup.ag
const JUPITER_ULTRA_API = 'https://api.jup.ag/ultra/v1';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

// Get Jupiter API key from environment
function getJupiterApiKey(): string | null {
  return process.env.JUPITER_API_KEY || null;
}

export interface JupiterSwapResult {
  success: boolean;
  signature?: string;
  inputAmount?: number;
  outputAmount?: number;
  error?: string;
  walletIndex?: number;
}

/**
 * Get order from Jupiter Ultra API (includes quote + transaction)
 */
async function getJupiterOrder(
  inputMint: string,
  outputMint: string,
  amount: string,
  taker: string
): Promise<any> {
  const apiKey = getJupiterApiKey();
  if (!apiKey) {
    throw new Error('Jupiter API key not set. Get one from https://portal.jup.ag and set JUPITER_API_KEY');
  }
  
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    taker,
  });
  
  const response = await fetch(`${JUPITER_ULTRA_API}/order?${params}`, {
    headers: {
      'x-api-key': apiKey,
    },
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jupiter order failed: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Execute swap on Jupiter Ultra API
 */
async function executeJupiterSwap(
  signedTransaction: string,
  requestId: string
): Promise<{ signature: string; status: string }> {
  const apiKey = getJupiterApiKey();
  if (!apiKey) {
    throw new Error('Jupiter API key not set');
  }
  
  const response = await fetch(`${JUPITER_ULTRA_API}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      signedTransaction,
      requestId,
    }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jupiter execute failed: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Buy tokens using Jupiter Ultra API (for graduated tokens)
 */
export async function buyOnJupiter(
  wallet: Keypair,
  tokenMint: string,
  solAmount: number,
  slippageBps: number = config.defaultSlippageBps,
  walletIndex?: number
): Promise<JupiterSwapResult> {
  try {
    const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
    
    console.log(`  Getting Jupiter order for ${solAmount} SOL...`);
    
    // Get order (includes quote + unsigned transaction)
    const order = await getJupiterOrder(
      SOL_MINT,
      tokenMint,
      lamports.toString(),
      wallet.publicKey.toBase58()
    );
    
    if (!order.transaction) {
      throw new Error(order.errorMessage || 'No transaction returned');
    }
    
    const expectedTokens = parseInt(order.outAmount);
    console.log(`  Expected: ~${(expectedTokens / 1e6).toFixed(2)} tokens`);
    
    // Deserialize and sign
    const swapTx = VersionedTransaction.deserialize(
      Buffer.from(order.transaction, 'base64')
    );
    
    swapTx.sign([wallet]);
    
    // Execute via Jupiter
    const signedTxBase64 = Buffer.from(swapTx.serialize()).toString('base64');
    const result = await executeJupiterSwap(signedTxBase64, order.requestId);
    
    return {
      success: true,
      signature: result.signature,
      inputAmount: solAmount,
      outputAmount: expectedTokens,
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
 * Sell tokens using Jupiter Ultra API (for graduated tokens)
 */
export async function sellOnJupiter(
  wallet: Keypair,
  tokenMint: string,
  tokenAmount: bigint | 'all',
  slippageBps: number = config.defaultSlippageBps,
  walletIndex?: number
): Promise<JupiterSwapResult> {
  const connection = createConnection();
  
  try {
    // If 'all', get balance first
    let amount: bigint;
    if (tokenAmount === 'all') {
      const mint = new PublicKey(tokenMint);
      const mintInfo = await connection.getAccountInfo(mint);
      if (!mintInfo) throw new Error('Mint not found');
      
      const { getAssociatedTokenAddressSync } = await import('@solana/spl-token');
      const ata = getAssociatedTokenAddressSync(mint, wallet.publicKey, false, mintInfo.owner);
      const balance = await connection.getTokenAccountBalance(ata);
      amount = BigInt(balance.value.amount);
    } else {
      amount = tokenAmount;
    }
    
    if (amount === BigInt(0)) {
      return { success: false, error: 'No tokens to sell', walletIndex };
    }
    
    console.log(`  Getting Jupiter order for ${(Number(amount) / 1e6).toFixed(2)} tokens...`);
    
    // Get order: Token -> SOL
    const order = await getJupiterOrder(
      tokenMint,
      SOL_MINT,
      amount.toString(),
      wallet.publicKey.toBase58()
    );
    
    if (!order.transaction) {
      throw new Error(order.errorMessage || 'No transaction returned');
    }
    
    const expectedSol = parseInt(order.outAmount) / LAMPORTS_PER_SOL;
    console.log(`  Expected: ~${expectedSol.toFixed(6)} SOL`);
    
    // Deserialize and sign
    const swapTx = VersionedTransaction.deserialize(
      Buffer.from(order.transaction, 'base64')
    );
    
    swapTx.sign([wallet]);
    
    // Execute via Jupiter
    const signedTxBase64 = Buffer.from(swapTx.serialize()).toString('base64');
    const result = await executeJupiterSwap(signedTxBase64, order.requestId);
    
    return {
      success: true,
      signature: result.signature,
      inputAmount: Number(amount),
      outputAmount: expectedSol,
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
 * Multi-wallet buy on Jupiter
 */
export async function multiBuyOnJupiter(
  wallets: Keypair[],
  tokenMint: string,
  solAmounts: number[],
  slippageBps: number = config.defaultSlippageBps,
  onProgress?: (result: JupiterSwapResult) => void
): Promise<JupiterSwapResult[]> {
  const results: JupiterSwapResult[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    console.log(`\n  [Wallet ${i}] Buying ${solAmounts[i]} SOL on Jupiter...`);
    
    const result = await buyOnJupiter(
      wallets[i],
      tokenMint,
      solAmounts[i],
      slippageBps,
      i
    );
    
    results.push(result);
    onProgress?.(result);
    
    if (i < wallets.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  return results;
}

/**
 * Check if token is available on Jupiter
 */
export async function isOnJupiter(tokenMint: string): Promise<boolean> {
  const apiKey = getJupiterApiKey();
  if (!apiKey) {
    console.log('  ⚠️ Jupiter API key not set - cannot check Jupiter availability');
    return false;
  }
  
  try {
    // Try to get a tiny order (without taker to just get quote)
    const params = new URLSearchParams({
      inputMint: SOL_MINT,
      outputMint: tokenMint,
      amount: '1000000',
    });
    
    const response = await fetch(`${JUPITER_ULTRA_API}/order?${params}`, {
      headers: { 'x-api-key': apiKey },
    });
    
    if (response.ok) {
      const data = await response.json();
      return !!data.outAmount && parseInt(data.outAmount) > 0;
    }
    return false;
  } catch {
    return false;
  }
}

  Keypair,
  PublicKey,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';

// Jupiter Ultra API (new) - requires API key from portal.jup.ag
const JUPITER_ULTRA_API = 'https://api.jup.ag/ultra/v1';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

// Get Jupiter API key from environment
function getJupiterApiKey(): string | null {
  return process.env.JUPITER_API_KEY || null;
}

export interface JupiterSwapResult {
  success: boolean;
  signature?: string;
  inputAmount?: number;
  outputAmount?: number;
  error?: string;
  walletIndex?: number;
}

/**
 * Get order from Jupiter Ultra API (includes quote + transaction)
 */
async function getJupiterOrder(
  inputMint: string,
  outputMint: string,
  amount: string,
  taker: string
): Promise<any> {
  const apiKey = getJupiterApiKey();
  if (!apiKey) {
    throw new Error('Jupiter API key not set. Get one from https://portal.jup.ag and set JUPITER_API_KEY');
  }
  
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    taker,
  });
  
  const response = await fetch(`${JUPITER_ULTRA_API}/order?${params}`, {
    headers: {
      'x-api-key': apiKey,
    },
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jupiter order failed: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Execute swap on Jupiter Ultra API
 */
async function executeJupiterSwap(
  signedTransaction: string,
  requestId: string
): Promise<{ signature: string; status: string }> {
  const apiKey = getJupiterApiKey();
  if (!apiKey) {
    throw new Error('Jupiter API key not set');
  }
  
  const response = await fetch(`${JUPITER_ULTRA_API}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      signedTransaction,
      requestId,
    }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jupiter execute failed: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Buy tokens using Jupiter Ultra API (for graduated tokens)
 */
export async function buyOnJupiter(
  wallet: Keypair,
  tokenMint: string,
  solAmount: number,
  slippageBps: number = config.defaultSlippageBps,
  walletIndex?: number
): Promise<JupiterSwapResult> {
  try {
    const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
    
    console.log(`  Getting Jupiter order for ${solAmount} SOL...`);
    
    // Get order (includes quote + unsigned transaction)
    const order = await getJupiterOrder(
      SOL_MINT,
      tokenMint,
      lamports.toString(),
      wallet.publicKey.toBase58()
    );
    
    if (!order.transaction) {
      throw new Error(order.errorMessage || 'No transaction returned');
    }
    
    const expectedTokens = parseInt(order.outAmount);
    console.log(`  Expected: ~${(expectedTokens / 1e6).toFixed(2)} tokens`);
    
    // Deserialize and sign
    const swapTx = VersionedTransaction.deserialize(
      Buffer.from(order.transaction, 'base64')
    );
    
    swapTx.sign([wallet]);
    
    // Execute via Jupiter
    const signedTxBase64 = Buffer.from(swapTx.serialize()).toString('base64');
    const result = await executeJupiterSwap(signedTxBase64, order.requestId);
    
    return {
      success: true,
      signature: result.signature,
      inputAmount: solAmount,
      outputAmount: expectedTokens,
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
 * Sell tokens using Jupiter Ultra API (for graduated tokens)
 */
export async function sellOnJupiter(
  wallet: Keypair,
  tokenMint: string,
  tokenAmount: bigint | 'all',
  slippageBps: number = config.defaultSlippageBps,
  walletIndex?: number
): Promise<JupiterSwapResult> {
  const connection = createConnection();
  
  try {
    // If 'all', get balance first
    let amount: bigint;
    if (tokenAmount === 'all') {
      const mint = new PublicKey(tokenMint);
      const mintInfo = await connection.getAccountInfo(mint);
      if (!mintInfo) throw new Error('Mint not found');
      
      const { getAssociatedTokenAddressSync } = await import('@solana/spl-token');
      const ata = getAssociatedTokenAddressSync(mint, wallet.publicKey, false, mintInfo.owner);
      const balance = await connection.getTokenAccountBalance(ata);
      amount = BigInt(balance.value.amount);
    } else {
      amount = tokenAmount;
    }
    
    if (amount === BigInt(0)) {
      return { success: false, error: 'No tokens to sell', walletIndex };
    }
    
    console.log(`  Getting Jupiter order for ${(Number(amount) / 1e6).toFixed(2)} tokens...`);
    
    // Get order: Token -> SOL
    const order = await getJupiterOrder(
      tokenMint,
      SOL_MINT,
      amount.toString(),
      wallet.publicKey.toBase58()
    );
    
    if (!order.transaction) {
      throw new Error(order.errorMessage || 'No transaction returned');
    }
    
    const expectedSol = parseInt(order.outAmount) / LAMPORTS_PER_SOL;
    console.log(`  Expected: ~${expectedSol.toFixed(6)} SOL`);
    
    // Deserialize and sign
    const swapTx = VersionedTransaction.deserialize(
      Buffer.from(order.transaction, 'base64')
    );
    
    swapTx.sign([wallet]);
    
    // Execute via Jupiter
    const signedTxBase64 = Buffer.from(swapTx.serialize()).toString('base64');
    const result = await executeJupiterSwap(signedTxBase64, order.requestId);
    
    return {
      success: true,
      signature: result.signature,
      inputAmount: Number(amount),
      outputAmount: expectedSol,
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
 * Multi-wallet buy on Jupiter
 */
export async function multiBuyOnJupiter(
  wallets: Keypair[],
  tokenMint: string,
  solAmounts: number[],
  slippageBps: number = config.defaultSlippageBps,
  onProgress?: (result: JupiterSwapResult) => void
): Promise<JupiterSwapResult[]> {
  const results: JupiterSwapResult[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    console.log(`\n  [Wallet ${i}] Buying ${solAmounts[i]} SOL on Jupiter...`);
    
    const result = await buyOnJupiter(
      wallets[i],
      tokenMint,
      solAmounts[i],
      slippageBps,
      i
    );
    
    results.push(result);
    onProgress?.(result);
    
    if (i < wallets.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  return results;
}

/**
 * Check if token is available on Jupiter
 */
export async function isOnJupiter(tokenMint: string): Promise<boolean> {
  const apiKey = getJupiterApiKey();
  if (!apiKey) {
    console.log('  ⚠️ Jupiter API key not set - cannot check Jupiter availability');
    return false;
  }
  
  try {
    // Try to get a tiny order (without taker to just get quote)
    const params = new URLSearchParams({
      inputMint: SOL_MINT,
      outputMint: tokenMint,
      amount: '1000000',
    });
    
    const response = await fetch(`${JUPITER_ULTRA_API}/order?${params}`, {
      headers: { 'x-api-key': apiKey },
    });
    
    if (response.ok) {
      const data = await response.json();
      return !!data.outAmount && parseInt(data.outAmount) > 0;
    }
    return false;
  } catch {
    return false;
  }
}
