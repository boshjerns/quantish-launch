import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // Analyze multiple buy transactions
  const sigs = await conn.getSignaturesForAddress(PUMP, { limit: 30 });
  
  let found = 0;
  for (const sig of sigs) {
    if (found >= 3) break;
    
    const tx = await conn.getParsedTransaction(sig.signature, { 
      maxSupportedTransactionVersion: 0 
    });
    if (!tx) continue;
    
    const ixs = tx.transaction.message.instructions;
    for (const ix of ixs) {
      if (!('accounts' in ix) || !ix.programId.equals(PUMP) || ix.accounts.length < 14) continue;
      
      const accounts = ix.accounts as PublicKey[];
      
      // Extract key accounts
      const acct1 = accounts[1]; // Associated bonding curve
      const mint = accounts[2];
      const bondingCurve = accounts[3];
      const acct4 = accounts[4]; // Unknown
      const tokenProgram = accounts[8];
      
      console.log(`\n=== TX ${found + 1}: ${sig.signature.slice(0, 20)}... ===`);
      console.log('Mint:', mint.toBase58().slice(0, 20) + '...');
      console.log('Bonding Curve:', bondingCurve.toBase58().slice(0, 20) + '...');
      console.log('Token Program:', tokenProgram.toBase58());
      
      // Derive expected associated bonding curve
      const isToken2022 = tokenProgram.equals(TOKEN_2022_PROGRAM_ID);
      const expectedABC = getAssociatedTokenAddressSync(
        mint,
        bondingCurve,
        true,
        isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
      );
      
      console.log('\nAccount 1 (from tx):', acct1.toBase58());
      console.log('Expected ATA:       ', expectedABC.toBase58());
      console.log('Account 1 = ATA:', acct1.equals(expectedABC));
      
      console.log('\nAccount 4 (from tx):', acct4.toBase58());
      console.log('Account 4 = Account 1:', acct4.equals(acct1));
      
      // If they're different, check what account 4 is
      if (!acct4.equals(acct1)) {
        // Maybe it's derived with different seeds
        const seedCombos = [
          [Buffer.from('bonding-curve-vault'), mint.toBuffer()],
          [Buffer.from('bonding-curve-token'), bondingCurve.toBuffer()],
          [bondingCurve.toBuffer()],
          [mint.toBuffer(), bondingCurve.toBuffer()],
        ];
        
        console.log('\nTrying to derive account 4...');
        for (const seeds of seedCombos) {
          const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
          if (pda.equals(acct4)) {
            console.log('✓ FOUND! Seeds:', seeds.length);
          }
        }
        
        // Fetch account 4 info
        const info4 = await conn.getAccountInfo(acct4);
        if (info4) {
          console.log('Account 4 owner:', info4.owner.toBase58());
          if (info4.data.length >= 72) {
            const tokenMint = new PublicKey(info4.data.slice(0, 32));
            const tokenOwner = new PublicKey(info4.data.slice(32, 64));
            console.log('Account 4 as token:');
            console.log('  Mint:', tokenMint.toBase58().slice(0, 20) + '...');
            console.log('  Owner:', tokenOwner.toBase58().slice(0, 20) + '...');
          }
        }
      }
      
      found++;
      break;
    }
  }
}

main().catch(console.error);


import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // Analyze multiple buy transactions
  const sigs = await conn.getSignaturesForAddress(PUMP, { limit: 30 });
  
  let found = 0;
  for (const sig of sigs) {
    if (found >= 3) break;
    
    const tx = await conn.getParsedTransaction(sig.signature, { 
      maxSupportedTransactionVersion: 0 
    });
    if (!tx) continue;
    
    const ixs = tx.transaction.message.instructions;
    for (const ix of ixs) {
      if (!('accounts' in ix) || !ix.programId.equals(PUMP) || ix.accounts.length < 14) continue;
      
      const accounts = ix.accounts as PublicKey[];
      
      // Extract key accounts
      const acct1 = accounts[1]; // Associated bonding curve
      const mint = accounts[2];
      const bondingCurve = accounts[3];
      const acct4 = accounts[4]; // Unknown
      const tokenProgram = accounts[8];
      
      console.log(`\n=== TX ${found + 1}: ${sig.signature.slice(0, 20)}... ===`);
      console.log('Mint:', mint.toBase58().slice(0, 20) + '...');
      console.log('Bonding Curve:', bondingCurve.toBase58().slice(0, 20) + '...');
      console.log('Token Program:', tokenProgram.toBase58());
      
      // Derive expected associated bonding curve
      const isToken2022 = tokenProgram.equals(TOKEN_2022_PROGRAM_ID);
      const expectedABC = getAssociatedTokenAddressSync(
        mint,
        bondingCurve,
        true,
        isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
      );
      
      console.log('\nAccount 1 (from tx):', acct1.toBase58());
      console.log('Expected ATA:       ', expectedABC.toBase58());
      console.log('Account 1 = ATA:', acct1.equals(expectedABC));
      
      console.log('\nAccount 4 (from tx):', acct4.toBase58());
      console.log('Account 4 = Account 1:', acct4.equals(acct1));
      
      // If they're different, check what account 4 is
      if (!acct4.equals(acct1)) {
        // Maybe it's derived with different seeds
        const seedCombos = [
          [Buffer.from('bonding-curve-vault'), mint.toBuffer()],
          [Buffer.from('bonding-curve-token'), bondingCurve.toBuffer()],
          [bondingCurve.toBuffer()],
          [mint.toBuffer(), bondingCurve.toBuffer()],
        ];
        
        console.log('\nTrying to derive account 4...');
        for (const seeds of seedCombos) {
          const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
          if (pda.equals(acct4)) {
            console.log('✓ FOUND! Seeds:', seeds.length);
          }
        }
        
        // Fetch account 4 info
        const info4 = await conn.getAccountInfo(acct4);
        if (info4) {
          console.log('Account 4 owner:', info4.owner.toBase58());
          if (info4.data.length >= 72) {
            const tokenMint = new PublicKey(info4.data.slice(0, 32));
            const tokenOwner = new PublicKey(info4.data.slice(32, 64));
            console.log('Account 4 as token:');
            console.log('  Mint:', tokenMint.toBase58().slice(0, 20) + '...');
            console.log('  Owner:', tokenOwner.toBase58().slice(0, 20) + '...');
          }
        }
      }
      
      found++;
      break;
    }
  }
}

main().catch(console.error);


