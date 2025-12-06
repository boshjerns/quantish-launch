#!/usr/bin/env node
import 'dotenv/config';
import chalk from 'chalk';
import { loadWalletStore } from '../wallet/generator.js';
import {
  createConnection,
  getMasterKeypair,
  getBalance,
  createCustomDistributionPlan,
  distributeSOL,
} from '../wallet/distributor.js';

async function autoDistribute() {
  console.log(chalk.cyan('\n💰 Auto Distribution Script\n'));
  
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
  
  const connection = createConnection();
  const masterKeypair = getMasterKeypair();
  const masterBalance = await getBalance(connection, masterKeypair.publicKey);
  
  console.log(chalk.yellow('Master Wallet:'));
  console.log(chalk.white(`  Address: ${masterKeypair.publicKey.toBase58()}`));
  console.log(chalk.green(`  Balance: ${masterBalance.toFixed(4)} SOL\n`));
  
  // Custom distribution: 25%, 20%, 20%, 20%, 15%
  // Reserve 0.01 SOL for gas
  const gasReserve = 0.01;
  const distributable = masterBalance - gasReserve;
  
  if (distributable <= 0) {
    console.log(chalk.red('❌ Insufficient balance for distribution'));
    process.exit(1);
  }
  
  const percentages = [0.25, 0.20, 0.20, 0.20, 0.15];
  const amounts = percentages.map((p, i) => ({
    index: i,
    amountSol: distributable * p,
  }));
  
  console.log(chalk.cyan('Distribution Plan:'));
  console.log(chalk.gray('─'.repeat(50)));
  amounts.forEach((a, i) => {
    console.log(`  Wallet ${a.index}: ${(percentages[i] * 100).toFixed(0)}% = ${a.amountSol.toFixed(4)} SOL`);
  });
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.white(`  Total: ${distributable.toFixed(4)} SOL`));
  console.log(chalk.gray(`  Gas reserve: ${gasReserve.toFixed(4)} SOL\n`));
  
  const plan = createCustomDistributionPlan(amounts, password);
  
  console.log(chalk.cyan('💸 Executing distribution...\n'));
  
  const results = await distributeSOL(plan, (result) => {
    if (result.success) {
      console.log(chalk.green(`  ✓ Wallet ${result.walletIndex}: ${result.amountSol.toFixed(4)} SOL sent`));
      console.log(chalk.gray(`    TX: ${result.signature}`));
    } else {
      console.log(chalk.red(`  ✗ Wallet ${result.walletIndex}: ${result.error}`));
    }
  });
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(chalk.cyan('\n📊 Distribution Summary:'));
  console.log(chalk.green(`  Successful: ${successful.length}/${results.length}`));
  console.log(chalk.green(`  Total distributed: ${successful.reduce((s, r) => s + r.amountSol, 0).toFixed(4)} SOL`));
  
  if (failed.length > 0) {
    console.log(chalk.red(`  Failed: ${failed.length}`));
  }
}

autoDistribute().catch(console.error);


import 'dotenv/config';
import chalk from 'chalk';
import { loadWalletStore } from '../wallet/generator.js';
import {
  createConnection,
  getMasterKeypair,
  getBalance,
  createCustomDistributionPlan,
  distributeSOL,
} from '../wallet/distributor.js';

async function autoDistribute() {
  console.log(chalk.cyan('\n💰 Auto Distribution Script\n'));
  
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
  
  const connection = createConnection();
  const masterKeypair = getMasterKeypair();
  const masterBalance = await getBalance(connection, masterKeypair.publicKey);
  
  console.log(chalk.yellow('Master Wallet:'));
  console.log(chalk.white(`  Address: ${masterKeypair.publicKey.toBase58()}`));
  console.log(chalk.green(`  Balance: ${masterBalance.toFixed(4)} SOL\n`));
  
  // Custom distribution: 25%, 20%, 20%, 20%, 15%
  // Reserve 0.01 SOL for gas
  const gasReserve = 0.01;
  const distributable = masterBalance - gasReserve;
  
  if (distributable <= 0) {
    console.log(chalk.red('❌ Insufficient balance for distribution'));
    process.exit(1);
  }
  
  const percentages = [0.25, 0.20, 0.20, 0.20, 0.15];
  const amounts = percentages.map((p, i) => ({
    index: i,
    amountSol: distributable * p,
  }));
  
  console.log(chalk.cyan('Distribution Plan:'));
  console.log(chalk.gray('─'.repeat(50)));
  amounts.forEach((a, i) => {
    console.log(`  Wallet ${a.index}: ${(percentages[i] * 100).toFixed(0)}% = ${a.amountSol.toFixed(4)} SOL`);
  });
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.white(`  Total: ${distributable.toFixed(4)} SOL`));
  console.log(chalk.gray(`  Gas reserve: ${gasReserve.toFixed(4)} SOL\n`));
  
  const plan = createCustomDistributionPlan(amounts, password);
  
  console.log(chalk.cyan('💸 Executing distribution...\n'));
  
  const results = await distributeSOL(plan, (result) => {
    if (result.success) {
      console.log(chalk.green(`  ✓ Wallet ${result.walletIndex}: ${result.amountSol.toFixed(4)} SOL sent`));
      console.log(chalk.gray(`    TX: ${result.signature}`));
    } else {
      console.log(chalk.red(`  ✗ Wallet ${result.walletIndex}: ${result.error}`));
    }
  });
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(chalk.cyan('\n📊 Distribution Summary:'));
  console.log(chalk.green(`  Successful: ${successful.length}/${results.length}`));
  console.log(chalk.green(`  Total distributed: ${successful.reduce((s, r) => s + r.amountSol, 0).toFixed(4)} SOL`));
  
  if (failed.length > 0) {
    console.log(chalk.red(`  Failed: ${failed.length}`));
  }
}

autoDistribute().catch(console.error);


