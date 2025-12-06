#!/usr/bin/env node
import 'dotenv/config';
import chalk from 'chalk';
import { loadWalletStore, getAllKeypairs } from '../wallet/generator.js';
import { createConnection, getAllBalances } from '../wallet/distributor.js';
import { fetchPumpFunToken, multiBuyOnPumpFun, BuyResult } from '../trading/pump-fun.js';
import { config } from '../config/index.js';

const TOKEN_MINT = process.argv[2] || 'HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump';
const SOL_PER_WALLET = parseFloat(process.argv[3] || '0.005'); // Small test amount

async function executeSnipe() {
  console.log(chalk.cyan('\n🎯 Executing Multi-Wallet Snipe\n'));
  
  const password = process.env.WALLET_ENCRYPTION_PASSWORD;
  
  if (!password) {
    console.log(chalk.red('❌ WALLET_ENCRYPTION_PASSWORD not set'));
    process.exit(1);
  }
  
  const store = loadWalletStore(password);
  if (!store) {
    console.log(chalk.red('❌ No wallet store found'));
    process.exit(1);
  }
  
  // Show target info
  console.log(chalk.yellow('Target Token:'));
  console.log(chalk.white(`  Mint: ${TOKEN_MINT}`));
  console.log(chalk.white(`  SOL per wallet: ${SOL_PER_WALLET}`));
  console.log(chalk.white(`  Total wallets: ${store.wallets.length}\n`));
  
  // Fetch token info
  console.log(chalk.cyan('🔍 Fetching token info...\n'));
  const tokenInfo = await fetchPumpFunToken(TOKEN_MINT);
  
  if (!tokenInfo) {
    console.log(chalk.red('❌ Token not found on pump.fun'));
    process.exit(1);
  }
  
  console.log(chalk.green('✓ Token found:'));
  console.log(chalk.white(`  Name: ${tokenInfo.name} (${tokenInfo.symbol})`));
  console.log(chalk.white(`  Status: ${tokenInfo.complete ? 'Graduated (DEX)' : 'Bonding Curve'}`));
  console.log(chalk.white(`  Bonding Curve: ${tokenInfo.bondingCurve}`));
  
  if (tokenInfo.complete) {
    console.log(chalk.yellow('\n⚠️  Token has graduated - would need to use Jupiter DEX'));
    console.log(chalk.yellow('    For this test, we\'ll attempt anyway to show the workflow'));
  }
  
  // Check wallet balances
  const connection = createConnection();
  const balances = await getAllBalances(connection, password);
  
  console.log(chalk.cyan('\n💼 Wallet Balances:'));
  console.log(chalk.gray('─'.repeat(50)));
  
  let walletsReady = 0;
  for (const wallet of store.wallets) {
    const balance = balances.get(wallet.publicKey) || 0;
    const hasEnough = balance >= SOL_PER_WALLET + 0.002; // Include fee buffer
    if (hasEnough) walletsReady++;
    const status = hasEnough ? chalk.green('✓ Ready') : chalk.red('✗ Low');
    console.log(`  [${wallet.index}] ${balance.toFixed(4)} SOL - ${status}`);
  }
  
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.white(`  Wallets ready: ${walletsReady}/${store.wallets.length}\n`));
  
  if (walletsReady === 0) {
    console.log(chalk.red('❌ No wallets have sufficient balance'));
    process.exit(1);
  }
  
  // Get all keypairs
  const allKeypairs = getAllKeypairs(password);
  
  // Filter to only wallets with sufficient balance
  const readyWallets = allKeypairs.filter((_, i) => {
    const balance = balances.get(store.wallets[i].publicKey) || 0;
    return balance >= SOL_PER_WALLET + 0.002;
  });
  
  const amounts = readyWallets.map(() => SOL_PER_WALLET);
  
  console.log(chalk.cyan('🚀 Executing snipe...\n'));
  console.log(chalk.yellow(`  Buying ${SOL_PER_WALLET} SOL worth from ${readyWallets.length} wallet(s)\n`));
  
  const startTime = Date.now();
  
  try {
    const results = await multiBuyOnPumpFun(
      readyWallets,
      TOKEN_MINT,
      amounts,
      config.defaultSlippageBps,
      (result: BuyResult) => {
        const walletIdx = result.walletIndex ?? '?';
        if (result.success) {
          console.log(chalk.green(`  ✓ Wallet ${walletIdx}: Success`));
          console.log(chalk.gray(`    TX: ${result.signature}`));
          if (result.tokenAmount) {
            console.log(chalk.gray(`    Tokens: ~${result.tokenAmount.toLocaleString()}`));
          }
        } else {
          console.log(chalk.red(`  ✗ Wallet ${walletIdx}: ${result.error}`));
        }
      }
    );
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Summary
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(chalk.cyan(`\n📊 Snipe Results (${elapsed}s):`));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.green(`  Successful: ${successful.length}/${results.length}`));
    console.log(chalk.red(`  Failed: ${failed.length}/${results.length}`));
    
    const totalSpent = successful.reduce((sum, r) => sum + (r.solSpent || 0), 0);
    const totalTokens = successful.reduce((sum, r) => sum + (r.tokenAmount || 0), 0);
    
    console.log(chalk.white(`  Total SOL spent: ${totalSpent.toFixed(4)} SOL`));
    console.log(chalk.white(`  Total tokens: ~${totalTokens.toLocaleString()}`));
    console.log(chalk.gray('─'.repeat(40)));
    
    if (failed.length > 0) {
      console.log(chalk.red('\nErrors:'));
      failed.forEach((r, i) => {
        console.log(chalk.red(`  ${i + 1}. Wallet ${r.walletIndex}: ${r.error}`));
      });
    }
    
  } catch (error) {
    console.log(chalk.red(`\n❌ Snipe failed: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

executeSnipe().catch(console.error);


import 'dotenv/config';
import chalk from 'chalk';
import { loadWalletStore, getAllKeypairs } from '../wallet/generator.js';
import { createConnection, getAllBalances } from '../wallet/distributor.js';
import { fetchPumpFunToken, multiBuyOnPumpFun, BuyResult } from '../trading/pump-fun.js';
import { config } from '../config/index.js';

const TOKEN_MINT = process.argv[2] || 'HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump';
const SOL_PER_WALLET = parseFloat(process.argv[3] || '0.005'); // Small test amount

async function executeSnipe() {
  console.log(chalk.cyan('\n🎯 Executing Multi-Wallet Snipe\n'));
  
  const password = process.env.WALLET_ENCRYPTION_PASSWORD;
  
  if (!password) {
    console.log(chalk.red('❌ WALLET_ENCRYPTION_PASSWORD not set'));
    process.exit(1);
  }
  
  const store = loadWalletStore(password);
  if (!store) {
    console.log(chalk.red('❌ No wallet store found'));
    process.exit(1);
  }
  
  // Show target info
  console.log(chalk.yellow('Target Token:'));
  console.log(chalk.white(`  Mint: ${TOKEN_MINT}`));
  console.log(chalk.white(`  SOL per wallet: ${SOL_PER_WALLET}`));
  console.log(chalk.white(`  Total wallets: ${store.wallets.length}\n`));
  
  // Fetch token info
  console.log(chalk.cyan('🔍 Fetching token info...\n'));
  const tokenInfo = await fetchPumpFunToken(TOKEN_MINT);
  
  if (!tokenInfo) {
    console.log(chalk.red('❌ Token not found on pump.fun'));
    process.exit(1);
  }
  
  console.log(chalk.green('✓ Token found:'));
  console.log(chalk.white(`  Name: ${tokenInfo.name} (${tokenInfo.symbol})`));
  console.log(chalk.white(`  Status: ${tokenInfo.complete ? 'Graduated (DEX)' : 'Bonding Curve'}`));
  console.log(chalk.white(`  Bonding Curve: ${tokenInfo.bondingCurve}`));
  
  if (tokenInfo.complete) {
    console.log(chalk.yellow('\n⚠️  Token has graduated - would need to use Jupiter DEX'));
    console.log(chalk.yellow('    For this test, we\'ll attempt anyway to show the workflow'));
  }
  
  // Check wallet balances
  const connection = createConnection();
  const balances = await getAllBalances(connection, password);
  
  console.log(chalk.cyan('\n💼 Wallet Balances:'));
  console.log(chalk.gray('─'.repeat(50)));
  
  let walletsReady = 0;
  for (const wallet of store.wallets) {
    const balance = balances.get(wallet.publicKey) || 0;
    const hasEnough = balance >= SOL_PER_WALLET + 0.002; // Include fee buffer
    if (hasEnough) walletsReady++;
    const status = hasEnough ? chalk.green('✓ Ready') : chalk.red('✗ Low');
    console.log(`  [${wallet.index}] ${balance.toFixed(4)} SOL - ${status}`);
  }
  
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.white(`  Wallets ready: ${walletsReady}/${store.wallets.length}\n`));
  
  if (walletsReady === 0) {
    console.log(chalk.red('❌ No wallets have sufficient balance'));
    process.exit(1);
  }
  
  // Get all keypairs
  const allKeypairs = getAllKeypairs(password);
  
  // Filter to only wallets with sufficient balance
  const readyWallets = allKeypairs.filter((_, i) => {
    const balance = balances.get(store.wallets[i].publicKey) || 0;
    return balance >= SOL_PER_WALLET + 0.002;
  });
  
  const amounts = readyWallets.map(() => SOL_PER_WALLET);
  
  console.log(chalk.cyan('🚀 Executing snipe...\n'));
  console.log(chalk.yellow(`  Buying ${SOL_PER_WALLET} SOL worth from ${readyWallets.length} wallet(s)\n`));
  
  const startTime = Date.now();
  
  try {
    const results = await multiBuyOnPumpFun(
      readyWallets,
      TOKEN_MINT,
      amounts,
      config.defaultSlippageBps,
      (result: BuyResult) => {
        const walletIdx = result.walletIndex ?? '?';
        if (result.success) {
          console.log(chalk.green(`  ✓ Wallet ${walletIdx}: Success`));
          console.log(chalk.gray(`    TX: ${result.signature}`));
          if (result.tokenAmount) {
            console.log(chalk.gray(`    Tokens: ~${result.tokenAmount.toLocaleString()}`));
          }
        } else {
          console.log(chalk.red(`  ✗ Wallet ${walletIdx}: ${result.error}`));
        }
      }
    );
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Summary
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(chalk.cyan(`\n📊 Snipe Results (${elapsed}s):`));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.green(`  Successful: ${successful.length}/${results.length}`));
    console.log(chalk.red(`  Failed: ${failed.length}/${results.length}`));
    
    const totalSpent = successful.reduce((sum, r) => sum + (r.solSpent || 0), 0);
    const totalTokens = successful.reduce((sum, r) => sum + (r.tokenAmount || 0), 0);
    
    console.log(chalk.white(`  Total SOL spent: ${totalSpent.toFixed(4)} SOL`));
    console.log(chalk.white(`  Total tokens: ~${totalTokens.toLocaleString()}`));
    console.log(chalk.gray('─'.repeat(40)));
    
    if (failed.length > 0) {
      console.log(chalk.red('\nErrors:'));
      failed.forEach((r, i) => {
        console.log(chalk.red(`  ${i + 1}. Wallet ${r.walletIndex}: ${r.error}`));
      });
    }
    
  } catch (error) {
    console.log(chalk.red(`\n❌ Snipe failed: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

executeSnipe().catch(console.error);


