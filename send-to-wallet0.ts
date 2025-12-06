import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from '@solana/web3.js';
import { config } from './src/config/index.js';
import { getMasterKeypair } from './src/wallet/distributor.js';
import { getAllKeypairs } from './src/wallet/generator.js';

const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
const master = getMasterKeypair(password);
const wallets = getAllKeypairs(password);
const conn = new Connection(config.rpcUrl);

// Send 1.04 SOL to wallet 0
const amount = 1.04 * LAMPORTS_PER_SOL;

console.log('Sending 1.04 SOL to wallet 0...');

const tx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: master.publicKey,
    toPubkey: wallets[0].publicKey,
    lamports: amount,
  })
);

const sig = await sendAndConfirmTransaction(conn, tx, [master], { commitment: 'confirmed' });
console.log('✓ Success:', sig);

import { config } from './src/config/index.js';
import { getMasterKeypair } from './src/wallet/distributor.js';
import { getAllKeypairs } from './src/wallet/generator.js';

const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
const master = getMasterKeypair(password);
const wallets = getAllKeypairs(password);
const conn = new Connection(config.rpcUrl);

// Send 1.04 SOL to wallet 0
const amount = 1.04 * LAMPORTS_PER_SOL;

console.log('Sending 1.04 SOL to wallet 0...');

const tx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: master.publicKey,
    toPubkey: wallets[0].publicKey,
    lamports: amount,
  })
);

const sig = await sendAndConfirmTransaction(conn, tx, [master], { commitment: 'confirmed' });
console.log('✓ Success:', sig);

