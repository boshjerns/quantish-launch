import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';

// Wrapped SOL mint address
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: any[];
}

export interface SwapResult {
  success: boolean;
  signature?: string;
  inputAmount?: number;
  outputAmount?: number;
  error?: string;
  walletIndex?: number;
}

/**
 * Gets a swap quote from Jupiter
 */
export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: number, // in lamports for SOL, or smallest unit for tokens
  slippageBps: number = config.defaultSlippageBps
): Promise<SwapQuote | null> {
  try {
    const url = new URL('https://quote-api.jup.ag/v6/quote');
    url.searchParams.set('inputMint', inputMint);
    url.searchParams.set('outputMint', outputMint);
    url.searchParams.set('amount', amount.toString());
    url.searchParams.set('slippageBps', slippageBps.toString());
    url.searchParams.set('onlyDirectRoutes', 'false');
    url.searchParams.set('asLegacyTransaction', 'false');
    
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      console.error('Jupiter quote error:', await response.text());
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to get Jupiter quote:', error);
    return null;
  }
}

/**
 * Gets the swap transaction from Jupiter
 */
export async function getJupiterSwapTransaction(
  quote: SwapQuote,
  userPublicKey: PublicKey,
  priorityFeeLamports: number = config.priorityFeeMicroLamports
): Promise<VersionedTransaction | null> {
  try {
    const response = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: userPublicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: priorityFeeLamports,
      }),
    });
    
    if (!response.ok) {
      console.error('Jupiter swap error:', await response.text());
      return null;
    }
    
    const { swapTransaction } = await response.json();
    
    // Deserialize the transaction
    const transactionBuf = Buffer.from(swapTransaction, 'base64');
    return VersionedTransaction.deserialize(transactionBuf);
  } catch (error) {
    console.error('Failed to get Jupiter swap transaction:', error);
    return null;
  }
}

/**
 * Executes a buy (SOL -> Token) using Jupiter
 */
export async function buyWithJupiter(
  wallet: Keypair,
  tokenMint: string,
  solAmount: number,
  slippageBps: number = config.defaultSlippageBps,
  walletIndex?: number
): Promise<SwapResult> {
  const connection = createConnection();
  
  try {
    // Convert SOL to lamports
    const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
    
    // Get quote
    const quote = await getJupiterQuote(WSOL_MINT, tokenMint, lamports, slippageBps);
    
    if (!quote) {
      return {
        success: false,
        error: 'Failed to get quote - token may not have liquidity',
        walletIndex,
      };
    }
    
    console.log(`  Quote: ${solAmount} SOL -> ${(Number(quote.outAmount) / 1e6).toFixed(2)} tokens`);
    console.log(`  Price impact: ${quote.priceImpactPct}%`);
    
    // Get swap transaction
    const transaction = await getJupiterSwapTransaction(quote, wallet.publicKey);
    
    if (!transaction) {
      return {
        success: false,
        error: 'Failed to build swap transaction',
        walletIndex,
      };
    }
    
    // Sign the transaction
    transaction.sign([wallet]);
    
    // Send transaction
    const signature = await connection.sendTransaction(transaction, {
      maxRetries: config.maxTxRetries,
      skipPreflight: false,
    });
    
    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: transaction.message.recentBlockhash,
        lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight,
      },
      'confirmed'
    );
    
    if (confirmation.value.err) {
      return {
        success: false,
        error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
        walletIndex,
      };
    }
    
    return {
      success: true,
      signature,
      inputAmount: solAmount,
      outputAmount: Number(quote.outAmount),
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

/**
 * Executes a sell (Token -> SOL) using Jupiter
 */
export async function sellWithJupiter(
  wallet: Keypair,
  tokenMint: string,
  tokenAmount: number, // in smallest unit (e.g., with decimals)
  slippageBps: number = config.defaultSlippageBps,
  walletIndex?: number
): Promise<SwapResult> {
  const connection = createConnection();
  
  try {
    // Get quote
    const quote = await getJupiterQuote(tokenMint, WSOL_MINT, Math.floor(tokenAmount), slippageBps);
    
    if (!quote) {
      return {
        success: false,
        error: 'Failed to get quote - token may not have liquidity',
        walletIndex,
      };
    }
    
    console.log(`  Quote: ${tokenAmount} tokens -> ${(Number(quote.outAmount) / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    
    // Get swap transaction
    const transaction = await getJupiterSwapTransaction(quote, wallet.publicKey);
    
    if (!transaction) {
      return {
        success: false,
        error: 'Failed to build swap transaction',
        walletIndex,
      };
    }
    
    // Sign and send
    transaction.sign([wallet]);
    
    const signature = await connection.sendTransaction(transaction, {
      maxRetries: config.maxTxRetries,
      skipPreflight: false,
    });
    
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: transaction.message.recentBlockhash,
        lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight,
      },
      'confirmed'
    );
    
    if (confirmation.value.err) {
      return {
        success: false,
        error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
        walletIndex,
      };
    }
    
    return {
      success: true,
      signature,
      inputAmount: tokenAmount,
      outputAmount: Number(quote.outAmount) / LAMPORTS_PER_SOL,
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

/**
 * Multi-wallet buy using Jupiter - executes sequentially for reliability
 */
export async function multiBuyWithJupiter(
  wallets: Keypair[],
  tokenMint: string,
  solAmounts: number[],
  slippageBps: number = config.defaultSlippageBps,
  onProgress?: (result: SwapResult) => void
): Promise<SwapResult[]> {
  if (wallets.length !== solAmounts.length) {
    throw new Error('Wallets and amounts arrays must have the same length');
  }
  
  const results: SwapResult[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    console.log(`\n  [Wallet ${i}] Buying ${solAmounts[i]} SOL worth...`);
    
    const result = await buyWithJupiter(
      wallets[i],
      tokenMint,
      solAmounts[i],
      slippageBps,
      i
    );
    
    results.push(result);
    onProgress?.(result);
    
    // Small delay between transactions
    if (i < wallets.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  
  return results;
}

/**
 * Multi-wallet sell using Jupiter
 */
export async function multiSellWithJupiter(
  wallets: Keypair[],
  tokenMint: string,
  tokenAmounts: number[],
  slippageBps: number = config.defaultSlippageBps,
  onProgress?: (result: SwapResult) => void
): Promise<SwapResult[]> {
  if (wallets.length !== tokenAmounts.length) {
    throw new Error('Wallets and amounts arrays must have the same length');
  }
  
  const results: SwapResult[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    if (tokenAmounts[i] <= 0) {
      results.push({
        success: false,
        error: 'No tokens to sell',
        walletIndex: i,
      });
      continue;
    }
    
    console.log(`\n  [Wallet ${i}] Selling ${tokenAmounts[i]} tokens...`);
    
    const result = await sellWithJupiter(
      wallets[i],
      tokenMint,
      tokenAmounts[i],
      slippageBps,
      i
    );
    
    results.push(result);
    onProgress?.(result);
    
    if (i < wallets.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  
  return results;
}

/**
 * Check if a token has liquidity on Jupiter
 */
export async function checkTokenLiquidity(tokenMint: string): Promise<boolean> {
  try {
    // Try to get a small quote
    const quote = await getJupiterQuote(
      WSOL_MINT,
      tokenMint,
      1000000, // 0.001 SOL
      1000
    );
    
    return quote !== null && Number(quote.outAmount) > 0;
  } catch {
    return false;
  }
}


  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';

// Wrapped SOL mint address
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: any[];
}

export interface SwapResult {
  success: boolean;
  signature?: string;
  inputAmount?: number;
  outputAmount?: number;
  error?: string;
  walletIndex?: number;
}

/**
 * Gets a swap quote from Jupiter
 */
export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: number, // in lamports for SOL, or smallest unit for tokens
  slippageBps: number = config.defaultSlippageBps
): Promise<SwapQuote | null> {
  try {
    const url = new URL('https://quote-api.jup.ag/v6/quote');
    url.searchParams.set('inputMint', inputMint);
    url.searchParams.set('outputMint', outputMint);
    url.searchParams.set('amount', amount.toString());
    url.searchParams.set('slippageBps', slippageBps.toString());
    url.searchParams.set('onlyDirectRoutes', 'false');
    url.searchParams.set('asLegacyTransaction', 'false');
    
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      console.error('Jupiter quote error:', await response.text());
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to get Jupiter quote:', error);
    return null;
  }
}

/**
 * Gets the swap transaction from Jupiter
 */
export async function getJupiterSwapTransaction(
  quote: SwapQuote,
  userPublicKey: PublicKey,
  priorityFeeLamports: number = config.priorityFeeMicroLamports
): Promise<VersionedTransaction | null> {
  try {
    const response = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: userPublicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: priorityFeeLamports,
      }),
    });
    
    if (!response.ok) {
      console.error('Jupiter swap error:', await response.text());
      return null;
    }
    
    const { swapTransaction } = await response.json();
    
    // Deserialize the transaction
    const transactionBuf = Buffer.from(swapTransaction, 'base64');
    return VersionedTransaction.deserialize(transactionBuf);
  } catch (error) {
    console.error('Failed to get Jupiter swap transaction:', error);
    return null;
  }
}

/**
 * Executes a buy (SOL -> Token) using Jupiter
 */
export async function buyWithJupiter(
  wallet: Keypair,
  tokenMint: string,
  solAmount: number,
  slippageBps: number = config.defaultSlippageBps,
  walletIndex?: number
): Promise<SwapResult> {
  const connection = createConnection();
  
  try {
    // Convert SOL to lamports
    const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
    
    // Get quote
    const quote = await getJupiterQuote(WSOL_MINT, tokenMint, lamports, slippageBps);
    
    if (!quote) {
      return {
        success: false,
        error: 'Failed to get quote - token may not have liquidity',
        walletIndex,
      };
    }
    
    console.log(`  Quote: ${solAmount} SOL -> ${(Number(quote.outAmount) / 1e6).toFixed(2)} tokens`);
    console.log(`  Price impact: ${quote.priceImpactPct}%`);
    
    // Get swap transaction
    const transaction = await getJupiterSwapTransaction(quote, wallet.publicKey);
    
    if (!transaction) {
      return {
        success: false,
        error: 'Failed to build swap transaction',
        walletIndex,
      };
    }
    
    // Sign the transaction
    transaction.sign([wallet]);
    
    // Send transaction
    const signature = await connection.sendTransaction(transaction, {
      maxRetries: config.maxTxRetries,
      skipPreflight: false,
    });
    
    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: transaction.message.recentBlockhash,
        lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight,
      },
      'confirmed'
    );
    
    if (confirmation.value.err) {
      return {
        success: false,
        error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
        walletIndex,
      };
    }
    
    return {
      success: true,
      signature,
      inputAmount: solAmount,
      outputAmount: Number(quote.outAmount),
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

/**
 * Executes a sell (Token -> SOL) using Jupiter
 */
export async function sellWithJupiter(
  wallet: Keypair,
  tokenMint: string,
  tokenAmount: number, // in smallest unit (e.g., with decimals)
  slippageBps: number = config.defaultSlippageBps,
  walletIndex?: number
): Promise<SwapResult> {
  const connection = createConnection();
  
  try {
    // Get quote
    const quote = await getJupiterQuote(tokenMint, WSOL_MINT, Math.floor(tokenAmount), slippageBps);
    
    if (!quote) {
      return {
        success: false,
        error: 'Failed to get quote - token may not have liquidity',
        walletIndex,
      };
    }
    
    console.log(`  Quote: ${tokenAmount} tokens -> ${(Number(quote.outAmount) / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    
    // Get swap transaction
    const transaction = await getJupiterSwapTransaction(quote, wallet.publicKey);
    
    if (!transaction) {
      return {
        success: false,
        error: 'Failed to build swap transaction',
        walletIndex,
      };
    }
    
    // Sign and send
    transaction.sign([wallet]);
    
    const signature = await connection.sendTransaction(transaction, {
      maxRetries: config.maxTxRetries,
      skipPreflight: false,
    });
    
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: transaction.message.recentBlockhash,
        lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight,
      },
      'confirmed'
    );
    
    if (confirmation.value.err) {
      return {
        success: false,
        error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
        walletIndex,
      };
    }
    
    return {
      success: true,
      signature,
      inputAmount: tokenAmount,
      outputAmount: Number(quote.outAmount) / LAMPORTS_PER_SOL,
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

/**
 * Multi-wallet buy using Jupiter - executes sequentially for reliability
 */
export async function multiBuyWithJupiter(
  wallets: Keypair[],
  tokenMint: string,
  solAmounts: number[],
  slippageBps: number = config.defaultSlippageBps,
  onProgress?: (result: SwapResult) => void
): Promise<SwapResult[]> {
  if (wallets.length !== solAmounts.length) {
    throw new Error('Wallets and amounts arrays must have the same length');
  }
  
  const results: SwapResult[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    console.log(`\n  [Wallet ${i}] Buying ${solAmounts[i]} SOL worth...`);
    
    const result = await buyWithJupiter(
      wallets[i],
      tokenMint,
      solAmounts[i],
      slippageBps,
      i
    );
    
    results.push(result);
    onProgress?.(result);
    
    // Small delay between transactions
    if (i < wallets.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  
  return results;
}

/**
 * Multi-wallet sell using Jupiter
 */
export async function multiSellWithJupiter(
  wallets: Keypair[],
  tokenMint: string,
  tokenAmounts: number[],
  slippageBps: number = config.defaultSlippageBps,
  onProgress?: (result: SwapResult) => void
): Promise<SwapResult[]> {
  if (wallets.length !== tokenAmounts.length) {
    throw new Error('Wallets and amounts arrays must have the same length');
  }
  
  const results: SwapResult[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    if (tokenAmounts[i] <= 0) {
      results.push({
        success: false,
        error: 'No tokens to sell',
        walletIndex: i,
      });
      continue;
    }
    
    console.log(`\n  [Wallet ${i}] Selling ${tokenAmounts[i]} tokens...`);
    
    const result = await sellWithJupiter(
      wallets[i],
      tokenMint,
      tokenAmounts[i],
      slippageBps,
      i
    );
    
    results.push(result);
    onProgress?.(result);
    
    if (i < wallets.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  
  return results;
}

/**
 * Check if a token has liquidity on Jupiter
 */
export async function checkTokenLiquidity(tokenMint: string): Promise<boolean> {
  try {
    // Try to get a small quote
    const quote = await getJupiterQuote(
      WSOL_MINT,
      tokenMint,
      1000000, // 0.001 SOL
      1000
    );
    
    return quote !== null && Number(quote.outAmount) > 0;
  } catch {
    return false;
  }
}


