import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  console.log('Fetching recent pump.fun transactions...\n');
  
  const sigs = await conn.getSignaturesForAddress(PUMP, { limit: 15 });
  
  for (const sig of sigs) {
    const tx = await conn.getParsedTransaction(sig.signature, { 
      maxSupportedTransactionVersion: 0 
    });
    if (!tx) continue;
    
    const ixs = tx.transaction.message.instructions;
    for (const ix of ixs) {
      // Check if it's a pump.fun instruction with many accounts (buy has 16)
      if ('accounts' in ix && ix.programId.equals(PUMP) && ix.accounts.length >= 14) {
        console.log('='.repeat(60));
        console.log('TX:', sig.signature.slice(0, 40) + '...');
        console.log('Accounts:', ix.accounts.length);
        console.log('-'.repeat(60));
        
        ix.accounts.forEach((acc: PublicKey, i: number) => {
          console.log(`${i.toString().padStart(2)}: ${acc.toBase58()}`);
        });
        
        console.log('');
        return; // Just show one successful tx
      }
    }
  }
  
  console.log('No buy transactions found in recent history');
}

main().catch(console.error);


import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  console.log('Fetching recent pump.fun transactions...\n');
  
  const sigs = await conn.getSignaturesForAddress(PUMP, { limit: 15 });
  
  for (const sig of sigs) {
    const tx = await conn.getParsedTransaction(sig.signature, { 
      maxSupportedTransactionVersion: 0 
    });
    if (!tx) continue;
    
    const ixs = tx.transaction.message.instructions;
    for (const ix of ixs) {
      // Check if it's a pump.fun instruction with many accounts (buy has 16)
      if ('accounts' in ix && ix.programId.equals(PUMP) && ix.accounts.length >= 14) {
        console.log('='.repeat(60));
        console.log('TX:', sig.signature.slice(0, 40) + '...');
        console.log('Accounts:', ix.accounts.length);
        console.log('-'.repeat(60));
        
        ix.accounts.forEach((acc: PublicKey, i: number) => {
          console.log(`${i.toString().padStart(2)}: ${acc.toBase58()}`);
        });
        
        console.log('');
        return; // Just show one successful tx
      }
    }
  }
  
  console.log('No buy transactions found in recent history');
}

main().catch(console.error);


