import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  const mint = new PublicKey('3UD2AL3x7Ytkv4H3yk7vGS1xk2Y2u3eJFc4GaSnbbwBZ');
  const bondingCurve = new PublicKey('FUcxwB9r1GB4DuCtcKtNspgE5BLbQCBiKCfFyoY8YXpH');
  const target4 = new PublicKey('4mGZUDUSLBRpXPayE51fzj8itLU1m7gqbSJg5u3odZKR');
  const target14 = new PublicKey('8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt');
  const feeRecipient = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');
  
  console.log('=== Checking if Account 4 is WSOL ATA for bonding curve ===');
  
  // Check if account 4 is the WSOL ATA for the bonding curve
  const wsolAtaForBonding = getAssociatedTokenAddressSync(
    NATIVE_MINT,  // WSOL mint
    bondingCurve,
    true,  // allowOwnerOffCurve for PDAs
    TOKEN_PROGRAM_ID
  );
  console.log('WSOL ATA for bonding curve:', wsolAtaForBonding.toBase58());
  console.log('Target 4:', target4.toBase58());
  console.log('Match:', wsolAtaForBonding.equals(target4));
  
  console.log('\n=== Checking if Account 14 is a fee vault ATA ===');
  
  // Check if account 14 is the token ATA for fee recipient
  const tokenAtaForFee = getAssociatedTokenAddressSync(
    mint,
    feeRecipient,
    true,
    TOKEN_PROGRAM_ID
  );
  console.log('Token ATA for fee recipient:', tokenAtaForFee.toBase58());
  console.log('Target 14:', target14.toBase58());
  console.log('Match:', tokenAtaForFee.equals(target14));
  
  // Try WSOL ATA for fee recipient
  const wsolAtaForFee = getAssociatedTokenAddressSync(
    NATIVE_MINT,
    feeRecipient,
    true,
    TOKEN_PROGRAM_ID
  );
  console.log('WSOL ATA for fee recipient:', wsolAtaForFee.toBase58());
  console.log('Match:', wsolAtaForFee.equals(target14));
  
  // Maybe it's a PDA from pump.fun with fee_recipient seed
  console.log('\n=== Checking PDA derivations ===');
  
  const pdaSeeds = [
    [feeRecipient.toBuffer()],
    [Buffer.from('fee'), feeRecipient.toBuffer()],
    [Buffer.from('fee-vault')],
    [Buffer.from('fee_vault')],
    [Buffer.from('creator_fee')],
  ];
  
  for (const seeds of pdaSeeds) {
    const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
    console.log(`Seeds: ${seeds.map(s => s.slice(0,10).toString())}: ${pda.toBase58().slice(0,20)}...`);
    if (pda.equals(target14)) {
      console.log('✓ FOUND MATCH!');
    }
  }
  
  // Let me decode account 4 to see what token it holds
  console.log('\n=== Decoding Account 4 token data ===');
  const acct4 = await conn.getAccountInfo(target4);
  if (acct4) {
    // Token account: 32 bytes mint, 32 bytes owner, 8 bytes amount
    const tokenMint = new PublicKey(acct4.data.slice(0, 32));
    const tokenOwner = new PublicKey(acct4.data.slice(32, 64));
    const amount = acct4.data.readBigUInt64LE(64);
    
    console.log('Mint:', tokenMint.toBase58());
    console.log('Owner:', tokenOwner.toBase58());
    console.log('Amount:', amount.toString());
    console.log('Is WSOL:', tokenMint.equals(NATIVE_MINT));
  }
  
  console.log('\n=== Decoding Account 14 ===');
  const acct14 = await conn.getAccountInfo(target14);
  if (acct14) {
    console.log('Data length:', acct14.data.length);
    // Try to decode as token account
    if (acct14.data.length >= 72) {
      const tokenMint = new PublicKey(acct14.data.slice(0, 32));
      const tokenOwner = new PublicKey(acct14.data.slice(32, 64));
      console.log('As token account:');
      console.log('  Mint:', tokenMint.toBase58());
      console.log('  Owner:', tokenOwner.toBase58());
    }
  }
}

main().catch(console.error);


import { getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  const mint = new PublicKey('3UD2AL3x7Ytkv4H3yk7vGS1xk2Y2u3eJFc4GaSnbbwBZ');
  const bondingCurve = new PublicKey('FUcxwB9r1GB4DuCtcKtNspgE5BLbQCBiKCfFyoY8YXpH');
  const target4 = new PublicKey('4mGZUDUSLBRpXPayE51fzj8itLU1m7gqbSJg5u3odZKR');
  const target14 = new PublicKey('8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt');
  const feeRecipient = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');
  
  console.log('=== Checking if Account 4 is WSOL ATA for bonding curve ===');
  
  // Check if account 4 is the WSOL ATA for the bonding curve
  const wsolAtaForBonding = getAssociatedTokenAddressSync(
    NATIVE_MINT,  // WSOL mint
    bondingCurve,
    true,  // allowOwnerOffCurve for PDAs
    TOKEN_PROGRAM_ID
  );
  console.log('WSOL ATA for bonding curve:', wsolAtaForBonding.toBase58());
  console.log('Target 4:', target4.toBase58());
  console.log('Match:', wsolAtaForBonding.equals(target4));
  
  console.log('\n=== Checking if Account 14 is a fee vault ATA ===');
  
  // Check if account 14 is the token ATA for fee recipient
  const tokenAtaForFee = getAssociatedTokenAddressSync(
    mint,
    feeRecipient,
    true,
    TOKEN_PROGRAM_ID
  );
  console.log('Token ATA for fee recipient:', tokenAtaForFee.toBase58());
  console.log('Target 14:', target14.toBase58());
  console.log('Match:', tokenAtaForFee.equals(target14));
  
  // Try WSOL ATA for fee recipient
  const wsolAtaForFee = getAssociatedTokenAddressSync(
    NATIVE_MINT,
    feeRecipient,
    true,
    TOKEN_PROGRAM_ID
  );
  console.log('WSOL ATA for fee recipient:', wsolAtaForFee.toBase58());
  console.log('Match:', wsolAtaForFee.equals(target14));
  
  // Maybe it's a PDA from pump.fun with fee_recipient seed
  console.log('\n=== Checking PDA derivations ===');
  
  const pdaSeeds = [
    [feeRecipient.toBuffer()],
    [Buffer.from('fee'), feeRecipient.toBuffer()],
    [Buffer.from('fee-vault')],
    [Buffer.from('fee_vault')],
    [Buffer.from('creator_fee')],
  ];
  
  for (const seeds of pdaSeeds) {
    const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
    console.log(`Seeds: ${seeds.map(s => s.slice(0,10).toString())}: ${pda.toBase58().slice(0,20)}...`);
    if (pda.equals(target14)) {
      console.log('✓ FOUND MATCH!');
    }
  }
  
  // Let me decode account 4 to see what token it holds
  console.log('\n=== Decoding Account 4 token data ===');
  const acct4 = await conn.getAccountInfo(target4);
  if (acct4) {
    // Token account: 32 bytes mint, 32 bytes owner, 8 bytes amount
    const tokenMint = new PublicKey(acct4.data.slice(0, 32));
    const tokenOwner = new PublicKey(acct4.data.slice(32, 64));
    const amount = acct4.data.readBigUInt64LE(64);
    
    console.log('Mint:', tokenMint.toBase58());
    console.log('Owner:', tokenOwner.toBase58());
    console.log('Amount:', amount.toString());
    console.log('Is WSOL:', tokenMint.equals(NATIVE_MINT));
  }
  
  console.log('\n=== Decoding Account 14 ===');
  const acct14 = await conn.getAccountInfo(target14);
  if (acct14) {
    console.log('Data length:', acct14.data.length);
    // Try to decode as token account
    if (acct14.data.length >= 72) {
      const tokenMint = new PublicKey(acct14.data.slice(0, 32));
      const tokenOwner = new PublicKey(acct14.data.slice(32, 64));
      console.log('As token account:');
      console.log('  Mint:', tokenMint.toBase58());
      console.log('  Owner:', tokenOwner.toBase58());
    }
  }
}

main().catch(console.error);


