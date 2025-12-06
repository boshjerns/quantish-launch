import { PublicKey } from '@solana/web3.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const user = new PublicKey('DNbyUGhMGfTbFF75F1A7RVm9S7rJXqkjJDgV3HR5x5gm');
const expected = new PublicKey('GNyqtAFZnT15GZbZDhvLxZFV86dFyabbWi78RNDms75t');

console.log('User:', user.toBase58());
console.log('Expected PDA:', expected.toBase58());
console.log();

const seedCombinations = [
  ['user_volume_accumulator', user.toBuffer()],
  ['user-volume-accumulator', user.toBuffer()],
  ['volume_accumulator', user.toBuffer()],
  ['volume-accumulator', user.toBuffer()],
  ['user_volume', user.toBuffer()],
  ['user-volume', user.toBuffer()],
  ['volume', user.toBuffer()],
  [user.toBuffer(), 'volume'],
  [user.toBuffer(), 'volume_accumulator'],
  [user.toBuffer()],
];

for (const seedParts of seedCombinations) {
  try {
    const seeds = seedParts.map(s => typeof s === 'string' ? Buffer.from(s) : s);
    const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
    const match = pda.equals(expected) ? '✓ MATCH!' : '';
    console.log(`${seedParts.map(s => typeof s === 'string' ? s : '<user>').join(' + ')}: ${pda.toBase58().slice(0, 20)}... ${match}`);
  } catch (e) {
    console.log(`Error: ${e}`);
  }
}



const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const user = new PublicKey('DNbyUGhMGfTbFF75F1A7RVm9S7rJXqkjJDgV3HR5x5gm');
const expected = new PublicKey('GNyqtAFZnT15GZbZDhvLxZFV86dFyabbWi78RNDms75t');

console.log('User:', user.toBase58());
console.log('Expected PDA:', expected.toBase58());
console.log();

const seedCombinations = [
  ['user_volume_accumulator', user.toBuffer()],
  ['user-volume-accumulator', user.toBuffer()],
  ['volume_accumulator', user.toBuffer()],
  ['volume-accumulator', user.toBuffer()],
  ['user_volume', user.toBuffer()],
  ['user-volume', user.toBuffer()],
  ['volume', user.toBuffer()],
  [user.toBuffer(), 'volume'],
  [user.toBuffer(), 'volume_accumulator'],
  [user.toBuffer()],
];

for (const seedParts of seedCombinations) {
  try {
    const seeds = seedParts.map(s => typeof s === 'string' ? Buffer.from(s) : s);
    const [pda] = PublicKey.findProgramAddressSync(seeds, PUMP);
    const match = pda.equals(expected) ? '✓ MATCH!' : '';
    console.log(`${seedParts.map(s => typeof s === 'string' ? s : '<user>').join(' + ')}: ${pda.toBase58().slice(0, 20)}... ${match}`);
  } catch (e) {
    console.log(`Error: ${e}`);
  }
}


