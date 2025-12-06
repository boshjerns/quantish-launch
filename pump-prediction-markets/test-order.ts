/**
 * Test placing an order
 */

import { initializeDatabase, db } from './src/db/schema.js';
import { executeMarketOrder } from './src/services/order-engine.js';
import { displayToMicroUsdc, microUsdcToDisplay } from './src/core/math.js';

async function main() {
  console.log('Testing order placement...\n');
  
  // Set env vars
  process.env.DATABASE_PATH = './data/markets.db';
  
  // Initialize DB
  initializeDatabase();
  
  // Check market exists
  const market = db.prepare('SELECT * FROM tokens WHERE mint = ?').get('MOCK1111111111111111111111111111111111111111') as any;
  
  if (!market) {
    console.error('Market not found! Run test-sync.ts first.');
    return;
  }
  
  console.log('Market found:', market.symbol, `(${market.progress_bps/100}% progress)`);
  
  // Place order
  console.log('\nPlacing $10 YES bet...');
  
  try {
    const result = await executeMarketOrder({
      userId: 'test-user-123',
      marketMint: 'MOCK1111111111111111111111111111111111111111',
      side: 'yes',
      amountMicroUsdc: displayToMicroUsdc(10), // $10
    });
    
    console.log('\nResult:', result);
    
    if (result.success) {
      console.log(`\n✅ Order executed!`);
      console.log(`   Shares: ${microUsdcToDisplay(result.shares!)}`);
      console.log(`   Effective Price: $${result.effectivePrice!.toFixed(4)}`);
      
      // Check position
      const position = db.prepare('SELECT * FROM positions WHERE user_id = ?').get('test-user-123') as any;
      if (position) {
        console.log('\n📊 Position:');
        console.log(`   Side: ${position.side.toUpperCase()}`);
        console.log(`   Shares: ${microUsdcToDisplay(BigInt(position.shares))}`);
        console.log(`   Cost: $${microUsdcToDisplay(BigInt(position.cost_basis))}`);
        console.log(`   Entry Price: ${position.entry_price_bps/100}%`);
      }
    } else {
      console.log(`\n❌ Order failed: ${result.error}`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);

 * Test placing an order
 */

import { initializeDatabase, db } from './src/db/schema.js';
import { executeMarketOrder } from './src/services/order-engine.js';
import { displayToMicroUsdc, microUsdcToDisplay } from './src/core/math.js';

async function main() {
  console.log('Testing order placement...\n');
  
  // Set env vars
  process.env.DATABASE_PATH = './data/markets.db';
  
  // Initialize DB
  initializeDatabase();
  
  // Check market exists
  const market = db.prepare('SELECT * FROM tokens WHERE mint = ?').get('MOCK1111111111111111111111111111111111111111') as any;
  
  if (!market) {
    console.error('Market not found! Run test-sync.ts first.');
    return;
  }
  
  console.log('Market found:', market.symbol, `(${market.progress_bps/100}% progress)`);
  
  // Place order
  console.log('\nPlacing $10 YES bet...');
  
  try {
    const result = await executeMarketOrder({
      userId: 'test-user-123',
      marketMint: 'MOCK1111111111111111111111111111111111111111',
      side: 'yes',
      amountMicroUsdc: displayToMicroUsdc(10), // $10
    });
    
    console.log('\nResult:', result);
    
    if (result.success) {
      console.log(`\n✅ Order executed!`);
      console.log(`   Shares: ${microUsdcToDisplay(result.shares!)}`);
      console.log(`   Effective Price: $${result.effectivePrice!.toFixed(4)}`);
      
      // Check position
      const position = db.prepare('SELECT * FROM positions WHERE user_id = ?').get('test-user-123') as any;
      if (position) {
        console.log('\n📊 Position:');
        console.log(`   Side: ${position.side.toUpperCase()}`);
        console.log(`   Shares: ${microUsdcToDisplay(BigInt(position.shares))}`);
        console.log(`   Cost: $${microUsdcToDisplay(BigInt(position.cost_basis))}`);
        console.log(`   Entry Price: ${position.entry_price_bps/100}%`);
      }
    } else {
      console.log(`\n❌ Order failed: ${result.error}`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);

