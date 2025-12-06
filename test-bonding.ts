import { Connection, PublicKey } from '@solana/web3.js';

async function main() {
  const conn = new Connection(process.env.SOLANA_RPC_URL!);
  
  const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  const mint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  
  // Derive bonding curve
  const [bondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMP
  );
  
  console.log('Bonding curve:', bondingCurve.toBase58());
  
  const info = await conn.getAccountInfo(bondingCurve);
  if (!info) {
    console.log('Bonding curve not found');
    return;
  }
  
  console.log('Data length:', info.data.length);
  console.log('\nRaw data (first 200 bytes as hex):');
  console.log(info.data.slice(0, 200).toString('hex'));
  
  // Try to find creator pubkey in the data
  // Looking at different offsets
  console.log('\n\nTrying different offsets for creator pubkey (32 bytes):');
  
  for (let offset of [49, 57, 65, 73, 81, 89, 97, 105, 113, 121]) {
    try {
      const possibleCreator = new PublicKey(info.data.slice(offset, offset + 32));
      console.log(`Offset ${offset}: ${possibleCreator.toBase58()}`);
    } catch (e) {
      console.log(`Offset ${offset}: Invalid pubkey`);
    }
  }
  
  // Also check what successful tx creator vault looks like
  const successTxCreatorVault = new PublicKey('BQhks26xWkCXjrxgg7Hj3aZkaTAZQC8wvZTzcJ8vnH5n');
  const successTxCreatorVaultInfo = await conn.getAccountInfo(successTxCreatorVault);
  if (successTxCreatorVaultInfo) {
    console.log('\n\nSuccess tx creator vault:');
    console.log('Owner:', successTxCreatorVaultInfo.owner.toBase58());
  }
}

main().catch(console.error);



async function main() {
  const conn = new Connection(process.env.SOLANA_RPC_URL!);
  
  const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  const mint = new PublicKey('HJy79ZaCzFNG8Toq1PBseHGnBeZf8sktvuC3sCSZpump');
  
  // Derive bonding curve
  const [bondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMP
  );
  
  console.log('Bonding curve:', bondingCurve.toBase58());
  
  const info = await conn.getAccountInfo(bondingCurve);
  if (!info) {
    console.log('Bonding curve not found');
    return;
  }
  
  console.log('Data length:', info.data.length);
  console.log('\nRaw data (first 200 bytes as hex):');
  console.log(info.data.slice(0, 200).toString('hex'));
  
  // Try to find creator pubkey in the data
  // Looking at different offsets
  console.log('\n\nTrying different offsets for creator pubkey (32 bytes):');
  
  for (let offset of [49, 57, 65, 73, 81, 89, 97, 105, 113, 121]) {
    try {
      const possibleCreator = new PublicKey(info.data.slice(offset, offset + 32));
      console.log(`Offset ${offset}: ${possibleCreator.toBase58()}`);
    } catch (e) {
      console.log(`Offset ${offset}: Invalid pubkey`);
    }
  }
  
  // Also check what successful tx creator vault looks like
  const successTxCreatorVault = new PublicKey('BQhks26xWkCXjrxgg7Hj3aZkaTAZQC8wvZTzcJ8vnH5n');
  const successTxCreatorVaultInfo = await conn.getAccountInfo(successTxCreatorVault);
  if (successTxCreatorVaultInfo) {
    console.log('\n\nSuccess tx creator vault:');
    console.log('Owner:', successTxCreatorVaultInfo.owner.toBase58());
  }
}

main().catch(console.error);


