import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { config } from './src/config/index.js';
import { getAllKeypairs } from './src/wallet/generator.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
  const wallets = getAllKeypairs(password);
  const user = wallets[0].publicKey;
  
  // Our token
  const mint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  
  // Get bonding curve data
  const [bondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMP
  );
  
  const bcInfo = await conn.getAccountInfo(bondingCurve);
  if (!bcInfo) {
    console.log('Bonding curve not found');
    return;
  }
  
  const creator = new PublicKey(bcInfo.data.slice(49, 81));
  
  // Derive all accounts
  const [global] = PublicKey.findProgramAddressSync([Buffer.from('global')], PUMP);
  const feeSolVaultT2022 = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
  const associatedBondingCurve = getAssociatedTokenAddressSync(mint, bondingCurve, true, TOKEN_2022_PROGRAM_ID);
  const associatedUser = getAssociatedTokenAddressSync(mint, user, false, TOKEN_2022_PROGRAM_ID);
  const [eventAuthority] = PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], PUMP);
  const [globalVolume] = PublicKey.findProgramAddressSync([Buffer.from('global_volume_accumulator')], PUMP);
  const [creatorVault] = PublicKey.findProgramAddressSync([Buffer.from('creator-vault'), creator.toBuffer()], PUMP);
  const feeRecipientVault = new PublicKey('8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt');
  const feeRecipient = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');
  
  console.log('=== OUR DERIVED ACCOUNTS ===\n');
  console.log('Position | Our Value');
  console.log('-'.repeat(70));
  console.log(` 0 global:                    ${global.toBase58()}`);
  console.log(` 1 fee_sol_vault:             ${feeSolVaultT2022.toBase58()}`);
  console.log(` 2 mint:                      ${mint.toBase58()}`);
  console.log(` 3 bonding_curve:             ${bondingCurve.toBase58()}`);
  console.log(` 4 associated_bonding_curve:  ${associatedBondingCurve.toBase58()}`);
  console.log(` 5 associated_user:           ${associatedUser.toBase58()}`);
  console.log(` 6 user:                      ${user.toBase58()}`);
  console.log(` 7 system_program:            11111111111111111111111111111111`);
  console.log(` 8 token_program:             ${TOKEN_2022_PROGRAM_ID.toBase58()}`);
  console.log(` 9 coin_creator:              ${creator.toBase58()}`);
  console.log(`10 event_authority:           ${eventAuthority.toBase58()}`);
  console.log(`11 program:                   ${PUMP.toBase58()}`);
  console.log(`12 global_volume:             ${globalVolume.toBase58()}`);
  console.log(`13 creator_vault:             ${creatorVault.toBase58()}`);
  console.log(`14 fee_recipient_vault:       ${feeRecipientVault.toBase58()}`);
  console.log(`15 fee_recipient:             ${feeRecipient.toBase58()}`);
  
  // Compare with successful Token-2022 transaction
  console.log('\n\n=== SUCCESSFUL TX ACCOUNTS (from earlier analysis) ===\n');
  const successfulAccounts = [
    '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf', // 0: global
    'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM', // 1: fee_sol_vault (Token-2022)
    'FxTcPAWoxkiU7Lo2JctKxoiucNRU7vwztzW4cKf5pump', // 2: mint (different token)
    '2grgAUkbnPWbAaMvnhcY92JVm3GhwZ2K6Z4ah5n9SRUJ', // 3: bonding_curve
    'Gok1J2dFQdfLDv62zCMbqYQxyTVhEE5NWPkDUKSQgcHV', // 4: associated_bonding_curve
    '2upzGHVAMXiukXmLbbzotNPUVfVbq9MUwtQtGwmkmDgq', // 5: associated_user
    '46iaV6bdqCzbrE65unWjzMypwsmp8gWWz25DmSVRgA11', // 6: user
    '11111111111111111111111111111111',              // 7: system
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',  // 8: Token-2022 program
    '4fP82iS5ySwsskDPeerHugjQJ2iRAu3yoW9PrY9LCsof', // 9: coin_creator
    'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1', // 10: event_auth
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',  // 11: program
    'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y', // 12: global_volume
    '5UTEmoUtTkr4owhxTF5F5u7ygKZ4aBRcVLqwHY4anYEX', // 13: creator_vault
    '8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt', // 14: fee_recipient_vault
    'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ',  // 15: fee_recipient
  ];
  
  for (let i = 0; i < successfulAccounts.length; i++) {
    console.log(`${i.toString().padStart(2)}: ${successfulAccounts[i]}`);
  }
  
  // Check matches
  console.log('\n\n=== VERIFICATION ===\n');
  console.log('Global matches:', global.toBase58() === successfulAccounts[0] ? '✓' : '✗');
  console.log('Fee sol vault matches:', feeSolVaultT2022.toBase58() === successfulAccounts[1] ? '✓' : '✗');
  console.log('Token-2022 program matches:', TOKEN_2022_PROGRAM_ID.toBase58() === successfulAccounts[8] ? '✓' : '✗');
  console.log('Event authority matches:', eventAuthority.toBase58() === successfulAccounts[10] ? '✓' : '✗');
  console.log('Program matches:', PUMP.toBase58() === successfulAccounts[11] ? '✓' : '✗');
  console.log('Global volume matches:', globalVolume.toBase58() === successfulAccounts[12] ? '✓' : '✗');
  console.log('Fee recipient vault matches:', feeRecipientVault.toBase58() === successfulAccounts[14] ? '✓' : '✗');
  console.log('Fee recipient matches:', feeRecipient.toBase58() === successfulAccounts[15] ? '✓' : '✗');
  
  // Check if any accounts don't exist
  console.log('\n=== ACCOUNT EXISTENCE CHECK ===\n');
  
  const accountsToCheck = [
    { name: 'global', pk: global },
    { name: 'fee_sol_vault_t2022', pk: feeSolVaultT2022 },
    { name: 'associated_bonding_curve', pk: associatedBondingCurve },
    { name: 'event_authority', pk: eventAuthority },
    { name: 'global_volume', pk: globalVolume },
    { name: 'creator_vault', pk: creatorVault },
    { name: 'fee_recipient_vault', pk: feeRecipientVault },
  ];
  
  for (const acct of accountsToCheck) {
    const info = await conn.getAccountInfo(acct.pk);
    console.log(`${acct.name.padEnd(25)}: ${info ? '✓ exists' : '✗ NOT FOUND'}`);
  }
}

main().catch(console.error);


import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { config } from './src/config/index.js';
import { getAllKeypairs } from './src/wallet/generator.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
  const wallets = getAllKeypairs(password);
  const user = wallets[0].publicKey;
  
  // Our token
  const mint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  
  // Get bonding curve data
  const [bondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMP
  );
  
  const bcInfo = await conn.getAccountInfo(bondingCurve);
  if (!bcInfo) {
    console.log('Bonding curve not found');
    return;
  }
  
  const creator = new PublicKey(bcInfo.data.slice(49, 81));
  
  // Derive all accounts
  const [global] = PublicKey.findProgramAddressSync([Buffer.from('global')], PUMP);
  const feeSolVaultT2022 = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
  const associatedBondingCurve = getAssociatedTokenAddressSync(mint, bondingCurve, true, TOKEN_2022_PROGRAM_ID);
  const associatedUser = getAssociatedTokenAddressSync(mint, user, false, TOKEN_2022_PROGRAM_ID);
  const [eventAuthority] = PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], PUMP);
  const [globalVolume] = PublicKey.findProgramAddressSync([Buffer.from('global_volume_accumulator')], PUMP);
  const [creatorVault] = PublicKey.findProgramAddressSync([Buffer.from('creator-vault'), creator.toBuffer()], PUMP);
  const feeRecipientVault = new PublicKey('8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt');
  const feeRecipient = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');
  
  console.log('=== OUR DERIVED ACCOUNTS ===\n');
  console.log('Position | Our Value');
  console.log('-'.repeat(70));
  console.log(` 0 global:                    ${global.toBase58()}`);
  console.log(` 1 fee_sol_vault:             ${feeSolVaultT2022.toBase58()}`);
  console.log(` 2 mint:                      ${mint.toBase58()}`);
  console.log(` 3 bonding_curve:             ${bondingCurve.toBase58()}`);
  console.log(` 4 associated_bonding_curve:  ${associatedBondingCurve.toBase58()}`);
  console.log(` 5 associated_user:           ${associatedUser.toBase58()}`);
  console.log(` 6 user:                      ${user.toBase58()}`);
  console.log(` 7 system_program:            11111111111111111111111111111111`);
  console.log(` 8 token_program:             ${TOKEN_2022_PROGRAM_ID.toBase58()}`);
  console.log(` 9 coin_creator:              ${creator.toBase58()}`);
  console.log(`10 event_authority:           ${eventAuthority.toBase58()}`);
  console.log(`11 program:                   ${PUMP.toBase58()}`);
  console.log(`12 global_volume:             ${globalVolume.toBase58()}`);
  console.log(`13 creator_vault:             ${creatorVault.toBase58()}`);
  console.log(`14 fee_recipient_vault:       ${feeRecipientVault.toBase58()}`);
  console.log(`15 fee_recipient:             ${feeRecipient.toBase58()}`);
  
  // Compare with successful Token-2022 transaction
  console.log('\n\n=== SUCCESSFUL TX ACCOUNTS (from earlier analysis) ===\n');
  const successfulAccounts = [
    '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf', // 0: global
    'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM', // 1: fee_sol_vault (Token-2022)
    'FxTcPAWoxkiU7Lo2JctKxoiucNRU7vwztzW4cKf5pump', // 2: mint (different token)
    '2grgAUkbnPWbAaMvnhcY92JVm3GhwZ2K6Z4ah5n9SRUJ', // 3: bonding_curve
    'Gok1J2dFQdfLDv62zCMbqYQxyTVhEE5NWPkDUKSQgcHV', // 4: associated_bonding_curve
    '2upzGHVAMXiukXmLbbzotNPUVfVbq9MUwtQtGwmkmDgq', // 5: associated_user
    '46iaV6bdqCzbrE65unWjzMypwsmp8gWWz25DmSVRgA11', // 6: user
    '11111111111111111111111111111111',              // 7: system
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',  // 8: Token-2022 program
    '4fP82iS5ySwsskDPeerHugjQJ2iRAu3yoW9PrY9LCsof', // 9: coin_creator
    'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1', // 10: event_auth
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',  // 11: program
    'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y', // 12: global_volume
    '5UTEmoUtTkr4owhxTF5F5u7ygKZ4aBRcVLqwHY4anYEX', // 13: creator_vault
    '8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt', // 14: fee_recipient_vault
    'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ',  // 15: fee_recipient
  ];
  
  for (let i = 0; i < successfulAccounts.length; i++) {
    console.log(`${i.toString().padStart(2)}: ${successfulAccounts[i]}`);
  }
  
  // Check matches
  console.log('\n\n=== VERIFICATION ===\n');
  console.log('Global matches:', global.toBase58() === successfulAccounts[0] ? '✓' : '✗');
  console.log('Fee sol vault matches:', feeSolVaultT2022.toBase58() === successfulAccounts[1] ? '✓' : '✗');
  console.log('Token-2022 program matches:', TOKEN_2022_PROGRAM_ID.toBase58() === successfulAccounts[8] ? '✓' : '✗');
  console.log('Event authority matches:', eventAuthority.toBase58() === successfulAccounts[10] ? '✓' : '✗');
  console.log('Program matches:', PUMP.toBase58() === successfulAccounts[11] ? '✓' : '✗');
  console.log('Global volume matches:', globalVolume.toBase58() === successfulAccounts[12] ? '✓' : '✗');
  console.log('Fee recipient vault matches:', feeRecipientVault.toBase58() === successfulAccounts[14] ? '✓' : '✗');
  console.log('Fee recipient matches:', feeRecipient.toBase58() === successfulAccounts[15] ? '✓' : '✗');
  
  // Check if any accounts don't exist
  console.log('\n=== ACCOUNT EXISTENCE CHECK ===\n');
  
  const accountsToCheck = [
    { name: 'global', pk: global },
    { name: 'fee_sol_vault_t2022', pk: feeSolVaultT2022 },
    { name: 'associated_bonding_curve', pk: associatedBondingCurve },
    { name: 'event_authority', pk: eventAuthority },
    { name: 'global_volume', pk: globalVolume },
    { name: 'creator_vault', pk: creatorVault },
    { name: 'fee_recipient_vault', pk: feeRecipientVault },
  ];
  
  for (const acct of accountsToCheck) {
    const info = await conn.getAccountInfo(acct.pk);
    console.log(`${acct.name.padEnd(25)}: ${info ? '✓ exists' : '✗ NOT FOUND'}`);
  }
}

main().catch(console.error);


