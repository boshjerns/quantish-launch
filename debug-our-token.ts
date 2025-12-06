import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { config } from './src/config/index.js';
import { getAllKeypairs } from './src/wallet/generator.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  const mint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  
  console.log('=== Our Token Analysis ===\n');
  
  // Check what token program the mint uses
  const mintAccount = await conn.getAccountInfo(mint);
  if (mintAccount) {
    console.log('Mint owner (token program):', mintAccount.owner.toBase58());
    const isToken2022 = mintAccount.owner.equals(TOKEN_2022_PROGRAM_ID);
    console.log('Is Token-2022:', isToken2022);
    
    // Derive bonding curve
    const [bondingCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), mint.toBuffer()],
      PUMP
    );
    console.log('\nBonding Curve:', bondingCurve.toBase58());
    
    // Derive associated bonding curve (token ATA for bonding curve)
    const tokenProgram = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    
    const associatedBondingCurve = getAssociatedTokenAddressSync(
      mint,
      bondingCurve,
      true, // allowOwnerOffCurve
      tokenProgram
    );
    console.log('Associated Bonding Curve:', associatedBondingCurve.toBase58());
    
    // Check if it exists
    const abcInfo = await conn.getAccountInfo(associatedBondingCurve);
    console.log('ABC exists:', !!abcInfo);
    if (abcInfo) {
      console.log('ABC owner:', abcInfo.owner.toBase58());
    }
    
    // Load wallets and check their ATAs
    const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
    const wallets = getAllKeypairs(password);
    
    console.log('\n=== User ATAs ===');
    for (let i = 0; i < wallets.length; i++) {
      const userAta = getAssociatedTokenAddressSync(
        mint,
        wallets[i].publicKey,
        false, // not PDA
        tokenProgram
      );
      console.log(`Wallet ${i} ATA: ${userAta.toBase58()}`);
    }
    
    // Check against the logged pubkeys from the error
    console.log('\n=== Comparison with error logs ===');
    const loggedPubkeys = [
      'GNyqtAFZnT15GZbZDhvLxZFV86dFyabbWi78RNDms75t', // Wallet 0
      'Bhasy6hiSNxA5tydKS8BfsYZZEcFb4EBZmMHxkg83zWx', // Wallet 1
    ];
    
    const expectedPubkey = 'HRmQJ8gr8bJ64AwEkpyj6mB9cG4sRUygHJ2k8H6rKPxE';
    console.log('Expected (from log):', expectedPubkey);
    
    // Check if the expected pubkey is the bonding curve ATA
    console.log('ABC matches expected:', associatedBondingCurve.toBase58() === expectedPubkey);
    
    // Check if expected is a PDA
    const expectedPK = new PublicKey(expectedPubkey);
    const expectedInfo = await conn.getAccountInfo(expectedPK);
    if (expectedInfo) {
      console.log('\nExpected pubkey info:');
      console.log('  Owner:', expectedInfo.owner.toBase58());
      console.log('  Lamports:', expectedInfo.lamports);
      console.log('  Data length:', expectedInfo.data.length);
    }
    
    // Try to decode bonding curve data to see creator
    const bcInfo = await conn.getAccountInfo(bondingCurve);
    if (bcInfo) {
      console.log('\n=== Bonding Curve Data ===');
      const creator = new PublicKey(bcInfo.data.slice(49, 81));
      console.log('Creator:', creator.toBase58());
      
      // Creator vault
      const [creatorVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('creator-vault'), creator.toBuffer()],
        PUMP
      );
      console.log('Creator Vault:', creatorVault.toBase58());
    }
  }
}

main().catch(console.error);


import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { config } from './src/config/index.js';
import { getAllKeypairs } from './src/wallet/generator.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  const mint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  
  console.log('=== Our Token Analysis ===\n');
  
  // Check what token program the mint uses
  const mintAccount = await conn.getAccountInfo(mint);
  if (mintAccount) {
    console.log('Mint owner (token program):', mintAccount.owner.toBase58());
    const isToken2022 = mintAccount.owner.equals(TOKEN_2022_PROGRAM_ID);
    console.log('Is Token-2022:', isToken2022);
    
    // Derive bonding curve
    const [bondingCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), mint.toBuffer()],
      PUMP
    );
    console.log('\nBonding Curve:', bondingCurve.toBase58());
    
    // Derive associated bonding curve (token ATA for bonding curve)
    const tokenProgram = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    
    const associatedBondingCurve = getAssociatedTokenAddressSync(
      mint,
      bondingCurve,
      true, // allowOwnerOffCurve
      tokenProgram
    );
    console.log('Associated Bonding Curve:', associatedBondingCurve.toBase58());
    
    // Check if it exists
    const abcInfo = await conn.getAccountInfo(associatedBondingCurve);
    console.log('ABC exists:', !!abcInfo);
    if (abcInfo) {
      console.log('ABC owner:', abcInfo.owner.toBase58());
    }
    
    // Load wallets and check their ATAs
    const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
    const wallets = getAllKeypairs(password);
    
    console.log('\n=== User ATAs ===');
    for (let i = 0; i < wallets.length; i++) {
      const userAta = getAssociatedTokenAddressSync(
        mint,
        wallets[i].publicKey,
        false, // not PDA
        tokenProgram
      );
      console.log(`Wallet ${i} ATA: ${userAta.toBase58()}`);
    }
    
    // Check against the logged pubkeys from the error
    console.log('\n=== Comparison with error logs ===');
    const loggedPubkeys = [
      'GNyqtAFZnT15GZbZDhvLxZFV86dFyabbWi78RNDms75t', // Wallet 0
      'Bhasy6hiSNxA5tydKS8BfsYZZEcFb4EBZmMHxkg83zWx', // Wallet 1
    ];
    
    const expectedPubkey = 'HRmQJ8gr8bJ64AwEkpyj6mB9cG4sRUygHJ2k8H6rKPxE';
    console.log('Expected (from log):', expectedPubkey);
    
    // Check if the expected pubkey is the bonding curve ATA
    console.log('ABC matches expected:', associatedBondingCurve.toBase58() === expectedPubkey);
    
    // Check if expected is a PDA
    const expectedPK = new PublicKey(expectedPubkey);
    const expectedInfo = await conn.getAccountInfo(expectedPK);
    if (expectedInfo) {
      console.log('\nExpected pubkey info:');
      console.log('  Owner:', expectedInfo.owner.toBase58());
      console.log('  Lamports:', expectedInfo.lamports);
      console.log('  Data length:', expectedInfo.data.length);
    }
    
    // Try to decode bonding curve data to see creator
    const bcInfo = await conn.getAccountInfo(bondingCurve);
    if (bcInfo) {
      console.log('\n=== Bonding Curve Data ===');
      const creator = new PublicKey(bcInfo.data.slice(49, 81));
      console.log('Creator:', creator.toBase58());
      
      // Creator vault
      const [creatorVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('creator-vault'), creator.toBuffer()],
        PUMP
      );
      console.log('Creator Vault:', creatorVault.toBase58());
    }
  }
}

main().catch(console.error);


