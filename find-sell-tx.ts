import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // Our token's bonding curve
  const ourMint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  const [ourBondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), ourMint.toBuffer()],
    PUMP
  );
  
  console.log('Searching for SELL transactions on our token...');
  
  const sigs = await conn.getSignaturesForAddress(ourBondingCurve, { limit: 30 });
  
  for (const sig of sigs) {
    const tx = await conn.getParsedTransaction(sig.signature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx || tx.meta?.err) continue;
    
    const logs = tx.meta?.logMessages || [];
    const isSell = logs.some(log => log.includes('Instruction: Sell'));
    
    if (!isSell) continue;
    
    console.log('\n' + '='.repeat(70));
    console.log('FOUND SELL TX:', sig.signature);
    
    // Find the pump.fun sell instruction
    const ixs = tx.transaction.message.instructions;
    for (const ix of ixs) {
      if (!('accounts' in ix)) continue;
      if (!ix.programId.equals(PUMP)) continue;
      
      const accounts = ix.accounts as PublicKey[];
      if (accounts.length < 10) continue;
      
      console.log(`\nPump.fun instruction with ${accounts.length} accounts:`);
      
      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        let label = '';
        
        if (acc.toBase58() === '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf') label = 'global';
        else if (acc.toBase58() === ourMint.toBase58()) label = 'mint';
        else if (acc.toBase58() === ourBondingCurve.toBase58()) label = 'bonding_curve';
        else if (acc.toBase58() === '11111111111111111111111111111111') label = 'system';
        else if (acc.toBase58() === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') label = 'Token-2022';
        else if (acc.toBase58() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') label = 'SPL Token';
        else if (acc.toBase58() === 'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1') label = 'event_auth';
        else if (acc.toBase58() === PUMP.toBase58()) label = 'program';
        else if (acc.toBase58() === 'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y') label = 'global_volume';
        else if (acc.toBase58() === 'FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz') label = 'fee_sol_vault_T2022';
        else if (acc.toBase58() === '8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt') label = 'fee_recipient_vault';
        else if (acc.toBase58() === 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ') label = 'fee_recipient';
        else if (acc.toBase58() === 'HRmQJ8gr8bJ64AwEkpyj6mB9cG4sRUygHJ2k8H6rKPxE') label = 'creator_vault';
        else if (acc.toBase58() === 'HWH7XCi9zLNQpsaKSTDCwBpDHm7gqxkVbqbUmNu5DRge') label = 'assoc_bonding';
        else if (acc.toBase58() === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL') label = 'ATA_program';
        
        console.log(`${i.toString().padStart(2)}: ${acc.toBase58()} ${label ? `(${label})` : ''}`);
      }
      
      // Show discriminator
      if ('data' in ix) {
        const decoded = Buffer.from(ix.data as string, 'base64');
        console.log('\nDiscriminator:', Array.from(decoded.slice(0, 8)).join(', '));
      }
    }
    
    // Found one, stop
    break;
  }
}

main().catch(console.error);


import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // Our token's bonding curve
  const ourMint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  const [ourBondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), ourMint.toBuffer()],
    PUMP
  );
  
  console.log('Searching for SELL transactions on our token...');
  
  const sigs = await conn.getSignaturesForAddress(ourBondingCurve, { limit: 30 });
  
  for (const sig of sigs) {
    const tx = await conn.getParsedTransaction(sig.signature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx || tx.meta?.err) continue;
    
    const logs = tx.meta?.logMessages || [];
    const isSell = logs.some(log => log.includes('Instruction: Sell'));
    
    if (!isSell) continue;
    
    console.log('\n' + '='.repeat(70));
    console.log('FOUND SELL TX:', sig.signature);
    
    // Find the pump.fun sell instruction
    const ixs = tx.transaction.message.instructions;
    for (const ix of ixs) {
      if (!('accounts' in ix)) continue;
      if (!ix.programId.equals(PUMP)) continue;
      
      const accounts = ix.accounts as PublicKey[];
      if (accounts.length < 10) continue;
      
      console.log(`\nPump.fun instruction with ${accounts.length} accounts:`);
      
      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        let label = '';
        
        if (acc.toBase58() === '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf') label = 'global';
        else if (acc.toBase58() === ourMint.toBase58()) label = 'mint';
        else if (acc.toBase58() === ourBondingCurve.toBase58()) label = 'bonding_curve';
        else if (acc.toBase58() === '11111111111111111111111111111111') label = 'system';
        else if (acc.toBase58() === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') label = 'Token-2022';
        else if (acc.toBase58() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') label = 'SPL Token';
        else if (acc.toBase58() === 'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1') label = 'event_auth';
        else if (acc.toBase58() === PUMP.toBase58()) label = 'program';
        else if (acc.toBase58() === 'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y') label = 'global_volume';
        else if (acc.toBase58() === 'FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz') label = 'fee_sol_vault_T2022';
        else if (acc.toBase58() === '8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt') label = 'fee_recipient_vault';
        else if (acc.toBase58() === 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ') label = 'fee_recipient';
        else if (acc.toBase58() === 'HRmQJ8gr8bJ64AwEkpyj6mB9cG4sRUygHJ2k8H6rKPxE') label = 'creator_vault';
        else if (acc.toBase58() === 'HWH7XCi9zLNQpsaKSTDCwBpDHm7gqxkVbqbUmNu5DRge') label = 'assoc_bonding';
        else if (acc.toBase58() === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL') label = 'ATA_program';
        
        console.log(`${i.toString().padStart(2)}: ${acc.toBase58()} ${label ? `(${label})` : ''}`);
      }
      
      // Show discriminator
      if ('data' in ix) {
        const decoded = Buffer.from(ix.data as string, 'base64');
        console.log('\nDiscriminator:', Array.from(decoded.slice(0, 8)).join(', '));
      }
    }
    
    // Found one, stop
    break;
  }
}

main().catch(console.error);


