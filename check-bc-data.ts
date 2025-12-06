import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // Check bonding curve data for Token-2022 token
  const bondingCurve_T2022 = new PublicKey('2grgAUkbnPWbAaMvnhcY92JVm3GhwZ2K6Z4ah5n9SRUJ');
  const position1_T2022 = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
  
  console.log('=== Token-2022 Bonding Curve Data ===\n');
  
  const bcInfo = await conn.getAccountInfo(bondingCurve_T2022);
  if (bcInfo) {
    console.log('Data length:', bcInfo.data.length);
    
    // Try to find position1 pubkey in the data
    const pos1Bytes = position1_T2022.toBuffer();
    for (let i = 0; i <= bcInfo.data.length - 32; i++) {
      const slice = bcInfo.data.slice(i, i + 32);
      if (slice.equals(pos1Bytes)) {
        console.log(`Found position1 at offset ${i}!`);
      }
    }
    
    // Dump full layout
    console.log('\nBonding curve layout:');
    console.log('Offset 0-8 (discriminator):', bcInfo.data.slice(0, 8).toString('hex'));
    console.log('Offset 8-16 (u64):', bcInfo.data.readBigUInt64LE(8).toString());
    console.log('Offset 16-24 (u64):', bcInfo.data.readBigUInt64LE(16).toString());
    console.log('Offset 24-32 (u64):', bcInfo.data.readBigUInt64LE(24).toString());
    console.log('Offset 32-40 (u64):', bcInfo.data.readBigUInt64LE(32).toString());
    console.log('Offset 40-48 (u64):', bcInfo.data.readBigUInt64LE(40).toString());
    console.log('Offset 48 (bool):', bcInfo.data.readUInt8(48));
    
    // Creator at 49-81
    const creator = new PublicKey(bcInfo.data.slice(49, 81));
    console.log('Offset 49-81 (creator):', creator.toBase58());
    
    // Check if there's more data after creator
    if (bcInfo.data.length > 81) {
      console.log('\nAdditional data after creator:');
      for (let i = 81; i + 32 <= bcInfo.data.length; i += 32) {
        const pk = new PublicKey(bcInfo.data.slice(i, i + 32));
        console.log(`Offset ${i}-${i+32}:`, pk.toBase58());
        if (pk.equals(position1_T2022)) {
          console.log('  ^ THIS IS POSITION 1!');
        }
      }
    }
  }
  
  // Also check our token's bonding curve
  console.log('\n\n=== Our Token Bonding Curve Data ===\n');
  
  const ourMint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  const [ourBondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), ourMint.toBuffer()],
    PUMP
  );
  
  const ourBcInfo = await conn.getAccountInfo(ourBondingCurve);
  if (ourBcInfo) {
    console.log('Data length:', ourBcInfo.data.length);
    console.log('Offset 0-8 (discriminator):', ourBcInfo.data.slice(0, 8).toString('hex'));
    console.log('Offset 8-16 (virtual_token):', ourBcInfo.data.readBigUInt64LE(8).toString());
    console.log('Offset 16-24 (virtual_sol):', ourBcInfo.data.readBigUInt64LE(16).toString());
    
    const creator = new PublicKey(ourBcInfo.data.slice(49, 81));
    console.log('Offset 49-81 (creator):', creator.toBase58());
    
    // Check for additional pubkeys
    if (ourBcInfo.data.length > 81) {
      console.log('\nAdditional pubkeys:');
      for (let i = 81; i + 32 <= ourBcInfo.data.length; i += 32) {
        const pk = new PublicKey(ourBcInfo.data.slice(i, i + 32));
        console.log(`Offset ${i}-${i+32}:`, pk.toBase58());
      }
    }
  }
}

main().catch(console.error);


import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // Check bonding curve data for Token-2022 token
  const bondingCurve_T2022 = new PublicKey('2grgAUkbnPWbAaMvnhcY92JVm3GhwZ2K6Z4ah5n9SRUJ');
  const position1_T2022 = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
  
  console.log('=== Token-2022 Bonding Curve Data ===\n');
  
  const bcInfo = await conn.getAccountInfo(bondingCurve_T2022);
  if (bcInfo) {
    console.log('Data length:', bcInfo.data.length);
    
    // Try to find position1 pubkey in the data
    const pos1Bytes = position1_T2022.toBuffer();
    for (let i = 0; i <= bcInfo.data.length - 32; i++) {
      const slice = bcInfo.data.slice(i, i + 32);
      if (slice.equals(pos1Bytes)) {
        console.log(`Found position1 at offset ${i}!`);
      }
    }
    
    // Dump full layout
    console.log('\nBonding curve layout:');
    console.log('Offset 0-8 (discriminator):', bcInfo.data.slice(0, 8).toString('hex'));
    console.log('Offset 8-16 (u64):', bcInfo.data.readBigUInt64LE(8).toString());
    console.log('Offset 16-24 (u64):', bcInfo.data.readBigUInt64LE(16).toString());
    console.log('Offset 24-32 (u64):', bcInfo.data.readBigUInt64LE(24).toString());
    console.log('Offset 32-40 (u64):', bcInfo.data.readBigUInt64LE(32).toString());
    console.log('Offset 40-48 (u64):', bcInfo.data.readBigUInt64LE(40).toString());
    console.log('Offset 48 (bool):', bcInfo.data.readUInt8(48));
    
    // Creator at 49-81
    const creator = new PublicKey(bcInfo.data.slice(49, 81));
    console.log('Offset 49-81 (creator):', creator.toBase58());
    
    // Check if there's more data after creator
    if (bcInfo.data.length > 81) {
      console.log('\nAdditional data after creator:');
      for (let i = 81; i + 32 <= bcInfo.data.length; i += 32) {
        const pk = new PublicKey(bcInfo.data.slice(i, i + 32));
        console.log(`Offset ${i}-${i+32}:`, pk.toBase58());
        if (pk.equals(position1_T2022)) {
          console.log('  ^ THIS IS POSITION 1!');
        }
      }
    }
  }
  
  // Also check our token's bonding curve
  console.log('\n\n=== Our Token Bonding Curve Data ===\n');
  
  const ourMint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  const [ourBondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), ourMint.toBuffer()],
    PUMP
  );
  
  const ourBcInfo = await conn.getAccountInfo(ourBondingCurve);
  if (ourBcInfo) {
    console.log('Data length:', ourBcInfo.data.length);
    console.log('Offset 0-8 (discriminator):', ourBcInfo.data.slice(0, 8).toString('hex'));
    console.log('Offset 8-16 (virtual_token):', ourBcInfo.data.readBigUInt64LE(8).toString());
    console.log('Offset 16-24 (virtual_sol):', ourBcInfo.data.readBigUInt64LE(16).toString());
    
    const creator = new PublicKey(ourBcInfo.data.slice(49, 81));
    console.log('Offset 49-81 (creator):', creator.toBase58());
    
    // Check for additional pubkeys
    if (ourBcInfo.data.length > 81) {
      console.log('\nAdditional pubkeys:');
      for (let i = 81; i + 32 <= ourBcInfo.data.length; i += 32) {
        const pk = new PublicKey(ourBcInfo.data.slice(i, i + 32));
        console.log(`Offset ${i}-${i+32}:`, pk.toBase58());
      }
    }
  }
}

main().catch(console.error);


