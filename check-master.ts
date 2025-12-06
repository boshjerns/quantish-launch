import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { config } from './src/config/index.js';

const conn = new Connection(config.rpcUrl);
const master = new PublicKey('3hCxVYsWE9for5NS19KyxmcjDgpHN6qaCNBzurkz8xA4');
const balance = await conn.getBalance(master);
console.log('Master wallet balance:', (balance / LAMPORTS_PER_SOL).toFixed(4), 'SOL');

import { config } from './src/config/index.js';

const conn = new Connection(config.rpcUrl);
const master = new PublicKey('3hCxVYsWE9for5NS19KyxmcjDgpHN6qaCNBzurkz8xA4');
const balance = await conn.getBalance(master);
console.log('Master wallet balance:', (balance / LAMPORTS_PER_SOL).toFixed(4), 'SOL');

