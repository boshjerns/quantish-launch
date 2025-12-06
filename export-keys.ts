import { getAllKeypairs } from './src/wallet/generator.js';
import * as fs from 'fs';
import bs58 from 'bs58';

const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
const wallets = getAllKeypairs(password);

let backup = `========================================
WALLET BACKUP - KEEP THIS FILE SECURE!
========================================
Generated: ${new Date().toLocaleDateString()}

These are your private keys. Anyone with these can access your funds.
Store this file safely offline and delete from this computer after backing up.

MASTER WALLET:
Address: 3hCxVYsWE9for5NS19KyxmcjDgpHN6qaCNBzurkz8xA4
Private Key: 4xJCivHBN8JmWmVoyQdVedd48yRHgwXf2eRhSBJ8yBqK8cGZUhRAKskmm1R2w7RPe1gQenmUtYySJQSF3EcqBLn4

========================================
TRADING WALLETS (5):
========================================
`;

wallets.forEach((wallet, i) => {
  const privateKey = bs58.encode(wallet.secretKey);
  backup += `
[${i}] ${wallet.publicKey.toBase58()}
    Private Key: ${privateKey}
`;
});

backup += `
========================================
ENCRYPTION PASSWORD: QuantishSniper2024!
========================================
`;

fs.writeFileSync('BACKUP-KEYS.txt', backup);
console.log('✅ Keys exported to BACKUP-KEYS.txt');
console.log('⚠️  Store this file securely and delete after backing up!');

import * as fs from 'fs';
import bs58 from 'bs58';

const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
const wallets = getAllKeypairs(password);

let backup = `========================================
WALLET BACKUP - KEEP THIS FILE SECURE!
========================================
Generated: ${new Date().toLocaleDateString()}

These are your private keys. Anyone with these can access your funds.
Store this file safely offline and delete from this computer after backing up.

MASTER WALLET:
Address: 3hCxVYsWE9for5NS19KyxmcjDgpHN6qaCNBzurkz8xA4
Private Key: 4xJCivHBN8JmWmVoyQdVedd48yRHgwXf2eRhSBJ8yBqK8cGZUhRAKskmm1R2w7RPe1gQenmUtYySJQSF3EcqBLn4

========================================
TRADING WALLETS (5):
========================================
`;

wallets.forEach((wallet, i) => {
  const privateKey = bs58.encode(wallet.secretKey);
  backup += `
[${i}] ${wallet.publicKey.toBase58()}
    Private Key: ${privateKey}
`;
});

backup += `
========================================
ENCRYPTION PASSWORD: QuantishSniper2024!
========================================
`;

fs.writeFileSync('BACKUP-KEYS.txt', backup);
console.log('✅ Keys exported to BACKUP-KEYS.txt');
console.log('⚠️  Store this file securely and delete after backing up!');

