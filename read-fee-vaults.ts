import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // Known fee vaults
  const feeVault_Token = new PublicKey('6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs');
  const feeVault_Token2022 = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
  
  // Derive global config
  const [globalConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    PUMP
  );
  
  console.log('Global Config:', globalConfig.toBase58());
  
  const globalInfo = await conn.getAccountInfo(globalConfig);
  if (!globalInfo) return;
  
  console.log('Data length:', globalInfo.data.length);
  
  // Read at exact offset 290 where Token-2022 vault was found
  const pos290 = new PublicKey(globalInfo.data.slice(290, 322));
  console.log('\nOffset 290-322:', pos290.toBase58());
  console.log('Matches Token-2022 vault:', pos290.equals(feeVault_Token2022));
  
  // Search for Token vault
  console.log('\nSearching for Token fee vault...');
  for (let i = 0; i <= globalInfo.data.length - 32; i++) {
    const pk = new PublicKey(globalInfo.data.slice(i, i + 32));
    if (pk.equals(feeVault_Token)) {
      console.log(`Found Token vault at offset ${i}`);
      // Read the byte pattern around it
      console.log('  Bytes before:', globalInfo.data.slice(Math.max(0, i-8), i).toString('hex'));
    }
  }
  
  // Check if Token vault might be derived differently
  console.log('\n=== Checking fee vault derivations ===');
  
  // Try deriving with various seeds
  const seedsToTry = [
    [Buffer.from('fee-vault')],
    [Buffer.from('fee_vault')],
    [Buffer.from('fee-sol-vault')],
    [Buffer.from('fee_sol_vault')],
    [Buffer.from('sol-fee')],
  ];
  
  for (const seeds of seedsToTry) {
    const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
    console.log(`[${seeds[0].toString()}]: ${pda.toBase58()}`);
  }
  
  // The Token vault is System-owned with 80 bytes of data - maybe it's a nonce account?
  console.log('\n=== Token vault account info ===');
  const tokenVaultInfo = await conn.getAccountInfo(feeVault_Token);
  if (tokenVaultInfo) {
    console.log('Owner:', tokenVaultInfo.owner.toBase58());
    console.log('Data length:', tokenVaultInfo.data.length);
    console.log('Lamports:', tokenVaultInfo.lamports);
    
    // Check if it's derived from a lookup table or something
    if (tokenVaultInfo.data.length === 80) {
      // Might be a durable nonce account
      console.log('Data (first 32 bytes):', tokenVaultInfo.data.slice(0, 32).toString('hex'));
    }
  }
  
  // For our target token, we need Token-2022 vault
  console.log('\n=== Summary for our Token-2022 token ===');
  console.log('Token-2022 Fee Sol Vault: CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
  console.log('This should be used at position 1 for Token-2022 tokens');
}

main().catch(console.error);


import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // Known fee vaults
  const feeVault_Token = new PublicKey('6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs');
  const feeVault_Token2022 = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
  
  // Derive global config
  const [globalConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    PUMP
  );
  
  console.log('Global Config:', globalConfig.toBase58());
  
  const globalInfo = await conn.getAccountInfo(globalConfig);
  if (!globalInfo) return;
  
  console.log('Data length:', globalInfo.data.length);
  
  // Read at exact offset 290 where Token-2022 vault was found
  const pos290 = new PublicKey(globalInfo.data.slice(290, 322));
  console.log('\nOffset 290-322:', pos290.toBase58());
  console.log('Matches Token-2022 vault:', pos290.equals(feeVault_Token2022));
  
  // Search for Token vault
  console.log('\nSearching for Token fee vault...');
  for (let i = 0; i <= globalInfo.data.length - 32; i++) {
    const pk = new PublicKey(globalInfo.data.slice(i, i + 32));
    if (pk.equals(feeVault_Token)) {
      console.log(`Found Token vault at offset ${i}`);
      // Read the byte pattern around it
      console.log('  Bytes before:', globalInfo.data.slice(Math.max(0, i-8), i).toString('hex'));
    }
  }
  
  // Check if Token vault might be derived differently
  console.log('\n=== Checking fee vault derivations ===');
  
  // Try deriving with various seeds
  const seedsToTry = [
    [Buffer.from('fee-vault')],
    [Buffer.from('fee_vault')],
    [Buffer.from('fee-sol-vault')],
    [Buffer.from('fee_sol_vault')],
    [Buffer.from('sol-fee')],
  ];
  
  for (const seeds of seedsToTry) {
    const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
    console.log(`[${seeds[0].toString()}]: ${pda.toBase58()}`);
  }
  
  // The Token vault is System-owned with 80 bytes of data - maybe it's a nonce account?
  console.log('\n=== Token vault account info ===');
  const tokenVaultInfo = await conn.getAccountInfo(feeVault_Token);
  if (tokenVaultInfo) {
    console.log('Owner:', tokenVaultInfo.owner.toBase58());
    console.log('Data length:', tokenVaultInfo.data.length);
    console.log('Lamports:', tokenVaultInfo.lamports);
    
    // Check if it's derived from a lookup table or something
    if (tokenVaultInfo.data.length === 80) {
      // Might be a durable nonce account
      console.log('Data (first 32 bytes):', tokenVaultInfo.data.slice(0, 32).toString('hex'));
    }
  }
  
  // For our target token, we need Token-2022 vault
  console.log('\n=== Summary for our Token-2022 token ===');
  console.log('Token-2022 Fee Sol Vault: CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
  console.log('This should be used at position 1 for Token-2022 tokens');
}

main().catch(console.error);


