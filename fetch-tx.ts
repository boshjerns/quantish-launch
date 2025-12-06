import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // The successful transaction on our token
  const sig = '2oZFugrZRacXXUZsBRJ53GSEUpuPKVZpUkqfgN2wq9vHAqR3BsPCs2yVHjLn7k8kZGN8erQxDRVQ2Rbe5Z4i1F8H';
  
  console.log('Fetching transaction:', sig);
  
  const tx = await conn.getParsedTransaction(sig, {
    maxSupportedTransactionVersion: 0
  });
  
  if (!tx) {
    console.log('Transaction not found');
    return;
  }
  
  console.log('\nTransaction details:');
  console.log('Status:', tx.meta?.err ? 'FAILED' : 'SUCCESS');
  console.log('Slot:', tx.slot);
  
  // Get all account keys from the transaction
  const accountKeys = tx.transaction.message.accountKeys;
  console.log('\n=== ALL ACCOUNT KEYS ===');
  accountKeys.forEach((key, i) => {
    const pk = key.pubkey.toBase58();
    let label = '';
    if (pk === '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf') label = 'global';
    else if (pk === 'HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump') label = 'mint';
    else if (pk === 'HJBsJ5DK7LKWyqhCJZSmLCERDRfz1peTcovfkWEgQxHK') label = 'bonding_curve';
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
    
    console.log(`${i.toString().padStart(2)}: ${pk} ${label ? `(${label})` : ''}`);
  });
  
  // Show instructions
  console.log('\n=== INSTRUCTIONS ===');
  const ixs = tx.transaction.message.instructions;
  ixs.forEach((ix, idx) => {
    console.log(`\nInstruction ${idx}:`);
    console.log('  Program:', ix.programId.toBase58());
    
    if ('accounts' in ix) {
      console.log('  Accounts:', (ix.accounts as PublicKey[]).map(a => a.toBase58().slice(0, 10) + '...').join(', '));
    }
    if ('data' in ix) {
      console.log('  Data:', (ix.data as string).slice(0, 20) + '...');
    }
  });
  
  // Show logs
  console.log('\n=== LOGS ===');
  tx.meta?.logMessages?.forEach(log => console.log(log));
}

main().catch(console.error);


import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // The successful transaction on our token
  const sig = '2oZFugrZRacXXUZsBRJ53GSEUpuPKVZpUkqfgN2wq9vHAqR3BsPCs2yVHjLn7k8kZGN8erQxDRVQ2Rbe5Z4i1F8H';
  
  console.log('Fetching transaction:', sig);
  
  const tx = await conn.getParsedTransaction(sig, {
    maxSupportedTransactionVersion: 0
  });
  
  if (!tx) {
    console.log('Transaction not found');
    return;
  }
  
  console.log('\nTransaction details:');
  console.log('Status:', tx.meta?.err ? 'FAILED' : 'SUCCESS');
  console.log('Slot:', tx.slot);
  
  // Get all account keys from the transaction
  const accountKeys = tx.transaction.message.accountKeys;
  console.log('\n=== ALL ACCOUNT KEYS ===');
  accountKeys.forEach((key, i) => {
    const pk = key.pubkey.toBase58();
    let label = '';
    if (pk === '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf') label = 'global';
    else if (pk === 'HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump') label = 'mint';
    else if (pk === 'HJBsJ5DK7LKWyqhCJZSmLCERDRfz1peTcovfkWEgQxHK') label = 'bonding_curve';
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
    
    console.log(`${i.toString().padStart(2)}: ${pk} ${label ? `(${label})` : ''}`);
  });
  
  // Show instructions
  console.log('\n=== INSTRUCTIONS ===');
  const ixs = tx.transaction.message.instructions;
  ixs.forEach((ix, idx) => {
    console.log(`\nInstruction ${idx}:`);
    console.log('  Program:', ix.programId.toBase58());
    
    if ('accounts' in ix) {
      console.log('  Accounts:', (ix.accounts as PublicKey[]).map(a => a.toBase58().slice(0, 10) + '...').join(', '));
    }
    if ('data' in ix) {
      console.log('  Data:', (ix.data as string).slice(0, 20) + '...');
    }
  });
  
  // Show logs
  console.log('\n=== LOGS ===');
  tx.meta?.logMessages?.forEach(log => console.log(log));
}

main().catch(console.error);


