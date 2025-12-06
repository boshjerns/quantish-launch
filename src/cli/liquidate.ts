import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from '../config/index.js';
import { createConnection, getMasterKeypair } from '../wallet/distributor.js';
import { getAllKeypairs } from '../wallet/generator.js';
import {
  fetchPumpTokenInfo,
  getTokenBalance,
  sellOnPumpFunV3,
  multiSellOnPumpFunV3,
  transferTokens,
  aggregateTokens,
} from '../trading/pump-fun-v3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: npx tsx src/cli/liquidate.ts <TOKEN_MINT> [--sell-half] [--transfer-to-master]');
    console.log('\nOptions:');
    console.log('  --sell-half           Sell half the tokens from each wallet');
    console.log('  --sell-all            Sell all tokens from each wallet');
    console.log('  --transfer-to-master  Transfer remaining tokens to master wallet');
    console.log('\nExamples:');
    console.log('  npx tsx src/cli/liquidate.ts HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump --sell-half --transfer-to-master');
    process.exit(1);
  }
  
  const tokenMint = args[0];
  const sellHalf = args.includes('--sell-half');
  const sellAll = args.includes('--sell-all');
  const transferToMaster = args.includes('--transfer-to-master');
  
  console.log('\n💰 Pump.fun Liquidation Tool\n');
  console.log('Token:', tokenMint);
  console.log('Mode:', sellAll ? 'Sell ALL' : sellHalf ? 'Sell HALF' : 'View only');
  console.log('Transfer to master:', transferToMaster ? 'Yes' : 'No');
  
  // Load wallets
  const password = process.env.WALLET_ENCRYPTION_PASSWORD;
  if (!password) {
    console.error('Error: WALLET_ENCRYPTION_PASSWORD not set');
    process.exit(1);
  }
  
  let wallets: Keypair[];
  let masterWallet: Keypair;
  try {
    wallets = getAllKeypairs(password);
    masterWallet = getMasterKeypair(password);
  } catch {
    console.error('Error: No wallets found. Run generate-wallets first.');
    process.exit(1);
  }
  
  const connection = createConnection();
  
  // Get token info
  console.log('\n🔍 Fetching token info...');
  const tokenInfo = await fetchPumpTokenInfo(connection, tokenMint);
  
  if (!tokenInfo) {
    console.error('❌ Token not found');
    process.exit(1);
  }
  
  console.log(`  Bonding Curve: ${tokenInfo.bondingCurve.toBase58().slice(0, 12)}...`);
  console.log(`  Token Program: ${tokenInfo.tokenProgram.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'SPL Token'}`);
  console.log(`  Status: ${tokenInfo.complete ? 'GRADUATED' : 'Active'}`);
  
  // Check balances
  console.log('\n📊 Token Balances:');
  console.log('────────────────────────────────────────────────────');
  
  let totalTokens = BigInt(0);
  const walletsWithTokens: { wallet: Keypair; balance: bigint; index: number }[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    const balance = await getTokenBalance(
      connection,
      wallets[i].publicKey,
      tokenInfo.mint,
      tokenInfo.tokenProgram
    );
    
    totalTokens += balance;
    
    if (balance > BigInt(0)) {
      walletsWithTokens.push({ wallet: wallets[i], balance, index: i });
    }
    
    const balanceFormatted = (Number(balance) / 1e6).toFixed(2);
    console.log(`  [${i}] ${wallets[i].publicKey.toBase58().slice(0, 12)}...: ${balanceFormatted} tokens`);
  }
  
  console.log('────────────────────────────────────────────────────');
  console.log(`  Total: ${(Number(totalTokens) / 1e6).toFixed(2)} tokens across ${walletsWithTokens.length} wallets`);
  
  if (walletsWithTokens.length === 0) {
    console.log('\n⚠️ No wallets have tokens to liquidate.');
    process.exit(0);
  }
  
  // STEP 1: Sell tokens
  if (sellHalf || sellAll) {
    const sellMode = sellAll ? 'all' : 'half';
    console.log(`\n🔥 Selling ${sellMode.toUpperCase()} tokens from ${walletsWithTokens.length} wallets...`);
    
    const sellResults = await multiSellOnPumpFunV3(
      walletsWithTokens.map(w => w.wallet),
      tokenMint,
      sellMode,
      config.defaultSlippageBps,
      (result) => {
        const idx = walletsWithTokens[result.walletIndex!].index;
        if (result.success) {
          console.log(`  ✓ Wallet ${idx}: Sold ${(result.tokensSold! / 1e6).toFixed(2)} tokens for ~${result.solReceived?.toFixed(4)} SOL`);
        } else {
          console.log(`  ✗ Wallet ${idx}: ${result.error?.slice(0, 50)}`);
        }
      }
    );
    
    const successfulSells = sellResults.filter(r => r.success);
    const totalSolReceived = successfulSells.reduce((s, r) => s + (r.solReceived || 0), 0);
    const totalTokensSold = successfulSells.reduce((s, r) => s + (r.tokensSold || 0), 0);
    
    console.log('\n📈 Sell Summary:');
    console.log(`  Successful: ${successfulSells.length}/${walletsWithTokens.length}`);
    console.log(`  Tokens sold: ${(totalTokensSold / 1e6).toFixed(2)}`);
    console.log(`  SOL received: ~${totalSolReceived.toFixed(4)}`);
    
    if (successfulSells.length > 0) {
      console.log('\n  Transactions:');
      successfulSells.forEach(r => {
        console.log(`    https://solscan.io/tx/${r.signature}`);
      });
    }
  }
  
  // STEP 2: Transfer remaining tokens to master
  if (transferToMaster) {
    // Re-check balances after selling
    console.log('\n📦 Transferring remaining tokens to master wallet...');
    console.log(`  Master: ${masterWallet.publicKey.toBase58()}`);
    
    const walletsStillWithTokens: { wallet: Keypair; index: number }[] = [];
    
    for (let i = 0; i < wallets.length; i++) {
      const balance = await getTokenBalance(
        connection,
        wallets[i].publicKey,
        tokenInfo.mint,
        tokenInfo.tokenProgram
      );
      
      if (balance > BigInt(0)) {
        walletsStillWithTokens.push({ wallet: wallets[i], index: i });
      }
    }
    
    if (walletsStillWithTokens.length === 0) {
      console.log('  No tokens remaining to transfer.');
    } else {
      const transferResults = await aggregateTokens(
        walletsStillWithTokens.map(w => w.wallet),
        masterWallet.publicKey,
        tokenMint,
        'all',
        (result) => {
          const idx = walletsStillWithTokens[result.walletIndex!].index;
          if (result.success) {
            console.log(`  ✓ Wallet ${idx}: Transferred ${(result.amount! / 1e6).toFixed(2)} tokens`);
          } else {
            console.log(`  ✗ Wallet ${idx}: ${result.error?.slice(0, 50)}`);
          }
        }
      );
      
      const successfulTransfers = transferResults.filter(r => r.success);
      const totalTransferred = successfulTransfers.reduce((s, r) => s + (r.amount || 0), 0);
      
      console.log('\n📦 Transfer Summary:');
      console.log(`  Successful: ${successfulTransfers.length}/${walletsStillWithTokens.length}`);
      console.log(`  Tokens transferred: ${(totalTransferred / 1e6).toFixed(2)}`);
      
      if (successfulTransfers.length > 0) {
        console.log('\n  Transactions:');
        successfulTransfers.forEach(r => {
          console.log(`    https://solscan.io/tx/${r.signature}`);
        });
      }
    }
  }
  
  // Final balance check
  console.log('\n✅ Final State:');
  const masterBalance = await getTokenBalance(
    connection,
    masterWallet.publicKey,
    tokenInfo.mint,
    tokenInfo.tokenProgram
  );
  console.log(`  Master wallet tokens: ${(Number(masterBalance) / 1e6).toFixed(2)}`);
  
  const masterSol = await connection.getBalance(masterWallet.publicKey);
  console.log(`  Master wallet SOL: ${(masterSol / LAMPORTS_PER_SOL).toFixed(4)}`);
}

main().catch(console.error);


import { createConnection, getMasterKeypair } from '../wallet/distributor.js';
import { getAllKeypairs } from '../wallet/generator.js';
import {
  fetchPumpTokenInfo,
  getTokenBalance,
  sellOnPumpFunV3,
  multiSellOnPumpFunV3,
  transferTokens,
  aggregateTokens,
} from '../trading/pump-fun-v3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: npx tsx src/cli/liquidate.ts <TOKEN_MINT> [--sell-half] [--transfer-to-master]');
    console.log('\nOptions:');
    console.log('  --sell-half           Sell half the tokens from each wallet');
    console.log('  --sell-all            Sell all tokens from each wallet');
    console.log('  --transfer-to-master  Transfer remaining tokens to master wallet');
    console.log('\nExamples:');
    console.log('  npx tsx src/cli/liquidate.ts HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump --sell-half --transfer-to-master');
    process.exit(1);
  }
  
  const tokenMint = args[0];
  const sellHalf = args.includes('--sell-half');
  const sellAll = args.includes('--sell-all');
  const transferToMaster = args.includes('--transfer-to-master');
  
  console.log('\n💰 Pump.fun Liquidation Tool\n');
  console.log('Token:', tokenMint);
  console.log('Mode:', sellAll ? 'Sell ALL' : sellHalf ? 'Sell HALF' : 'View only');
  console.log('Transfer to master:', transferToMaster ? 'Yes' : 'No');
  
  // Load wallets
  const password = process.env.WALLET_ENCRYPTION_PASSWORD;
  if (!password) {
    console.error('Error: WALLET_ENCRYPTION_PASSWORD not set');
    process.exit(1);
  }
  
  let wallets: Keypair[];
  let masterWallet: Keypair;
  try {
    wallets = getAllKeypairs(password);
    masterWallet = getMasterKeypair(password);
  } catch {
    console.error('Error: No wallets found. Run generate-wallets first.');
    process.exit(1);
  }
  
  const connection = createConnection();
  
  // Get token info
  console.log('\n🔍 Fetching token info...');
  const tokenInfo = await fetchPumpTokenInfo(connection, tokenMint);
  
  if (!tokenInfo) {
    console.error('❌ Token not found');
    process.exit(1);
  }
  
  console.log(`  Bonding Curve: ${tokenInfo.bondingCurve.toBase58().slice(0, 12)}...`);
  console.log(`  Token Program: ${tokenInfo.tokenProgram.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'SPL Token'}`);
  console.log(`  Status: ${tokenInfo.complete ? 'GRADUATED' : 'Active'}`);
  
  // Check balances
  console.log('\n📊 Token Balances:');
  console.log('────────────────────────────────────────────────────');
  
  let totalTokens = BigInt(0);
  const walletsWithTokens: { wallet: Keypair; balance: bigint; index: number }[] = [];
  
  for (let i = 0; i < wallets.length; i++) {
    const balance = await getTokenBalance(
      connection,
      wallets[i].publicKey,
      tokenInfo.mint,
      tokenInfo.tokenProgram
    );
    
    totalTokens += balance;
    
    if (balance > BigInt(0)) {
      walletsWithTokens.push({ wallet: wallets[i], balance, index: i });
    }
    
    const balanceFormatted = (Number(balance) / 1e6).toFixed(2);
    console.log(`  [${i}] ${wallets[i].publicKey.toBase58().slice(0, 12)}...: ${balanceFormatted} tokens`);
  }
  
  console.log('────────────────────────────────────────────────────');
  console.log(`  Total: ${(Number(totalTokens) / 1e6).toFixed(2)} tokens across ${walletsWithTokens.length} wallets`);
  
  if (walletsWithTokens.length === 0) {
    console.log('\n⚠️ No wallets have tokens to liquidate.');
    process.exit(0);
  }
  
  // STEP 1: Sell tokens
  if (sellHalf || sellAll) {
    const sellMode = sellAll ? 'all' : 'half';
    console.log(`\n🔥 Selling ${sellMode.toUpperCase()} tokens from ${walletsWithTokens.length} wallets...`);
    
    const sellResults = await multiSellOnPumpFunV3(
      walletsWithTokens.map(w => w.wallet),
      tokenMint,
      sellMode,
      config.defaultSlippageBps,
      (result) => {
        const idx = walletsWithTokens[result.walletIndex!].index;
        if (result.success) {
          console.log(`  ✓ Wallet ${idx}: Sold ${(result.tokensSold! / 1e6).toFixed(2)} tokens for ~${result.solReceived?.toFixed(4)} SOL`);
        } else {
          console.log(`  ✗ Wallet ${idx}: ${result.error?.slice(0, 50)}`);
        }
      }
    );
    
    const successfulSells = sellResults.filter(r => r.success);
    const totalSolReceived = successfulSells.reduce((s, r) => s + (r.solReceived || 0), 0);
    const totalTokensSold = successfulSells.reduce((s, r) => s + (r.tokensSold || 0), 0);
    
    console.log('\n📈 Sell Summary:');
    console.log(`  Successful: ${successfulSells.length}/${walletsWithTokens.length}`);
    console.log(`  Tokens sold: ${(totalTokensSold / 1e6).toFixed(2)}`);
    console.log(`  SOL received: ~${totalSolReceived.toFixed(4)}`);
    
    if (successfulSells.length > 0) {
      console.log('\n  Transactions:');
      successfulSells.forEach(r => {
        console.log(`    https://solscan.io/tx/${r.signature}`);
      });
    }
  }
  
  // STEP 2: Transfer remaining tokens to master
  if (transferToMaster) {
    // Re-check balances after selling
    console.log('\n📦 Transferring remaining tokens to master wallet...');
    console.log(`  Master: ${masterWallet.publicKey.toBase58()}`);
    
    const walletsStillWithTokens: { wallet: Keypair; index: number }[] = [];
    
    for (let i = 0; i < wallets.length; i++) {
      const balance = await getTokenBalance(
        connection,
        wallets[i].publicKey,
        tokenInfo.mint,
        tokenInfo.tokenProgram
      );
      
      if (balance > BigInt(0)) {
        walletsStillWithTokens.push({ wallet: wallets[i], index: i });
      }
    }
    
    if (walletsStillWithTokens.length === 0) {
      console.log('  No tokens remaining to transfer.');
    } else {
      const transferResults = await aggregateTokens(
        walletsStillWithTokens.map(w => w.wallet),
        masterWallet.publicKey,
        tokenMint,
        'all',
        (result) => {
          const idx = walletsStillWithTokens[result.walletIndex!].index;
          if (result.success) {
            console.log(`  ✓ Wallet ${idx}: Transferred ${(result.amount! / 1e6).toFixed(2)} tokens`);
          } else {
            console.log(`  ✗ Wallet ${idx}: ${result.error?.slice(0, 50)}`);
          }
        }
      );
      
      const successfulTransfers = transferResults.filter(r => r.success);
      const totalTransferred = successfulTransfers.reduce((s, r) => s + (r.amount || 0), 0);
      
      console.log('\n📦 Transfer Summary:');
      console.log(`  Successful: ${successfulTransfers.length}/${walletsStillWithTokens.length}`);
      console.log(`  Tokens transferred: ${(totalTransferred / 1e6).toFixed(2)}`);
      
      if (successfulTransfers.length > 0) {
        console.log('\n  Transactions:');
        successfulTransfers.forEach(r => {
          console.log(`    https://solscan.io/tx/${r.signature}`);
        });
      }
    }
  }
  
  // Final balance check
  console.log('\n✅ Final State:');
  const masterBalance = await getTokenBalance(
    connection,
    masterWallet.publicKey,
    tokenInfo.mint,
    tokenInfo.tokenProgram
  );
  console.log(`  Master wallet tokens: ${(Number(masterBalance) / 1e6).toFixed(2)}`);
  
  const masterSol = await connection.getBalance(masterWallet.publicKey);
  console.log(`  Master wallet SOL: ${(masterSol / LAMPORTS_PER_SOL).toFixed(4)}`);
}

main().catch(console.error);

