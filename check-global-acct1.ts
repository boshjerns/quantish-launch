import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  const globalAcct1 = new PublicKey('6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs');
  
  console.log('=== Checking Account 1: 6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs ===\n');
  
  const info = await conn.getAccountInfo(globalAcct1);
  if (info) {
    console.log('Owner:', info.owner.toBase58());
    console.log('Lamports:', info.lamports);
    console.log('Data length:', info.data.length);
    console.log('Executable:', info.executable);
  }
  
  // Try to find what seeds derive this
  console.log('\nTrying seed derivations...');
  
  const seedCombos = [
    [Buffer.from('fee_sol_vault')],
    [Buffer.from('fee-sol-vault')],
    [Buffer.from('sol_vault')],
    [Buffer.from('sol-vault')],
    [Buffer.from('fee')],
    [Buffer.from('treasury')],
    [Buffer.from('protocol_fee')],
    [Buffer.from('fee_pool')],
    [Buffer.from('liquidity')],
    [Buffer.from('pool')],
  ];
  
  for (const seeds of seedCombos) {
    const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
    console.log(`[${seeds.map(s => s.toString())}]: ${pda.toBase58()}`);
    if (pda.equals(globalAcct1)) {
      console.log('✓ MATCH!');
    }
  }
  
  // Also check account 14
  console.log('\n=== Checking Account 14: 8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt ===\n');
  
  const acct14 = new PublicKey('8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt');
  
  const seedCombos14 = [
    [Buffer.from('fee_sol')],
    [Buffer.from('fee-sol')],
    [Buffer.from('protocol')],
    [Buffer.from('mint')],
  ];
  
  for (const seeds of seedCombos14) {
    const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
    console.log(`[${seeds.map(s => s.toString())}]: ${pda.toBase58()}`);
    if (pda.equals(acct14)) {
      console.log('✓ MATCH!');
    }
  }
  
  // Check if account 14 is derived from fee recipient
  const feeRecipient = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');
  
  const feeSeeds = [
    [Buffer.from('vault'), feeRecipient.toBuffer()],
    [feeRecipient.toBuffer()],
    [Buffer.from('fee'), feeRecipient.toBuffer()],
  ];
  
  console.log('\nChecking fee recipient based derivations...');
  for (const seeds of feeSeeds) {
    const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
    console.log(`Seeds: ${pda.toBase58()}`);
    if (pda.equals(acct14)) {
      console.log('✓ MATCH!');
    }
  }
  
  // Try with fee recipient as the program
  console.log('\nChecking derivation from fee_recipient program...');
  const feeSeeds2 = [
    [Buffer.from('fee_sol')],
    [Buffer.from('sol')],
  ];
  
  for (const seeds of feeSeeds2) {
    const [pda] = PublicKey.findProgramAddressSync(seeds, feeRecipient);
    console.log(`[${seeds.map(s => s.toString())}] from fee program: ${pda.toBase58()}`);
    if (pda.equals(acct14)) {
      console.log('✓ MATCH!');
    }
  }
}

main().catch(console.error);


import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  const globalAcct1 = new PublicKey('6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs');
  
  console.log('=== Checking Account 1: 6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs ===\n');
  
  const info = await conn.getAccountInfo(globalAcct1);
  if (info) {
    console.log('Owner:', info.owner.toBase58());
    console.log('Lamports:', info.lamports);
    console.log('Data length:', info.data.length);
    console.log('Executable:', info.executable);
  }
  
  // Try to find what seeds derive this
  console.log('\nTrying seed derivations...');
  
  const seedCombos = [
    [Buffer.from('fee_sol_vault')],
    [Buffer.from('fee-sol-vault')],
    [Buffer.from('sol_vault')],
    [Buffer.from('sol-vault')],
    [Buffer.from('fee')],
    [Buffer.from('treasury')],
    [Buffer.from('protocol_fee')],
    [Buffer.from('fee_pool')],
    [Buffer.from('liquidity')],
    [Buffer.from('pool')],
  ];
  
  for (const seeds of seedCombos) {
    const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
    console.log(`[${seeds.map(s => s.toString())}]: ${pda.toBase58()}`);
    if (pda.equals(globalAcct1)) {
      console.log('✓ MATCH!');
    }
  }
  
  // Also check account 14
  console.log('\n=== Checking Account 14: 8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt ===\n');
  
  const acct14 = new PublicKey('8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt');
  
  const seedCombos14 = [
    [Buffer.from('fee_sol')],
    [Buffer.from('fee-sol')],
    [Buffer.from('protocol')],
    [Buffer.from('mint')],
  ];
  
  for (const seeds of seedCombos14) {
    const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
    console.log(`[${seeds.map(s => s.toString())}]: ${pda.toBase58()}`);
    if (pda.equals(acct14)) {
      console.log('✓ MATCH!');
    }
  }
  
  // Check if account 14 is derived from fee recipient
  const feeRecipient = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');
  
  const feeSeeds = [
    [Buffer.from('vault'), feeRecipient.toBuffer()],
    [feeRecipient.toBuffer()],
    [Buffer.from('fee'), feeRecipient.toBuffer()],
  ];
  
  console.log('\nChecking fee recipient based derivations...');
  for (const seeds of feeSeeds) {
    const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
    console.log(`Seeds: ${pda.toBase58()}`);
    if (pda.equals(acct14)) {
      console.log('✓ MATCH!');
    }
  }
  
  // Try with fee recipient as the program
  console.log('\nChecking derivation from fee_recipient program...');
  const feeSeeds2 = [
    [Buffer.from('fee_sol')],
    [Buffer.from('sol')],
  ];
  
  for (const seeds of feeSeeds2) {
    const [pda] = PublicKey.findProgramAddressSync(seeds, feeRecipient);
    console.log(`[${seeds.map(s => s.toString())}] from fee program: ${pda.toBase58()}`);
    if (pda.equals(acct14)) {
      console.log('✓ MATCH!');
    }
  }
}

main().catch(console.error);


