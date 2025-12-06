import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from '../config/index.js';
import { createConnection, getMasterKeypair } from '../wallet/distributor.js';
import {
  fetchPumpTokenInfo,
  getTokenBalance,
  sellOnPumpFunV3,
} from '../trading/pump-fun-v3.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: npx tsx src/cli/sell-master.ts <TOKEN_MINT> [half|all]');
    process.exit(1);
  }
  
  const tokenMint = args[0];
  const sellMode = args[1] === 'all' ? 'all' : 'half';
  
  console.log('\n💰 Master Wallet Sell\n');
  
  const password = process.env.WALLET_ENCRYPTION_PASSWORD;
  if (!password) {
    console.error('Error: WALLET_ENCRYPTION_PASSWORD not set');
    process.exit(1);
  }
  
  const masterWallet = getMasterKeypair(password);
  const connection = createConnection();
  
  console.log('Master wallet:', masterWallet.publicKey.toBase58());
  
  // Get token info
  const tokenInfo = await fetchPumpTokenInfo(connection, tokenMint);
  if (!tokenInfo) {
    console.error('Token not found');
    process.exit(1);
  }
  
  // Get balance
  const balance = await getTokenBalance(
    connection,
    masterWallet.publicKey,
    tokenInfo.mint,
    tokenInfo.tokenProgram
  );
  
  console.log(`Token balance: ${(Number(balance) / 1e6).toFixed(2)} tokens`);
  console.log(`Sell mode: ${sellMode}`);
  
  if (balance === BigInt(0)) {
    console.log('No tokens to sell');
    process.exit(0);
  }
  
  // Execute sell
  console.log('\n🔥 Selling...');
  
  const result = await sellOnPumpFunV3(
    masterWallet,
    tokenMint,
    sellMode,
    config.defaultSlippageBps
  );
  
  if (result.success) {
    console.log(`\n✅ Success!`);
    console.log(`  Tokens sold: ${(result.tokensSold! / 1e6).toFixed(2)}`);
    console.log(`  SOL received: ~${result.solReceived?.toFixed(6)}`);
    console.log(`  TX: https://solscan.io/tx/${result.signature}`);
    
    // Check final balances
    const newBalance = await getTokenBalance(
      connection,
      masterWallet.publicKey,
      tokenInfo.mint,
      tokenInfo.tokenProgram
    );
    const solBalance = await connection.getBalance(masterWallet.publicKey);
    
    console.log(`\n📊 Final State:`);
    console.log(`  Tokens remaining: ${(Number(newBalance) / 1e6).toFixed(2)}`);
    console.log(`  SOL balance: ${(solBalance / LAMPORTS_PER_SOL).toFixed(6)}`);
  } else {
    console.log(`\n❌ Failed: ${result.error}`);
  }
}

main().catch(console.error);


import { config } from '../config/index.js';
import { createConnection, getMasterKeypair } from '../wallet/distributor.js';
import {
  fetchPumpTokenInfo,
  getTokenBalance,
  sellOnPumpFunV3,
} from '../trading/pump-fun-v3.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: npx tsx src/cli/sell-master.ts <TOKEN_MINT> [half|all]');
    process.exit(1);
  }
  
  const tokenMint = args[0];
  const sellMode = args[1] === 'all' ? 'all' : 'half';
  
  console.log('\n💰 Master Wallet Sell\n');
  
  const password = process.env.WALLET_ENCRYPTION_PASSWORD;
  if (!password) {
    console.error('Error: WALLET_ENCRYPTION_PASSWORD not set');
    process.exit(1);
  }
  
  const masterWallet = getMasterKeypair(password);
  const connection = createConnection();
  
  console.log('Master wallet:', masterWallet.publicKey.toBase58());
  
  // Get token info
  const tokenInfo = await fetchPumpTokenInfo(connection, tokenMint);
  if (!tokenInfo) {
    console.error('Token not found');
    process.exit(1);
  }
  
  // Get balance
  const balance = await getTokenBalance(
    connection,
    masterWallet.publicKey,
    tokenInfo.mint,
    tokenInfo.tokenProgram
  );
  
  console.log(`Token balance: ${(Number(balance) / 1e6).toFixed(2)} tokens`);
  console.log(`Sell mode: ${sellMode}`);
  
  if (balance === BigInt(0)) {
    console.log('No tokens to sell');
    process.exit(0);
  }
  
  // Execute sell
  console.log('\n🔥 Selling...');
  
  const result = await sellOnPumpFunV3(
    masterWallet,
    tokenMint,
    sellMode,
    config.defaultSlippageBps
  );
  
  if (result.success) {
    console.log(`\n✅ Success!`);
    console.log(`  Tokens sold: ${(result.tokensSold! / 1e6).toFixed(2)}`);
    console.log(`  SOL received: ~${result.solReceived?.toFixed(6)}`);
    console.log(`  TX: https://solscan.io/tx/${result.signature}`);
    
    // Check final balances
    const newBalance = await getTokenBalance(
      connection,
      masterWallet.publicKey,
      tokenInfo.mint,
      tokenInfo.tokenProgram
    );
    const solBalance = await connection.getBalance(masterWallet.publicKey);
    
    console.log(`\n📊 Final State:`);
    console.log(`  Tokens remaining: ${(Number(newBalance) / 1e6).toFixed(2)}`);
    console.log(`  SOL balance: ${(solBalance / LAMPORTS_PER_SOL).toFixed(6)}`);
  } else {
    console.log(`\n❌ Failed: ${result.error}`);
  }
}

main().catch(console.error);


