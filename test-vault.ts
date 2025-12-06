import { Connection, PublicKey } from '@solana/web3.js';

async function main() {
  const conn = new Connection(process.env.SOLANA_RPC_URL!);
  
  const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  
  // From successful transaction:
  // Mint: Agp692r66dgj7Y6CDzSiokC1Aw9D5ezT3hNhFxdDpump
  // Creator vault: BQhks26xWkCXjrxgg7Hj3aZkaTAZQC8wvZTzcJ8vnH5n
  
  const successMint = new PublicKey('Agp692r66dgj7Y6CDzSiokC1Aw9D5ezT3hNhFxdDpump');
  const successCreatorVault = new PublicKey('BQhks26xWkCXjrxgg7Hj3aZkaTAZQC8wvZTzcJ8vnH5n');
  
  // Get bonding curve for successful mint to find creator
  const [successBondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), successMint.toBuffer()],
    PUMP
  );
  
  const bcInfo = await conn.getAccountInfo(successBondingCurve);
  if (bcInfo) {
    const creator = new PublicKey(bcInfo.data.slice(49, 81));
    console.log('Creator from bonding curve:', creator.toBase58());
    
    // Try different seed combinations
    const seeds = [
      [Buffer.from('creator-vault'), creator.toBuffer()],
      [Buffer.from('creator_vault'), creator.toBuffer()],
      [Buffer.from('vault'), creator.toBuffer()],
      [Buffer.from('creator-vault'), successMint.toBuffer()],
      [Buffer.from('vault'), successMint.toBuffer()],
      [creator.toBuffer()],
      [Buffer.from('creator'), creator.toBuffer()],
    ];
    
    console.log('\nTrying seed combinations:');
    for (const seed of seeds) {
      const [pda] = PublicKey.findProgramAddressSync(seed, PUMP);
      const match = pda.equals(successCreatorVault) ? '✓ MATCH!' : '';
      console.log(`Seeds [${seed.map(s => s.toString().slice(0, 20) + '...').join(', ')}]: ${pda.toBase58()} ${match}`);
    }
  }
  
  // Also check the account at position 14 (8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt)
  console.log('\n\nLooking for what creates 8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt:');
  const target14 = new PublicKey('8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt');
  
  // Maybe it's derived from mint authority seed
  const mintAuthSeeds = [
    [Buffer.from('mint-authority')],
    [Buffer.from('mint_authority')],
    [Buffer.from('authority')],
  ];
  
  for (const seed of mintAuthSeeds) {
    const [pda] = PublicKey.findProgramAddressSync(seed, PUMP);
    const match = pda.equals(target14) ? '✓ MATCH!' : '';
    console.log(`Seeds [${seed[0].toString()}]: ${pda.toBase58()} ${match}`);
  }
}

main().catch(console.error);



async function main() {
  const conn = new Connection(process.env.SOLANA_RPC_URL!);
  
  const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  
  // From successful transaction:
  // Mint: Agp692r66dgj7Y6CDzSiokC1Aw9D5ezT3hNhFxdDpump
  // Creator vault: BQhks26xWkCXjrxgg7Hj3aZkaTAZQC8wvZTzcJ8vnH5n
  
  const successMint = new PublicKey('Agp692r66dgj7Y6CDzSiokC1Aw9D5ezT3hNhFxdDpump');
  const successCreatorVault = new PublicKey('BQhks26xWkCXjrxgg7Hj3aZkaTAZQC8wvZTzcJ8vnH5n');
  
  // Get bonding curve for successful mint to find creator
  const [successBondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), successMint.toBuffer()],
    PUMP
  );
  
  const bcInfo = await conn.getAccountInfo(successBondingCurve);
  if (bcInfo) {
    const creator = new PublicKey(bcInfo.data.slice(49, 81));
    console.log('Creator from bonding curve:', creator.toBase58());
    
    // Try different seed combinations
    const seeds = [
      [Buffer.from('creator-vault'), creator.toBuffer()],
      [Buffer.from('creator_vault'), creator.toBuffer()],
      [Buffer.from('vault'), creator.toBuffer()],
      [Buffer.from('creator-vault'), successMint.toBuffer()],
      [Buffer.from('vault'), successMint.toBuffer()],
      [creator.toBuffer()],
      [Buffer.from('creator'), creator.toBuffer()],
    ];
    
    console.log('\nTrying seed combinations:');
    for (const seed of seeds) {
      const [pda] = PublicKey.findProgramAddressSync(seed, PUMP);
      const match = pda.equals(successCreatorVault) ? '✓ MATCH!' : '';
      console.log(`Seeds [${seed.map(s => s.toString().slice(0, 20) + '...').join(', ')}]: ${pda.toBase58()} ${match}`);
    }
  }
  
  // Also check the account at position 14 (8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt)
  console.log('\n\nLooking for what creates 8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt:');
  const target14 = new PublicKey('8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt');
  
  // Maybe it's derived from mint authority seed
  const mintAuthSeeds = [
    [Buffer.from('mint-authority')],
    [Buffer.from('mint_authority')],
    [Buffer.from('authority')],
  ];
  
  for (const seed of mintAuthSeeds) {
    const [pda] = PublicKey.findProgramAddressSync(seed, PUMP);
    const match = pda.equals(target14) ? '✓ MATCH!' : '';
    console.log(`Seeds [${seed[0].toString()}]: ${pda.toBase58()} ${match}`);
  }
}

main().catch(console.error);


