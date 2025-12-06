import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';
import { getAllKeypairs } from '../wallet/generator.js';
import { fetchPumpTokenInfo, buyOnPumpFunV2, multiBuyOnPumpFunV2 } from '../trading/pump-fun-v2.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: npx tsx src/cli/snipe-v2.ts <TOKEN_MINT> <SOL_PER_WALLET>');
    console.log('Example: npx tsx src/cli/snipe-v2.ts HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump 0.005');
    process.exit(1);
  }
  
  const tokenMint = args[0];
  const solPerWallet = parseFloat(args[1]);
  
  console.log('\n🎯 Pump.fun Bonding Curve Sniper v2\n');
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
  
  // Fetch token info
  const connection = createConnection();
  console.log('\n🔍 Fetching bonding curve info...');
  
  const tokenInfo = await fetchPumpTokenInfo(connection, tokenMint);
  
  if (!tokenInfo) {
    console.error('❌ Token not found or not on pump.fun bonding curve');
    process.exit(1);
  }
  
  console.log('✓ Token found on bonding curve!');
  console.log(`  Bonding Curve: ${tokenInfo.bondingCurve.toBase58().slice(0, 12)}...`);
  console.log(`  Creator: ${tokenInfo.coinCreator.toBase58().slice(0, 12)}...`);
  console.log(`  Token Program: ${tokenInfo.tokenProgram.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'Token Program'}`);
  console.log(`  Status: ${tokenInfo.complete ? 'Graduated' : 'Active on Bonding Curve'}`);
  
  if (tokenInfo.complete) {
    console.error('❌ Token has graduated from bonding curve. Use Jupiter instead.');
    process.exit(1);
  }
  
  // Check balances
  console.log('\n💼 Wallet Balances:');
  console.log('──────────────────────────────────────────────────');
  
  const readyWallets: { wallet: Keypair; index: number }[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    const balance = await connection.getBalance(wallets[i].publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;
    const isReady = balanceSOL >= solPerWallet + 0.003; // Extra for fees
    
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
  
  // Execute snipe
  console.log('\n🚀 Executing bonding curve buy...');
  
  const startTime = Date.now();
  const walletsToUse = readyWallets.map(w => w.wallet);
  const amounts = readyWallets.map(() => solPerWallet);
  
  const results = await multiBuyOnPumpFunV2(
    walletsToUse,
    tokenMint,
    amounts,
    config.defaultSlippageBps,
    (result) => {
      const idx = readyWallets[result.walletIndex!].index;
      if (result.success) {
        console.log(`  ✓ Wallet ${idx}: TX ${result.signature?.slice(0, 16)}...`);
      } else {
        console.log(`  ✗ Wallet ${idx}: ${result.error?.slice(0, 60)}`);
      }
    }
  );
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const successful = results.filter(r => r.success);
  const totalSol = successful.reduce((s, r) => s + (r.solSpent || 0), 0);
  const totalTokens = successful.reduce((s, r) => s + (r.tokenAmount || 0), 0);
  
  console.log(`\n📊 Results (${elapsed}s):`);
  console.log('────────────────────────────────────────');
  console.log(`  Success: ${successful.length}/${readyWallets.length}`);
  console.log(`  SOL spent: ${totalSol.toFixed(4)}`);
  console.log(`  Tokens: ~${(totalTokens / 1e6).toFixed(2)}M`);
  console.log('────────────────────────────────────────');
  
  if (successful.length > 0) {
    console.log('\n✅ Transactions:');
    successful.forEach(r => {
      console.log(`  https://solscan.io/tx/${r.signature}`);
    });
  }
}

main().catch(console.error);


import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';
import { getAllKeypairs } from '../wallet/generator.js';
import { fetchPumpTokenInfo, buyOnPumpFunV2, multiBuyOnPumpFunV2 } from '../trading/pump-fun-v2.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: npx tsx src/cli/snipe-v2.ts <TOKEN_MINT> <SOL_PER_WALLET>');
    console.log('Example: npx tsx src/cli/snipe-v2.ts HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump 0.005');
    process.exit(1);
  }
  
  const tokenMint = args[0];
  const solPerWallet = parseFloat(args[1]);
  
  console.log('\n🎯 Pump.fun Bonding Curve Sniper v2\n');
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
  
  // Fetch token info
  const connection = createConnection();
  console.log('\n🔍 Fetching bonding curve info...');
  
  const tokenInfo = await fetchPumpTokenInfo(connection, tokenMint);
  
  if (!tokenInfo) {
    console.error('❌ Token not found or not on pump.fun bonding curve');
    process.exit(1);
  }
  
  console.log('✓ Token found on bonding curve!');
  console.log(`  Bonding Curve: ${tokenInfo.bondingCurve.toBase58().slice(0, 12)}...`);
  console.log(`  Creator: ${tokenInfo.coinCreator.toBase58().slice(0, 12)}...`);
  console.log(`  Token Program: ${tokenInfo.tokenProgram.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'Token Program'}`);
  console.log(`  Status: ${tokenInfo.complete ? 'Graduated' : 'Active on Bonding Curve'}`);
  
  if (tokenInfo.complete) {
    console.error('❌ Token has graduated from bonding curve. Use Jupiter instead.');
    process.exit(1);
  }
  
  // Check balances
  console.log('\n💼 Wallet Balances:');
  console.log('──────────────────────────────────────────────────');
  
  const readyWallets: { wallet: Keypair; index: number }[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    const balance = await connection.getBalance(wallets[i].publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;
    const isReady = balanceSOL >= solPerWallet + 0.003; // Extra for fees
    
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
  
  // Execute snipe
  console.log('\n🚀 Executing bonding curve buy...');
  
  const startTime = Date.now();
  const walletsToUse = readyWallets.map(w => w.wallet);
  const amounts = readyWallets.map(() => solPerWallet);
  
  const results = await multiBuyOnPumpFunV2(
    walletsToUse,
    tokenMint,
    amounts,
    config.defaultSlippageBps,
    (result) => {
      const idx = readyWallets[result.walletIndex!].index;
      if (result.success) {
        console.log(`  ✓ Wallet ${idx}: TX ${result.signature?.slice(0, 16)}...`);
      } else {
        console.log(`  ✗ Wallet ${idx}: ${result.error?.slice(0, 60)}`);
      }
    }
  );
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const successful = results.filter(r => r.success);
  const totalSol = successful.reduce((s, r) => s + (r.solSpent || 0), 0);
  const totalTokens = successful.reduce((s, r) => s + (r.tokenAmount || 0), 0);
  
  console.log(`\n📊 Results (${elapsed}s):`);
  console.log('────────────────────────────────────────');
  console.log(`  Success: ${successful.length}/${readyWallets.length}`);
  console.log(`  SOL spent: ${totalSol.toFixed(4)}`);
  console.log(`  Tokens: ~${(totalTokens / 1e6).toFixed(2)}M`);
  console.log('────────────────────────────────────────');
  
  if (successful.length > 0) {
    console.log('\n✅ Transactions:');
    successful.forEach(r => {
      console.log(`  https://solscan.io/tx/${r.signature}`);
    });
  }
}

main().catch(console.error);

