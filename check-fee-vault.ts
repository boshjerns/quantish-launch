import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // The fee_sol_vault from the successful transaction
  const target = new PublicKey('FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz');
  
  // The creator from that token
  const creator = new PublicKey('FsFCrYiRpwju3wg3SDYCqnVNFXwoy3SVC6bBhjRETFmj');
  
  console.log('Target fee_sol_vault:', target.toBase58());
  console.log('Creator:', creator.toBase58());
  
  // Try creator-vault seed (same as what we use for creatorVault but maybe different)
  const seeds = [
    [Buffer.from('sol_vault'), creator.toBuffer()],
    [Buffer.from('fee_vault'), creator.toBuffer()],
    [Buffer.from('creator_sol_vault'), creator.toBuffer()],
    [creator.toBuffer(), Buffer.from('sol')],
    [creator.toBuffer()],
  ];
  
  console.log('\nPDA Tests:');
  for (const s of seeds) {
    try {
      const [pda] = PublicKey.findProgramAddressSync(s, PUMP);
      const match = pda.equals(target) ? 'MATCH!' : '';
      console.log(`${JSON.stringify(s.map(b => b.slice(0,10).toString('hex')))}: ${pda.toBase58().slice(0,15)}... ${match}`);
    } catch {}
  }
  
  // Check our token
  const ourCreator = new PublicKey('GVM9i9d7kptnEXVszu5hCUKPanGZqDXbiG7nbSQ3h83N');
  console.log('\nOur creator:', ourCreator.toBase58());
  
  // Try the same derivations for our creator
  for (const seedTemplate of ['sol_vault', 'fee_vault']) {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from(seedTemplate), ourCreator.toBuffer()],
      PUMP
    );
    const info = await conn.getAccountInfo(pda);
    console.log(`${seedTemplate} + creator: ${pda.toBase58().slice(0,15)}... exists=${!!info}`);
  }
}

main().catch(console.error);


import { config } from './src/config/index.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  
  // The fee_sol_vault from the successful transaction
  const target = new PublicKey('FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz');
  
  // The creator from that token
  const creator = new PublicKey('FsFCrYiRpwju3wg3SDYCqnVNFXwoy3SVC6bBhjRETFmj');
  
  console.log('Target fee_sol_vault:', target.toBase58());
  console.log('Creator:', creator.toBase58());
  
  // Try creator-vault seed (same as what we use for creatorVault but maybe different)
  const seeds = [
    [Buffer.from('sol_vault'), creator.toBuffer()],
    [Buffer.from('fee_vault'), creator.toBuffer()],
    [Buffer.from('creator_sol_vault'), creator.toBuffer()],
    [creator.toBuffer(), Buffer.from('sol')],
    [creator.toBuffer()],
  ];
  
  console.log('\nPDA Tests:');
  for (const s of seeds) {
    try {
      const [pda] = PublicKey.findProgramAddressSync(s, PUMP);
      const match = pda.equals(target) ? 'MATCH!' : '';
      console.log(`${JSON.stringify(s.map(b => b.slice(0,10).toString('hex')))}: ${pda.toBase58().slice(0,15)}... ${match}`);
    } catch {}
  }
  
  // Check our token
  const ourCreator = new PublicKey('GVM9i9d7kptnEXVszu5hCUKPanGZqDXbiG7nbSQ3h83N');
  console.log('\nOur creator:', ourCreator.toBase58());
  
  // Try the same derivations for our creator
  for (const seedTemplate of ['sol_vault', 'fee_vault']) {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from(seedTemplate), ourCreator.toBuffer()],
      PUMP
    );
    const info = await conn.getAccountInfo(pda);
    console.log(`${seedTemplate} + creator: ${pda.toBase58().slice(0,15)}... exists=${!!info}`);
  }
}

main().catch(console.error);


