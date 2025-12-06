import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // Derive global config
  const [globalConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    PUMP
  );
  
  console.log('Global Config:', globalConfig.toBase58());
  
  const globalInfo = await conn.getAccountInfo(globalConfig);
  if (globalInfo) {
    console.log('\nGlobal config data length:', globalInfo.data.length);
    console.log('Owner:', globalInfo.owner.toBase58());
    
    // The known position 1 addresses
    const pos1_Token = new PublicKey('6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs');
    const pos1_T2022 = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
    
    // Search for them in global config
    console.log('\nSearching for known position 1 addresses in global config:');
    
    for (let i = 0; i <= globalInfo.data.length - 32; i++) {
      const pk = new PublicKey(globalInfo.data.slice(i, i + 32));
      if (pk.equals(pos1_Token)) {
        console.log(`Found Token position1 at offset ${i}`);
      }
      if (pk.equals(pos1_T2022)) {
        console.log(`Found Token-2022 position1 at offset ${i}`);
      }
    }
    
    // Dump all pubkeys in the global config
    console.log('\n=== All pubkeys in global config ===');
    console.log('Offset 0-8 (discriminator):', globalInfo.data.slice(0, 8).toString('hex'));
    
    for (let i = 8; i + 32 <= globalInfo.data.length; i += 32) {
      const pk = new PublicKey(globalInfo.data.slice(i, i + 32));
      if (!pk.equals(PublicKey.default)) {
        console.log(`Offset ${i.toString().padStart(3)}: ${pk.toBase58()}`);
      }
    }
    
    // Also try reading at specific known offsets
    console.log('\n=== Trying specific offsets ===');
    
    // Try reading various u8/u64 values
    if (globalInfo.data.length > 8) {
      // First let me try to understand the structure
      // Usually: discriminator (8) + fields
      
      // Try to read some booleans and u64s
      let offset = 8;
      
      // Read status/initialized
      console.log(`Offset ${offset} (u8):`, globalInfo.data.readUInt8(offset));
      offset += 1;
      
      // Read authority (32 bytes)
      if (offset + 32 <= globalInfo.data.length) {
        const auth = new PublicKey(globalInfo.data.slice(offset, offset + 32));
        console.log(`Offset ${offset} (authority?):`, auth.toBase58());
        offset += 32;
      }
      
      // Read fee_recipient (32 bytes)
      if (offset + 32 <= globalInfo.data.length) {
        const feeRec = new PublicKey(globalInfo.data.slice(offset, offset + 32));
        console.log(`Offset ${offset} (fee_recipient?):`, feeRec.toBase58());
        offset += 32;
      }
      
      // Continue reading pubkeys
      while (offset + 32 <= globalInfo.data.length) {
        const pk = new PublicKey(globalInfo.data.slice(offset, offset + 32));
        console.log(`Offset ${offset}:`, pk.toBase58());
        offset += 32;
      }
    }
  }
}

main().catch(console.error);


import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // Derive global config
  const [globalConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    PUMP
  );
  
  console.log('Global Config:', globalConfig.toBase58());
  
  const globalInfo = await conn.getAccountInfo(globalConfig);
  if (globalInfo) {
    console.log('\nGlobal config data length:', globalInfo.data.length);
    console.log('Owner:', globalInfo.owner.toBase58());
    
    // The known position 1 addresses
    const pos1_Token = new PublicKey('6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs');
    const pos1_T2022 = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
    
    // Search for them in global config
    console.log('\nSearching for known position 1 addresses in global config:');
    
    for (let i = 0; i <= globalInfo.data.length - 32; i++) {
      const pk = new PublicKey(globalInfo.data.slice(i, i + 32));
      if (pk.equals(pos1_Token)) {
        console.log(`Found Token position1 at offset ${i}`);
      }
      if (pk.equals(pos1_T2022)) {
        console.log(`Found Token-2022 position1 at offset ${i}`);
      }
    }
    
    // Dump all pubkeys in the global config
    console.log('\n=== All pubkeys in global config ===');
    console.log('Offset 0-8 (discriminator):', globalInfo.data.slice(0, 8).toString('hex'));
    
    for (let i = 8; i + 32 <= globalInfo.data.length; i += 32) {
      const pk = new PublicKey(globalInfo.data.slice(i, i + 32));
      if (!pk.equals(PublicKey.default)) {
        console.log(`Offset ${i.toString().padStart(3)}: ${pk.toBase58()}`);
      }
    }
    
    // Also try reading at specific known offsets
    console.log('\n=== Trying specific offsets ===');
    
    // Try reading various u8/u64 values
    if (globalInfo.data.length > 8) {
      // First let me try to understand the structure
      // Usually: discriminator (8) + fields
      
      // Try to read some booleans and u64s
      let offset = 8;
      
      // Read status/initialized
      console.log(`Offset ${offset} (u8):`, globalInfo.data.readUInt8(offset));
      offset += 1;
      
      // Read authority (32 bytes)
      if (offset + 32 <= globalInfo.data.length) {
        const auth = new PublicKey(globalInfo.data.slice(offset, offset + 32));
        console.log(`Offset ${offset} (authority?):`, auth.toBase58());
        offset += 32;
      }
      
      // Read fee_recipient (32 bytes)
      if (offset + 32 <= globalInfo.data.length) {
        const feeRec = new PublicKey(globalInfo.data.slice(offset, offset + 32));
        console.log(`Offset ${offset} (fee_recipient?):`, feeRec.toBase58());
        offset += 32;
      }
      
      // Continue reading pubkeys
      while (offset + 32 <= globalInfo.data.length) {
        const pk = new PublicKey(globalInfo.data.slice(offset, offset + 32));
        console.log(`Offset ${offset}:`, pk.toBase58());
        offset += 32;
      }
    }
  }
}

main().catch(console.error);


