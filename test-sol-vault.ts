import { PublicKey } from '@solana/web3.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const mint = new PublicKey('Agp692r66dgj7Y6CDzSiokC1Aw9D5ezT3hNhFxdDpump');
const bondingCurve = new PublicKey('Fgfffogjfg7sPmqWyd7euK5XHMTPCVYwmjSSJf7MS2B2');
const target = new PublicKey('62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV');

// Try many seed combinations
const seedCombos = [
  [[Buffer.from('sol-pool'), mint.toBuffer()]],
  [[Buffer.from('sol_pool'), mint.toBuffer()]],
  [[mint.toBuffer(), Buffer.from('sol_pool')]],
  [[Buffer.from('liquidity'), mint.toBuffer()]],
  [[bondingCurve.toBuffer()]],
  [[Buffer.from('curve'), mint.toBuffer()]],
  [[mint.toBuffer(), Buffer.from('curve')]],
  [[mint.toBuffer()]],
  [[Buffer.from('reserve'), mint.toBuffer()]],
  [[Buffer.from('sol'), mint.toBuffer()]],
  [[mint.toBuffer(), Buffer.from('sol')]],
  [[Buffer.from('pool'), mint.toBuffer()]],
];

console.log('Looking for:', target.toBase58());
console.log('\nTrying seeds:');

for (const seeds of seedCombos) {
  try {
    const [pda, bump] = PublicKey.findProgramAddressSync(seeds[0] as Buffer[], PUMP);
    const match = pda.equals(target) ? '✓ MATCH!' : '';
    console.log(`[${seeds[0].map((s: Buffer) => s.toString('utf8').replace(/[^\x20-\x7E]/g, '?')).join(', ')}]: ${pda.toBase58().slice(0, 20)}... ${match}`);
  } catch (e) {
    // skip
  }
}

// The pos1 might simply be derived as ["bonding-curve", mint] without the prefix
// Let's check a few more specific to bonding curves
const [bc2] = PublicKey.findProgramAddressSync(
  [Buffer.from('bonding-curve'), mint.toBuffer()],
  PUMP
);
console.log('\nBonding curve PDA:', bc2.toBase58());
console.log('Matches bondingCurve?', bc2.equals(bondingCurve));

// Maybe pos1 is the coin account (holding SOL for the curve)
const [coinAccount] = PublicKey.findProgramAddressSync(
  [mint.toBuffer(), Buffer.from('sol_pool')],
  PUMP
);
console.log('\nCoin account PDA:', coinAccount.toBase58());
console.log('Matches pos1?', coinAccount.equals(target));



const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const mint = new PublicKey('Agp692r66dgj7Y6CDzSiokC1Aw9D5ezT3hNhFxdDpump');
const bondingCurve = new PublicKey('Fgfffogjfg7sPmqWyd7euK5XHMTPCVYwmjSSJf7MS2B2');
const target = new PublicKey('62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV');

// Try many seed combinations
const seedCombos = [
  [[Buffer.from('sol-pool'), mint.toBuffer()]],
  [[Buffer.from('sol_pool'), mint.toBuffer()]],
  [[mint.toBuffer(), Buffer.from('sol_pool')]],
  [[Buffer.from('liquidity'), mint.toBuffer()]],
  [[bondingCurve.toBuffer()]],
  [[Buffer.from('curve'), mint.toBuffer()]],
  [[mint.toBuffer(), Buffer.from('curve')]],
  [[mint.toBuffer()]],
  [[Buffer.from('reserve'), mint.toBuffer()]],
  [[Buffer.from('sol'), mint.toBuffer()]],
  [[mint.toBuffer(), Buffer.from('sol')]],
  [[Buffer.from('pool'), mint.toBuffer()]],
];

console.log('Looking for:', target.toBase58());
console.log('\nTrying seeds:');

for (const seeds of seedCombos) {
  try {
    const [pda, bump] = PublicKey.findProgramAddressSync(seeds[0] as Buffer[], PUMP);
    const match = pda.equals(target) ? '✓ MATCH!' : '';
    console.log(`[${seeds[0].map((s: Buffer) => s.toString('utf8').replace(/[^\x20-\x7E]/g, '?')).join(', ')}]: ${pda.toBase58().slice(0, 20)}... ${match}`);
  } catch (e) {
    // skip
  }
}

// The pos1 might simply be derived as ["bonding-curve", mint] without the prefix
// Let's check a few more specific to bonding curves
const [bc2] = PublicKey.findProgramAddressSync(
  [Buffer.from('bonding-curve'), mint.toBuffer()],
  PUMP
);
console.log('\nBonding curve PDA:', bc2.toBase58());
console.log('Matches bondingCurve?', bc2.equals(bondingCurve));

// Maybe pos1 is the coin account (holding SOL for the curve)
const [coinAccount] = PublicKey.findProgramAddressSync(
  [mint.toBuffer(), Buffer.from('sol_pool')],
  PUMP
);
console.log('\nCoin account PDA:', coinAccount.toBase58());
console.log('Matches pos1?', coinAccount.equals(target));


