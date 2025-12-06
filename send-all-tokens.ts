import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from './src/config/index.js';
import { createConnection } from './src/wallet/distributor.js';
import { getAllKeypairs } from './src/wallet/generator.js';
import {
  transferTokens,
  aggregateTokens,
} from './src/trading/pump-fun-v3.js';

const TOKEN_MINT = 'Gd9Fqvd54ghDpE7PmvwpxALSbvd9YBFnFNYa9iA9pump';
const DESTINATION = '6JSodXKKyTXU6XhdR9iq9PiCYSCeyRvpdhnmNEyTxDMi';

async function main() {
  console.log('\n📦 Transferring All Tokens\n');
  console.log('Token:', TOKEN_MINT);
  console.log('Destination:', DESTINATION);
  console.log('');
  
  const password = process.env.WALLET_ENCRYPTION_PASSWORD;
  if (!password) {
    console.error('Error: WALLET_ENCRYPTION_PASSWORD not set');
    process.exit(1);
  }
  
  const wallets = getAllKeypairs(password);
  const destPubkey = new PublicKey(DESTINATION);
  
  console.log(`Transferring from ${wallets.length} wallets...\n`);
  
  const results = await aggregateTokens(
    wallets,
    destPubkey,
    TOKEN_MINT,
    'all',
    (result) => {
      const idx = result.walletIndex!;
      if (result.success) {
        console.log(`  ✓ Wallet ${idx}: Transferred ${(result.amount! / 1e6).toFixed(2)} tokens`);
      } else {
        console.log(`  ✗ Wallet ${idx}: ${result.error?.slice(0, 50)}`);
      }
    }
  );
  
  const successful = results.filter(r => r.success);
  const totalTransferred = successful.reduce((s, r) => s + (r.amount || 0), 0);
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`📊 Transfer Summary:`);
  console.log(`  Successful: ${successful.length}/${wallets.length}`);
  console.log(`  Total transferred: ${(totalTransferred / 1e6).toFixed(2)} tokens`);
  console.log('═══════════════════════════════════════════════════════');
  
  if (successful.length > 0) {
    console.log('\n📝 Transactions:');
    successful.forEach(r => {
      console.log(`  https://solscan.io/tx/${r.signature}`);
    });
  }
  
  console.log('\n✅ Transfer complete!');
}

main().catch(console.error);

import { config } from './src/config/index.js';
import { createConnection } from './src/wallet/distributor.js';
import { getAllKeypairs } from './src/wallet/generator.js';
import {
  transferTokens,
  aggregateTokens,
} from './src/trading/pump-fun-v3.js';

const TOKEN_MINT = 'Gd9Fqvd54ghDpE7PmvwpxALSbvd9YBFnFNYa9iA9pump';
const DESTINATION = '6JSodXKKyTXU6XhdR9iq9PiCYSCeyRvpdhnmNEyTxDMi';

async function main() {
  console.log('\n📦 Transferring All Tokens\n');
  console.log('Token:', TOKEN_MINT);
  console.log('Destination:', DESTINATION);
  console.log('');
  
  const password = process.env.WALLET_ENCRYPTION_PASSWORD;
  if (!password) {
    console.error('Error: WALLET_ENCRYPTION_PASSWORD not set');
    process.exit(1);
  }
  
  const wallets = getAllKeypairs(password);
  const destPubkey = new PublicKey(DESTINATION);
  
  console.log(`Transferring from ${wallets.length} wallets...\n`);
  
  const results = await aggregateTokens(
    wallets,
    destPubkey,
    TOKEN_MINT,
    'all',
    (result) => {
      const idx = result.walletIndex!;
      if (result.success) {
        console.log(`  ✓ Wallet ${idx}: Transferred ${(result.amount! / 1e6).toFixed(2)} tokens`);
      } else {
        console.log(`  ✗ Wallet ${idx}: ${result.error?.slice(0, 50)}`);
      }
    }
  );
  
  const successful = results.filter(r => r.success);
  const totalTransferred = successful.reduce((s, r) => s + (r.amount || 0), 0);
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`📊 Transfer Summary:`);
  console.log(`  Successful: ${successful.length}/${wallets.length}`);
  console.log(`  Total transferred: ${(totalTransferred / 1e6).toFixed(2)} tokens`);
  console.log('═══════════════════════════════════════════════════════');
  
  if (successful.length > 0) {
    console.log('\n📝 Transactions:');
    successful.forEach(r => {
      console.log(`  https://solscan.io/tx/${r.signature}`);
    });
  }
  
  console.log('\n✅ Transfer complete!');
}

main().catch(console.error);

