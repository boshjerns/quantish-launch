import { Connection, PublicKey } from '@solana/web3.js';

async function main() {
  const conn = new Connection(process.env.SOLANA_RPC_URL!);
  
  const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  
  // Get multiple recent pump.fun buy transactions
  const sigs = await conn.getSignaturesForAddress(PUMP, { limit: 20 });
  
  const pos1Accounts = new Set<string>();
  
  for (const sig of sigs) {
    if (sig.err) continue;
    
    const tx = await conn.getTransaction(sig.signature, { 
      maxSupportedTransactionVersion: 0 
    });
    
    if (!tx?.meta?.logMessages?.some(l => l.includes('Instruction: Buy'))) continue;
    
    const msg = tx.transaction.message as any;
    const keys = msg.staticAccountKeys || msg.accountKeys;
    const ixs = msg.compiledInstructions || msg.instructions;
    
    for (const ix of ixs) {
      const progIdx = ix.programIdIndex;
      if (progIdx !== undefined) {
        const progId = keys[progIdx];
        if (progId.toBase58() === PUMP.toBase58()) {
          const acctIndices = ix.accountKeyIndexes || ix.accounts;
          if (acctIndices.length >= 2) {
            // Position 1 in the instruction
            const pos1Key = keys[acctIndices[1]].toBase58();
            pos1Accounts.add(pos1Key);
          }
          break;
        }
      }
    }
  }
  
  console.log('Unique accounts at position 1 in buy instructions:');
  for (const acc of pos1Accounts) {
    console.log(`  ${acc}`);
  }
  
  if (pos1Accounts.size === 1) {
    console.log('\n✓ Same account used in all transactions - this is a global treasury!');
  } else {
    console.log('\n✗ Different accounts - per-token PDAs');
  }
}

main().catch(console.error);



async function main() {
  const conn = new Connection(process.env.SOLANA_RPC_URL!);
  
  const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  
  // Get multiple recent pump.fun buy transactions
  const sigs = await conn.getSignaturesForAddress(PUMP, { limit: 20 });
  
  const pos1Accounts = new Set<string>();
  
  for (const sig of sigs) {
    if (sig.err) continue;
    
    const tx = await conn.getTransaction(sig.signature, { 
      maxSupportedTransactionVersion: 0 
    });
    
    if (!tx?.meta?.logMessages?.some(l => l.includes('Instruction: Buy'))) continue;
    
    const msg = tx.transaction.message as any;
    const keys = msg.staticAccountKeys || msg.accountKeys;
    const ixs = msg.compiledInstructions || msg.instructions;
    
    for (const ix of ixs) {
      const progIdx = ix.programIdIndex;
      if (progIdx !== undefined) {
        const progId = keys[progIdx];
        if (progId.toBase58() === PUMP.toBase58()) {
          const acctIndices = ix.accountKeyIndexes || ix.accounts;
          if (acctIndices.length >= 2) {
            // Position 1 in the instruction
            const pos1Key = keys[acctIndices[1]].toBase58();
            pos1Accounts.add(pos1Key);
          }
          break;
        }
      }
    }
  }
  
  console.log('Unique accounts at position 1 in buy instructions:');
  for (const acc of pos1Accounts) {
    console.log(`  ${acc}`);
  }
  
  if (pos1Accounts.size === 1) {
    console.log('\n✓ Same account used in all transactions - this is a global treasury!');
  } else {
    console.log('\n✗ Different accounts - per-token PDAs');
  }
}

main().catch(console.error);


