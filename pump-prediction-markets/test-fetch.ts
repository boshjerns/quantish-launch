/**
 * Test script to debug pump.fun API fetching
 */

async function testFetch() {
  console.log('Testing pump.fun API...\n');
  
  try {
    // Test 1: Direct API call
    console.log('1. Fetching from pump.fun API...');
    const response = await fetch(
      'https://frontend-api.pump.fun/coins?offset=0&limit=10&sort=last_trade_timestamp&order=DESC&includeNsfw=false'
    );
    
    console.log(`   Status: ${response.status}`);
    console.log(`   OK: ${response.ok}`);
    
    if (!response.ok) {
      const text = await response.text();
      console.log(`   Error: ${text}`);
      return;
    }
    
    const data = await response.json();
    console.log(`   Got ${data.length} tokens\n`);
    
    // Show first few tokens
    console.log('2. First 3 tokens:');
    for (const token of data.slice(0, 3)) {
      console.log(`   - ${token.symbol} (${token.name})`);
      console.log(`     Mint: ${token.mint}`);
      console.log(`     Complete: ${token.complete}`);
      console.log(`     Market Cap: $${token.usd_market_cap?.toFixed(2)}`);
      console.log('');
    }
    
    // Test 2: Filter non-graduated
    const active = data.filter((t: any) => !t.complete);
    console.log(`3. Active (non-graduated) tokens: ${active.length}/${data.length}`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testFetch();

 * Test script to debug pump.fun API fetching
 */

async function testFetch() {
  console.log('Testing pump.fun API...\n');
  
  try {
    // Test 1: Direct API call
    console.log('1. Fetching from pump.fun API...');
    const response = await fetch(
      'https://frontend-api.pump.fun/coins?offset=0&limit=10&sort=last_trade_timestamp&order=DESC&includeNsfw=false'
    );
    
    console.log(`   Status: ${response.status}`);
    console.log(`   OK: ${response.ok}`);
    
    if (!response.ok) {
      const text = await response.text();
      console.log(`   Error: ${text}`);
      return;
    }
    
    const data = await response.json();
    console.log(`   Got ${data.length} tokens\n`);
    
    // Show first few tokens
    console.log('2. First 3 tokens:');
    for (const token of data.slice(0, 3)) {
      console.log(`   - ${token.symbol} (${token.name})`);
      console.log(`     Mint: ${token.mint}`);
      console.log(`     Complete: ${token.complete}`);
      console.log(`     Market Cap: $${token.usd_market_cap?.toFixed(2)}`);
      console.log('');
    }
    
    // Test 2: Filter non-graduated
    const active = data.filter((t: any) => !t.complete);
    console.log(`3. Active (non-graduated) tokens: ${active.length}/${data.length}`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testFetch();

