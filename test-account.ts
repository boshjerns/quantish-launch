import { Connection, PublicKey } from '@solana/web3.js';

async function main() {
  const conn = new Connection(process.env.SOLANA_RPC_URL!);
  
  // The unknown account from the successful transaction
  const unknown = new PublicKey('8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt');
  
  const info = await conn.getAccountInfo(unknown);
  
  if (info) {
    console.log('Account:', unknown.toBase58());
    console.log('Owner:', info.owner.toBase58());
    console.log('Lamports:', info.lamports);
    console.log('Data length:', info.data.length);
    console.log('Executable:', info.executable);
  } else {
    console.log('Account not found');
  }
  
  // Also check our derived creator vault
  const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  const creator = new PublicKey('GVM9i9d7kptnpwkTe6SJd6xSK8oYz4ZcRqp1rnkfupNk'); // from our token
  
  const [creatorVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('creator-vault'), creator.toBuffer()],
    PUMP
  );
  
  console.log('\nOur creator vault:', creatorVault.toBase58());
  
  // Try different seeds for unknown account
  const [mintAuth] = PublicKey.findProgramAddressSync(
    [Buffer.from('mint-authority')],
    PUMP
  );
  console.log('Mint authority PDA:', mintAuth.toBase58());
}

main().catch(console.error);



async function main() {
  const conn = new Connection(process.env.SOLANA_RPC_URL!);
  
  // The unknown account from the successful transaction
  const unknown = new PublicKey('8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt');
  
  const info = await conn.getAccountInfo(unknown);
  
  if (info) {
    console.log('Account:', unknown.toBase58());
    console.log('Owner:', info.owner.toBase58());
    console.log('Lamports:', info.lamports);
    console.log('Data length:', info.data.length);
    console.log('Executable:', info.executable);
  } else {
    console.log('Account not found');
  }
  
  // Also check our derived creator vault
  const PUMP = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  const creator = new PublicKey('GVM9i9d7kptnpwkTe6SJd6xSK8oYz4ZcRqp1rnkfupNk'); // from our token
  
  const [creatorVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('creator-vault'), creator.toBuffer()],
    PUMP
  );
  
  console.log('\nOur creator vault:', creatorVault.toBase58());
  
  // Try different seeds for unknown account
  const [mintAuth] = PublicKey.findProgramAddressSync(
    [Buffer.from('mint-authority')],
    PUMP
  );
  console.log('Mint authority PDA:', mintAuth.toBase58());
}

main().catch(console.error);


