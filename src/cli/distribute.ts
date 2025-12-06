#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { loadWalletStore, verifyPassword } from '../wallet/generator.js';
import {
  createConnection,
  getMasterKeypair,
  getBalance,
  getAllBalances,
  createEqualDistributionPlan,
  createCustomDistributionPlan,
  distributeSOL,
  collectToMaster,
  DistributionResult,
} from '../wallet/distributor.js';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

const program = new Command();

program
  .name('distribute')
  .description('Distribute SOL from master wallet to sub-wallets')
  .option('-p, --password <string>', 'Encryption password')
  .option('-a, --amount <number>', 'Total SOL amount to distribute')
  .option('--equal', 'Distribute equally to all wallets')
  .option('--collect', 'Collect all SOL back to master wallet')
  .option('--status', 'Show wallet balances')
  .action(async (options) => {
    console.log(chalk.cyan('\n💰 Solana Wallet Fund Distributor\n'));
    
    // Check wallet store exists
    const store = loadWalletStore();
    if (!store) {
      console.log(chalk.red('❌ No wallet store found. Run generate-wallets first.'));
      process.exit(1);
    }
    
    // Get password
    let password = options.password;
    if (!password) {
      const { inputPassword } = await inquirer.prompt([
        {
          type: 'password',
          name: 'inputPassword',
          message: 'Enter encryption password:',
          mask: '*',
        },
      ]);
      password = inputPassword;
    }
    
    if (!verifyPassword(password)) {
      console.log(chalk.red('❌ Invalid password'));
      process.exit(1);
    }
    
    const connection = createConnection();
    
    // Show status
    if (options.status) {
      await showStatus(connection, password);
      return;
    }
    
    // Collect to master
    if (options.collect) {
      await handleCollect(password);
      return;
    }
    
    // Distribution flow
    await handleDistribution(connection, password, options);
  });

async function showStatus(connection: any, password: string) {
  console.log(chalk.cyan('📊 Wallet Balances\n'));
  
  try {
    // Get master wallet balance
    const masterKeypair = getMasterKeypair();
    const masterBalance = await getBalance(connection, masterKeypair.publicKey);
    
    console.log(chalk.yellow('Master Wallet:'));
    console.log(chalk.white(`  ${masterKeypair.publicKey.toBase58()}`));
    console.log(chalk.green(`  Balance: ${masterBalance.toFixed(4)} SOL\n`));
    
    // Get sub-wallet balances
    const balances = await getAllBalances(connection, password);
    const store = loadWalletStore(password)!;
    
    console.log(chalk.yellow('Sub-Wallets:'));
    console.log(chalk.gray('─'.repeat(70)));
    
    let totalSubBalance = 0;
    
    for (const wallet of store.wallets) {
      const balance = balances.get(wallet.publicKey) || 0;
      totalSubBalance += balance;
      
      const balanceStr = balance.toFixed(4).padStart(10);
      const statusIcon = balance > 0 ? chalk.green('●') : chalk.gray('○');
      
      console.log(
        `  ${statusIcon} ${chalk.gray(`[${wallet.index}]`)} ${wallet.publicKey.slice(0, 20)}...${wallet.publicKey.slice(-8)} ${chalk.green(balanceStr)} SOL`
      );
    }
    
    console.log(chalk.gray('─'.repeat(70)));
    console.log(chalk.cyan(`  Total in sub-wallets: ${totalSubBalance.toFixed(4)} SOL`));
    console.log(chalk.cyan(`  Grand total: ${(masterBalance + totalSubBalance).toFixed(4)} SOL`));
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('Master wallet')) {
      console.log(chalk.yellow('⚠️  Master wallet not configured. Set MASTER_WALLET_PRIVATE_KEY in .env'));
    } else {
      console.log(chalk.red(`❌ Error: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
}

async function handleCollect(password: string) {
  console.log(chalk.cyan('📥 Collecting SOL from sub-wallets to master...\n'));
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'This will transfer all SOL from sub-wallets to master. Continue?',
      default: false,
    },
  ]);
  
  if (!confirm) {
    console.log(chalk.gray('Operation cancelled'));
    return;
  }
  
  try {
    console.log(chalk.gray('\nProcessing transfers...\n'));
    
    const result = await collectToMaster(password, (index, success, error) => {
      if (success) {
        console.log(chalk.green(`  ✓ Wallet ${index} - collected`));
      } else {
        console.log(chalk.red(`  ✗ Wallet ${index} - ${error}`));
      }
    });
    
    console.log(chalk.cyan('\n📊 Collection Summary:'));
    console.log(chalk.white(`  Total wallets processed: ${result.total}`));
    console.log(chalk.green(`  Total SOL collected: ${result.collected.toFixed(4)} SOL`));
    
    if (result.errors.length > 0) {
      console.log(chalk.red(`  Errors: ${result.errors.length}`));
    }
    
  } catch (error) {
    console.log(chalk.red(`❌ Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

async function handleDistribution(connection: any, password: string, options: any) {
  const store = loadWalletStore(password)!;
  
  // Get master wallet info
  let masterKeypair;
  let masterBalance;
  
  try {
    masterKeypair = getMasterKeypair();
    masterBalance = await getBalance(connection, masterKeypair.publicKey);
  } catch (error) {
    console.log(chalk.red('❌ Master wallet not configured. Set MASTER_WALLET_PRIVATE_KEY in .env'));
    process.exit(1);
  }
  
  console.log(chalk.yellow('Master Wallet:'));
  console.log(chalk.white(`  ${masterKeypair.publicKey.toBase58()}`));
  console.log(chalk.green(`  Balance: ${masterBalance.toFixed(4)} SOL\n`));
  console.log(chalk.white(`  Sub-wallets available: ${store.wallets.length}\n`));
  
  // Get distribution amount
  let totalAmount = options.amount ? parseFloat(options.amount) : 0;
  
  if (!totalAmount) {
    const { amount } = await inquirer.prompt([
      {
        type: 'number',
        name: 'amount',
        message: 'Total SOL to distribute:',
        validate: (input) => {
          if (input <= 0) return 'Amount must be greater than 0';
          if (input > masterBalance - 0.1) return `Insufficient balance (max: ${(masterBalance - 0.1).toFixed(4)} SOL)`;
          return true;
        },
      },
    ]);
    totalAmount = amount;
  }
  
  // Get distribution type
  const { distributionType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'distributionType',
      message: 'Distribution method:',
      choices: [
        { name: `Equal (${(totalAmount / store.wallets.length).toFixed(4)} SOL each)`, value: 'equal' },
        { name: 'Custom amounts per wallet', value: 'custom' },
      ],
    },
  ]);
  
  let plan;
  
  if (distributionType === 'equal') {
    plan = createEqualDistributionPlan(totalAmount, store.wallets.length, password);
  } else {
    // Custom distribution
    const amounts: { index: number; amountSol: number }[] = [];
    
    console.log(chalk.cyan('\nEnter amount for each wallet (0 to skip):'));
    
    for (const wallet of store.wallets) {
      const { amount } = await inquirer.prompt([
        {
          type: 'number',
          name: 'amount',
          message: `Wallet ${wallet.index} (${wallet.publicKey.slice(0, 12)}...):`,
          default: 0,
        },
      ]);
      
      if (amount > 0) {
        amounts.push({ index: wallet.index, amountSol: amount });
      }
    }
    
    if (amounts.length === 0) {
      console.log(chalk.yellow('No wallets selected for distribution'));
      return;
    }
    
    plan = createCustomDistributionPlan(amounts, password);
  }
  
  // Show plan and confirm
  const totalToSend = plan.reduce((sum, p) => sum + p.amountSol, 0);
  
  console.log(chalk.cyan('\n📋 Distribution Plan:'));
  console.log(chalk.gray('─'.repeat(60)));
  
  for (const item of plan) {
    console.log(`  Wallet ${item.walletIndex}: ${item.publicKey.slice(0, 16)}... → ${item.amountSol.toFixed(4)} SOL`);
  }
  
  console.log(chalk.gray('─'.repeat(60)));
  console.log(chalk.white(`  Total to distribute: ${totalToSend.toFixed(4)} SOL`));
  console.log(chalk.gray(`  Estimated fees: ~${(plan.length * 0.00001).toFixed(5)} SOL`));
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Execute distribution?',
      default: false,
    },
  ]);
  
  if (!confirm) {
    console.log(chalk.gray('Operation cancelled'));
    return;
  }
  
  // Execute distribution
  console.log(chalk.cyan('\n💸 Executing distribution...\n'));
  
  const results = await distributeSOL(plan, (result: DistributionResult) => {
    if (result.success) {
      console.log(chalk.green(`  ✓ Wallet ${result.walletIndex}: ${result.amountSol.toFixed(4)} SOL sent`));
      console.log(chalk.gray(`    TX: ${result.signature}`));
    } else {
      console.log(chalk.red(`  ✗ Wallet ${result.walletIndex}: ${result.error}`));
    }
  });
  
  // Summary
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(chalk.cyan('\n📊 Distribution Summary:'));
  console.log(chalk.green(`  Successful: ${successful.length}/${results.length}`));
  console.log(chalk.green(`  Total distributed: ${successful.reduce((s, r) => s + r.amountSol, 0).toFixed(4)} SOL`));
  
  if (failed.length > 0) {
    console.log(chalk.red(`  Failed: ${failed.length}`));
  }
}

program.parse();


import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { loadWalletStore, verifyPassword } from '../wallet/generator.js';
import {
  createConnection,
  getMasterKeypair,
  getBalance,
  getAllBalances,
  createEqualDistributionPlan,
  createCustomDistributionPlan,
  distributeSOL,
  collectToMaster,
  DistributionResult,
} from '../wallet/distributor.js';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

const program = new Command();

program
  .name('distribute')
  .description('Distribute SOL from master wallet to sub-wallets')
  .option('-p, --password <string>', 'Encryption password')
  .option('-a, --amount <number>', 'Total SOL amount to distribute')
  .option('--equal', 'Distribute equally to all wallets')
  .option('--collect', 'Collect all SOL back to master wallet')
  .option('--status', 'Show wallet balances')
  .action(async (options) => {
    console.log(chalk.cyan('\n💰 Solana Wallet Fund Distributor\n'));
    
    // Check wallet store exists
    const store = loadWalletStore();
    if (!store) {
      console.log(chalk.red('❌ No wallet store found. Run generate-wallets first.'));
      process.exit(1);
    }
    
    // Get password
    let password = options.password;
    if (!password) {
      const { inputPassword } = await inquirer.prompt([
        {
          type: 'password',
          name: 'inputPassword',
          message: 'Enter encryption password:',
          mask: '*',
        },
      ]);
      password = inputPassword;
    }
    
    if (!verifyPassword(password)) {
      console.log(chalk.red('❌ Invalid password'));
      process.exit(1);
    }
    
    const connection = createConnection();
    
    // Show status
    if (options.status) {
      await showStatus(connection, password);
      return;
    }
    
    // Collect to master
    if (options.collect) {
      await handleCollect(password);
      return;
    }
    
    // Distribution flow
    await handleDistribution(connection, password, options);
  });

async function showStatus(connection: any, password: string) {
  console.log(chalk.cyan('📊 Wallet Balances\n'));
  
  try {
    // Get master wallet balance
    const masterKeypair = getMasterKeypair();
    const masterBalance = await getBalance(connection, masterKeypair.publicKey);
    
    console.log(chalk.yellow('Master Wallet:'));
    console.log(chalk.white(`  ${masterKeypair.publicKey.toBase58()}`));
    console.log(chalk.green(`  Balance: ${masterBalance.toFixed(4)} SOL\n`));
    
    // Get sub-wallet balances
    const balances = await getAllBalances(connection, password);
    const store = loadWalletStore(password)!;
    
    console.log(chalk.yellow('Sub-Wallets:'));
    console.log(chalk.gray('─'.repeat(70)));
    
    let totalSubBalance = 0;
    
    for (const wallet of store.wallets) {
      const balance = balances.get(wallet.publicKey) || 0;
      totalSubBalance += balance;
      
      const balanceStr = balance.toFixed(4).padStart(10);
      const statusIcon = balance > 0 ? chalk.green('●') : chalk.gray('○');
      
      console.log(
        `  ${statusIcon} ${chalk.gray(`[${wallet.index}]`)} ${wallet.publicKey.slice(0, 20)}...${wallet.publicKey.slice(-8)} ${chalk.green(balanceStr)} SOL`
      );
    }
    
    console.log(chalk.gray('─'.repeat(70)));
    console.log(chalk.cyan(`  Total in sub-wallets: ${totalSubBalance.toFixed(4)} SOL`));
    console.log(chalk.cyan(`  Grand total: ${(masterBalance + totalSubBalance).toFixed(4)} SOL`));
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('Master wallet')) {
      console.log(chalk.yellow('⚠️  Master wallet not configured. Set MASTER_WALLET_PRIVATE_KEY in .env'));
    } else {
      console.log(chalk.red(`❌ Error: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
}

async function handleCollect(password: string) {
  console.log(chalk.cyan('📥 Collecting SOL from sub-wallets to master...\n'));
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'This will transfer all SOL from sub-wallets to master. Continue?',
      default: false,
    },
  ]);
  
  if (!confirm) {
    console.log(chalk.gray('Operation cancelled'));
    return;
  }
  
  try {
    console.log(chalk.gray('\nProcessing transfers...\n'));
    
    const result = await collectToMaster(password, (index, success, error) => {
      if (success) {
        console.log(chalk.green(`  ✓ Wallet ${index} - collected`));
      } else {
        console.log(chalk.red(`  ✗ Wallet ${index} - ${error}`));
      }
    });
    
    console.log(chalk.cyan('\n📊 Collection Summary:'));
    console.log(chalk.white(`  Total wallets processed: ${result.total}`));
    console.log(chalk.green(`  Total SOL collected: ${result.collected.toFixed(4)} SOL`));
    
    if (result.errors.length > 0) {
      console.log(chalk.red(`  Errors: ${result.errors.length}`));
    }
    
  } catch (error) {
    console.log(chalk.red(`❌ Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

async function handleDistribution(connection: any, password: string, options: any) {
  const store = loadWalletStore(password)!;
  
  // Get master wallet info
  let masterKeypair;
  let masterBalance;
  
  try {
    masterKeypair = getMasterKeypair();
    masterBalance = await getBalance(connection, masterKeypair.publicKey);
  } catch (error) {
    console.log(chalk.red('❌ Master wallet not configured. Set MASTER_WALLET_PRIVATE_KEY in .env'));
    process.exit(1);
  }
  
  console.log(chalk.yellow('Master Wallet:'));
  console.log(chalk.white(`  ${masterKeypair.publicKey.toBase58()}`));
  console.log(chalk.green(`  Balance: ${masterBalance.toFixed(4)} SOL\n`));
  console.log(chalk.white(`  Sub-wallets available: ${store.wallets.length}\n`));
  
  // Get distribution amount
  let totalAmount = options.amount ? parseFloat(options.amount) : 0;
  
  if (!totalAmount) {
    const { amount } = await inquirer.prompt([
      {
        type: 'number',
        name: 'amount',
        message: 'Total SOL to distribute:',
        validate: (input) => {
          if (input <= 0) return 'Amount must be greater than 0';
          if (input > masterBalance - 0.1) return `Insufficient balance (max: ${(masterBalance - 0.1).toFixed(4)} SOL)`;
          return true;
        },
      },
    ]);
    totalAmount = amount;
  }
  
  // Get distribution type
  const { distributionType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'distributionType',
      message: 'Distribution method:',
      choices: [
        { name: `Equal (${(totalAmount / store.wallets.length).toFixed(4)} SOL each)`, value: 'equal' },
        { name: 'Custom amounts per wallet', value: 'custom' },
      ],
    },
  ]);
  
  let plan;
  
  if (distributionType === 'equal') {
    plan = createEqualDistributionPlan(totalAmount, store.wallets.length, password);
  } else {
    // Custom distribution
    const amounts: { index: number; amountSol: number }[] = [];
    
    console.log(chalk.cyan('\nEnter amount for each wallet (0 to skip):'));
    
    for (const wallet of store.wallets) {
      const { amount } = await inquirer.prompt([
        {
          type: 'number',
          name: 'amount',
          message: `Wallet ${wallet.index} (${wallet.publicKey.slice(0, 12)}...):`,
          default: 0,
        },
      ]);
      
      if (amount > 0) {
        amounts.push({ index: wallet.index, amountSol: amount });
      }
    }
    
    if (amounts.length === 0) {
      console.log(chalk.yellow('No wallets selected for distribution'));
      return;
    }
    
    plan = createCustomDistributionPlan(amounts, password);
  }
  
  // Show plan and confirm
  const totalToSend = plan.reduce((sum, p) => sum + p.amountSol, 0);
  
  console.log(chalk.cyan('\n📋 Distribution Plan:'));
  console.log(chalk.gray('─'.repeat(60)));
  
  for (const item of plan) {
    console.log(`  Wallet ${item.walletIndex}: ${item.publicKey.slice(0, 16)}... → ${item.amountSol.toFixed(4)} SOL`);
  }
  
  console.log(chalk.gray('─'.repeat(60)));
  console.log(chalk.white(`  Total to distribute: ${totalToSend.toFixed(4)} SOL`));
  console.log(chalk.gray(`  Estimated fees: ~${(plan.length * 0.00001).toFixed(5)} SOL`));
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Execute distribution?',
      default: false,
    },
  ]);
  
  if (!confirm) {
    console.log(chalk.gray('Operation cancelled'));
    return;
  }
  
  // Execute distribution
  console.log(chalk.cyan('\n💸 Executing distribution...\n'));
  
  const results = await distributeSOL(plan, (result: DistributionResult) => {
    if (result.success) {
      console.log(chalk.green(`  ✓ Wallet ${result.walletIndex}: ${result.amountSol.toFixed(4)} SOL sent`));
      console.log(chalk.gray(`    TX: ${result.signature}`));
    } else {
      console.log(chalk.red(`  ✗ Wallet ${result.walletIndex}: ${result.error}`));
    }
  });
  
  // Summary
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(chalk.cyan('\n📊 Distribution Summary:'));
  console.log(chalk.green(`  Successful: ${successful.length}/${results.length}`));
  console.log(chalk.green(`  Total distributed: ${successful.reduce((s, r) => s + r.amountSol, 0).toFixed(4)} SOL`));
  
  if (failed.length > 0) {
    console.log(chalk.red(`  Failed: ${failed.length}`));
  }
}

program.parse();


