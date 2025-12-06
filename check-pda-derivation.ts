import { PublicKey } from '@solana/web3.js';
import { getAllKeypairs } from './src/wallet/generator.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
  const wallets = getAllKeypairs(password);
  
  const mint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  const creator = new PublicKey('GVM9i9d7kptnEXVszu5hCUKPanGZqDXbiG7nbSQ3h83N');
  const bondingCurve = new PublicKey('HJBsJ5DK7LKWyqhCJZSmLCERDRfz1peTcovfkWEgQxHK');
  
  // The logged "Right" values
  const targets = [
    new PublicKey('GNyqtAFZnT15GZbZDhvLxZFV86dFyabbWi78RNDms75t'),
    new PublicKey('Bhasy6hiSNxA5tydKS8BfsYZZEcFb4EBZmMHxkg83zWx'),
    new PublicKey('6AW3YXo5cP5iW77LJjNHHC8UKrQocEt3LfSvgSKXhgfb'),
    new PublicKey('5YgGmJLE61NgzKADjeywCuT1x2Eu2hbvJqiW93uUYnvX'),
    new PublicKey('14VkjBRUxLG6jZLEmnw9c92y3k8JqvE7kFWHDNcrbbTn'),
  ];
  
  console.log('=== Trying to derive the logged values ===\n');
  
  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i].publicKey;
    const target = targets[i];
    
    console.log(`\n--- Wallet ${i}: ${wallet.toBase58().slice(0, 12)}... ---`);
    console.log(`Target: ${target.toBase58()}`);
    
    // Try different seed combinations
    const seedCombos = [
      // User-based vaults
      [Buffer.from('creator-vault'), wallet.toBuffer()],
      [Buffer.from('user-vault'), wallet.toBuffer()],
      [Buffer.from('vault'), wallet.toBuffer()],
      [wallet.toBuffer()],
      [wallet.toBuffer(), creator.toBuffer()],
      [creator.toBuffer(), wallet.toBuffer()],
      [wallet.toBuffer(), mint.toBuffer()],
      [mint.toBuffer(), wallet.toBuffer()],
      [wallet.toBuffer(), bondingCurve.toBuffer()],
      [bondingCurve.toBuffer(), wallet.toBuffer()],
      // ATA-like seeds  
      [wallet.toBuffer(), Buffer.from('token'), mint.toBuffer()],
    ];
    
    for (const seeds of seedCombos) {
      try {
        const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
        if (pda.equals(target)) {
          console.log('✓ FOUND! Seeds:', seeds.length, 'parts');
          seeds.forEach((s, idx) => {
            const pk = seeds[idx].length === 32 ? new PublicKey(seeds[idx]) : null;
            console.log(`  Part ${idx}:`, pk ? pk.toBase58() : s.toString());
          });
        }
      } catch (e) {
        // ignore
      }
    }
  }
  
  // Maybe the logged value is derived from position 5 (associated_user)?
  // Let me check if swapping positions would help
  console.log('\n\n=== Understanding the comparison ===');
  console.log('The program compares Creator Vault with some value');
  console.log('Creator Vault: HRmQJ8gr8bJ64AwEkpyj6mB9cG4sRUygHJ2k8H6rKPxE');
  
  // Check if maybe our position 13 (creator_vault) should be something else
  const [correctCreatorVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('creator-vault'), creator.toBuffer()],
    PUMP
  );
  console.log('Derived creator vault:', correctCreatorVault.toBase58());
}

main().catch(console.error);


import { getAllKeypairs } from './src/wallet/generator.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
  const wallets = getAllKeypairs(password);
  
  const mint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  const creator = new PublicKey('GVM9i9d7kptnEXVszu5hCUKPanGZqDXbiG7nbSQ3h83N');
  const bondingCurve = new PublicKey('HJBsJ5DK7LKWyqhCJZSmLCERDRfz1peTcovfkWEgQxHK');
  
  // The logged "Right" values
  const targets = [
    new PublicKey('GNyqtAFZnT15GZbZDhvLxZFV86dFyabbWi78RNDms75t'),
    new PublicKey('Bhasy6hiSNxA5tydKS8BfsYZZEcFb4EBZmMHxkg83zWx'),
    new PublicKey('6AW3YXo5cP5iW77LJjNHHC8UKrQocEt3LfSvgSKXhgfb'),
    new PublicKey('5YgGmJLE61NgzKADjeywCuT1x2Eu2hbvJqiW93uUYnvX'),
    new PublicKey('14VkjBRUxLG6jZLEmnw9c92y3k8JqvE7kFWHDNcrbbTn'),
  ];
  
  console.log('=== Trying to derive the logged values ===\n');
  
  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i].publicKey;
    const target = targets[i];
    
    console.log(`\n--- Wallet ${i}: ${wallet.toBase58().slice(0, 12)}... ---`);
    console.log(`Target: ${target.toBase58()}`);
    
    // Try different seed combinations
    const seedCombos = [
      // User-based vaults
      [Buffer.from('creator-vault'), wallet.toBuffer()],
      [Buffer.from('user-vault'), wallet.toBuffer()],
      [Buffer.from('vault'), wallet.toBuffer()],
      [wallet.toBuffer()],
      [wallet.toBuffer(), creator.toBuffer()],
      [creator.toBuffer(), wallet.toBuffer()],
      [wallet.toBuffer(), mint.toBuffer()],
      [mint.toBuffer(), wallet.toBuffer()],
      [wallet.toBuffer(), bondingCurve.toBuffer()],
      [bondingCurve.toBuffer(), wallet.toBuffer()],
      // ATA-like seeds  
      [wallet.toBuffer(), Buffer.from('token'), mint.toBuffer()],
    ];
    
    for (const seeds of seedCombos) {
      try {
        const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
        if (pda.equals(target)) {
          console.log('✓ FOUND! Seeds:', seeds.length, 'parts');
          seeds.forEach((s, idx) => {
            const pk = seeds[idx].length === 32 ? new PublicKey(seeds[idx]) : null;
            console.log(`  Part ${idx}:`, pk ? pk.toBase58() : s.toString());
          });
        }
      } catch (e) {
        // ignore
      }
    }
  }
  
  // Maybe the logged value is derived from position 5 (associated_user)?
  // Let me check if swapping positions would help
  console.log('\n\n=== Understanding the comparison ===');
  console.log('The program compares Creator Vault with some value');
  console.log('Creator Vault: HRmQJ8gr8bJ64AwEkpyj6mB9cG4sRUygHJ2k8H6rKPxE');
  
  // Check if maybe our position 13 (creator_vault) should be something else
  const [correctCreatorVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('creator-vault'), creator.toBuffer()],
    PUMP
  );
  console.log('Derived creator vault:', correctCreatorVault.toBase58());
}

main().catch(console.error);


