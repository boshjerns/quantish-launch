import { getAllKeypairs } from './src/wallet/generator.js';

const password = process.env.WALLET_ENCRYPTION_PASSWORD;
if (!password) {
  console.error('WALLET_ENCRYPTION_PASSWORD not set');
  process.exit(1);
}

const wallets = getAllKeypairs(password);

console.log('\n📦 Your 5 Trading Wallets:\n');
wallets.forEach((k, i) => {
  console.log(`[${i}] ${k.publicKey.toBase58()}`);
});
console.log('');


const password = process.env.WALLET_ENCRYPTION_PASSWORD;
if (!password) {
  console.error('WALLET_ENCRYPTION_PASSWORD not set');
  process.exit(1);
}

const wallets = getAllKeypairs(password);

console.log('\n📦 Your 5 Trading Wallets:\n');
wallets.forEach((k, i) => {
  console.log(`[${i}] ${k.publicKey.toBase58()}`);
});
console.log('');

