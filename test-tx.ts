import { Connection, PublicKey } from '@solana/web3.js';

async function main() {
  const conn = new Connection(process.env.SOLANA_RPC_URL!);
  
  console.log('Fetching recent pump.fun transactions...');
  
  // Get recent transactions for pump.fun program
  const sigs = await conn.getSignaturesForAddress(
    new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),
    { limit: 10 }
  );
  
  // Find a successful "buy" transaction
  for (const sig of sigs) {
    if (!sig.err) {
      console.log('\nFound successful tx:', sig.signature.slice(0, 20) + '...');
      const tx = await conn.getTransaction(sig.signature, { 
        maxSupportedTransactionVersion: 0 
      });
      
      if (tx?.meta?.logMessages?.some(l => l.includes('Instruction: Buy'))) {
        console.log('This is a BUY transaction!');
        console.log('\nAccounts:');
        
        // Get account keys
        const msg = tx.transaction.message as any;
        const keys = msg.staticAccountKeys || msg.accountKeys;
        
        if (keys) {
          keys.forEach((k: PublicKey, i: number) => {
            console.log(`  ${i.toString().padStart(2)}: ${k.toBase58()}`);
          });
        }
        
        // Show instruction data
        const ixs = msg.compiledInstructions || msg.instructions;
        if (ixs) {
          console.log('\nPump.fun instruction accounts:');
          ixs.forEach((ix: any, idx: number) => {
            const progIdx = ix.programIdIndex;
            if (progIdx !== undefined) {
              const progId = keys[progIdx];
              if (progId.toBase58() === '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P') {
                const acctIndices = ix.accountKeyIndexes || ix.accounts;
                console.log(`\nInstruction ${idx} uses ${acctIndices.length} accounts:`);
                acctIndices.forEach((accIdx: number, i: number) => {
                  console.log(`  ${i.toString().padStart(2)}: [${accIdx}] ${keys[accIdx].toBase58()}`);
                });
              }
            }
          });
        }
        break;
      }
    }
  }
}

main().catch(console.error);


async function main() {
  const conn = new Connection(process.env.SOLANA_RPC_URL!);
  
  console.log('Fetching recent pump.fun transactions...');
  
  // Get recent transactions for pump.fun program
  const sigs = await conn.getSignaturesForAddress(
    new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),
    { limit: 10 }
  );
  
  // Find a successful "buy" transaction
  for (const sig of sigs) {
    if (!sig.err) {
      console.log('\nFound successful tx:', sig.signature.slice(0, 20) + '...');
      const tx = await conn.getTransaction(sig.signature, { 
        maxSupportedTransactionVersion: 0 
      });
      
      if (tx?.meta?.logMessages?.some(l => l.includes('Instruction: Buy'))) {
        console.log('This is a BUY transaction!');
        console.log('\nAccounts:');
        
        // Get account keys
        const msg = tx.transaction.message as any;
        const keys = msg.staticAccountKeys || msg.accountKeys;
        
        if (keys) {
          keys.forEach((k: PublicKey, i: number) => {
            console.log(`  ${i.toString().padStart(2)}: ${k.toBase58()}`);
          });
        }
        
        // Show instruction data
        const ixs = msg.compiledInstructions || msg.instructions;
        if (ixs) {
          console.log('\nPump.fun instruction accounts:');
          ixs.forEach((ix: any, idx: number) => {
            const progIdx = ix.programIdIndex;
            if (progIdx !== undefined) {
              const progId = keys[progIdx];
              if (progId.toBase58() === '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P') {
                const acctIndices = ix.accountKeyIndexes || ix.accounts;
                console.log(`\nInstruction ${idx} uses ${acctIndices.length} accounts:`);
                acctIndices.forEach((accIdx: number, i: number) => {
                  console.log(`  ${i.toString().padStart(2)}: [${accIdx}] ${keys[accIdx].toBase58()}`);
                });
              }
            }
          });
        }
        break;
      }
    }
  }
}

main().catch(console.error);

