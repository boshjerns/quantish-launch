import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // From the successful transaction
  const accounts = [
    '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf',  // 0: Global
    '6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs',  // 1: Associated bonding curve
    '3UD2AL3x7Ytkv4H3yk7vGS1xk2Y2u3eJFc4GaSnbbwBZ',  // 2: Mint
    'FUcxwB9r1GB4DuCtcKtNspgE5BLbQCBiKCfFyoY8YXpH',  // 3: Bonding curve
    '4mGZUDUSLBRpXPayE51fzj8itLU1m7gqbSJg5u3odZKR',  // 4: ??? SOL vault?
    'C6dwvp8Tic8Nr9D9vzAnCkZqua6boe6mDYFbakbJotEz',  // 5: User ATA
    'EG7MiZWRcfWNZR4Z54G6azsGKwu9QzZePNzHE4TVdXR5',  // 6: User (signer)
    '11111111111111111111111111111111',              // 7: System program
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',  // 8: Token program
    '2qKTkpBRXK19CeG9xvY25HngTWwsN4uSE1dAibjFQALC',  // 9: Coin creator
    'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1',  // 10: Event authority
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',  // 11: Program
    'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y',  // 12: Global volume
    '4eNAvCj3zvRAFGF1MYB6L2RApfjki5mM6rjUobKEBfJ2',  // 13: Creator vault
    '8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt',  // 14: ??? What is this?
    'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ',  // 15: Fee recipient
  ];
  
  // Check what account 4 and 14 are
  console.log('Analyzing unknown accounts...\n');
  
  const mint = new PublicKey(accounts[2]);
  const bondingCurve = new PublicKey(accounts[3]);
  const creator = new PublicKey(accounts[9]);
  
  // Try to derive account 4
  console.log('=== Account 4: 4mGZUDUSLBRpXPayE51fzj8itLU1m7gqbSJg5u3odZKR ===');
  const target4 = new PublicKey('4mGZUDUSLBRpXPayE51fzj8itLU1m7gqbSJg5u3odZKR');
  
  // Try: pool-sol-vault with bonding curve
  const seeds4 = [
    [Buffer.from('pool-sol-vault'), bondingCurve.toBuffer()],
    [Buffer.from('sol-vault'), bondingCurve.toBuffer()],
    [Buffer.from('pool_sol_vault'), bondingCurve.toBuffer()],
    [Buffer.from('pool-sol-reserves'), bondingCurve.toBuffer()],
    [bondingCurve.toBuffer(), Buffer.from('pool')],
  ];
  
  for (const seed of seeds4) {
    const [pda] = PublicKey.findProgramAddressSync(seed, PUMP);
    if (pda.equals(target4)) {
      console.log('✓ Found! Seeds:', seed.map(s => s.toString()));
    }
  }
  
  // Check if it's owned by system program (SOL vault)
  const acct4Info = await conn.getAccountInfo(target4);
  console.log('Account 4 owner:', acct4Info?.owner.toBase58());
  console.log('Account 4 lamports:', acct4Info?.lamports);
  console.log('');
  
  // Try to derive account 14
  console.log('=== Account 14: 8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt ===');
  const target14 = new PublicKey('8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt');
  
  const acct14Info = await conn.getAccountInfo(target14);
  console.log('Account 14 owner:', acct14Info?.owner.toBase58());
  console.log('Account 14 lamports:', acct14Info?.lamports);
  
  // Check if it's a PDA
  const seeds14 = [
    [Buffer.from('creator_fee_vault')],
    [Buffer.from('creator-fee-vault')],
    [Buffer.from('protocol_fee_vault')],
    [Buffer.from('protocol-fee-vault')],
    [Buffer.from('mint_authority')],
    [Buffer.from('mint-authority')],
  ];
  
  for (const seed of seeds14) {
    const [pda] = PublicKey.findProgramAddressSync(seed, PUMP);
    if (pda.equals(target14)) {
      console.log('✓ Found! Seeds:', seed.map(s => s.toString()));
    }
  }
  
  // Try checking if it's derived from global
  const global = new PublicKey(accounts[0]);
  console.log('\nChecking derivation from global...');
  
  const moreSeeds = [
    [Buffer.from('mint_authority')],
    [Buffer.from('authority')],
  ];
  
  for (const seed of moreSeeds) {
    const [pda] = PublicKey.findProgramAddressSync(seed, PUMP);
    console.log(`Seeds [${seed.map(s => s.toString())}]: ${pda.toBase58()}`);
    if (pda.equals(target14)) {
      console.log('✓ MATCH!');
    }
  }
}

main().catch(console.error);


import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // From the successful transaction
  const accounts = [
    '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf',  // 0: Global
    '6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs',  // 1: Associated bonding curve
    '3UD2AL3x7Ytkv4H3yk7vGS1xk2Y2u3eJFc4GaSnbbwBZ',  // 2: Mint
    'FUcxwB9r1GB4DuCtcKtNspgE5BLbQCBiKCfFyoY8YXpH',  // 3: Bonding curve
    '4mGZUDUSLBRpXPayE51fzj8itLU1m7gqbSJg5u3odZKR',  // 4: ??? SOL vault?
    'C6dwvp8Tic8Nr9D9vzAnCkZqua6boe6mDYFbakbJotEz',  // 5: User ATA
    'EG7MiZWRcfWNZR4Z54G6azsGKwu9QzZePNzHE4TVdXR5',  // 6: User (signer)
    '11111111111111111111111111111111',              // 7: System program
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',  // 8: Token program
    '2qKTkpBRXK19CeG9xvY25HngTWwsN4uSE1dAibjFQALC',  // 9: Coin creator
    'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1',  // 10: Event authority
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',  // 11: Program
    'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y',  // 12: Global volume
    '4eNAvCj3zvRAFGF1MYB6L2RApfjki5mM6rjUobKEBfJ2',  // 13: Creator vault
    '8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt',  // 14: ??? What is this?
    'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ',  // 15: Fee recipient
  ];
  
  // Check what account 4 and 14 are
  console.log('Analyzing unknown accounts...\n');
  
  const mint = new PublicKey(accounts[2]);
  const bondingCurve = new PublicKey(accounts[3]);
  const creator = new PublicKey(accounts[9]);
  
  // Try to derive account 4
  console.log('=== Account 4: 4mGZUDUSLBRpXPayE51fzj8itLU1m7gqbSJg5u3odZKR ===');
  const target4 = new PublicKey('4mGZUDUSLBRpXPayE51fzj8itLU1m7gqbSJg5u3odZKR');
  
  // Try: pool-sol-vault with bonding curve
  const seeds4 = [
    [Buffer.from('pool-sol-vault'), bondingCurve.toBuffer()],
    [Buffer.from('sol-vault'), bondingCurve.toBuffer()],
    [Buffer.from('pool_sol_vault'), bondingCurve.toBuffer()],
    [Buffer.from('pool-sol-reserves'), bondingCurve.toBuffer()],
    [bondingCurve.toBuffer(), Buffer.from('pool')],
  ];
  
  for (const seed of seeds4) {
    const [pda] = PublicKey.findProgramAddressSync(seed, PUMP);
    if (pda.equals(target4)) {
      console.log('✓ Found! Seeds:', seed.map(s => s.toString()));
    }
  }
  
  // Check if it's owned by system program (SOL vault)
  const acct4Info = await conn.getAccountInfo(target4);
  console.log('Account 4 owner:', acct4Info?.owner.toBase58());
  console.log('Account 4 lamports:', acct4Info?.lamports);
  console.log('');
  
  // Try to derive account 14
  console.log('=== Account 14: 8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt ===');
  const target14 = new PublicKey('8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt');
  
  const acct14Info = await conn.getAccountInfo(target14);
  console.log('Account 14 owner:', acct14Info?.owner.toBase58());
  console.log('Account 14 lamports:', acct14Info?.lamports);
  
  // Check if it's a PDA
  const seeds14 = [
    [Buffer.from('creator_fee_vault')],
    [Buffer.from('creator-fee-vault')],
    [Buffer.from('protocol_fee_vault')],
    [Buffer.from('protocol-fee-vault')],
    [Buffer.from('mint_authority')],
    [Buffer.from('mint-authority')],
  ];
  
  for (const seed of seeds14) {
    const [pda] = PublicKey.findProgramAddressSync(seed, PUMP);
    if (pda.equals(target14)) {
      console.log('✓ Found! Seeds:', seed.map(s => s.toString()));
    }
  }
  
  // Try checking if it's derived from global
  const global = new PublicKey(accounts[0]);
  console.log('\nChecking derivation from global...');
  
  const moreSeeds = [
    [Buffer.from('mint_authority')],
    [Buffer.from('authority')],
  ];
  
  for (const seed of moreSeeds) {
    const [pda] = PublicKey.findProgramAddressSync(seed, PUMP);
    console.log(`Seeds [${seed.map(s => s.toString())}]: ${pda.toBase58()}`);
    if (pda.equals(target14)) {
      console.log('✓ MATCH!');
    }
  }
}

main().catch(console.error);


