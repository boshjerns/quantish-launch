#!/usr/bin/env node
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';
import { getAllKeypairs } from '../wallet/generator.js';
import {
  fetchPumpTokenInfo,
  buyOnPumpFunV3,
  multiBuyOnPumpFunV3,
} from '../trading/pump-fun-v3.js';
import {
  buyOnJupiter,
  multiBuyOnJupiter,
  isOnJupiter,
} from '../trading/jupiter.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`
🎯 Solana Token Sniper

Usage: npx tsx src/cli/snipe.ts <TOKEN_MINT> <SOL_PER_WALLET> [options]

Options:
  --force-jupiter    Force Jupiter even if on bonding curve
  --single           Only use first wallet (for testing)

Examples:
  npx tsx src/cli/snipe.ts HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump 0.005
  npx tsx src/cli/snipe.ts EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.01 --force-jupiter
`);
    process.exit(1);
  }
  
  const tokenMint = args[0];
  const solPerWallet = parseFloat(args[1]);
  const forceJupiter = args.includes('--force-jupiter');
  const singleWallet = args.includes('--single');
  
  console.log('\n🎯 Solana Token Sniper\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Token: ${tokenMint}`);
  console.log(`  SOL per wallet: ${solPerWallet}`);
  console.log('═══════════════════════════════════════════════════════');
  
  // Load wallets
  const password = process.env.WALLET_ENCRYPTION_PASSWORD;
  if (!password) {
    console.error('\n❌ Error: WALLET_ENCRYPTION_PASSWORD not set');
    process.exit(1);
  }
  
  let wallets: Keypair[];
  try {
    wallets = getAllKeypairs(password);
    if (singleWallet) {
      wallets = [wallets[0]];
    }
  } catch {
    console.error('\n❌ Error: No wallets found. Run generate-wallets first.');
    process.exit(1);
  }
  
  console.log(`\n📦 Loaded ${wallets.length} wallet(s)`);
  
  const connection = createConnection();
  
  // Check balances
  console.log('\n💼 Checking balances...');
  const readyWallets: { wallet: Keypair; index: number; balance: number }[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    const balance = await connection.getBalance(wallets[i].publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;
    const isReady = balanceSOL >= solPerWallet + 0.003;
    
    if (isReady) {
      readyWallets.push({ wallet: wallets[i], index: i, balance: balanceSOL });
    }
    
    console.log(`  [${i}] ${balanceSOL.toFixed(4)} SOL ${isReady ? '✓' : '✗'}`);
  }
  
  if (readyWallets.length === 0) {
    console.error('\n❌ No wallets have sufficient balance.');
    process.exit(1);
  }
  
  console.log(`\n✓ ${readyWallets.length} wallet(s) ready`);
  
  // Determine trading venue
  console.log('\n🔍 Detecting trading venue...');
  
  let usePumpFun = false;
  let useJupiter = false;
  let pumpTokenInfo: Awaited<ReturnType<typeof fetchPumpTokenInfo>> = null;
  
  if (!forceJupiter) {
    pumpTokenInfo = await fetchPumpTokenInfo(connection, tokenMint);
    if (pumpTokenInfo && !pumpTokenInfo.complete) {
      usePumpFun = true;
      console.log('  ✓ Found on Pump.fun bonding curve');
      console.log(`    Bonding Curve: ${pumpTokenInfo.bondingCurve.toBase58().slice(0, 12)}...`);
      console.log(`    Token Program: ${pumpTokenInfo.tokenProgram.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'SPL Token'}`);
    } else if (pumpTokenInfo?.complete) {
      console.log('  ⚠️ Token graduated from bonding curve, checking Jupiter...');
    }
  }
  
  if (!usePumpFun) {
    console.log('  Checking Jupiter availability...');
    useJupiter = await isOnJupiter(tokenMint);
    if (useJupiter) {
      console.log('  ✓ Available on Jupiter');
    } else {
      console.error('\n❌ Token not found on Pump.fun or Jupiter');
      process.exit(1);
    }
  }
  
  // Execute snipe
  console.log('\n🚀 EXECUTING SNIPE...\n');
  
  const startTime = Date.now();
  const walletsToUse = readyWallets.map(w => w.wallet);
  const amounts = readyWallets.map(() => solPerWallet);
  
  let successCount = 0;
  let totalSolSpent = 0;
  let totalTokens = 0;
  const signatures: string[] = [];
  
  if (usePumpFun) {
    console.log('📍 Using: Pump.fun Bonding Curve\n');
    
    const results = await multiBuyOnPumpFunV3(
      walletsToUse,
      tokenMint,
      amounts,
      config.defaultSlippageBps,
      (result) => {
        const idx = readyWallets[result.walletIndex!].index;
        if (result.success) {
          console.log(`  ✓ Wallet ${idx}: ${result.signature?.slice(0, 20)}...`);
          successCount++;
          totalSolSpent += result.solSpent || 0;
          totalTokens += result.tokenAmount || 0;
          signatures.push(result.signature!);
        } else {
          console.log(`  ✗ Wallet ${idx}: ${result.error?.slice(0, 50)}`);
        }
      }
    );
  } else if (useJupiter) {
    console.log('📍 Using: Jupiter DEX Aggregator\n');
    
    const results = await multiBuyOnJupiter(
      walletsToUse,
      tokenMint,
      amounts,
      config.defaultSlippageBps,
      (result) => {
        const idx = readyWallets[result.walletIndex!].index;
        if (result.success) {
          console.log(`  ✓ Wallet ${idx}: ${result.signature?.slice(0, 20)}...`);
          successCount++;
          totalSolSpent += result.inputAmount || 0;
          totalTokens += result.outputAmount || 0;
          signatures.push(result.signature!);
        } else {
          console.log(`  ✗ Wallet ${idx}: ${result.error?.slice(0, 50)}`);
        }
      }
    );
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`📊 RESULTS (${elapsed}s)`);
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Success: ${successCount}/${readyWallets.length}`);
  console.log(`  SOL spent: ${totalSolSpent.toFixed(6)}`);
  console.log(`  Tokens: ~${(totalTokens / 1e6).toFixed(2)}M`);
  console.log('═══════════════════════════════════════════════════════');
  
  if (signatures.length > 0) {
    console.log('\n📝 Transactions:');
    signatures.forEach(sig => {
      console.log(`  https://solscan.io/tx/${sig}`);
    });
  }
  
  console.log('\n✅ Snipe complete!');
}

main().catch(console.error);

import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';
import { getAllKeypairs } from '../wallet/generator.js';
import {
  fetchPumpTokenInfo,
  buyOnPumpFunV3,
  multiBuyOnPumpFunV3,
} from '../trading/pump-fun-v3.js';
import {
  buyOnJupiter,
  multiBuyOnJupiter,
  isOnJupiter,
} from '../trading/jupiter.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`
🎯 Solana Token Sniper

Usage: npx tsx src/cli/snipe.ts <TOKEN_MINT> <SOL_PER_WALLET> [options]

Options:
  --force-jupiter    Force Jupiter even if on bonding curve
  --single           Only use first wallet (for testing)

Examples:
  npx tsx src/cli/snipe.ts HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump 0.005
  npx tsx src/cli/snipe.ts EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.01 --force-jupiter
`);
    process.exit(1);
  }
  
  const tokenMint = args[0];
  const solPerWallet = parseFloat(args[1]);
  const forceJupiter = args.includes('--force-jupiter');
  const singleWallet = args.includes('--single');
  
  console.log('\n🎯 Solana Token Sniper\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Token: ${tokenMint}`);
  console.log(`  SOL per wallet: ${solPerWallet}`);
  console.log('═══════════════════════════════════════════════════════');
  
  // Load wallets
  const password = process.env.WALLET_ENCRYPTION_PASSWORD;
  if (!password) {
    console.error('\n❌ Error: WALLET_ENCRYPTION_PASSWORD not set');
    process.exit(1);
  }
  
  let wallets: Keypair[];
  try {
    wallets = getAllKeypairs(password);
    if (singleWallet) {
      wallets = [wallets[0]];
    }
  } catch {
    console.error('\n❌ Error: No wallets found. Run generate-wallets first.');
    process.exit(1);
  }
  
  console.log(`\n📦 Loaded ${wallets.length} wallet(s)`);
  
  const connection = createConnection();
  
  // Check balances
  console.log('\n💼 Checking balances...');
  const readyWallets: { wallet: Keypair; index: number; balance: number }[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    const balance = await connection.getBalance(wallets[i].publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;
    const isReady = balanceSOL >= solPerWallet + 0.003;
    
    if (isReady) {
      readyWallets.push({ wallet: wallets[i], index: i, balance: balanceSOL });
    }
    
    console.log(`  [${i}] ${balanceSOL.toFixed(4)} SOL ${isReady ? '✓' : '✗'}`);
  }
  
  if (readyWallets.length === 0) {
    console.error('\n❌ No wallets have sufficient balance.');
    process.exit(1);
  }
  
  console.log(`\n✓ ${readyWallets.length} wallet(s) ready`);
  
  // Determine trading venue
  console.log('\n🔍 Detecting trading venue...');
  
  let usePumpFun = false;
  let useJupiter = false;
  let pumpTokenInfo: Awaited<ReturnType<typeof fetchPumpTokenInfo>> = null;
  
  if (!forceJupiter) {
    pumpTokenInfo = await fetchPumpTokenInfo(connection, tokenMint);
    if (pumpTokenInfo && !pumpTokenInfo.complete) {
      usePumpFun = true;
      console.log('  ✓ Found on Pump.fun bonding curve');
      console.log(`    Bonding Curve: ${pumpTokenInfo.bondingCurve.toBase58().slice(0, 12)}...`);
      console.log(`    Token Program: ${pumpTokenInfo.tokenProgram.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'SPL Token'}`);
    } else if (pumpTokenInfo?.complete) {
      console.log('  ⚠️ Token graduated from bonding curve, checking Jupiter...');
    }
  }
  
  if (!usePumpFun) {
    console.log('  Checking Jupiter availability...');
    useJupiter = await isOnJupiter(tokenMint);
    if (useJupiter) {
      console.log('  ✓ Available on Jupiter');
    } else {
      console.error('\n❌ Token not found on Pump.fun or Jupiter');
      process.exit(1);
    }
  }
  
  // Execute snipe
  console.log('\n🚀 EXECUTING SNIPE...\n');
  
  const startTime = Date.now();
  const walletsToUse = readyWallets.map(w => w.wallet);
  const amounts = readyWallets.map(() => solPerWallet);
  
  let successCount = 0;
  let totalSolSpent = 0;
  let totalTokens = 0;
  const signatures: string[] = [];
  
  if (usePumpFun) {
    console.log('📍 Using: Pump.fun Bonding Curve\n');
    
    const results = await multiBuyOnPumpFunV3(
      walletsToUse,
      tokenMint,
      amounts,
      config.defaultSlippageBps,
      (result) => {
        const idx = readyWallets[result.walletIndex!].index;
        if (result.success) {
          console.log(`  ✓ Wallet ${idx}: ${result.signature?.slice(0, 20)}...`);
          successCount++;
          totalSolSpent += result.solSpent || 0;
          totalTokens += result.tokenAmount || 0;
          signatures.push(result.signature!);
        } else {
          console.log(`  ✗ Wallet ${idx}: ${result.error?.slice(0, 50)}`);
        }
      }
    );
  } else if (useJupiter) {
    console.log('📍 Using: Jupiter DEX Aggregator\n');
    
    const results = await multiBuyOnJupiter(
      walletsToUse,
      tokenMint,
      amounts,
      config.defaultSlippageBps,
      (result) => {
        const idx = readyWallets[result.walletIndex!].index;
        if (result.success) {
          console.log(`  ✓ Wallet ${idx}: ${result.signature?.slice(0, 20)}...`);
          successCount++;
          totalSolSpent += result.inputAmount || 0;
          totalTokens += result.outputAmount || 0;
          signatures.push(result.signature!);
        } else {
          console.log(`  ✗ Wallet ${idx}: ${result.error?.slice(0, 50)}`);
        }
      }
    );
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`📊 RESULTS (${elapsed}s)`);
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Success: ${successCount}/${readyWallets.length}`);
  console.log(`  SOL spent: ${totalSolSpent.toFixed(6)}`);
  console.log(`  Tokens: ~${(totalTokens / 1e6).toFixed(2)}M`);
  console.log('═══════════════════════════════════════════════════════');
  
  if (signatures.length > 0) {
    console.log('\n📝 Transactions:');
    signatures.forEach(sig => {
      console.log(`  https://solscan.io/tx/${sig}`);
    });
  }
  
  console.log('\n✅ Snipe complete!');
}

main().catch(console.error);
