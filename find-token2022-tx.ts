import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  console.log('Searching for Token-2022 buy transactions...\n');
  
  const sigs = await conn.getSignaturesForAddress(PUMP, { limit: 50 });
  
  for (const sig of sigs) {
    const tx = await conn.getParsedTransaction(sig.signature, { 
      maxSupportedTransactionVersion: 0 
    });
    if (!tx) continue;
    
    const ixs = tx.transaction.message.instructions;
    for (const ix of ixs) {
      if (!('accounts' in ix) || !ix.programId.equals(PUMP) || ix.accounts.length < 14) continue;
      
      const accounts = ix.accounts as PublicKey[];
      const tokenProgram = accounts[8];
      
      // Check if Token-2022
      if (tokenProgram.equals(TOKEN_2022_PROGRAM_ID)) {
        console.log('='.repeat(60));
        console.log('FOUND Token-2022 TX:', sig.signature.slice(0, 40) + '...');
        console.log('Full signature:', sig.signature);
        console.log('-'.repeat(60));
        
        accounts.forEach((acc: PublicKey, i: number) => {
          let label = '';
          switch(i) {
            case 0: label = 'global'; break;
            case 1: label = 'fee_sol_vault?'; break;
            case 2: label = 'mint'; break;
            case 3: label = 'bonding_curve'; break;
            case 4: label = 'assoc_bonding_curve'; break;
            case 5: label = 'assoc_user'; break;
            case 6: label = 'user'; break;
            case 7: label = 'system'; break;
            case 8: label = 'token_program'; break;
            case 9: label = 'coin_creator'; break;
            case 10: label = 'event_auth'; break;
            case 11: label = 'program'; break;
            case 12: label = 'global_volume'; break;
            case 13: label = 'creator_vault'; break;
            case 14: label = 'fee_vault?'; break;
            case 15: label = 'fee_recipient'; break;
            default: label = '???'; break;
          }
          console.log(`${i.toString().padStart(2)}: ${acc.toBase58().padEnd(45)} // ${label}`);
        });
        
        // Verify mint is Token-2022
        const mint = accounts[2];
        const mintInfo = await conn.getAccountInfo(mint);
        if (mintInfo) {
          console.log('\nMint verification:');
          console.log('  Mint owner:', mintInfo.owner.toBase58());
          console.log('  Is Token-2022:', mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID));
        }
        
        return; // Found one, stop
      }
    }
  }
  
  console.log('No Token-2022 transactions found in recent history');
}

main().catch(console.error);


import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  console.log('Searching for Token-2022 buy transactions...\n');
  
  const sigs = await conn.getSignaturesForAddress(PUMP, { limit: 50 });
  
  for (const sig of sigs) {
    const tx = await conn.getParsedTransaction(sig.signature, { 
      maxSupportedTransactionVersion: 0 
    });
    if (!tx) continue;
    
    const ixs = tx.transaction.message.instructions;
    for (const ix of ixs) {
      if (!('accounts' in ix) || !ix.programId.equals(PUMP) || ix.accounts.length < 14) continue;
      
      const accounts = ix.accounts as PublicKey[];
      const tokenProgram = accounts[8];
      
      // Check if Token-2022
      if (tokenProgram.equals(TOKEN_2022_PROGRAM_ID)) {
        console.log('='.repeat(60));
        console.log('FOUND Token-2022 TX:', sig.signature.slice(0, 40) + '...');
        console.log('Full signature:', sig.signature);
        console.log('-'.repeat(60));
        
        accounts.forEach((acc: PublicKey, i: number) => {
          let label = '';
          switch(i) {
            case 0: label = 'global'; break;
            case 1: label = 'fee_sol_vault?'; break;
            case 2: label = 'mint'; break;
            case 3: label = 'bonding_curve'; break;
            case 4: label = 'assoc_bonding_curve'; break;
            case 5: label = 'assoc_user'; break;
            case 6: label = 'user'; break;
            case 7: label = 'system'; break;
            case 8: label = 'token_program'; break;
            case 9: label = 'coin_creator'; break;
            case 10: label = 'event_auth'; break;
            case 11: label = 'program'; break;
            case 12: label = 'global_volume'; break;
            case 13: label = 'creator_vault'; break;
            case 14: label = 'fee_vault?'; break;
            case 15: label = 'fee_recipient'; break;
            default: label = '???'; break;
          }
          console.log(`${i.toString().padStart(2)}: ${acc.toBase58().padEnd(45)} // ${label}`);
        });
        
        // Verify mint is Token-2022
        const mint = accounts[2];
        const mintInfo = await conn.getAccountInfo(mint);
        if (mintInfo) {
          console.log('\nMint verification:');
          console.log('  Mint owner:', mintInfo.owner.toBase58());
          console.log('  Is Token-2022:', mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID));
        }
        
        return; // Found one, stop
      }
    }
  }
  
  console.log('No Token-2022 transactions found in recent history');
}

main().catch(console.error);


