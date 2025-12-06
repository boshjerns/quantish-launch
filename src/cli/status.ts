#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { loadWalletStore, verifyPassword, getAllPublicKeys } from '../wallet/generator.js';
import { createConnection, getBalance, getMasterKeypair, getAllBalances } from '../wallet/distributor.js';
import { config } from '../config/index.js';

const program = new Command();

program
  .name('status')
  .description('Show wallet status and balances')
  .option('-p, --password <string>', 'Encryption password')
  .option('--detailed', 'Show detailed information')
  .action(async (options) => {
    console.log(chalk.cyan('\n📊 Wallet Status Dashboard\n'));
    
    // Check wallet store
    const store = loadWalletStore();
    if (!store) {
      console.log(chalk.red('❌ No wallet store found'));
      console.log(chalk.gray('Run: npm run generate-wallets to create wallets'));
      process.exit(1);
    }
    
    // Show basic info without password
    console.log(chalk.yellow('📁 Wallet Store Info:'));
    console.log(chalk.white(`  Version: ${store.version}`));
    console.log(chalk.white(`  Created: ${new Date(store.createdAt).toLocaleString()}`));
    console.log(chalk.white(`  Updated: ${new Date(store.updatedAt).toLocaleString()}`));
    console.log(chalk.white(`  Wallets: ${store.wallets.length}`));
    
    // Network info
    console.log(chalk.yellow('\n🌐 Network Configuration:'));
    console.log(chalk.white(`  Network: ${config.network}`));
    console.log(chalk.white(`  RPC: ${config.rpcUrl.slice(0, 40)}...`));
    
    // Try to get master wallet info
    try {
      const masterKeypair = getMasterKeypair();
      const connection = createConnection();
      const masterBalance = await getBalance(connection, masterKeypair.publicKey);
      
      console.log(chalk.yellow('\n💎 Master Wallet:'));
      console.log(chalk.white(`  Address: ${masterKeypair.publicKey.toBase58()}`));
      console.log(chalk.green(`  Balance: ${masterBalance.toFixed(4)} SOL`));
    } catch {
      console.log(chalk.yellow('\n💎 Master Wallet:'));
      console.log(chalk.gray('  Not configured (set MASTER_WALLET_PRIVATE_KEY in .env)'));
    }
    
    // Get password for detailed view
    let password = options.password;
    
    if (!password && options.detailed) {
      const { inputPassword } = await inquirer.prompt([
        {
          type: 'password',
          name: 'inputPassword',
          message: 'Enter encryption password for detailed view:',
          mask: '*',
        },
      ]);
      password = inputPassword;
    }
    
    if (password && verifyPassword(password)) {
      const connection = createConnection();
      const balances = await getAllBalances(connection, password);
      
      console.log(chalk.yellow('\n💼 Sub-Wallets:'));
      console.log(chalk.gray('─'.repeat(75)));
      console.log(
        chalk.gray('  #  ') +
        chalk.gray('Address'.padEnd(48)) +
        chalk.gray('Balance'.padStart(12)) +
        chalk.gray('Status'.padStart(10))
      );
      console.log(chalk.gray('─'.repeat(75)));
      
      let totalBalance = 0;
      let fundedCount = 0;
      
      for (const wallet of store.wallets) {
        const balance = balances.get(wallet.publicKey) || 0;
        totalBalance += balance;
        
        const isFunded = balance >= config.minBuyAmountSol;
        if (isFunded) fundedCount++;
        
        const statusIcon = isFunded ? chalk.green('Ready') : chalk.gray('Empty');
        const balanceColor = isFunded ? chalk.green : chalk.gray;
        
        console.log(
          chalk.white(`  ${wallet.index.toString().padStart(2)} `) +
          chalk.white(wallet.publicKey.padEnd(48)) +
          balanceColor(`${balance.toFixed(4)} SOL`.padStart(12)) +
          statusIcon.padStart(10)
        );
      }
      
      console.log(chalk.gray('─'.repeat(75)));
      console.log(chalk.cyan(`  Total: ${totalBalance.toFixed(4)} SOL across ${store.wallets.length} wallets`));
      console.log(chalk.cyan(`  Ready for trading: ${fundedCount}/${store.wallets.length} wallets`));
      
      // Trading config
      console.log(chalk.yellow('\n⚙️  Trading Configuration:'));
      console.log(chalk.white(`  Default Slippage: ${config.defaultSlippageBps / 100}%`));
      console.log(chalk.white(`  Priority Fee: ${config.priorityFeeMicroLamports} microlamports`));
      console.log(chalk.white(`  Min Buy: ${config.minBuyAmountSol} SOL`));
      console.log(chalk.white(`  Max Buy: ${config.maxBuyAmountSol} SOL`));
      
    } else if (password) {
      console.log(chalk.red('\n❌ Invalid password'));
    } else {
      // Show public keys only
      console.log(chalk.yellow('\n💼 Sub-Wallet Addresses:'));
      const publicKeys = getAllPublicKeys();
      publicKeys.forEach((pk, i) => {
        console.log(chalk.gray(`  ${i}. ${pk}`));
      });
      console.log(chalk.gray('\nUse --detailed flag to see balances'));
    }
    
    // Quick commands
    console.log(chalk.yellow('\n📋 Quick Commands:'));
    console.log(chalk.gray('  Generate wallets:  npm run generate-wallets'));
    console.log(chalk.gray('  Distribute SOL:    npm run distribute'));
    console.log(chalk.gray('  Execute snipe:     npm run snipe'));
    console.log(chalk.gray('  View balances:     npm run status -- --detailed'));
  });

program.parse();


import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { loadWalletStore, verifyPassword, getAllPublicKeys } from '../wallet/generator.js';
import { createConnection, getBalance, getMasterKeypair, getAllBalances } from '../wallet/distributor.js';
import { config } from '../config/index.js';

const program = new Command();

program
  .name('status')
  .description('Show wallet status and balances')
  .option('-p, --password <string>', 'Encryption password')
  .option('--detailed', 'Show detailed information')
  .action(async (options) => {
    console.log(chalk.cyan('\n📊 Wallet Status Dashboard\n'));
    
    // Check wallet store
    const store = loadWalletStore();
    if (!store) {
      console.log(chalk.red('❌ No wallet store found'));
      console.log(chalk.gray('Run: npm run generate-wallets to create wallets'));
      process.exit(1);
    }
    
    // Show basic info without password
    console.log(chalk.yellow('📁 Wallet Store Info:'));
    console.log(chalk.white(`  Version: ${store.version}`));
    console.log(chalk.white(`  Created: ${new Date(store.createdAt).toLocaleString()}`));
    console.log(chalk.white(`  Updated: ${new Date(store.updatedAt).toLocaleString()}`));
    console.log(chalk.white(`  Wallets: ${store.wallets.length}`));
    
    // Network info
    console.log(chalk.yellow('\n🌐 Network Configuration:'));
    console.log(chalk.white(`  Network: ${config.network}`));
    console.log(chalk.white(`  RPC: ${config.rpcUrl.slice(0, 40)}...`));
    
    // Try to get master wallet info
    try {
      const masterKeypair = getMasterKeypair();
      const connection = createConnection();
      const masterBalance = await getBalance(connection, masterKeypair.publicKey);
      
      console.log(chalk.yellow('\n💎 Master Wallet:'));
      console.log(chalk.white(`  Address: ${masterKeypair.publicKey.toBase58()}`));
      console.log(chalk.green(`  Balance: ${masterBalance.toFixed(4)} SOL`));
    } catch {
      console.log(chalk.yellow('\n💎 Master Wallet:'));
      console.log(chalk.gray('  Not configured (set MASTER_WALLET_PRIVATE_KEY in .env)'));
    }
    
    // Get password for detailed view
    let password = options.password;
    
    if (!password && options.detailed) {
      const { inputPassword } = await inquirer.prompt([
        {
          type: 'password',
          name: 'inputPassword',
          message: 'Enter encryption password for detailed view:',
          mask: '*',
        },
      ]);
      password = inputPassword;
    }
    
    if (password && verifyPassword(password)) {
      const connection = createConnection();
      const balances = await getAllBalances(connection, password);
      
      console.log(chalk.yellow('\n💼 Sub-Wallets:'));
      console.log(chalk.gray('─'.repeat(75)));
      console.log(
        chalk.gray('  #  ') +
        chalk.gray('Address'.padEnd(48)) +
        chalk.gray('Balance'.padStart(12)) +
        chalk.gray('Status'.padStart(10))
      );
      console.log(chalk.gray('─'.repeat(75)));
      
      let totalBalance = 0;
      let fundedCount = 0;
      
      for (const wallet of store.wallets) {
        const balance = balances.get(wallet.publicKey) || 0;
        totalBalance += balance;
        
        const isFunded = balance >= config.minBuyAmountSol;
        if (isFunded) fundedCount++;
        
        const statusIcon = isFunded ? chalk.green('Ready') : chalk.gray('Empty');
        const balanceColor = isFunded ? chalk.green : chalk.gray;
        
        console.log(
          chalk.white(`  ${wallet.index.toString().padStart(2)} `) +
          chalk.white(wallet.publicKey.padEnd(48)) +
          balanceColor(`${balance.toFixed(4)} SOL`.padStart(12)) +
          statusIcon.padStart(10)
        );
      }
      
      console.log(chalk.gray('─'.repeat(75)));
      console.log(chalk.cyan(`  Total: ${totalBalance.toFixed(4)} SOL across ${store.wallets.length} wallets`));
      console.log(chalk.cyan(`  Ready for trading: ${fundedCount}/${store.wallets.length} wallets`));
      
      // Trading config
      console.log(chalk.yellow('\n⚙️  Trading Configuration:'));
      console.log(chalk.white(`  Default Slippage: ${config.defaultSlippageBps / 100}%`));
      console.log(chalk.white(`  Priority Fee: ${config.priorityFeeMicroLamports} microlamports`));
      console.log(chalk.white(`  Min Buy: ${config.minBuyAmountSol} SOL`));
      console.log(chalk.white(`  Max Buy: ${config.maxBuyAmountSol} SOL`));
      
    } else if (password) {
      console.log(chalk.red('\n❌ Invalid password'));
    } else {
      // Show public keys only
      console.log(chalk.yellow('\n💼 Sub-Wallet Addresses:'));
      const publicKeys = getAllPublicKeys();
      publicKeys.forEach((pk, i) => {
        console.log(chalk.gray(`  ${i}. ${pk}`));
      });
      console.log(chalk.gray('\nUse --detailed flag to see balances'));
    }
    
    // Quick commands
    console.log(chalk.yellow('\n📋 Quick Commands:'));
    console.log(chalk.gray('  Generate wallets:  npm run generate-wallets'));
    console.log(chalk.gray('  Distribute SOL:    npm run distribute'));
    console.log(chalk.gray('  Execute snipe:     npm run snipe'));
    console.log(chalk.gray('  View balances:     npm run status -- --detailed'));
  });

program.parse();


