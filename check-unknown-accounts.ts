import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { config } from './src/config/index.js';
import { getAllKeypairs } from './src/wallet/generator.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
  const wallets = getAllKeypairs(password);
  
  const mint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  
  // The logged "Right" values from error
  const loggedValues = [
    'GNyqtAFZnT15GZbZDhvLxZFV86dFyabbWi78RNDms75t',
    'Bhasy6hiSNxA5tydKS8BfsYZZEcFb4EBZmMHxkg83zWx',
    '6AW3YXo5cP5iW77LJjNHHC8UKrQocEt3LfSvgSKXhgfb',
    '5YgGmJLE61NgzKADjeywCuT1x2Eu2hbvJqiW93uUYnvX',
    '14VkjBRUxLG6jZLEmnw9c92y3k8JqvE7kFWHDNcrbbTn',
  ];
  
  console.log('=== Checking unknown logged accounts ===\n');
  
  for (let i = 0; i < loggedValues.length; i++) {
    const pk = new PublicKey(loggedValues[i]);
    console.log(`\n--- Logged ${i}: ${loggedValues[i]} ---`);
    
    const info = await conn.getAccountInfo(pk);
    if (info) {
      console.log('Owner:', info.owner.toBase58());
      console.log('Lamports:', info.lamports);
      console.log('Data length:', info.data.length);
      
      // If it's a token account
      if (info.owner.equals(TOKEN_2022_PROGRAM_ID) || info.owner.equals(TOKEN_PROGRAM_ID)) {
        const tokenMint = new PublicKey(info.data.slice(0, 32));
        const tokenOwner = new PublicKey(info.data.slice(32, 64));
        console.log('Token Mint:', tokenMint.toBase58());
        console.log('Token Owner:', tokenOwner.toBase58());
        
        // Check if owner is our wallet
        for (let j = 0; j < wallets.length; j++) {
          if (tokenOwner.equals(wallets[j].publicKey)) {
            console.log(`  -> Owned by Wallet ${j}`);
          }
        }
      }
    } else {
      console.log('Account does not exist');
      
      // Check if it could be a not-yet-created ATA
      for (let j = 0; j < wallets.length; j++) {
        const expectedAta = getAssociatedTokenAddressSync(
          mint,
          wallets[j].publicKey,
          false,
          TOKEN_2022_PROGRAM_ID
        );
        if (expectedAta.equals(pk)) {
          console.log(`  -> This is Wallet ${j}'s ATA (not created yet)`);
        }
      }
    }
  }
  
  // Let's also check what ATAs we're creating
  console.log('\n\n=== ATAs we would create ===\n');
  for (let i = 0; i < wallets.length; i++) {
    const ata = getAssociatedTokenAddressSync(
      mint,
      wallets[i].publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`Wallet ${i}: ${ata.toBase58()}`);
  }
}

main().catch(console.error);


import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { config } from './src/config/index.js';
import { getAllKeypairs } from './src/wallet/generator.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function main() {
  const conn = new Connection(config.rpcUrl);
  const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
  const wallets = getAllKeypairs(password);
  
  const mint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  
  // The logged "Right" values from error
  const loggedValues = [
    'GNyqtAFZnT15GZbZDhvLxZFV86dFyabbWi78RNDms75t',
    'Bhasy6hiSNxA5tydKS8BfsYZZEcFb4EBZmMHxkg83zWx',
    '6AW3YXo5cP5iW77LJjNHHC8UKrQocEt3LfSvgSKXhgfb',
    '5YgGmJLE61NgzKADjeywCuT1x2Eu2hbvJqiW93uUYnvX',
    '14VkjBRUxLG6jZLEmnw9c92y3k8JqvE7kFWHDNcrbbTn',
  ];
  
  console.log('=== Checking unknown logged accounts ===\n');
  
  for (let i = 0; i < loggedValues.length; i++) {
    const pk = new PublicKey(loggedValues[i]);
    console.log(`\n--- Logged ${i}: ${loggedValues[i]} ---`);
    
    const info = await conn.getAccountInfo(pk);
    if (info) {
      console.log('Owner:', info.owner.toBase58());
      console.log('Lamports:', info.lamports);
      console.log('Data length:', info.data.length);
      
      // If it's a token account
      if (info.owner.equals(TOKEN_2022_PROGRAM_ID) || info.owner.equals(TOKEN_PROGRAM_ID)) {
        const tokenMint = new PublicKey(info.data.slice(0, 32));
        const tokenOwner = new PublicKey(info.data.slice(32, 64));
        console.log('Token Mint:', tokenMint.toBase58());
        console.log('Token Owner:', tokenOwner.toBase58());
        
        // Check if owner is our wallet
        for (let j = 0; j < wallets.length; j++) {
          if (tokenOwner.equals(wallets[j].publicKey)) {
            console.log(`  -> Owned by Wallet ${j}`);
          }
        }
      }
    } else {
      console.log('Account does not exist');
      
      // Check if it could be a not-yet-created ATA
      for (let j = 0; j < wallets.length; j++) {
        const expectedAta = getAssociatedTokenAddressSync(
          mint,
          wallets[j].publicKey,
          false,
          TOKEN_2022_PROGRAM_ID
        );
        if (expectedAta.equals(pk)) {
          console.log(`  -> This is Wallet ${j}'s ATA (not created yet)`);
        }
      }
    }
  }
  
  // Let's also check what ATAs we're creating
  console.log('\n\n=== ATAs we would create ===\n');
  for (let i = 0; i < wallets.length; i++) {
    const ata = getAssociatedTokenAddressSync(
      mint,
      wallets[i].publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`Wallet ${i}: ${ata.toBase58()}`);
  }
}

main().catch(console.error);


