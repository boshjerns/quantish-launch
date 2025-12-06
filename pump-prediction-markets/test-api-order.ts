/**
 * Test API order placement
 */

async function main() {
  const url = 'http://localhost:3001/api/orders/market';
  const body = {
    marketMint: 'MOCK3333333333333333333333333333333333333333',
    side: 'no',
    amount: 20
  };
  
  console.log('Testing API order placement...');
  console.log('URL:', url);
  console.log('Body:', body);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'api-test-wallet'
      },
      body: JSON.stringify(body)
    });
    
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();

 * Test API order placement
 */

async function main() {
  const url = 'http://localhost:3001/api/orders/market';
  const body = {
    marketMint: 'MOCK3333333333333333333333333333333333333333',
    side: 'no',
    amount: 20
  };
  
  console.log('Testing API order placement...');
  console.log('URL:', url);
  console.log('Body:', body);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'api-test-wallet'
      },
      body: JSON.stringify(body)
    });
    
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();

