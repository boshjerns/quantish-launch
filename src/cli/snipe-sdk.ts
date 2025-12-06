import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';
import { getAllKeypairs } from '../wallet/generator.js';
import { buyWithSDK, multiBuyWithSDK } from '../trading/pump-sdk.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: npx tsx src/cli/snipe-sdk.ts <TOKEN_MINT> <SOL_PER_WALLET>');
    console.log('Example: npx tsx src/cli/snipe-sdk.ts HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump 0.005');
    process.exit(1);
  }
  
  const tokenMint = args[0];
  const solPerWallet = parseFloat(args[1]);
  
  console.log('\n🎯 Pump.fun SDK Sniper\n');
  console.log('Target Token:');
  console.log(`  Mint: ${tokenMint}`);
  console.log(`  SOL per wallet: ${solPerWallet}`);
  
  // Load wallets
  const password = process.env.WALLET_ENCRYPTION_PASSWORD;
  if (!password) {
    console.error('Error: WALLET_ENCRYPTION_PASSWORD not set');
    process.exit(1);
  }
  
  let wallets: Keypair[];
  try {
    wallets = getAllKeypairs(password);
  } catch {
    console.error('Error: No wallets found. Run generate-wallets first.');
    process.exit(1);
  }
  
  console.log(`  Total wallets: ${wallets.length}`);
  
  // Check balances
  const connection = createConnection();
  
  console.log('\n💼 Wallet Balances:');
  console.log('──────────────────────────────────────────────────');
  
  const readyWallets: { wallet: Keypair; index: number }[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    const balance = await connection.getBalance(wallets[i].publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;
    const isReady = balanceSOL >= solPerWallet + 0.003;
    
    if (isReady) {
      readyWallets.push({ wallet: wallets[i], index: i });
    }
    
    console.log(`  [${i}] ${balanceSOL.toFixed(4)} SOL - ${isReady ? '✓ Ready' : '✗ Insufficient'}`);
  }
  
  console.log('──────────────────────────────────────────────────');
  console.log(`  Ready: ${readyWallets.length}/${wallets.length}`);
  
  if (readyWallets.length === 0) {
    console.error('\n❌ No wallets have sufficient balance.');
    process.exit(1);
  }
  
  // Execute snipe with first wallet only for testing
  console.log('\n🚀 Testing buy with first ready wallet...');
  
  const testWallet = readyWallets[0];
  const result = await buyWithSDK(
    testWallet.wallet,
    tokenMint,
    solPerWallet,
    testWallet.index
  );
  
  if (result.success) {
    console.log(`\n✅ Success! TX: ${result.signature}`);
    console.log(`   https://solscan.io/tx/${result.signature}`);
  } else {
    console.log(`\n❌ Failed: ${result.error}`);
  }
}

main().catch(console.error);


import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';
import { getAllKeypairs } from '../wallet/generator.js';
import { buyWithSDK, multiBuyWithSDK } from '../trading/pump-sdk.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: npx tsx src/cli/snipe-sdk.ts <TOKEN_MINT> <SOL_PER_WALLET>');
    console.log('Example: npx tsx src/cli/snipe-sdk.ts HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump 0.005');
    process.exit(1);
  }
  
  const tokenMint = args[0];
  const solPerWallet = parseFloat(args[1]);
  
  console.log('\n🎯 Pump.fun SDK Sniper\n');
  console.log('Target Token:');
  console.log(`  Mint: ${tokenMint}`);
  console.log(`  SOL per wallet: ${solPerWallet}`);
  
  // Load wallets
  const password = process.env.WALLET_ENCRYPTION_PASSWORD;
  if (!password) {
    console.error('Error: WALLET_ENCRYPTION_PASSWORD not set');
    process.exit(1);
  }
  
  let wallets: Keypair[];
  try {
    wallets = getAllKeypairs(password);
  } catch {
    console.error('Error: No wallets found. Run generate-wallets first.');
    process.exit(1);
  }
  
  console.log(`  Total wallets: ${wallets.length}`);
  
  // Check balances
  const connection = createConnection();
  
  console.log('\n💼 Wallet Balances:');
  console.log('──────────────────────────────────────────────────');
  
  const readyWallets: { wallet: Keypair; index: number }[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    const balance = await connection.getBalance(wallets[i].publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;
    const isReady = balanceSOL >= solPerWallet + 0.003;
    
    if (isReady) {
      readyWallets.push({ wallet: wallets[i], index: i });
    }
    
    console.log(`  [${i}] ${balanceSOL.toFixed(4)} SOL - ${isReady ? '✓ Ready' : '✗ Insufficient'}`);
  }
  
  console.log('──────────────────────────────────────────────────');
  console.log(`  Ready: ${readyWallets.length}/${wallets.length}`);
  
  if (readyWallets.length === 0) {
    console.error('\n❌ No wallets have sufficient balance.');
    process.exit(1);
  }
  
  // Execute snipe with first wallet only for testing
  console.log('\n🚀 Testing buy with first ready wallet...');
  
  const testWallet = readyWallets[0];
  const result = await buyWithSDK(
    testWallet.wallet,
    tokenMint,
    solPerWallet,
    testWallet.index
  );
  
  if (result.success) {
    console.log(`\n✅ Success! TX: ${result.signature}`);
    console.log(`   https://solscan.io/tx/${result.signature}`);
  } else {
    console.log(`\n❌ Failed: ${result.error}`);
  }
}

main().catch(console.error);


