import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, NATIVE_MINT } from '@solana/spl-token';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // Token-2022 transaction values
  const position1_T2022 = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
  const mint_T2022 = new PublicKey('FxTcPAWoxkiU7Lo2JctKxoiucNRU7vwztzW4cKf5pump');
  const bondingCurve_T2022 = new PublicKey('2grgAUkbnPWbAaMvnhcY92JVm3GhwZ2K6Z4ah5n9SRUJ');
  const creator_T2022 = new PublicKey('4fP82iS5ySwsskDPeerHugjQJ2iRAu3yoW9PrY9LCsof');
  
  // Regular Token transaction values
  const position1_Token = new PublicKey('6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs');
  const mint_Token = new PublicKey('9TEUwfweLbcA753xN9zsSh7TLqLbUv8mwcN57ofPT2Ya');
  const bondingCurve_Token = new PublicKey('Ea5PRYbn1Rg9Ce14cwshPDXDdM7LYb1G4e9MNsWUgPJC');
  
  console.log('=== Analyzing Position 1 for Token-2022 TX ===\n');
  
  const info1 = await conn.getAccountInfo(position1_T2022);
  if (info1) {
    console.log('Position 1 owner:', info1.owner.toBase58());
    console.log('Position 1 lamports:', info1.lamports);
    console.log('Position 1 data length:', info1.data.length);
    
    // If it's a token account, decode it
    if (info1.owner.equals(TOKEN_2022_PROGRAM_ID) || info1.owner.equals(TOKEN_PROGRAM_ID)) {
      const tokenMint = new PublicKey(info1.data.slice(0, 32));
      const tokenOwner = new PublicKey(info1.data.slice(32, 64));
      console.log('\nAs token account:');
      console.log('  Mint:', tokenMint.toBase58());
      console.log('  Owner:', tokenOwner.toBase58());
    }
  }
  
  // Try to derive position 1 for Token-2022
  console.log('\n=== Trying to derive Position 1 ===\n');
  
  // Maybe it's related to the creator
  const creatorVault_T2022 = PublicKey.findProgramAddressSync(
    [Buffer.from('creator-vault'), creator_T2022.toBuffer()],
    PUMP
  )[0];
  console.log('Creator vault (T2022):', creatorVault_T2022.toBase58());
  console.log('Matches position 1:', creatorVault_T2022.equals(position1_T2022));
  
  // Try bonding curve related seeds
  const seedsToTry = [
    [Buffer.from('sol-pool'), bondingCurve_T2022.toBuffer()],
    [Buffer.from('pool'), bondingCurve_T2022.toBuffer()],
    [Buffer.from('fee'), bondingCurve_T2022.toBuffer()],
    [Buffer.from('vault'), bondingCurve_T2022.toBuffer()],
    [bondingCurve_T2022.toBuffer(), Buffer.from('sol')],
    [Buffer.from('bonding-curve-sol'), mint_T2022.toBuffer()],
  ];
  
  for (const seeds of seedsToTry) {
    const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
    if (pda.equals(position1_T2022)) {
      console.log('✓ FOUND for T2022! Seeds:', seeds.map(s => s.slice(0,16).toString()));
    }
  }
  
  // Check for regular Token
  console.log('\n=== Checking Regular Token position 1 ===');
  const info2 = await conn.getAccountInfo(position1_Token);
  if (info2) {
    console.log('Position 1 (Token) owner:', info2.owner.toBase58());
    console.log('Position 1 (Token) lamports:', info2.lamports);
    console.log('Position 1 (Token) data length:', info2.data.length);
  }
  
  // For our target token
  console.log('\n=== Deriving position 1 for our target token ===');
  const ourMint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  const [ourBondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), ourMint.toBuffer()],
    PUMP
  );
  
  // Get creator
  const bcInfo = await conn.getAccountInfo(ourBondingCurve);
  if (bcInfo) {
    const ourCreator = new PublicKey(bcInfo.data.slice(49, 81));
    console.log('Our creator:', ourCreator.toBase58());
    
    // Check if position 1 might be creator's SOL vault
    const [ourCreatorVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('creator-vault'), ourCreator.toBuffer()],
      PUMP
    );
    console.log('Our creator vault:', ourCreatorVault.toBase58());
    
    // That was already found to be position 13
    // Try other derivations
    for (const seeds of seedsToTry.map(s => 
      s.map(buf => {
        if (buf.equals(bondingCurve_T2022.toBuffer())) return ourBondingCurve.toBuffer();
        if (buf.equals(mint_T2022.toBuffer())) return ourMint.toBuffer();
        return buf;
      })
    )) {
      const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
      console.log(`Seeds attempt: ${pda.toBase58().slice(0, 20)}...`);
    }
  }
}

main().catch(console.error);


import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, NATIVE_MINT } from '@solana/spl-token';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // Token-2022 transaction values
  const position1_T2022 = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
  const mint_T2022 = new PublicKey('FxTcPAWoxkiU7Lo2JctKxoiucNRU7vwztzW4cKf5pump');
  const bondingCurve_T2022 = new PublicKey('2grgAUkbnPWbAaMvnhcY92JVm3GhwZ2K6Z4ah5n9SRUJ');
  const creator_T2022 = new PublicKey('4fP82iS5ySwsskDPeerHugjQJ2iRAu3yoW9PrY9LCsof');
  
  // Regular Token transaction values
  const position1_Token = new PublicKey('6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs');
  const mint_Token = new PublicKey('9TEUwfweLbcA753xN9zsSh7TLqLbUv8mwcN57ofPT2Ya');
  const bondingCurve_Token = new PublicKey('Ea5PRYbn1Rg9Ce14cwshPDXDdM7LYb1G4e9MNsWUgPJC');
  
  console.log('=== Analyzing Position 1 for Token-2022 TX ===\n');
  
  const info1 = await conn.getAccountInfo(position1_T2022);
  if (info1) {
    console.log('Position 1 owner:', info1.owner.toBase58());
    console.log('Position 1 lamports:', info1.lamports);
    console.log('Position 1 data length:', info1.data.length);
    
    // If it's a token account, decode it
    if (info1.owner.equals(TOKEN_2022_PROGRAM_ID) || info1.owner.equals(TOKEN_PROGRAM_ID)) {
      const tokenMint = new PublicKey(info1.data.slice(0, 32));
      const tokenOwner = new PublicKey(info1.data.slice(32, 64));
      console.log('\nAs token account:');
      console.log('  Mint:', tokenMint.toBase58());
      console.log('  Owner:', tokenOwner.toBase58());
    }
  }
  
  // Try to derive position 1 for Token-2022
  console.log('\n=== Trying to derive Position 1 ===\n');
  
  // Maybe it's related to the creator
  const creatorVault_T2022 = PublicKey.findProgramAddressSync(
    [Buffer.from('creator-vault'), creator_T2022.toBuffer()],
    PUMP
  )[0];
  console.log('Creator vault (T2022):', creatorVault_T2022.toBase58());
  console.log('Matches position 1:', creatorVault_T2022.equals(position1_T2022));
  
  // Try bonding curve related seeds
  const seedsToTry = [
    [Buffer.from('sol-pool'), bondingCurve_T2022.toBuffer()],
    [Buffer.from('pool'), bondingCurve_T2022.toBuffer()],
    [Buffer.from('fee'), bondingCurve_T2022.toBuffer()],
    [Buffer.from('vault'), bondingCurve_T2022.toBuffer()],
    [bondingCurve_T2022.toBuffer(), Buffer.from('sol')],
    [Buffer.from('bonding-curve-sol'), mint_T2022.toBuffer()],
  ];
  
  for (const seeds of seedsToTry) {
    const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
    if (pda.equals(position1_T2022)) {
      console.log('✓ FOUND for T2022! Seeds:', seeds.map(s => s.slice(0,16).toString()));
    }
  }
  
  // Check for regular Token
  console.log('\n=== Checking Regular Token position 1 ===');
  const info2 = await conn.getAccountInfo(position1_Token);
  if (info2) {
    console.log('Position 1 (Token) owner:', info2.owner.toBase58());
    console.log('Position 1 (Token) lamports:', info2.lamports);
    console.log('Position 1 (Token) data length:', info2.data.length);
  }
  
  // For our target token
  console.log('\n=== Deriving position 1 for our target token ===');
  const ourMint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  const [ourBondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), ourMint.toBuffer()],
    PUMP
  );
  
  // Get creator
  const bcInfo = await conn.getAccountInfo(ourBondingCurve);
  if (bcInfo) {
    const ourCreator = new PublicKey(bcInfo.data.slice(49, 81));
    console.log('Our creator:', ourCreator.toBase58());
    
    // Check if position 1 might be creator's SOL vault
    const [ourCreatorVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('creator-vault'), ourCreator.toBuffer()],
      PUMP
    );
    console.log('Our creator vault:', ourCreatorVault.toBase58());
    
    // That was already found to be position 13
    // Try other derivations
    for (const seeds of seedsToTry.map(s => 
      s.map(buf => {
        if (buf.equals(bondingCurve_T2022.toBuffer())) return ourBondingCurve.toBuffer();
        if (buf.equals(mint_T2022.toBuffer())) return ourMint.toBuffer();
        return buf;
      })
    )) {
      const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
      console.log(`Seeds attempt: ${pda.toBase58().slice(0, 20)}...`);
    }
  }
}

main().catch(console.error);


