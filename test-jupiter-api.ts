const JUPITER_API_KEY = process.env.JUPITER_API_KEY || '2d1c1d27-da19-4c81-9a9e-4f742e9bf68c';
const JUPITER_ULTRA_API = 'https://api.jup.ag/ultra/v1';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function main() {
  console.log('Testing Jupiter Ultra API...\n');
  console.log('API Key:', JUPITER_API_KEY.slice(0, 8) + '...');
  
  const params = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount: '1000000', // 0.001 SOL
  });
  
  const url = `${JUPITER_ULTRA_API}/order?${params}`;
  console.log('URL:', url);
  
  try {
    const response = await fetch(url, {
      headers: {
        'x-api-key': JUPITER_API_KEY,
      },
    });
    
    console.log('\nStatus:', response.status);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2).slice(0, 1000));
    
    if (data.outAmount) {
      console.log('\n✅ Jupiter API working!');
      console.log(`Expected output: ${parseInt(data.outAmount) / 1e6} USDC`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();

const JUPITER_ULTRA_API = 'https://api.jup.ag/ultra/v1';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function main() {
  console.log('Testing Jupiter Ultra API...\n');
  console.log('API Key:', JUPITER_API_KEY.slice(0, 8) + '...');
  
  const params = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount: '1000000', // 0.001 SOL
  });
  
  const url = `${JUPITER_ULTRA_API}/order?${params}`;
  console.log('URL:', url);
  
  try {
    const response = await fetch(url, {
      headers: {
        'x-api-key': JUPITER_API_KEY,
      },
    });
    
    console.log('\nStatus:', response.status);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2).slice(0, 1000));
    
    if (data.outAmount) {
      console.log('\n✅ Jupiter API working!');
      console.log(`Expected output: ${parseInt(data.outAmount) / 1e6} USDC`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();

