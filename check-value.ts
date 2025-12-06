import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { config } from './src/config/index.js';
import { getAllKeypairs } from './src/wallet/generator.js';

const TOKEN_MINT = 'Gd9Fqvd54ghDpE7PmvwpxALSbvd9YBFnFNYa9iA9pump';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const JUPITER_API_KEY = process.env.JUPITER_API_KEY!;

const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
const wallets = getAllKeypairs(password);
const conn = new Connection(config.rpcUrl);
const mint = new PublicKey(TOKEN_MINT);

// Get token program
const mintInfo = await conn.getAccountInfo(mint);
const tokenProgram = mintInfo!.owner;

// Calculate total tokens
let totalTokens = BigInt(0);
for (const wallet of wallets) {
  try {
    const ata = getAssociatedTokenAddressSync(mint, wallet.publicKey, false, tokenProgram);
    const balance = await conn.getTokenAccountBalance(ata);
    totalTokens += BigInt(balance.value.amount);
  } catch {}
}

console.log('\n💰 Portfolio Value Check\n');
console.log('Token:', TOKEN_MINT.slice(0, 12) + '...');
console.log('Total holdings:', (Number(totalTokens) / 1e6).toFixed(2), 'tokens');

// Get quote from Jupiter for selling all tokens
try {
  const params = new URLSearchParams({
    inputMint: TOKEN_MINT,
    outputMint: SOL_MINT,
    amount: totalTokens.toString(),
  });
  
  const response = await fetch(`https://api.jup.ag/ultra/v1/order?${params}`, {
    headers: { 'x-api-key': JUPITER_API_KEY },
  });
  
  if (response.ok) {
    const data = await response.json();
    const solValue = parseInt(data.outAmount) / LAMPORTS_PER_SOL;
    const priceImpact = parseFloat(data.priceImpactPct || '0') * 100;
    
    console.log('\n📊 Current Value:');
    console.log('═══════════════════════════════════════');
    console.log(`  If sold now: ~${solValue.toFixed(4)} SOL`);
    console.log(`  Price impact: ${priceImpact.toFixed(2)}%`);
    
    // Get SOL price estimate (rough)
    const solPrice = 140; // Approximate USD price
    console.log(`  USD estimate: ~$${(solValue * solPrice).toFixed(2)}`);
    console.log('═══════════════════════════════════════\n');
  } else {
    const text = await response.text();
    console.log('Could not get quote:', text);
  }
} catch (error) {
  console.error('Error getting price:', error);
}

import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { config } from './src/config/index.js';
import { getAllKeypairs } from './src/wallet/generator.js';

const TOKEN_MINT = 'Gd9Fqvd54ghDpE7PmvwpxALSbvd9YBFnFNYa9iA9pump';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const JUPITER_API_KEY = process.env.JUPITER_API_KEY!;

const password = process.env.WALLET_ENCRYPTION_PASSWORD!;
const wallets = getAllKeypairs(password);
const conn = new Connection(config.rpcUrl);
const mint = new PublicKey(TOKEN_MINT);

// Get token program
const mintInfo = await conn.getAccountInfo(mint);
const tokenProgram = mintInfo!.owner;

// Calculate total tokens
let totalTokens = BigInt(0);
for (const wallet of wallets) {
  try {
    const ata = getAssociatedTokenAddressSync(mint, wallet.publicKey, false, tokenProgram);
    const balance = await conn.getTokenAccountBalance(ata);
    totalTokens += BigInt(balance.value.amount);
  } catch {}
}

console.log('\n💰 Portfolio Value Check\n');
console.log('Token:', TOKEN_MINT.slice(0, 12) + '...');
console.log('Total holdings:', (Number(totalTokens) / 1e6).toFixed(2), 'tokens');

// Get quote from Jupiter for selling all tokens
try {
  const params = new URLSearchParams({
    inputMint: TOKEN_MINT,
    outputMint: SOL_MINT,
    amount: totalTokens.toString(),
  });
  
  const response = await fetch(`https://api.jup.ag/ultra/v1/order?${params}`, {
    headers: { 'x-api-key': JUPITER_API_KEY },
  });
  
  if (response.ok) {
    const data = await response.json();
    const solValue = parseInt(data.outAmount) / LAMPORTS_PER_SOL;
    const priceImpact = parseFloat(data.priceImpactPct || '0') * 100;
    
    console.log('\n📊 Current Value:');
    console.log('═══════════════════════════════════════');
    console.log(`  If sold now: ~${solValue.toFixed(4)} SOL`);
    console.log(`  Price impact: ${priceImpact.toFixed(2)}%`);
    
    // Get SOL price estimate (rough)
    const solPrice = 140; // Approximate USD price
    console.log(`  USD estimate: ~$${(solValue * solPrice).toFixed(2)}`);
    console.log('═══════════════════════════════════════\n');
  } else {
    const text = await response.text();
    console.log('Could not get quote:', text);
  }
} catch (error) {
  console.error('Error getting price:', error);
}

