import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // Search for direct pump.fun buy transactions
  console.log('Searching for DIRECT pump.fun buy transactions...');
  
  const sigs = await conn.getSignaturesForAddress(PUMP, { limit: 50 });
  
  for (const sig of sigs) {
    const tx = await conn.getParsedTransaction(sig.signature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx || tx.meta?.err) continue;
    
    // Check logs for direct Buy at depth [1]
    const logs = tx.meta?.logMessages || [];
    const isDirectBuy = logs.some(log => 
      log.includes('Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P invoke [1]')
    ) && logs.some(log => log.includes('Instruction: Buy'));
    
    if (!isDirectBuy) continue;
    
    console.log('\n' + '='.repeat(70));
    console.log('FOUND DIRECT BUY TX:', sig.signature);
    
    // Find the pump.fun instruction
    const ixs = tx.transaction.message.instructions;
    for (const ix of ixs) {
      if (!('accounts' in ix)) continue;
      if (!ix.programId.equals(PUMP)) continue;
      
      const accounts = ix.accounts as PublicKey[];
      console.log(`\nPump.fun direct instruction with ${accounts.length} accounts:`);
      
      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        let label = '';
        
        if (acc.toBase58() === '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf') label = 'global';
        else if (acc.toBase58() === '11111111111111111111111111111111') label = 'system';
        else if (acc.toBase58() === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') label = 'Token-2022';
        else if (acc.toBase58() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') label = 'SPL Token';
        else if (acc.toBase58() === 'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1') label = 'event_auth';
        else if (acc.toBase58() === PUMP.toBase58()) label = 'program';
        else if (acc.toBase58() === 'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y') label = 'global_volume';
        else if (acc.toBase58() === 'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM') label = 'fee_sol_vault_T2022';
        else if (acc.toBase58() === '62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV') label = 'fee_sol_vault_SPL?';
        else if (acc.toBase58() === '6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs') label = 'fee_sol_vault_OLD';
        else if (acc.toBase58() === '8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt') label = 'fee_recipient_vault';
        else if (acc.toBase58() === 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ') label = 'fee_recipient';
        else if (acc.toBase58() === 'SysvarRent111111111111111111111111111111111') label = 'rent';
        else if (acc.toBase58() === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL') label = 'ATA_program';
        
        console.log(`${i.toString().padStart(2)}: ${acc.toBase58()} ${label ? `(${label})` : ''}`);
      }
      
      // Show discriminator from instruction data
      if ('data' in ix) {
        const dataStr = ix.data as string;
        const decoded = Buffer.from(dataStr, 'base64');
        console.log('\nDiscriminator:', Array.from(decoded.slice(0, 8)).join(', '));
      }
    }
    
    // Found one, stop
    break;
  }
  
  console.log('\nDone.');
}

main().catch(console.error);


import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // Search for direct pump.fun buy transactions
  console.log('Searching for DIRECT pump.fun buy transactions...');
  
  const sigs = await conn.getSignaturesForAddress(PUMP, { limit: 50 });
  
  for (const sig of sigs) {
    const tx = await conn.getParsedTransaction(sig.signature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx || tx.meta?.err) continue;
    
    // Check logs for direct Buy at depth [1]
    const logs = tx.meta?.logMessages || [];
    const isDirectBuy = logs.some(log => 
      log.includes('Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P invoke [1]')
    ) && logs.some(log => log.includes('Instruction: Buy'));
    
    if (!isDirectBuy) continue;
    
    console.log('\n' + '='.repeat(70));
    console.log('FOUND DIRECT BUY TX:', sig.signature);
    
    // Find the pump.fun instruction
    const ixs = tx.transaction.message.instructions;
    for (const ix of ixs) {
      if (!('accounts' in ix)) continue;
      if (!ix.programId.equals(PUMP)) continue;
      
      const accounts = ix.accounts as PublicKey[];
      console.log(`\nPump.fun direct instruction with ${accounts.length} accounts:`);
      
      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        let label = '';
        
        if (acc.toBase58() === '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf') label = 'global';
        else if (acc.toBase58() === '11111111111111111111111111111111') label = 'system';
        else if (acc.toBase58() === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') label = 'Token-2022';
        else if (acc.toBase58() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') label = 'SPL Token';
        else if (acc.toBase58() === 'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1') label = 'event_auth';
        else if (acc.toBase58() === PUMP.toBase58()) label = 'program';
        else if (acc.toBase58() === 'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y') label = 'global_volume';
        else if (acc.toBase58() === 'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM') label = 'fee_sol_vault_T2022';
        else if (acc.toBase58() === '62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV') label = 'fee_sol_vault_SPL?';
        else if (acc.toBase58() === '6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs') label = 'fee_sol_vault_OLD';
        else if (acc.toBase58() === '8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt') label = 'fee_recipient_vault';
        else if (acc.toBase58() === 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ') label = 'fee_recipient';
        else if (acc.toBase58() === 'SysvarRent111111111111111111111111111111111') label = 'rent';
        else if (acc.toBase58() === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL') label = 'ATA_program';
        
        console.log(`${i.toString().padStart(2)}: ${acc.toBase58()} ${label ? `(${label})` : ''}`);
      }
      
      // Show discriminator from instruction data
      if ('data' in ix) {
        const dataStr = ix.data as string;
        const decoded = Buffer.from(dataStr, 'base64');
        console.log('\nDiscriminator:', Array.from(decoded.slice(0, 8)).join(', '));
      }
    }
    
    // Found one, stop
    break;
  }
  
  console.log('\nDone.');
}

main().catch(console.error);


