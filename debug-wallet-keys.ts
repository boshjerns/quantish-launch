import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { getAllKeypairs } from './src/wallet/generator.js';

async function main() {
  const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
  const wallets = getAllKeypairs(password);
  
  const mint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  
  console.log('=== Wallet Public Keys and ATAs ===\n');
  
  for (let i = 0; i < wallets.length; i++) {
    const pubkey = wallets[i].publicKey;
    const ata = getAssociatedTokenAddressSync(
      mint,
      pubkey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    console.log(`Wallet ${i}:`);
    console.log(`  Public Key: ${pubkey.toBase58()}`);
    console.log(`  ATA:        ${ata.toBase58()}`);
    console.log('');
  }
  
  // The logged "Right" values from error
  const loggedValues = [
    'GNyqtAFZnT15GZbZDhvLxZFV86dFyabbWi78RNDms75t',
    'Bhasy6hiSNxA5tydKS8BfsYZZEcFb4EBZmMHxkg83zWx',
    '6AW3YXo5cP5iW77LJjNHHC8UKrQocEt3LfSvgSKXhgfb',
    '5YgGmJLE61NgzKADjeywCuT1x2Eu2hbvJqiW93uUYnvX',
    '14VkjBRUxLG6jZLEmnw9c92y3k8JqvE7kFWHDNcrbbTn',
  ];
  
  console.log('=== Matching logged values ===\n');
  console.log('Expected:', 'HRmQJ8gr8bJ64AwEkpyj6mB9cG4sRUygHJ2k8H6rKPxE', '(Creator Vault)\n');
  
  for (let i = 0; i < loggedValues.length; i++) {
    const logged = loggedValues[i];
    
    // Check if it matches pubkey
    if (wallets[i].publicKey.toBase58() === logged) {
      console.log(`Logged ${i}: ${logged} = Wallet ${i} PUBLIC KEY`);
    }
    // Check if it matches ATA
    else {
      const ata = getAssociatedTokenAddressSync(
        mint,
        wallets[i].publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      if (ata.toBase58() === logged) {
        console.log(`Logged ${i}: ${logged} = Wallet ${i} ATA`);
      } else {
        console.log(`Logged ${i}: ${logged} = UNKNOWN`);
      }
    }
  }
}

main().catch(console.error);


import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { getAllKeypairs } from './src/wallet/generator.js';

async function main() {
  const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
  const wallets = getAllKeypairs(password);
  
  const mint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  
  console.log('=== Wallet Public Keys and ATAs ===\n');
  
  for (let i = 0; i < wallets.length; i++) {
    const pubkey = wallets[i].publicKey;
    const ata = getAssociatedTokenAddressSync(
      mint,
      pubkey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    console.log(`Wallet ${i}:`);
    console.log(`  Public Key: ${pubkey.toBase58()}`);
    console.log(`  ATA:        ${ata.toBase58()}`);
    console.log('');
  }
  
  // The logged "Right" values from error
  const loggedValues = [
    'GNyqtAFZnT15GZbZDhvLxZFV86dFyabbWi78RNDms75t',
    'Bhasy6hiSNxA5tydKS8BfsYZZEcFb4EBZmMHxkg83zWx',
    '6AW3YXo5cP5iW77LJjNHHC8UKrQocEt3LfSvgSKXhgfb',
    '5YgGmJLE61NgzKADjeywCuT1x2Eu2hbvJqiW93uUYnvX',
    '14VkjBRUxLG6jZLEmnw9c92y3k8JqvE7kFWHDNcrbbTn',
  ];
  
  console.log('=== Matching logged values ===\n');
  console.log('Expected:', 'HRmQJ8gr8bJ64AwEkpyj6mB9cG4sRUygHJ2k8H6rKPxE', '(Creator Vault)\n');
  
  for (let i = 0; i < loggedValues.length; i++) {
    const logged = loggedValues[i];
    
    // Check if it matches pubkey
    if (wallets[i].publicKey.toBase58() === logged) {
      console.log(`Logged ${i}: ${logged} = Wallet ${i} PUBLIC KEY`);
    }
    // Check if it matches ATA
    else {
      const ata = getAssociatedTokenAddressSync(
        mint,
        wallets[i].publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      if (ata.toBase58() === logged) {
        console.log(`Logged ${i}: ${logged} = Wallet ${i} ATA`);
      } else {
        console.log(`Logged ${i}: ${logged} = UNKNOWN`);
      }
    }
  }
}

main().catch(console.error);


