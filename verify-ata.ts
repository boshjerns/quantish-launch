import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  const mint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  
  // Derive bonding curve
  const [bondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMP
  );
  
  console.log('Mint:', mint.toBase58());
  console.log('Bonding Curve:', bondingCurve.toBase58());
  
  // Get the Token-2022 ATA for bonding curve
  const ata_t2022 = getAssociatedTokenAddressSync(
    mint,
    bondingCurve,
    true, // allowOwnerOffCurve for PDAs
    TOKEN_2022_PROGRAM_ID
  );
  
  // Get the SPL Token ATA for bonding curve
  const ata_spl = getAssociatedTokenAddressSync(
    mint,
    bondingCurve,
    true,
    TOKEN_PROGRAM_ID
  );
  
  console.log('\nATA with Token-2022:', ata_t2022.toBase58());
  console.log('ATA with SPL Token:', ata_spl.toBase58());
  
  // Check which one exists
  const info_t2022 = await conn.getAccountInfo(ata_t2022);
  const info_spl = await conn.getAccountInfo(ata_spl);
  
  console.log('\nToken-2022 ATA exists:', !!info_t2022);
  console.log('SPL Token ATA exists:', !!info_spl);
  
  if (info_t2022) {
    console.log('Token-2022 ATA owner:', info_t2022.owner.toBase58());
  }
  
  // Check bonding curve data for the actual token account stored
  const bcInfo = await conn.getAccountInfo(bondingCurve);
  if (bcInfo) {
    console.log('\nBonding curve data length:', bcInfo.data.length);
  }
}

main().catch(console.error);


import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  const mint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  
  // Derive bonding curve
  const [bondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMP
  );
  
  console.log('Mint:', mint.toBase58());
  console.log('Bonding Curve:', bondingCurve.toBase58());
  
  // Get the Token-2022 ATA for bonding curve
  const ata_t2022 = getAssociatedTokenAddressSync(
    mint,
    bondingCurve,
    true, // allowOwnerOffCurve for PDAs
    TOKEN_2022_PROGRAM_ID
  );
  
  // Get the SPL Token ATA for bonding curve
  const ata_spl = getAssociatedTokenAddressSync(
    mint,
    bondingCurve,
    true,
    TOKEN_PROGRAM_ID
  );
  
  console.log('\nATA with Token-2022:', ata_t2022.toBase58());
  console.log('ATA with SPL Token:', ata_spl.toBase58());
  
  // Check which one exists
  const info_t2022 = await conn.getAccountInfo(ata_t2022);
  const info_spl = await conn.getAccountInfo(ata_spl);
  
  console.log('\nToken-2022 ATA exists:', !!info_t2022);
  console.log('SPL Token ATA exists:', !!info_spl);
  
  if (info_t2022) {
    console.log('Token-2022 ATA owner:', info_t2022.owner.toBase58());
  }
  
  // Check bonding curve data for the actual token account stored
  const bcInfo = await conn.getAccountInfo(bondingCurve);
  if (bcInfo) {
    console.log('\nBonding curve data length:', bcInfo.data.length);
  }
}

main().catch(console.error);


