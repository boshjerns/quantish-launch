import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';
import { getAllKeypairs } from '../wallet/generator.js';
import { 
  buyWithJupiter, 
  multiBuyWithJupiter, 
  checkTokenLiquidity,
  getJupiterQuote 
} from '../trading/jupiter-swap.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: npx tsx src/cli/snipe-jupiter.ts <TOKEN_MINT> <SOL_PER_WALLET>');
    console.log('Example: npx tsx src/cli/snipe-jupiter.ts HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump 0.005');
    process.exit(1);
  }
  
  const tokenMint = args[0];
  const solPerWallet = parseFloat(args[1]);
  
  console.log('\n🎯 Jupiter Multi-Wallet Snipe\n');
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
  } catch (error) {
    console.error('Error: No wallets found. Run generate-wallets first.');
    process.exit(1);
  }
  
  console.log(`  Total wallets: ${wallets.length}`);
  
  // Check liquidity
  console.log('\n🔍 Checking token liquidity on Jupiter...');
  const hasLiquidity = await checkTokenLiquidity(tokenMint);
  
  if (!hasLiquidity) {
    console.log('⚠️  No liquidity found on Jupiter for this token.');
    console.log('   This could mean:');
    console.log('   - Token is still on bonding curve (not graduated)');
    console.log('   - Token has no active trading pairs');
    console.log('   - Token mint address is incorrect');
    console.log('\n   For bonding curve tokens, they need to "graduate" to Raydium first.');
    process.exit(1);
  }
  
  console.log('✓ Token has liquidity on Jupiter!');
  
  // Get a sample quote
  const sampleQuote = await getJupiterQuote(
    'So11111111111111111111111111111111111111112',
    tokenMint,
    Math.floor(solPerWallet * LAMPORTS_PER_SOL),
    config.defaultSlippageBps
  );
  
  if (sampleQuote) {
    console.log(`\n📊 Current Price Info:`);
    console.log(`  ${solPerWallet} SOL ≈ ${Number(sampleQuote.outAmount).toLocaleString()} tokens`);
    console.log(`  Price impact: ${sampleQuote.priceImpactPct}%`);
  }
  
  // Check balances
  const connection = createConnection();
  console.log('\n💼 Wallet Balances:');
  console.log('──────────────────────────────────────────────────');
  
  let readyWallets = 0;
  const readyWalletsList: { wallet: Keypair; index: number }[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    const balance = await connection.getBalance(wallets[i].publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;
    const isReady = balanceSOL >= solPerWallet + 0.002; // Extra for fees
    
    if (isReady) {
      readyWallets++;
      readyWalletsList.push({ wallet: wallets[i], index: i });
    }
    
    console.log(`  [${i}] ${balanceSOL.toFixed(4)} SOL - ${isReady ? '✓ Ready' : '✗ Insufficient'}`);
  }
  
  console.log('──────────────────────────────────────────────────');
  console.log(`  Wallets ready: ${readyWallets}/${wallets.length}`);
  
  if (readyWallets === 0) {
    console.error('\nNo wallets have sufficient balance.');
    process.exit(1);
  }
  
  // Execute snipe
  console.log('\n🚀 Executing Jupiter snipe...');
  console.log(`   Buying ${solPerWallet} SOL worth from ${readyWallets} wallet(s)\n`);
  
  const startTime = Date.now();
  const solAmounts = readyWalletsList.map(() => solPerWallet);
  const walletsToUse = readyWalletsList.map(w => w.wallet);
  
  const results = await multiBuyWithJupiter(
    walletsToUse,
    tokenMint,
    solAmounts,
    config.defaultSlippageBps,
    (result) => {
      const walletIdx = readyWalletsList[result.walletIndex!].index;
      if (result.success) {
        console.log(`  ✓ Wallet ${walletIdx}: Success! TX: ${result.signature?.slice(0, 20)}...`);
      } else {
        console.log(`  ✗ Wallet ${walletIdx}: ${result.error?.slice(0, 80)}`);
      }
    }
  );
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const successful = results.filter(r => r.success);
  const totalSolSpent = successful.reduce((sum, r) => sum + (r.inputAmount || 0), 0);
  const totalTokens = successful.reduce((sum, r) => sum + (r.outputAmount || 0), 0);
  
  console.log(`\n📊 Snipe Results (${elapsed}s):`);
  console.log('────────────────────────────────────────');
  console.log(`  Successful: ${successful.length}/${readyWallets}`);
  console.log(`  Failed: ${results.length - successful.length}/${readyWallets}`);
  console.log(`  Total SOL spent: ${totalSolSpent.toFixed(4)} SOL`);
  console.log(`  Total tokens received: ~${totalTokens.toLocaleString()}`);
  console.log('────────────────────────────────────────');
  
  if (successful.length > 0) {
    console.log('\n✅ Successful transactions:');
    successful.forEach(r => {
      const walletIdx = readyWalletsList[r.walletIndex!].index;
      console.log(`  Wallet ${walletIdx}: https://solscan.io/tx/${r.signature}`);
    });
  }
  
  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    console.log('\n❌ Failed transactions:');
    failed.forEach(r => {
      const walletIdx = readyWalletsList[r.walletIndex!].index;
      console.log(`  Wallet ${walletIdx}: ${r.error}`);
    });
  }
}

main().catch(console.error);


import { config } from '../config/index.js';
import { createConnection } from '../wallet/distributor.js';
import { getAllKeypairs } from '../wallet/generator.js';
import { 
  buyWithJupiter, 
  multiBuyWithJupiter, 
  checkTokenLiquidity,
  getJupiterQuote 
} from '../trading/jupiter-swap.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: npx tsx src/cli/snipe-jupiter.ts <TOKEN_MINT> <SOL_PER_WALLET>');
    console.log('Example: npx tsx src/cli/snipe-jupiter.ts HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump 0.005');
    process.exit(1);
  }
  
  const tokenMint = args[0];
  const solPerWallet = parseFloat(args[1]);
  
  console.log('\n🎯 Jupiter Multi-Wallet Snipe\n');
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
  } catch (error) {
    console.error('Error: No wallets found. Run generate-wallets first.');
    process.exit(1);
  }
  
  console.log(`  Total wallets: ${wallets.length}`);
  
  // Check liquidity
  console.log('\n🔍 Checking token liquidity on Jupiter...');
  const hasLiquidity = await checkTokenLiquidity(tokenMint);
  
  if (!hasLiquidity) {
    console.log('⚠️  No liquidity found on Jupiter for this token.');
    console.log('   This could mean:');
    console.log('   - Token is still on bonding curve (not graduated)');
    console.log('   - Token has no active trading pairs');
    console.log('   - Token mint address is incorrect');
    console.log('\n   For bonding curve tokens, they need to "graduate" to Raydium first.');
    process.exit(1);
  }
  
  console.log('✓ Token has liquidity on Jupiter!');
  
  // Get a sample quote
  const sampleQuote = await getJupiterQuote(
    'So11111111111111111111111111111111111111112',
    tokenMint,
    Math.floor(solPerWallet * LAMPORTS_PER_SOL),
    config.defaultSlippageBps
  );
  
  if (sampleQuote) {
    console.log(`\n📊 Current Price Info:`);
    console.log(`  ${solPerWallet} SOL ≈ ${Number(sampleQuote.outAmount).toLocaleString()} tokens`);
    console.log(`  Price impact: ${sampleQuote.priceImpactPct}%`);
  }
  
  // Check balances
  const connection = createConnection();
  console.log('\n💼 Wallet Balances:');
  console.log('──────────────────────────────────────────────────');
  
  let readyWallets = 0;
  const readyWalletsList: { wallet: Keypair; index: number }[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    const balance = await connection.getBalance(wallets[i].publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;
    const isReady = balanceSOL >= solPerWallet + 0.002; // Extra for fees
    
    if (isReady) {
      readyWallets++;
      readyWalletsList.push({ wallet: wallets[i], index: i });
    }
    
    console.log(`  [${i}] ${balanceSOL.toFixed(4)} SOL - ${isReady ? '✓ Ready' : '✗ Insufficient'}`);
  }
  
  console.log('──────────────────────────────────────────────────');
  console.log(`  Wallets ready: ${readyWallets}/${wallets.length}`);
  
  if (readyWallets === 0) {
    console.error('\nNo wallets have sufficient balance.');
    process.exit(1);
  }
  
  // Execute snipe
  console.log('\n🚀 Executing Jupiter snipe...');
  console.log(`   Buying ${solPerWallet} SOL worth from ${readyWallets} wallet(s)\n`);
  
  const startTime = Date.now();
  const solAmounts = readyWalletsList.map(() => solPerWallet);
  const walletsToUse = readyWalletsList.map(w => w.wallet);
  
  const results = await multiBuyWithJupiter(
    walletsToUse,
    tokenMint,
    solAmounts,
    config.defaultSlippageBps,
    (result) => {
      const walletIdx = readyWalletsList[result.walletIndex!].index;
      if (result.success) {
        console.log(`  ✓ Wallet ${walletIdx}: Success! TX: ${result.signature?.slice(0, 20)}...`);
      } else {
        console.log(`  ✗ Wallet ${walletIdx}: ${result.error?.slice(0, 80)}`);
      }
    }
  );
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const successful = results.filter(r => r.success);
  const totalSolSpent = successful.reduce((sum, r) => sum + (r.inputAmount || 0), 0);
  const totalTokens = successful.reduce((sum, r) => sum + (r.outputAmount || 0), 0);
  
  console.log(`\n📊 Snipe Results (${elapsed}s):`);
  console.log('────────────────────────────────────────');
  console.log(`  Successful: ${successful.length}/${readyWallets}`);
  console.log(`  Failed: ${results.length - successful.length}/${readyWallets}`);
  console.log(`  Total SOL spent: ${totalSolSpent.toFixed(4)} SOL`);
  console.log(`  Total tokens received: ~${totalTokens.toLocaleString()}`);
  console.log('────────────────────────────────────────');
  
  if (successful.length > 0) {
    console.log('\n✅ Successful transactions:');
    successful.forEach(r => {
      const walletIdx = readyWalletsList[r.walletIndex!].index;
      console.log(`  Wallet ${walletIdx}: https://solscan.io/tx/${r.signature}`);
    });
  }
  
  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    console.log('\n❌ Failed transactions:');
    failed.forEach(r => {
      const walletIdx = readyWalletsList[r.walletIndex!].index;
      console.log(`  Wallet ${walletIdx}: ${r.error}`);
    });
  }
}

main().catch(console.error);

