import { Connection, PublicKey } from '@solana/web3.js';

async function main() {
  const conn = new Connection(process.env.SOLANA_RPC_URL!);
  
  // Successful tx bonding curve
  const successBondingCurve = new PublicKey('Fgfffogjfg7sPmqWyd7euK5XHMTPCVYwmjSSJf7MS2B2');
  const successSolVault = new PublicKey('62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV');
  
  const info = await conn.getAccountInfo(successBondingCurve);
  if (!info) return;
  
  console.log('Bonding curve data length:', info.data.length);
  console.log('Looking for SOL vault:', successSolVault.toBase58());
  
  // Search for the pubkey in the data
  const data = info.data;
  const targetBytes = successSolVault.toBytes();
  
  for (let i = 0; i <= data.length - 32; i++) {
    const slice = data.slice(i, i + 32);
    if (Buffer.compare(slice, Buffer.from(targetBytes)) === 0) {
      console.log(`\nFound at offset ${i}!`);
    }
  }
  
  // Also print all pubkeys at various offsets
  console.log('\n\nAll potential pubkeys in bonding curve data:');
  const offsets = [0, 8, 40, 48, 49, 56, 64, 72, 80, 88, 96, 104, 112, 119];
  
  for (const offset of offsets) {
    if (offset + 32 <= data.length) {
      try {
        const pk = new PublicKey(data.slice(offset, offset + 32));
        console.log(`Offset ${offset.toString().padStart(3)}: ${pk.toBase58()}`);
      } catch {
        // skip
      }
    }
  }
}

main().catch(console.error);



async function main() {
  const conn = new Connection(process.env.SOLANA_RPC_URL!);
  
  // Successful tx bonding curve
  const successBondingCurve = new PublicKey('Fgfffogjfg7sPmqWyd7euK5XHMTPCVYwmjSSJf7MS2B2');
  const successSolVault = new PublicKey('62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV');
  
  const info = await conn.getAccountInfo(successBondingCurve);
  if (!info) return;
  
  console.log('Bonding curve data length:', info.data.length);
  console.log('Looking for SOL vault:', successSolVault.toBase58());
  
  // Search for the pubkey in the data
  const data = info.data;
  const targetBytes = successSolVault.toBytes();
  
  for (let i = 0; i <= data.length - 32; i++) {
    const slice = data.slice(i, i + 32);
    if (Buffer.compare(slice, Buffer.from(targetBytes)) === 0) {
      console.log(`\nFound at offset ${i}!`);
    }
  }
  
  // Also print all pubkeys at various offsets
  console.log('\n\nAll potential pubkeys in bonding curve data:');
  const offsets = [0, 8, 40, 48, 49, 56, 64, 72, 80, 88, 96, 104, 112, 119];
  
  for (const offset of offsets) {
    if (offset + 32 <= data.length) {
      try {
        const pk = new PublicKey(data.slice(offset, offset + 32));
        console.log(`Offset ${offset.toString().padStart(3)}: ${pk.toBase58()}`);
      } catch {
        // skip
      }
    }
  }
}

main().catch(console.error);


