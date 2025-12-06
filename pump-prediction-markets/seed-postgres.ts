/**
 * Seed PostgreSQL with mock markets
 */

import { initializePostgresDatabase, upsertMarketPg } from './src/db/postgres.js';
import { createMockMarkets } from './src/services/on-chain-fetcher.js';

async function main() {
  process.env.DATABASE_PUBLIC_URL = 'postgresql://postgres:ZBuNdoHzvWCHhZpDjkFfJPDgbgEfmGzY@mainline.proxy.rlwy.net:28824/railway';
  
  console.log('Seeding PostgreSQL with mock markets...\n');
  
  await initializePostgresDatabase();
  
  const mocks = createMockMarkets();
  
  for (const mock of mocks) {
    console.log(`  Adding ${mock.symbol}...`);
    await upsertMarketPg(mock);
  }
  
  console.log(`\n✅ Seeded ${mocks.length} markets to PostgreSQL`);
  process.exit(0);
}

main().catch(console.error);

 * Seed PostgreSQL with mock markets
 */

import { initializePostgresDatabase, upsertMarketPg } from './src/db/postgres.js';
import { createMockMarkets } from './src/services/on-chain-fetcher.js';

async function main() {
  process.env.DATABASE_PUBLIC_URL = 'postgresql://postgres:ZBuNdoHzvWCHhZpDjkFfJPDgbgEfmGzY@mainline.proxy.rlwy.net:28824/railway';
  
  console.log('Seeding PostgreSQL with mock markets...\n');
  
  await initializePostgresDatabase();
  
  const mocks = createMockMarkets();
  
  for (const mock of mocks) {
    console.log(`  Adding ${mock.symbol}...`);
    await upsertMarketPg(mock);
  }
  
  console.log(`\n✅ Seeded ${mocks.length} markets to PostgreSQL`);
  process.exit(0);
}

main().catch(console.error);

