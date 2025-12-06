import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

async function main() {
  const conn = new Connection(process.env.SOLANA_RPC_URL!);
  
  const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  
  // From successful transaction
  const accounts = {
    // Position 1: [2] 
    pos1: '62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV',
    // Position 4: [1]
    pos4: '4QF68kCZpngdHTvqeJpAJCQhG4SEbZ4GH6MmC2iJCBpe',
    // Position 13: [4]
    pos13: 'BQhks26xWkCXjrxgg7Hj3aZkaTAZQC8wvZTzcJ8vnH5n',
    // Position 14: [15]
    pos14: '8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt',
    // Mint
    mint: 'Agp692r66dgj7Y6CDzSiokC1Aw9D5ezT3hNhFxdDpump',
    // Bonding curve
    bondingCurve: 'Fgfffogjfg7sPmqWyd7euK5XHMTPCVYwmjSSJf7MS2B2',
  };
  
  for (const [name, addr] of Object.entries(accounts)) {
    const pk = new PublicKey(addr);
    const info = await conn.getAccountInfo(pk);
    console.log(`\n${name}: ${addr.slice(0, 16)}...`);
    if (info) {
      console.log(`  Owner: ${info.owner.toBase58()}`);
      console.log(`  Lamports: ${info.lamports}`);
      console.log(`  Data len: ${info.data.length}`);
    } else {
      console.log('  NOT FOUND');
    }
  }
  
  // Derive what associated_bonding_curve should be
  const mint = new PublicKey(accounts.mint);
  const bondingCurve = new PublicKey(accounts.bondingCurve);
  
  console.log('\n\n--- Derived accounts ---');
  
  const associatedBondingCurve = getAssociatedTokenAddressSync(
    mint,
    bondingCurve,
    true,
    TOKEN_2022_PROGRAM_ID
  );
  console.log('Associated bonding curve (Token-2022):', associatedBondingCurve.toBase58());
  
  // Check if pos4 or pos1 matches
  console.log('Matches pos4?', associatedBondingCurve.toBase58() === accounts.pos4);
  console.log('Matches pos1?', associatedBondingCurve.toBase58() === accounts.pos1);
  
  // Maybe pos1 is a SOL vault PDA
  const [solVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('sol-vault'), bondingCurve.toBuffer()],
    PUMP
  );
  console.log('\nSOL vault PDA:', solVault.toBase58());
  
  // Try other seeds
  const [vault1] = PublicKey.findProgramAddressSync(
    [bondingCurve.toBuffer(), Buffer.from('vault')],
    PUMP
  );
  console.log('Vault (curve + "vault"):', vault1.toBase58());
}

main().catch(console.error);


import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

async function main() {
  const conn = new Connection(process.env.SOLANA_RPC_URL!);
  
  const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  
  // From successful transaction
  const accounts = {
    // Position 1: [2] 
    pos1: '62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV',
    // Position 4: [1]
    pos4: '4QF68kCZpngdHTvqeJpAJCQhG4SEbZ4GH6MmC2iJCBpe',
    // Position 13: [4]
    pos13: 'BQhks26xWkCXjrxgg7Hj3aZkaTAZQC8wvZTzcJ8vnH5n',
    // Position 14: [15]
    pos14: '8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt',
    // Mint
    mint: 'Agp692r66dgj7Y6CDzSiokC1Aw9D5ezT3hNhFxdDpump',
    // Bonding curve
    bondingCurve: 'Fgfffogjfg7sPmqWyd7euK5XHMTPCVYwmjSSJf7MS2B2',
  };
  
  for (const [name, addr] of Object.entries(accounts)) {
    const pk = new PublicKey(addr);
    const info = await conn.getAccountInfo(pk);
    console.log(`\n${name}: ${addr.slice(0, 16)}...`);
    if (info) {
      console.log(`  Owner: ${info.owner.toBase58()}`);
      console.log(`  Lamports: ${info.lamports}`);
      console.log(`  Data len: ${info.data.length}`);
    } else {
      console.log('  NOT FOUND');
    }
  }
  
  // Derive what associated_bonding_curve should be
  const mint = new PublicKey(accounts.mint);
  const bondingCurve = new PublicKey(accounts.bondingCurve);
  
  console.log('\n\n--- Derived accounts ---');
  
  const associatedBondingCurve = getAssociatedTokenAddressSync(
    mint,
    bondingCurve,
    true,
    TOKEN_2022_PROGRAM_ID
  );
  console.log('Associated bonding curve (Token-2022):', associatedBondingCurve.toBase58());
  
  // Check if pos4 or pos1 matches
  console.log('Matches pos4?', associatedBondingCurve.toBase58() === accounts.pos4);
  console.log('Matches pos1?', associatedBondingCurve.toBase58() === accounts.pos1);
  
  // Maybe pos1 is a SOL vault PDA
  const [solVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('sol-vault'), bondingCurve.toBuffer()],
    PUMP
  );
  console.log('\nSOL vault PDA:', solVault.toBase58());
  
  // Try other seeds
  const [vault1] = PublicKey.findProgramAddressSync(
    [bondingCurve.toBuffer(), Buffer.from('vault')],
    PUMP
  );
  console.log('Vault (curve + "vault"):', vault1.toBase58());
}

main().catch(console.error);


