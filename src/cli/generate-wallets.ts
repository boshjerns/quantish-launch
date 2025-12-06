#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { generateWallets, loadWalletStore, verifyPassword } from '../wallet/generator.js';
import { generateSecurePassword } from '../wallet/encryption.js';

const program = new Command();

program
  .name('generate-wallets')
  .description('Generate new Solana wallets for sniping')
  .option('-c, --count <number>', 'Number of wallets to generate', '10')
  .option('-p, --password <string>', 'Encryption password (will prompt if not provided)')
  .option('--generate-password', 'Generate a secure password')
  .action(async (options) => {
    console.log(chalk.cyan('\n🔐 Solana Multi-Wallet Generator\n'));
    
    let password = options.password;
    const count = parseInt(options.count);
    
    if (count < 1 || count > 50) {
      console.log(chalk.red('❌ Wallet count must be between 1 and 50'));
      process.exit(1);
    }
    
    // Check if wallet store already exists
    const existingStore = loadWalletStore();
    
    if (existingStore) {
      console.log(chalk.yellow(`⚠️  Existing wallet store found with ${existingStore.wallets.length} wallet(s)`));
      
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'Add more wallets to existing store', value: 'add' },
            { name: 'Cancel', value: 'cancel' },
          ],
        },
      ]);
      
      if (action === 'cancel') {
        console.log(chalk.gray('Operation cancelled'));
        process.exit(0);
      }
      
      // Verify existing password
      if (!password) {
        const { existingPassword } = await inquirer.prompt([
          {
            type: 'password',
            name: 'existingPassword',
            message: 'Enter your existing encryption password:',
            mask: '*',
          },
        ]);
        password = existingPassword;
      }
      
      if (!verifyPassword(password)) {
        console.log(chalk.red('❌ Invalid password'));
        process.exit(1);
      }
    } else {
      // New wallet store - get or generate password
      if (options.generatePassword) {
        password = generateSecurePassword(32);
        console.log(chalk.green('\n🔑 Generated secure password:'));
        console.log(chalk.bgBlack.white(`\n  ${password}  \n`));
        console.log(chalk.red('⚠️  SAVE THIS PASSWORD! You will need it to access your wallets.\n'));
        
        const { confirmed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: 'Have you saved this password securely?',
            default: false,
          },
        ]);
        
        if (!confirmed) {
          console.log(chalk.red('Please save the password before continuing'));
          process.exit(1);
        }
      } else if (!password) {
        const answers = await inquirer.prompt([
          {
            type: 'password',
            name: 'password',
            message: 'Enter encryption password:',
            mask: '*',
            validate: (input) => {
              if (input.length < 8) {
                return 'Password must be at least 8 characters';
              }
              return true;
            },
          },
          {
            type: 'password',
            name: 'confirmPassword',
            message: 'Confirm encryption password:',
            mask: '*',
            validate: (input, answers) => {
              if (input !== answers?.password) {
                return 'Passwords do not match';
              }
              return true;
            },
          },
        ]);
        
        password = answers.password;
      }
    }
    
    console.log(chalk.cyan(`\n📝 Generating ${count} wallet(s)...\n`));
    
    try {
      const wallets = generateWallets(count, password);
      
      console.log(chalk.green(`✅ Successfully generated ${wallets.length} wallet(s)\n`));
      
      console.log(chalk.cyan('Generated Wallet Addresses:'));
      console.log(chalk.gray('─'.repeat(60)));
      
      wallets.forEach((wallet, i) => {
        console.log(chalk.white(`  ${i + 1}. ${wallet.publicKey}`));
      });
      
      console.log(chalk.gray('─'.repeat(60)));
      
      // Show store location
      console.log(chalk.cyan('\n📁 Wallets stored in: ./wallets/wallet-store.json'));
      console.log(chalk.yellow('\n⚠️  Important Security Notes:'));
      console.log(chalk.gray('  • Keep your encryption password safe'));
      console.log(chalk.gray('  • Never commit the wallets folder to git'));
      console.log(chalk.gray('  • Back up your wallet-store.json file'));
      
      // Show next steps
      console.log(chalk.cyan('\n📋 Next Steps:'));
      console.log(chalk.gray('  1. Fund your master wallet'));
      console.log(chalk.gray('  2. Run: npm run distribute -- to distribute SOL'));
      console.log(chalk.gray('  3. Run: npm run snipe -- to execute trades'));
      
    } catch (error) {
      console.log(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program.parse();


import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { generateWallets, loadWalletStore, verifyPassword } from '../wallet/generator.js';
import { generateSecurePassword } from '../wallet/encryption.js';

const program = new Command();

program
  .name('generate-wallets')
  .description('Generate new Solana wallets for sniping')
  .option('-c, --count <number>', 'Number of wallets to generate', '10')
  .option('-p, --password <string>', 'Encryption password (will prompt if not provided)')
  .option('--generate-password', 'Generate a secure password')
  .action(async (options) => {
    console.log(chalk.cyan('\n🔐 Solana Multi-Wallet Generator\n'));
    
    let password = options.password;
    const count = parseInt(options.count);
    
    if (count < 1 || count > 50) {
      console.log(chalk.red('❌ Wallet count must be between 1 and 50'));
      process.exit(1);
    }
    
    // Check if wallet store already exists
    const existingStore = loadWalletStore();
    
    if (existingStore) {
      console.log(chalk.yellow(`⚠️  Existing wallet store found with ${existingStore.wallets.length} wallet(s)`));
      
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'Add more wallets to existing store', value: 'add' },
            { name: 'Cancel', value: 'cancel' },
          ],
        },
      ]);
      
      if (action === 'cancel') {
        console.log(chalk.gray('Operation cancelled'));
        process.exit(0);
      }
      
      // Verify existing password
      if (!password) {
        const { existingPassword } = await inquirer.prompt([
          {
            type: 'password',
            name: 'existingPassword',
            message: 'Enter your existing encryption password:',
            mask: '*',
          },
        ]);
        password = existingPassword;
      }
      
      if (!verifyPassword(password)) {
        console.log(chalk.red('❌ Invalid password'));
        process.exit(1);
      }
    } else {
      // New wallet store - get or generate password
      if (options.generatePassword) {
        password = generateSecurePassword(32);
        console.log(chalk.green('\n🔑 Generated secure password:'));
        console.log(chalk.bgBlack.white(`\n  ${password}  \n`));
        console.log(chalk.red('⚠️  SAVE THIS PASSWORD! You will need it to access your wallets.\n'));
        
        const { confirmed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: 'Have you saved this password securely?',
            default: false,
          },
        ]);
        
        if (!confirmed) {
          console.log(chalk.red('Please save the password before continuing'));
          process.exit(1);
        }
      } else if (!password) {
        const answers = await inquirer.prompt([
          {
            type: 'password',
            name: 'password',
            message: 'Enter encryption password:',
            mask: '*',
            validate: (input) => {
              if (input.length < 8) {
                return 'Password must be at least 8 characters';
              }
              return true;
            },
          },
          {
            type: 'password',
            name: 'confirmPassword',
            message: 'Confirm encryption password:',
            mask: '*',
            validate: (input, answers) => {
              if (input !== answers?.password) {
                return 'Passwords do not match';
              }
              return true;
            },
          },
        ]);
        
        password = answers.password;
      }
    }
    
    console.log(chalk.cyan(`\n📝 Generating ${count} wallet(s)...\n`));
    
    try {
      const wallets = generateWallets(count, password);
      
      console.log(chalk.green(`✅ Successfully generated ${wallets.length} wallet(s)\n`));
      
      console.log(chalk.cyan('Generated Wallet Addresses:'));
      console.log(chalk.gray('─'.repeat(60)));
      
      wallets.forEach((wallet, i) => {
        console.log(chalk.white(`  ${i + 1}. ${wallet.publicKey}`));
      });
      
      console.log(chalk.gray('─'.repeat(60)));
      
      // Show store location
      console.log(chalk.cyan('\n📁 Wallets stored in: ./wallets/wallet-store.json'));
      console.log(chalk.yellow('\n⚠️  Important Security Notes:'));
      console.log(chalk.gray('  • Keep your encryption password safe'));
      console.log(chalk.gray('  • Never commit the wallets folder to git'));
      console.log(chalk.gray('  • Back up your wallet-store.json file'));
      
      // Show next steps
      console.log(chalk.cyan('\n📋 Next Steps:'));
      console.log(chalk.gray('  1. Fund your master wallet'));
      console.log(chalk.gray('  2. Run: npm run distribute -- to distribute SOL'));
      console.log(chalk.gray('  3. Run: npm run snipe -- to execute trades'));
      
    } catch (error) {
      console.log(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program.parse();


