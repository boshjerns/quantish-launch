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
  
  console.log('Searching for transactions on our token...');
  console.log('Bonding curve:', ourBondingCurve.toBase58());
  
  // Get signatures for our bonding curve
  const sigs = await conn.getSignaturesForAddress(ourBondingCurve, { limit: 10 });
  
  console.log(`\nFound ${sigs.length} transactions on our bonding curve:\n`);
  
  for (const sig of sigs) {
    const tx = await conn.getParsedTransaction(sig.signature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx) continue;
    
    // Only show successful transactions
    if (tx.meta?.err) continue;
    
    console.log('='.repeat(70));
    console.log('SUCCESSFUL TX:', sig.signature);
    console.log('Time:', new Date((tx.blockTime || 0) * 1000).toLocaleString());
    
    // Find ALL pump.fun instructions
    const ixs = tx.transaction.message.instructions;
    for (const ix of ixs) {
      if (!('accounts' in ix)) continue;
      if (!ix.programId.equals(PUMP)) continue;
      
      const accounts = ix.accounts as PublicKey[];
      console.log(`\nPump.fun instruction with ${accounts.length} accounts:`);
      
      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        let label = '';
        
        // Try to identify known accounts
        if (acc.toBase58() === '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf') label = '(global)';
        else if (acc.toBase58() === ourMint.toBase58()) label = '(mint)';
        else if (acc.toBase58() === ourBondingCurve.toBase58()) label = '(bonding_curve)';
        else if (acc.toBase58() === '11111111111111111111111111111111') label = '(system_program)';
        else if (acc.toBase58() === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') label = '(Token-2022)';
        else if (acc.toBase58() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') label = '(SPL Token)';
        else if (acc.toBase58() === 'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1') label = '(event_authority)';
        else if (acc.toBase58() === PUMP.toBase58()) label = '(program)';
        else if (acc.toBase58() === 'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y') label = '(global_volume)';
        else if (acc.toBase58() === 'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM') label = '(fee_sol_vault_T2022)';
        else if (acc.toBase58() === '8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt') label = '(fee_recipient_vault)';
        else if (acc.toBase58() === 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ') label = '(fee_recipient)';
        else if (acc.toBase58() === 'HRmQJ8gr8bJ64AwEkpyj6mB9cG4sRUygHJ2k8H6rKPxE') label = '(creator_vault)';
        else if (acc.toBase58() === 'GVM9i9d7kptnEXVszu5hCUKPanGZqDXbiG7nbSQ3h83N') label = '(coin_creator)';
        else if (acc.toBase58() === 'HWH7XCi9zLNQpsaKSTDCwBpDHm7gqxkVbqbUmNu5DRge') label = '(assoc_bonding_curve)';
        
        console.log(`${i.toString().padStart(2)}: ${acc.toBase58()} ${label}`);
      }
    }
    
    // Only show first successful tx
    break;
  }
}

main().catch(console.error);


const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // Our token's bonding curve
  const ourMint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  const [ourBondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), ourMint.toBuffer()],
    PUMP
  );
  
  console.log('Searching for transactions on our token...');
  console.log('Bonding curve:', ourBondingCurve.toBase58());
  
  // Get signatures for our bonding curve
  const sigs = await conn.getSignaturesForAddress(ourBondingCurve, { limit: 10 });
  
  console.log(`\nFound ${sigs.length} transactions on our bonding curve:\n`);
  
  for (const sig of sigs) {
    const tx = await conn.getParsedTransaction(sig.signature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx) continue;
    
    // Only show successful transactions
    if (tx.meta?.err) continue;
    
    console.log('='.repeat(70));
    console.log('SUCCESSFUL TX:', sig.signature);
    console.log('Time:', new Date((tx.blockTime || 0) * 1000).toLocaleString());
    
    // Find ALL pump.fun instructions
    const ixs = tx.transaction.message.instructions;
    for (const ix of ixs) {
      if (!('accounts' in ix)) continue;
      if (!ix.programId.equals(PUMP)) continue;
      
      const accounts = ix.accounts as PublicKey[];
      console.log(`\nPump.fun instruction with ${accounts.length} accounts:`);
      
      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        let label = '';
        
        // Try to identify known accounts
        if (acc.toBase58() === '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf') label = '(global)';
        else if (acc.toBase58() === ourMint.toBase58()) label = '(mint)';
        else if (acc.toBase58() === ourBondingCurve.toBase58()) label = '(bonding_curve)';
        else if (acc.toBase58() === '11111111111111111111111111111111') label = '(system_program)';
        else if (acc.toBase58() === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') label = '(Token-2022)';
        else if (acc.toBase58() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') label = '(SPL Token)';
        else if (acc.toBase58() === 'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1') label = '(event_authority)';
        else if (acc.toBase58() === PUMP.toBase58()) label = '(program)';
        else if (acc.toBase58() === 'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y') label = '(global_volume)';
        else if (acc.toBase58() === 'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM') label = '(fee_sol_vault_T2022)';
        else if (acc.toBase58() === '8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt') label = '(fee_recipient_vault)';
        else if (acc.toBase58() === 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ') label = '(fee_recipient)';
        else if (acc.toBase58() === 'HRmQJ8gr8bJ64AwEkpyj6mB9cG4sRUygHJ2k8H6rKPxE') label = '(creator_vault)';
        else if (acc.toBase58() === 'GVM9i9d7kptnEXVszu5hCUKPanGZqDXbiG7nbSQ3h83N') label = '(coin_creator)';
        else if (acc.toBase58() === 'HWH7XCi9zLNQpsaKSTDCwBpDHm7gqxkVbqbUmNu5DRge') label = '(assoc_bonding_curve)';
        
        console.log(`${i.toString().padStart(2)}: ${acc.toBase58()} ${label}`);
      }
    }
    
    // Only show first successful tx
    break;
  }
}

main().catch(console.error);
