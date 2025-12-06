import { Connection, PublicKey } from '@solana/web3.js';

async function main() {
  const conn = new Connection(process.env.SOLANA_RPC_URL!);
  const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  
  // Two different mints from the buy transactions
  const cases = [
    { 
      mint: 'Agp692r66dgj7Y6CDzSiokC1Aw9D5ezT3hNhFxdDpump',
      solVault: '62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV'
    },
    // Need another case - let me get from second tx
  ];
  
  for (const c of cases) {
    const mint = new PublicKey(c.mint);
    const target = new PublicKey(c.solVault);
    
    // Derive bonding curve
    const [bondingCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), mint.toBuffer()],
      PUMP
    );
    
    console.log(`\nMint: ${c.mint.slice(0, 16)}...`);
    console.log(`Bonding curve: ${bondingCurve.toBase58()}`);
    console.log(`Target SOL vault: ${target.toBase58()}`);
    
    // Try seeds with bonding curve
    const seedsToTry: Buffer[][] = [
      [bondingCurve.toBuffer()],
      [Buffer.from('sol'), bondingCurve.toBuffer()],
      [bondingCurve.toBuffer(), Buffer.from('sol')],
      [Buffer.from('pool'), bondingCurve.toBuffer()],
      [bondingCurve.toBuffer(), Buffer.from('pool')],
      [Buffer.from('liquidity'), bondingCurve.toBuffer()],
    ];
    
    for (const seeds of seedsToTry) {
      const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
      if (pda.equals(target)) {
        console.log('✓ FOUND! Seeds:', seeds.map(s => s.slice(0, 10).toString('hex')));
      }
    }
  }
  
  // Let me also check our target token
  console.log('\n\n--- Our target token ---');
  const ourMint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  const [ourBondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), ourMint.toBuffer()],
    PUMP
  );
  console.log('Our bonding curve:', ourBondingCurve.toBase58());
  
  // Try to find SOL vault for our token by checking bonding curve account
  const bcInfo = await conn.getAccountInfo(ourBondingCurve);
  if (bcInfo) {
    console.log('Bonding curve data length:', bcInfo.data.length);
    
    // The SOL vault might be a separate account that we need to find
    // Let me check if there's a pattern with creator vault
    const creator = new PublicKey(bcInfo.data.slice(49, 81));
    console.log('Creator:', creator.toBase58());
    
    // Creator vault
    const [creatorVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('creator-vault'), creator.toBuffer()],
      PUMP
    );
    console.log('Creator vault:', creatorVault.toBase58());
  }
}

main().catch(console.error);



async function main() {
  const conn = new Connection(process.env.SOLANA_RPC_URL!);
  const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  
  // Two different mints from the buy transactions
  const cases = [
    { 
      mint: 'Agp692r66dgj7Y6CDzSiokC1Aw9D5ezT3hNhFxdDpump',
      solVault: '62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV'
    },
    // Need another case - let me get from second tx
  ];
  
  for (const c of cases) {
    const mint = new PublicKey(c.mint);
    const target = new PublicKey(c.solVault);
    
    // Derive bonding curve
    const [bondingCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), mint.toBuffer()],
      PUMP
    );
    
    console.log(`\nMint: ${c.mint.slice(0, 16)}...`);
    console.log(`Bonding curve: ${bondingCurve.toBase58()}`);
    console.log(`Target SOL vault: ${target.toBase58()}`);
    
    // Try seeds with bonding curve
    const seedsToTry: Buffer[][] = [
      [bondingCurve.toBuffer()],
      [Buffer.from('sol'), bondingCurve.toBuffer()],
      [bondingCurve.toBuffer(), Buffer.from('sol')],
      [Buffer.from('pool'), bondingCurve.toBuffer()],
      [bondingCurve.toBuffer(), Buffer.from('pool')],
      [Buffer.from('liquidity'), bondingCurve.toBuffer()],
    ];
    
    for (const seeds of seedsToTry) {
      const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
      if (pda.equals(target)) {
        console.log('✓ FOUND! Seeds:', seeds.map(s => s.slice(0, 10).toString('hex')));
      }
    }
  }
  
  // Let me also check our target token
  console.log('\n\n--- Our target token ---');
  const ourMint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  const [ourBondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), ourMint.toBuffer()],
    PUMP
  );
  console.log('Our bonding curve:', ourBondingCurve.toBase58());
  
  // Try to find SOL vault for our token by checking bonding curve account
  const bcInfo = await conn.getAccountInfo(ourBondingCurve);
  if (bcInfo) {
    console.log('Bonding curve data length:', bcInfo.data.length);
    
    // The SOL vault might be a separate account that we need to find
    // Let me check if there's a pattern with creator vault
    const creator = new PublicKey(bcInfo.data.slice(49, 81));
    console.log('Creator:', creator.toBase58());
    
    // Creator vault
    const [creatorVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('creator-vault'), creator.toBuffer()],
      PUMP
    );
    console.log('Creator vault:', creatorVault.toBase58());
  }
}

main().catch(console.error);


