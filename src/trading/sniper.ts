import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from '../config/index.js';
import { getAllKeypairs, loadWalletStore } from '../wallet/generator.js';
import { createConnection, getBalance } from '../wallet/distributor.js';
import { fetchPumpFunToken, buyOnPumpFun, multiBuyOnPumpFun, BuyResult } from './pump-fun.js';
import { buyTokenWithJupiter, multiBuyWithJupiter, isTokenTradeableOnJupiter, SwapResult } from './jupiter.js';

export type TradingPlatform = 'pump-fun' | 'jupiter' | 'auto';

export interface SniperConfig {
  tokenMint: string;
  totalSolAmount: number;
  distribution: 'equal' | 'custom';
  customAmounts?: number[];
  walletIndices?: number[];
  slippageBps?: number;
  platform?: TradingPlatform;
  maxRetries?: number;
}

export interface SniperResult {
  platform: TradingPlatform;
  totalWallets: number;
  successfulBuys: number;
  failedBuys: number;
  totalSolSpent: number;
  totalTokensReceived: number;
  results: (BuyResult | SwapResult)[];
  errors: string[];
}

/**
 * Determines the best platform to use for a token
 */
export async function detectTradingPlatform(tokenMint: string): Promise<TradingPlatform> {
  // First, check if it's on pump.fun bonding curve
  const pumpFunToken = await fetchPumpFunToken(tokenMint);
  
  if (pumpFunToken && !pumpFunToken.complete) {
    console.log(`Token found on pump.fun bonding curve`);
    return 'pump-fun';
  }
  
  // If not on pump.fun or graduated, check Jupiter
  const jupiterAvailable = await isTokenTradeableOnJupiter(tokenMint);
  
  if (jupiterAvailable) {
    console.log(`Token available on Jupiter DEX`);
    return 'jupiter';
  }
  
  // Default to pump.fun if we can't determine
  console.log(`Could not determine platform, defaulting to pump.fun`);
  return 'pump-fun';
}

/**
 * Validates wallet balances before sniping
 */
async function validateBalances(
  wallets: Keypair[],
  amounts: number[]
): Promise<{ valid: boolean; errors: string[] }> {
  const connection = createConnection();
  const errors: string[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    const balance = await getBalance(connection, wallets[i].publicKey);
    const required = amounts[i] + 0.01; // Add buffer for fees
    
    if (balance < required) {
      errors.push(
        `Wallet ${i} (${wallets[i].publicKey.toBase58().slice(0, 8)}...) has insufficient balance: ${balance.toFixed(4)} SOL, needs ${required.toFixed(4)} SOL`
      );
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Executes a coordinated multi-wallet snipe
 */
export async function executeSnipe(
  sniperConfig: SniperConfig,
  password: string,
  onProgress?: (result: BuyResult | SwapResult) => void
): Promise<SniperResult> {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  // Get wallets to use
  let walletsToUse: Keypair[];
  let amounts: number[];
  
  if (sniperConfig.walletIndices && sniperConfig.walletIndices.length > 0) {
    // Use specific wallets
    walletsToUse = sniperConfig.walletIndices.map(idx => {
      const wallet = store.wallets.find(w => w.index === idx);
      if (!wallet) {
        throw new Error(`Wallet at index ${idx} not found`);
      }
      // Decrypt the wallet
      const { decrypt } = require('../wallet/encryption.js');
      const { base58ToKeypair } = require('../wallet/generator.js');
      const privateKey = decrypt(wallet.encryptedPrivateKey, password);
      return base58ToKeypair(privateKey);
    });
  } else {
    // Use all wallets
    walletsToUse = getAllKeypairs(password);
  }
  
  // Calculate amounts
  if (sniperConfig.distribution === 'custom' && sniperConfig.customAmounts) {
    if (sniperConfig.customAmounts.length !== walletsToUse.length) {
      throw new Error('Custom amounts array length must match number of wallets');
    }
    amounts = sniperConfig.customAmounts;
  } else {
    // Equal distribution
    const amountPerWallet = sniperConfig.totalSolAmount / walletsToUse.length;
    amounts = walletsToUse.map(() => amountPerWallet);
  }
  
  // Validate balances
  const balanceCheck = await validateBalances(walletsToUse, amounts);
  if (!balanceCheck.valid) {
    throw new Error(`Insufficient balances:\n${balanceCheck.errors.join('\n')}`);
  }
  
  // Determine platform
  let platform = sniperConfig.platform || 'auto';
  if (platform === 'auto') {
    platform = await detectTradingPlatform(sniperConfig.tokenMint);
  }
  
  const slippage = sniperConfig.slippageBps || config.defaultSlippageBps;
  
  // Execute buys based on platform
  let results: (BuyResult | SwapResult)[];
  
  if (platform === 'pump-fun') {
    results = await multiBuyOnPumpFun(
      walletsToUse,
      sniperConfig.tokenMint,
      amounts,
      slippage,
      onProgress
    );
  } else {
    results = await multiBuyWithJupiter(
      walletsToUse,
      sniperConfig.tokenMint,
      amounts,
      slippage,
      onProgress
    );
  }
  
  // Compile results
  const successfulBuys = results.filter(r => r.success);
  const failedBuys = results.filter(r => !r.success);
  
  return {
    platform,
    totalWallets: walletsToUse.length,
    successfulBuys: successfulBuys.length,
    failedBuys: failedBuys.length,
    totalSolSpent: successfulBuys.reduce((sum, r) => {
      if ('solSpent' in r && r.solSpent) {
        return sum + r.solSpent;
      }
      if ('inputAmount' in r && r.inputAmount) {
        return sum + r.inputAmount / LAMPORTS_PER_SOL;
      }
      return sum;
    }, 0),
    totalTokensReceived: successfulBuys.reduce((sum, r) => {
      if ('tokenAmount' in r && r.tokenAmount) {
        return sum + r.tokenAmount;
      }
      if ('outputAmount' in r && r.outputAmount) {
        return sum + r.outputAmount;
      }
      return sum;
    }, 0),
    results,
    errors: failedBuys.map(r => r.error || 'Unknown error'),
  };
}

/**
 * Quick snipe with minimal configuration
 */
export async function quickSnipe(
  tokenMint: string,
  solPerWallet: number,
  password: string,
  onProgress?: (result: BuyResult | SwapResult) => void
): Promise<SniperResult> {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  return executeSnipe(
    {
      tokenMint,
      totalSolAmount: solPerWallet * store.wallets.length,
      distribution: 'equal',
      platform: 'auto',
    },
    password,
    onProgress
  );
}

/**
 * Snipes with a subset of wallets
 */
export async function snipeWithWallets(
  tokenMint: string,
  walletIndices: number[],
  amounts: number[],
  password: string,
  platform: TradingPlatform = 'auto',
  onProgress?: (result: BuyResult | SwapResult) => void
): Promise<SniperResult> {
  return executeSnipe(
    {
      tokenMint,
      totalSolAmount: amounts.reduce((a, b) => a + b, 0),
      distribution: 'custom',
      customAmounts: amounts,
      walletIndices,
      platform,
    },
    password,
    onProgress
  );
}


import { config } from '../config/index.js';
import { getAllKeypairs, loadWalletStore } from '../wallet/generator.js';
import { createConnection, getBalance } from '../wallet/distributor.js';
import { fetchPumpFunToken, buyOnPumpFun, multiBuyOnPumpFun, BuyResult } from './pump-fun.js';
import { buyTokenWithJupiter, multiBuyWithJupiter, isTokenTradeableOnJupiter, SwapResult } from './jupiter.js';

export type TradingPlatform = 'pump-fun' | 'jupiter' | 'auto';

export interface SniperConfig {
  tokenMint: string;
  totalSolAmount: number;
  distribution: 'equal' | 'custom';
  customAmounts?: number[];
  walletIndices?: number[];
  slippageBps?: number;
  platform?: TradingPlatform;
  maxRetries?: number;
}

export interface SniperResult {
  platform: TradingPlatform;
  totalWallets: number;
  successfulBuys: number;
  failedBuys: number;
  totalSolSpent: number;
  totalTokensReceived: number;
  results: (BuyResult | SwapResult)[];
  errors: string[];
}

/**
 * Determines the best platform to use for a token
 */
export async function detectTradingPlatform(tokenMint: string): Promise<TradingPlatform> {
  // First, check if it's on pump.fun bonding curve
  const pumpFunToken = await fetchPumpFunToken(tokenMint);
  
  if (pumpFunToken && !pumpFunToken.complete) {
    console.log(`Token found on pump.fun bonding curve`);
    return 'pump-fun';
  }
  
  // If not on pump.fun or graduated, check Jupiter
  const jupiterAvailable = await isTokenTradeableOnJupiter(tokenMint);
  
  if (jupiterAvailable) {
    console.log(`Token available on Jupiter DEX`);
    return 'jupiter';
  }
  
  // Default to pump.fun if we can't determine
  console.log(`Could not determine platform, defaulting to pump.fun`);
  return 'pump-fun';
}

/**
 * Validates wallet balances before sniping
 */
async function validateBalances(
  wallets: Keypair[],
  amounts: number[]
): Promise<{ valid: boolean; errors: string[] }> {
  const connection = createConnection();
  const errors: string[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    const balance = await getBalance(connection, wallets[i].publicKey);
    const required = amounts[i] + 0.01; // Add buffer for fees
    
    if (balance < required) {
      errors.push(
        `Wallet ${i} (${wallets[i].publicKey.toBase58().slice(0, 8)}...) has insufficient balance: ${balance.toFixed(4)} SOL, needs ${required.toFixed(4)} SOL`
      );
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Executes a coordinated multi-wallet snipe
 */
export async function executeSnipe(
  sniperConfig: SniperConfig,
  password: string,
  onProgress?: (result: BuyResult | SwapResult) => void
): Promise<SniperResult> {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  // Get wallets to use
  let walletsToUse: Keypair[];
  let amounts: number[];
  
  if (sniperConfig.walletIndices && sniperConfig.walletIndices.length > 0) {
    // Use specific wallets
    walletsToUse = sniperConfig.walletIndices.map(idx => {
      const wallet = store.wallets.find(w => w.index === idx);
      if (!wallet) {
        throw new Error(`Wallet at index ${idx} not found`);
      }
      // Decrypt the wallet
      const { decrypt } = require('../wallet/encryption.js');
      const { base58ToKeypair } = require('../wallet/generator.js');
      const privateKey = decrypt(wallet.encryptedPrivateKey, password);
      return base58ToKeypair(privateKey);
    });
  } else {
    // Use all wallets
    walletsToUse = getAllKeypairs(password);
  }
  
  // Calculate amounts
  if (sniperConfig.distribution === 'custom' && sniperConfig.customAmounts) {
    if (sniperConfig.customAmounts.length !== walletsToUse.length) {
      throw new Error('Custom amounts array length must match number of wallets');
    }
    amounts = sniperConfig.customAmounts;
  } else {
    // Equal distribution
    const amountPerWallet = sniperConfig.totalSolAmount / walletsToUse.length;
    amounts = walletsToUse.map(() => amountPerWallet);
  }
  
  // Validate balances
  const balanceCheck = await validateBalances(walletsToUse, amounts);
  if (!balanceCheck.valid) {
    throw new Error(`Insufficient balances:\n${balanceCheck.errors.join('\n')}`);
  }
  
  // Determine platform
  let platform = sniperConfig.platform || 'auto';
  if (platform === 'auto') {
    platform = await detectTradingPlatform(sniperConfig.tokenMint);
  }
  
  const slippage = sniperConfig.slippageBps || config.defaultSlippageBps;
  
  // Execute buys based on platform
  let results: (BuyResult | SwapResult)[];
  
  if (platform === 'pump-fun') {
    results = await multiBuyOnPumpFun(
      walletsToUse,
      sniperConfig.tokenMint,
      amounts,
      slippage,
      onProgress
    );
  } else {
    results = await multiBuyWithJupiter(
      walletsToUse,
      sniperConfig.tokenMint,
      amounts,
      slippage,
      onProgress
    );
  }
  
  // Compile results
  const successfulBuys = results.filter(r => r.success);
  const failedBuys = results.filter(r => !r.success);
  
  return {
    platform,
    totalWallets: walletsToUse.length,
    successfulBuys: successfulBuys.length,
    failedBuys: failedBuys.length,
    totalSolSpent: successfulBuys.reduce((sum, r) => {
      if ('solSpent' in r && r.solSpent) {
        return sum + r.solSpent;
      }
      if ('inputAmount' in r && r.inputAmount) {
        return sum + r.inputAmount / LAMPORTS_PER_SOL;
      }
      return sum;
    }, 0),
    totalTokensReceived: successfulBuys.reduce((sum, r) => {
      if ('tokenAmount' in r && r.tokenAmount) {
        return sum + r.tokenAmount;
      }
      if ('outputAmount' in r && r.outputAmount) {
        return sum + r.outputAmount;
      }
      return sum;
    }, 0),
    results,
    errors: failedBuys.map(r => r.error || 'Unknown error'),
  };
}

/**
 * Quick snipe with minimal configuration
 */
export async function quickSnipe(
  tokenMint: string,
  solPerWallet: number,
  password: string,
  onProgress?: (result: BuyResult | SwapResult) => void
): Promise<SniperResult> {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  return executeSnipe(
    {
      tokenMint,
      totalSolAmount: solPerWallet * store.wallets.length,
      distribution: 'equal',
      platform: 'auto',
    },
    password,
    onProgress
  );
}

/**
 * Snipes with a subset of wallets
 */
export async function snipeWithWallets(
  tokenMint: string,
  walletIndices: number[],
  amounts: number[],
  password: string,
  platform: TradingPlatform = 'auto',
  onProgress?: (result: BuyResult | SwapResult) => void
): Promise<SniperResult> {
  return executeSnipe(
    {
      tokenMint,
      totalSolAmount: amounts.reduce((a, b) => a + b, 0),
      distribution: 'custom',
      customAmounts: amounts,
      walletIndices,
      platform,
    },
    password,
    onProgress
  );
}


