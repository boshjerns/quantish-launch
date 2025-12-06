/**
 * Test the sync function directly
 */

import { config } from './src/config/index.js';
import { initializeDatabase, db } from './src/db/schema.js';
import { syncMarkets, getActiveMarkets, dbMarketToCard } from './src/services/market-service.js';

async function main() {
  console.log('Testing market sync...\n');
  
  // Set env vars
  process.env.SOLANA_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=9e722182-5f97-466a-a3e8-c0d8c4622daf';
  process.env.DATABASE_PATH = './data/markets.db';
  
  // Initialize DB
  initializeDatabase();
  
  // Run sync
  console.log('\n1. Running sync...');
  const synced = await syncMarkets(10);
  console.log(`   Synced: ${synced}`);
  
  // Check markets
  console.log('\n2. Checking database...');
  const markets = getActiveMarkets(10);
  console.log(`   Found ${markets.length} markets in DB`);
  
  if (markets.length > 0) {
    console.log('\n3. First market:');
    const card = dbMarketToCard(markets[0]);
    console.log(JSON.stringify(card, null, 2));
  }
  
  // Direct DB check
  console.log('\n4. Direct DB query:');
  const all = db.prepare('SELECT mint, name, symbol, progress_bps, status FROM tokens').all();
  console.log(`   Total rows: ${all.length}`);
  all.slice(0, 3).forEach((row: any) => {
    console.log(`   - ${row.symbol}: ${row.progress_bps/100}% (${row.status})`);
  });
}

main().catch(console.error);

 * Test the sync function directly
 */

import { config } from './src/config/index.js';
import { initializeDatabase, db } from './src/db/schema.js';
import { syncMarkets, getActiveMarkets, dbMarketToCard } from './src/services/market-service.js';

async function main() {
  console.log('Testing market sync...\n');
  
  // Set env vars
  process.env.SOLANA_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=9e722182-5f97-466a-a3e8-c0d8c4622daf';
  process.env.DATABASE_PATH = './data/markets.db';
  
  // Initialize DB
  initializeDatabase();
  
  // Run sync
  console.log('\n1. Running sync...');
  const synced = await syncMarkets(10);
  console.log(`   Synced: ${synced}`);
  
  // Check markets
  console.log('\n2. Checking database...');
  const markets = getActiveMarkets(10);
  console.log(`   Found ${markets.length} markets in DB`);
  
  if (markets.length > 0) {
    console.log('\n3. First market:');
    const card = dbMarketToCard(markets[0]);
    console.log(JSON.stringify(card, null, 2));
  }
  
  // Direct DB check
  console.log('\n4. Direct DB query:');
  const all = db.prepare('SELECT mint, name, symbol, progress_bps, status FROM tokens').all();
  console.log(`   Total rows: ${all.length}`);
  all.slice(0, 3).forEach((row: any) => {
    console.log(`   - ${row.symbol}: ${row.progress_bps/100}% (${row.status})`);
  });
}

main().catch(console.error);

