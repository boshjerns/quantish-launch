import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  const [global] = PublicKey.findProgramAddressSync([Buffer.from('global')], PUMP);
  const info = await conn.getAccountInfo(global);
  
  if (!info) {
    console.log('Global account not found');
    return;
  }
  
  console.log('Global config address:', global.toBase58());
  console.log('Data length:', info.data.length);
  
  const data = info.data;
  
  // Parse the global struct based on the IDL
  // Global: initialized (bool), authority (pubkey), fee_recipient (pubkey), ...
  console.log('\n=== GLOBAL CONFIG DATA ===\n');
  
  const offsets = [
    { name: 'discriminator', offset: 0, length: 8 },
    { name: 'initialized', offset: 8, length: 1 },
    { name: 'authority', offset: 9, length: 32 },
    { name: 'fee_recipient', offset: 41, length: 32 },
    { name: 'initial_virtual_token_reserves', offset: 73, length: 8 },
    { name: 'initial_virtual_sol_reserves', offset: 81, length: 8 },
    { name: 'initial_real_token_reserves', offset: 89, length: 8 },
    { name: 'token_total_supply', offset: 97, length: 8 },
    { name: 'fee_basis_points', offset: 105, length: 8 },
  ];
  
  for (const { name, offset, length } of offsets) {
    if (offset + length > data.length) continue;
    
    if (length === 32) {
      const pk = new PublicKey(data.slice(offset, offset + 32));
      console.log(`${name.padEnd(35)}: ${pk.toBase58()}`);
    } else if (length === 8 && name !== 'discriminator') {
      const val = data.readBigUInt64LE(offset);
      console.log(`${name.padEnd(35)}: ${val.toString()}`);
    } else if (length === 1) {
      console.log(`${name.padEnd(35)}: ${data[offset] === 1}`);
    } else {
      console.log(`${name.padEnd(35)}: ${Array.from(data.slice(offset, offset + length)).join(', ')}`);
    }
  }
  
  // Check if there are more fields after the expected end
  const expectedEnd = 113;
  if (data.length > expectedEnd) {
    console.log('\n=== EXTRA DATA ===\n');
    console.log('Extra bytes:', data.length - expectedEnd);
    
    // Try to find more pubkeys
    for (let i = expectedEnd; i <= data.length - 32; i += 32) {
      try {
        const pk = new PublicKey(data.slice(i, i + 32));
        if (!pk.equals(PublicKey.default)) {
          console.log(`Offset ${i}: ${pk.toBase58()}`);
        }
      } catch {}
    }
  }
  
  // Look for the fee_sol_vault we found in successful tx
  const feeVaults = [
    'FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz',
    'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM',
    '62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV',
    '6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs',
  ];
  
  console.log('\n=== SEARCHING FOR FEE VAULTS ===\n');
  for (const addr of feeVaults) {
    const pk = new PublicKey(addr);
    const buf = pk.toBuffer();
    for (let i = 0; i <= data.length - 32; i++) {
      if (data.slice(i, i + 32).equals(buf)) {
        console.log(`Found ${addr.slice(0, 10)}... at offset ${i}`);
      }
    }
  }
}

main().catch(console.error);


import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  const [global] = PublicKey.findProgramAddressSync([Buffer.from('global')], PUMP);
  const info = await conn.getAccountInfo(global);
  
  if (!info) {
    console.log('Global account not found');
    return;
  }
  
  console.log('Global config address:', global.toBase58());
  console.log('Data length:', info.data.length);
  
  const data = info.data;
  
  // Parse the global struct based on the IDL
  // Global: initialized (bool), authority (pubkey), fee_recipient (pubkey), ...
  console.log('\n=== GLOBAL CONFIG DATA ===\n');
  
  const offsets = [
    { name: 'discriminator', offset: 0, length: 8 },
    { name: 'initialized', offset: 8, length: 1 },
    { name: 'authority', offset: 9, length: 32 },
    { name: 'fee_recipient', offset: 41, length: 32 },
    { name: 'initial_virtual_token_reserves', offset: 73, length: 8 },
    { name: 'initial_virtual_sol_reserves', offset: 81, length: 8 },
    { name: 'initial_real_token_reserves', offset: 89, length: 8 },
    { name: 'token_total_supply', offset: 97, length: 8 },
    { name: 'fee_basis_points', offset: 105, length: 8 },
  ];
  
  for (const { name, offset, length } of offsets) {
    if (offset + length > data.length) continue;
    
    if (length === 32) {
      const pk = new PublicKey(data.slice(offset, offset + 32));
      console.log(`${name.padEnd(35)}: ${pk.toBase58()}`);
    } else if (length === 8 && name !== 'discriminator') {
      const val = data.readBigUInt64LE(offset);
      console.log(`${name.padEnd(35)}: ${val.toString()}`);
    } else if (length === 1) {
      console.log(`${name.padEnd(35)}: ${data[offset] === 1}`);
    } else {
      console.log(`${name.padEnd(35)}: ${Array.from(data.slice(offset, offset + length)).join(', ')}`);
    }
  }
  
  // Check if there are more fields after the expected end
  const expectedEnd = 113;
  if (data.length > expectedEnd) {
    console.log('\n=== EXTRA DATA ===\n');
    console.log('Extra bytes:', data.length - expectedEnd);
    
    // Try to find more pubkeys
    for (let i = expectedEnd; i <= data.length - 32; i += 32) {
      try {
        const pk = new PublicKey(data.slice(i, i + 32));
        if (!pk.equals(PublicKey.default)) {
          console.log(`Offset ${i}: ${pk.toBase58()}`);
        }
      } catch {}
    }
  }
  
  // Look for the fee_sol_vault we found in successful tx
  const feeVaults = [
    'FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz',
    'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM',
    '62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV',
    '6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs',
  ];
  
  console.log('\n=== SEARCHING FOR FEE VAULTS ===\n');
  for (const addr of feeVaults) {
    const pk = new PublicKey(addr);
    const buf = pk.toBuffer();
    for (let i = 0; i <= data.length - 32; i++) {
      if (data.slice(i, i + 32).equals(buf)) {
        console.log(`Found ${addr.slice(0, 10)}... at offset ${i}`);
      }
    }
  }
}

main().catch(console.error);


