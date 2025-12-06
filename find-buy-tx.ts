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
  
  console.log('Searching for BUY transactions on our token...');
  console.log('Bonding curve:', ourBondingCurve.toBase58());
  
  // Get more signatures
  const sigs = await conn.getSignaturesForAddress(ourBondingCurve, { limit: 30 });
  
  for (const sig of sigs) {
    const tx = await conn.getParsedTransaction(sig.signature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx || tx.meta?.err) continue;
    
    // Check logs for "Buy" instruction
    const logs = tx.meta?.logMessages || [];
    const isBuy = logs.some(log => log.includes('Instruction: Buy'));
    
    if (!isBuy) continue;
    
    console.log('\n' + '='.repeat(70));
    console.log('FOUND BUY TX:', sig.signature);
    console.log('Time:', new Date((tx.blockTime || 0) * 1000).toLocaleString());
    
    // Show all account keys
    const accountKeys = tx.transaction.message.accountKeys;
    console.log('\n=== ALL ACCOUNT KEYS ===');
    accountKeys.forEach((key, i) => {
      const pk = key.pubkey.toBase58();
      let label = '';
      if (pk === '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf') label = 'global';
      else if (pk === ourMint.toBase58()) label = 'mint';
      else if (pk === ourBondingCurve.toBase58()) label = 'bonding_curve';
      else if (pk === '11111111111111111111111111111111') label = 'system';
      else if (pk === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') label = 'Token-2022';
      else if (pk === 'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1') label = 'event_auth';
      else if (pk === PUMP.toBase58()) label = 'pump_program';
      else if (pk === 'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y') label = 'global_volume';
      else if (pk === 'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM') label = 'fee_sol_vault';
      else if (pk === '8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt') label = 'fee_recipient_vault';
      else if (pk === 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ') label = 'fee_recipient';
      else if (pk === 'HRmQJ8gr8bJ64AwEkpyj6mB9cG4sRUygHJ2k8H6rKPxE') label = 'creator_vault';
      else if (pk === 'GVM9i9d7kptnEXVszu5hCUKPanGZqDXbiG7nbSQ3h83N') label = 'coin_creator';
      else if (pk === 'HWH7XCi9zLNQpsaKSTDCwBpDHm7gqxkVbqbUmNu5DRge') label = 'assoc_bonding';
      else if (pk === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL') label = 'ATA_program';
      else if (pk === 'SysvarRent111111111111111111111111111111111') label = 'rent';
      
      console.log(`${i.toString().padStart(2)}: ${pk} ${label ? `(${label})` : ''}`);
    });
    
    // Show relevant logs
    console.log('\n=== BUY LOGS ===');
    logs.filter(l => l.includes('Buy') || l.includes('pump') || l.includes('6EF8')).forEach(l => console.log(l));
    
    // Found one, stop
    break;
  }
  
  console.log('\nDone searching.');
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
  
  console.log('Searching for BUY transactions on our token...');
  console.log('Bonding curve:', ourBondingCurve.toBase58());
  
  // Get more signatures
  const sigs = await conn.getSignaturesForAddress(ourBondingCurve, { limit: 30 });
  
  for (const sig of sigs) {
    const tx = await conn.getParsedTransaction(sig.signature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx || tx.meta?.err) continue;
    
    // Check logs for "Buy" instruction
    const logs = tx.meta?.logMessages || [];
    const isBuy = logs.some(log => log.includes('Instruction: Buy'));
    
    if (!isBuy) continue;
    
    console.log('\n' + '='.repeat(70));
    console.log('FOUND BUY TX:', sig.signature);
    console.log('Time:', new Date((tx.blockTime || 0) * 1000).toLocaleString());
    
    // Show all account keys
    const accountKeys = tx.transaction.message.accountKeys;
    console.log('\n=== ALL ACCOUNT KEYS ===');
    accountKeys.forEach((key, i) => {
      const pk = key.pubkey.toBase58();
      let label = '';
      if (pk === '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf') label = 'global';
      else if (pk === ourMint.toBase58()) label = 'mint';
      else if (pk === ourBondingCurve.toBase58()) label = 'bonding_curve';
      else if (pk === '11111111111111111111111111111111') label = 'system';
      else if (pk === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') label = 'Token-2022';
      else if (pk === 'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1') label = 'event_auth';
      else if (pk === PUMP.toBase58()) label = 'pump_program';
      else if (pk === 'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y') label = 'global_volume';
      else if (pk === 'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM') label = 'fee_sol_vault';
      else if (pk === '8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt') label = 'fee_recipient_vault';
      else if (pk === 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ') label = 'fee_recipient';
      else if (pk === 'HRmQJ8gr8bJ64AwEkpyj6mB9cG4sRUygHJ2k8H6rKPxE') label = 'creator_vault';
      else if (pk === 'GVM9i9d7kptnEXVszu5hCUKPanGZqDXbiG7nbSQ3h83N') label = 'coin_creator';
      else if (pk === 'HWH7XCi9zLNQpsaKSTDCwBpDHm7gqxkVbqbUmNu5DRge') label = 'assoc_bonding';
      else if (pk === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL') label = 'ATA_program';
      else if (pk === 'SysvarRent111111111111111111111111111111111') label = 'rent';
      
      console.log(`${i.toString().padStart(2)}: ${pk} ${label ? `(${label})` : ''}`);
    });
    
    // Show relevant logs
    console.log('\n=== BUY LOGS ===');
    logs.filter(l => l.includes('Buy') || l.includes('pump') || l.includes('6EF8')).forEach(l => console.log(l));
    
    // Found one, stop
    break;
  }
  
  console.log('\nDone searching.');
}

main().catch(console.error);


