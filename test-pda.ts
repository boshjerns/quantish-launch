import { PublicKey } from '@solana/web3.js';

const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Our derived PDAs
const global = PublicKey.findProgramAddressSync([Buffer.from('global')], PUMP)[0];
const gva = PublicKey.findProgramAddressSync([Buffer.from('global_volume_accumulator')], PUMP)[0];

console.log('PUMP_GLOBAL:', global.toBase58());
console.log('GLOBAL_VOLUME_ACCUMULATOR:', gva.toBase58());
console.log('Error account from log:', 'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y');

// Check if error account matches any
if (global.toBase58() === 'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y') {
  console.log('Match: PUMP_GLOBAL');
}
if (gva.toBase58() === 'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y') {
  console.log('Match: GLOBAL_VOLUME_ACCUMULATOR');
}



const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Our derived PDAs
const global = PublicKey.findProgramAddressSync([Buffer.from('global')], PUMP)[0];
const gva = PublicKey.findProgramAddressSync([Buffer.from('global_volume_accumulator')], PUMP)[0];

console.log('PUMP_GLOBAL:', global.toBase58());
console.log('GLOBAL_VOLUME_ACCUMULATOR:', gva.toBase58());
console.log('Error account from log:', 'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y');

// Check if error account matches any
if (global.toBase58() === 'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y') {
  console.log('Match: PUMP_GLOBAL');
}
if (gva.toBase58() === 'Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y') {
  console.log('Match: GLOBAL_VOLUME_ACCUMULATOR');
}


