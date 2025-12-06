/**
 * Price Simulator - Randomly changes mock market prices
 * Run this to see live updates in the frontend!
 */

import { getPool, query, execute } from './src/db/postgres.js';

process.env.DATABASE_PUBLIC_URL = 'postgresql://postgres:ZBuNdoHzvWCHhZpDjkFfJPDgbgEfmGzY@mainline.proxy.rlwy.net:28824/railway';

async function simulatePriceChanges() {
  console.log('🎰 Price Simulator Started');
  console.log('   Watch your frontend for live price updates!\n');
  
  const pool = getPool();
  
  // Get all markets
  const markets = await query('SELECT mint, symbol, progress_bps, real_sol_lamports FROM tokens WHERE status = $1', ['active']);
  
  console.log(`Found ${markets.length} active markets\n`);
  
  let iteration = 0;
  
  // Update prices every 5 seconds
  setInterval(async () => {
    iteration++;
    console.log(`\n--- Update #${iteration} ---`);
    
    for (const market of markets) {
      // Random walk: -5% to +5% change
      const currentProgress = market.progress_bps;
      const change = Math.floor((Math.random() - 0.5) * 500); // -250 to +250 bps
      let newProgress = currentProgress + change;
      
      // Keep within bounds (1% to 99%)
      newProgress = Math.max(100, Math.min(9900, newProgress));
      
      // Calculate new SOL amount (progress * 85 SOL threshold)
      const newSolLamports = BigInt(Math.floor((newProgress / 10000) * 85 * 1e9));
      
      // Update database
      await execute(
        'UPDATE tokens SET progress_bps = $1, real_sol_lamports = $2, updated_at = $3 WHERE mint = $4',
        [newProgress, newSolLamports.toString(), Date.now(), market.mint]
      );
      
      const direction = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';
      const yesPrice = (newProgress / 10000).toFixed(2);
      console.log(`   ${direction} ${market.symbol}: YES $${yesPrice} (${change > 0 ? '+' : ''}${(change/100).toFixed(1)}%)`);
      
      // Update local reference for next iteration
      market.progress_bps = newProgress;
    }
    
    console.log('\n   💡 Check your frontend - prices should update via WebSocket!');
    
  }, 5000); // Every 5 seconds
}

simulatePriceChanges().catch(console.error);

 * Price Simulator - Randomly changes mock market prices
 * Run this to see live updates in the frontend!
 */

import { getPool, query, execute } from './src/db/postgres.js';

process.env.DATABASE_PUBLIC_URL = 'postgresql://postgres:ZBuNdoHzvWCHhZpDjkFfJPDgbgEfmGzY@mainline.proxy.rlwy.net:28824/railway';

async function simulatePriceChanges() {
  console.log('🎰 Price Simulator Started');
  console.log('   Watch your frontend for live price updates!\n');
  
  const pool = getPool();
  
  // Get all markets
  const markets = await query('SELECT mint, symbol, progress_bps, real_sol_lamports FROM tokens WHERE status = $1', ['active']);
  
  console.log(`Found ${markets.length} active markets\n`);
  
  let iteration = 0;
  
  // Update prices every 5 seconds
  setInterval(async () => {
    iteration++;
    console.log(`\n--- Update #${iteration} ---`);
    
    for (const market of markets) {
      // Random walk: -5% to +5% change
      const currentProgress = market.progress_bps;
      const change = Math.floor((Math.random() - 0.5) * 500); // -250 to +250 bps
      let newProgress = currentProgress + change;
      
      // Keep within bounds (1% to 99%)
      newProgress = Math.max(100, Math.min(9900, newProgress));
      
      // Calculate new SOL amount (progress * 85 SOL threshold)
      const newSolLamports = BigInt(Math.floor((newProgress / 10000) * 85 * 1e9));
      
      // Update database
      await execute(
        'UPDATE tokens SET progress_bps = $1, real_sol_lamports = $2, updated_at = $3 WHERE mint = $4',
        [newProgress, newSolLamports.toString(), Date.now(), market.mint]
      );
      
      const direction = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';
      const yesPrice = (newProgress / 10000).toFixed(2);
      console.log(`   ${direction} ${market.symbol}: YES $${yesPrice} (${change > 0 ? '+' : ''}${(change/100).toFixed(1)}%)`);
      
      // Update local reference for next iteration
      market.progress_bps = newProgress;
    }
    
    console.log('\n   💡 Check your frontend - prices should update via WebSocket!');
    
  }, 5000); // Every 5 seconds
}

simulatePriceChanges().catch(console.error);

