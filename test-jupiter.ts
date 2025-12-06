const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function main() {
  console.log('Testing Jupiter API...\n');
  
  try {
    const params = new URLSearchParams({
      inputMint: SOL_MINT,
      outputMint: USDC_MINT,
      amount: '1000000', // 0.001 SOL
      slippageBps: '500',
    });
    
    console.log(`URL: ${JUPITER_QUOTE_API}/quote?${params}\n`);
    
    const response = await fetch(`${JUPITER_QUOTE_API}/quote?${params}`);
    console.log('Status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('\n✅ Jupiter API working!');
      console.log('Quote response:', JSON.stringify(data, null, 2).slice(0, 500));
    } else {
      const text = await response.text();
      console.log('Error:', text);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
}

main();

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function main() {
  console.log('Testing Jupiter API...\n');
  
  try {
    const params = new URLSearchParams({
      inputMint: SOL_MINT,
      outputMint: USDC_MINT,
      amount: '1000000', // 0.001 SOL
      slippageBps: '500',
    });
    
    console.log(`URL: ${JUPITER_QUOTE_API}/quote?${params}\n`);
    
    const response = await fetch(`${JUPITER_QUOTE_API}/quote?${params}`);
    console.log('Status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('\n✅ Jupiter API working!');
      console.log('Quote response:', JSON.stringify(data, null, 2).slice(0, 500));
    } else {
      const text = await response.text();
      console.log('Error:', text);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
}

main();

