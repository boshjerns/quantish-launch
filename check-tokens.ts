import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { config } from './src/config/index.js';
import { getAllKeypairs } from './src/wallet/generator.js';

const TOKEN_MINT = 'Gd9Fqvd54ghDpE7PmvwpxALSbvd9YBFnFNYa9iA9pump';
const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
const wallets = getAllKeypairs(password);
const conn = new Connection(config.rpcUrl);
const mint = new PublicKey(TOKEN_MINT);

// Detect token program
const mintInfo = await conn.getAccountInfo(mint);
const tokenProgram = mintInfo!.owner;

console.log('\n🪙 Token Holdings: ' + TOKEN_MINT.slice(0,8) + '...\n');
console.log('═══════════════════════════════════════════════════════════════');

let total = BigInt(0);
for (let i = 0; i < wallets.length; i++) {
  try {
    const ata = getAssociatedTokenAddressSync(mint, wallets[i].publicKey, false, tokenProgram);
    const balance = await conn.getTokenAccountBalance(ata);
    const amount = BigInt(balance.value.amount);
    total += amount;
    console.log(`[${i}] ${wallets[i].publicKey.toBase58().slice(0,12)}...  ${(Number(amount) / 1e6).toFixed(2)} tokens`);
  } catch {
    console.log(`[${i}] ${wallets[i].publicKey.toBase58().slice(0,12)}...  0 tokens`);
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log(`Total tokens: ${(Number(total) / 1e6).toFixed(2)}\n`);

import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { config } from './src/config/index.js';
import { getAllKeypairs } from './src/wallet/generator.js';

const TOKEN_MINT = 'Gd9Fqvd54ghDpE7PmvwpxALSbvd9YBFnFNYa9iA9pump';
const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
const wallets = getAllKeypairs(password);
const conn = new Connection(config.rpcUrl);
const mint = new PublicKey(TOKEN_MINT);

// Detect token program
const mintInfo = await conn.getAccountInfo(mint);
const tokenProgram = mintInfo!.owner;

console.log('\n🪙 Token Holdings: ' + TOKEN_MINT.slice(0,8) + '...\n');
console.log('═══════════════════════════════════════════════════════════════');

let total = BigInt(0);
for (let i = 0; i < wallets.length; i++) {
  try {
    const ata = getAssociatedTokenAddressSync(mint, wallets[i].publicKey, false, tokenProgram);
    const balance = await conn.getTokenAccountBalance(ata);
    const amount = BigInt(balance.value.amount);
    total += amount;
    console.log(`[${i}] ${wallets[i].publicKey.toBase58().slice(0,12)}...  ${(Number(amount) / 1e6).toFixed(2)} tokens`);
  } catch {
    console.log(`[${i}] ${wallets[i].publicKey.toBase58().slice(0,12)}...  0 tokens`);
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log(`Total tokens: ${(Number(total) / 1e6).toFixed(2)}\n`);

