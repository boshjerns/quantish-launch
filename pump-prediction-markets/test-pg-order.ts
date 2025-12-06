/**
 * Test PostgreSQL order placement
 */

import {
  initializePostgresDatabase,
  getMarketByMintPg,
  createPositionPg,
  getUserPositionPg,
  updateMarketPoolPg,
} from './src/db/postgres.js';
import { calculateShares, calculatePriceFromProgress, displayToMicroUsdc, BPS_PRECISION } from './src/core/math.js';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  // Set env
  process.env.DATABASE_PUBLIC_URL = 'postgresql://postgres:ZBuNdoHzvWCHhZpDjkFfJPDgbgEfmGzY@mainline.proxy.rlwy.net:28824/railway';
  
  console.log('Testing PostgreSQL order...\n');
  
  try {
    await initializePostgresDatabase();
    
    const marketMint = 'MOCK4444444444444444444444444444444444444444';
    const userId = 'my-wallet-999';
    const side = 'yes';
    const amount = 50;
    
    // Get market
    console.log('1. Fetching market...');
    const market = await getMarketByMintPg(marketMint);
    
    if (!market) {
      console.log('Market not found!');
      return;
    }
    
    console.log(`   Found: ${market.symbol} (${market.progress_bps / 100}% progress)`);
    
    // Calculate price and shares
    const amountMicroUsdc = displayToMicroUsdc(amount);
    const realSolLamports = BigInt(market.real_sol_lamports);
    const priceQuote = calculatePriceFromProgress(realSolLamports);
    const currentPriceBps = side === 'yes' ? priceQuote.yesPriceBps : priceQuote.noPriceBps;
    
    console.log(`   Price: ${Number(currentPriceBps) / 10000}`);
    
    const shareCalc = calculateShares(amountMicroUsdc, currentPriceBps);
    console.log(`   Shares: ${shareCalc.shares}`);
    
    const now = Date.now();
    
    // Check existing position
    console.log('\n2. Checking existing position...');
    const existing = await getUserPositionPg(userId, marketMint, side);
    
    if (existing) {
      console.log(`   Found existing position: ${existing.id}`);
    } else {
      console.log('   No existing position');
      
      // Create new position
      console.log('\n3. Creating position...');
      const positionId = uuidv4();
      
      await createPositionPg({
        id: positionId,
        user_id: userId,
        market_mint: marketMint,
        side,
        shares: shareCalc.shares.toString(),
        cost_basis: amountMicroUsdc.toString(),
        entry_price_bps: Number(currentPriceBps),
        created_at: now,
        updated_at: now,
      });
      
      console.log(`   Created position: ${positionId}`);
      
      // Update pool
      console.log('\n4. Updating market pool...');
      await updateMarketPoolPg(marketMint, side, amountMicroUsdc.toString());
      console.log('   Done!');
    }
    
    console.log('\n✅ Order test complete!');
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
}

main();


 */

import {
  initializePostgresDatabase,
  getMarketByMintPg,
  createPositionPg,
  getUserPositionPg,
  updateMarketPoolPg,
} from './src/db/postgres.js';
import { calculateShares, calculatePriceFromProgress, displayToMicroUsdc, BPS_PRECISION } from './src/core/math.js';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  // Set env
  process.env.DATABASE_PUBLIC_URL = 'postgresql://postgres:ZBuNdoHzvWCHhZpDjkFfJPDgbgEfmGzY@mainline.proxy.rlwy.net:28824/railway';
  
  console.log('Testing PostgreSQL order...\n');
  
  try {
    await initializePostgresDatabase();
    
    const marketMint = 'MOCK4444444444444444444444444444444444444444';
    const userId = 'my-wallet-999';
    const side = 'yes';
    const amount = 50;
    
    // Get market
    console.log('1. Fetching market...');
    const market = await getMarketByMintPg(marketMint);
    
    if (!market) {
      console.log('Market not found!');
      return;
    }
    
    console.log(`   Found: ${market.symbol} (${market.progress_bps / 100}% progress)`);
    
    // Calculate price and shares
    const amountMicroUsdc = displayToMicroUsdc(amount);
    const realSolLamports = BigInt(market.real_sol_lamports);
    const priceQuote = calculatePriceFromProgress(realSolLamports);
    const currentPriceBps = side === 'yes' ? priceQuote.yesPriceBps : priceQuote.noPriceBps;
    
    console.log(`   Price: ${Number(currentPriceBps) / 10000}`);
    
    const shareCalc = calculateShares(amountMicroUsdc, currentPriceBps);
    console.log(`   Shares: ${shareCalc.shares}`);
    
    const now = Date.now();
    
    // Check existing position
    console.log('\n2. Checking existing position...');
    const existing = await getUserPositionPg(userId, marketMint, side);
    
    if (existing) {
      console.log(`   Found existing position: ${existing.id}`);
    } else {
      console.log('   No existing position');
      
      // Create new position
      console.log('\n3. Creating position...');
      const positionId = uuidv4();
      
      await createPositionPg({
        id: positionId,
        user_id: userId,
        market_mint: marketMint,
        side,
        shares: shareCalc.shares.toString(),
        cost_basis: amountMicroUsdc.toString(),
        entry_price_bps: Number(currentPriceBps),
        created_at: now,
        updated_at: now,
      });
      
      console.log(`   Created position: ${positionId}`);
      
      // Update pool
      console.log('\n4. Updating market pool...');
      await updateMarketPoolPg(marketMint, side, amountMicroUsdc.toString());
      console.log('   Done!');
    }
    
    console.log('\n✅ Order test complete!');
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
}

main();

