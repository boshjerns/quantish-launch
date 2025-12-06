import { PublicKey } from '@solana/web3.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const mint = new PublicKey('Agp692r66dgj7Y6CDzSiokC1Aw9D5ezT3hNhFxdDpump');
const bondingCurve = new PublicKey('Fgfffogjfg7sPmqWyd7euK5XHMTPCVYwmjSSJf7MS2B2');
const target = new PublicKey('62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV');

// Maybe derived from bonding curve
const seedCombos: Buffer[][] = [
  [bondingCurve.toBuffer(), Buffer.from('sol_pool')],
  [Buffer.from('sol_pool'), bondingCurve.toBuffer()],
  [bondingCurve.toBuffer(), Buffer.from('sol')],
  [Buffer.from('sol'), bondingCurve.toBuffer()],
  [bondingCurve.toBuffer(), Buffer.from('reserve')],
  [Buffer.from('vault'), bondingCurve.toBuffer()],
  [bondingCurve.toBuffer(), Buffer.from('vault')],
];

// Also try from mint with b"sol_pool"
seedCombos.push([mint.toBuffer(), Buffer.from('sol_pool').reverse()]);

// Try the exact pattern from the sample code: [&mint_addr.key().to_bytes(), b"sol_pool".as_ref()]
// This is [mint, "sol_pool"]
console.log('Looking for SOL vault:', target.toBase58());
console.log();

for (const seeds of seedCombos) {
  try {
    const [pda, bump] = PublicKey.findProgramAddressSync(seeds, PUMP);
    const match = pda.equals(target) ? '✓ MATCH!' : '';
    console.log(`Bump ${bump}: ${pda.toBase58().slice(0, 30)}... ${match}`);
  } catch (e) {
    console.log('Error:', (e as Error).message);
  }
}

// Let me try the pattern I saw in buy.rs: seeds = [&mint_addr.key().to_bytes(), b"sol_pool".as_ref()]
const [solPool] = PublicKey.findProgramAddressSync(
  [mint.toBuffer(), Buffer.from('sol_pool')],
  PUMP
);
console.log('\n[mint, "sol_pool"]:', solPool.toBase58());
console.log('Match?', solPool.equals(target));



const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const mint = new PublicKey('Agp692r66dgj7Y6CDzSiokC1Aw9D5ezT3hNhFxdDpump');
const bondingCurve = new PublicKey('Fgfffogjfg7sPmqWyd7euK5XHMTPCVYwmjSSJf7MS2B2');
const target = new PublicKey('62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV');

// Maybe derived from bonding curve
const seedCombos: Buffer[][] = [
  [bondingCurve.toBuffer(), Buffer.from('sol_pool')],
  [Buffer.from('sol_pool'), bondingCurve.toBuffer()],
  [bondingCurve.toBuffer(), Buffer.from('sol')],
  [Buffer.from('sol'), bondingCurve.toBuffer()],
  [bondingCurve.toBuffer(), Buffer.from('reserve')],
  [Buffer.from('vault'), bondingCurve.toBuffer()],
  [bondingCurve.toBuffer(), Buffer.from('vault')],
];

// Also try from mint with b"sol_pool"
seedCombos.push([mint.toBuffer(), Buffer.from('sol_pool').reverse()]);

// Try the exact pattern from the sample code: [&mint_addr.key().to_bytes(), b"sol_pool".as_ref()]
// This is [mint, "sol_pool"]
console.log('Looking for SOL vault:', target.toBase58());
console.log();

for (const seeds of seedCombos) {
  try {
    const [pda, bump] = PublicKey.findProgramAddressSync(seeds, PUMP);
    const match = pda.equals(target) ? '✓ MATCH!' : '';
    console.log(`Bump ${bump}: ${pda.toBase58().slice(0, 30)}... ${match}`);
  } catch (e) {
    console.log('Error:', (e as Error).message);
  }
}

// Let me try the pattern I saw in buy.rs: seeds = [&mint_addr.key().to_bytes(), b"sol_pool".as_ref()]
const [solPool] = PublicKey.findProgramAddressSync(
  [mint.toBuffer(), Buffer.from('sol_pool')],
  PUMP
);
console.log('\n[mint, "sol_pool"]:', solPool.toBase58());
console.log('Match?', solPool.equals(target));


