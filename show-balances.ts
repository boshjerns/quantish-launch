import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from './src/config/index.js';
import { getMasterKeypair } from './src/wallet/distributor.js';
import { getAllKeypairs } from './src/wallet/generator.js';

const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
const master = getMasterKeypair(password);
const wallets = getAllKeypairs(password);
const conn = new Connection(config.rpcUrl);

console.log('\n💰 Wallet Balances Ready for Trading\n');
console.log('═══════════════════════════════════════════════════════════════');

let total = 0;
for (let i = 0; i < wallets.length; i++) {
  const bal = await conn.getBalance(wallets[i].publicKey);
  const solBal = bal / LAMPORTS_PER_SOL;
  total += solBal;
  console.log(`[${i}] ${wallets[i].publicKey.toBase58()}  ${solBal.toFixed(4)} SOL`);
}

console.log('═══════════════════════════════════════════════════════════════');
console.log(`Total in trading wallets: ${total.toFixed(4)} SOL`);

const masterBal = await conn.getBalance(master.publicKey);
console.log(`Master wallet reserve: ${(masterBal / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);

import { config } from './src/config/index.js';
import { getMasterKeypair } from './src/wallet/distributor.js';
import { getAllKeypairs } from './src/wallet/generator.js';

const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
const master = getMasterKeypair(password);
const wallets = getAllKeypairs(password);
const conn = new Connection(config.rpcUrl);

console.log('\n💰 Wallet Balances Ready for Trading\n');
console.log('═══════════════════════════════════════════════════════════════');

let total = 0;
for (let i = 0; i < wallets.length; i++) {
  const bal = await conn.getBalance(wallets[i].publicKey);
  const solBal = bal / LAMPORTS_PER_SOL;
  total += solBal;
  console.log(`[${i}] ${wallets[i].publicKey.toBase58()}  ${solBal.toFixed(4)} SOL`);
}

console.log('═══════════════════════════════════════════════════════════════');
console.log(`Total in trading wallets: ${total.toFixed(4)} SOL`);

const masterBal = await conn.getBalance(master.publicKey);
console.log(`Master wallet reserve: ${(masterBal / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);

