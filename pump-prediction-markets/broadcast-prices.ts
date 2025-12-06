/**
 * Broadcast current prices via WebSocket
 * Connects as a client and triggers price refresh
 */

import WebSocket from 'ws';
import { getPool, query } from './src/db/postgres.js';

process.env.DATABASE_PUBLIC_URL = 'postgresql://postgres:ZBuNdoHzvWCHhZpDjkFfJPDgbgEfmGzY@mainline.proxy.rlwy.net:28824/railway';

async function broadcastPrices() {
  console.log('📡 Price Broadcaster Started\n');
  
  // Directly update and broadcast via API
  setInterval(async () => {
    try {
      // Get current prices from DB
      const markets = await query(
        'SELECT mint, symbol, progress_bps FROM tokens WHERE status = $1 ORDER BY progress_bps DESC',
        ['active']
      );
      
      console.log('Current prices:');
      markets.forEach((m: any) => {
        const yesPrice = (m.progress_bps / 10000).toFixed(3);
        console.log(`  ${m.symbol}: YES $${yesPrice}`);
      });
      console.log('');
      
    } catch (error) {
      console.error('Error:', error);
    }
  }, 5000);
}

broadcastPrices();

 * Broadcast current prices via WebSocket
 * Connects as a client and triggers price refresh
 */

import WebSocket from 'ws';
import { getPool, query } from './src/db/postgres.js';

process.env.DATABASE_PUBLIC_URL = 'postgresql://postgres:ZBuNdoHzvWCHhZpDjkFfJPDgbgEfmGzY@mainline.proxy.rlwy.net:28824/railway';

async function broadcastPrices() {
  console.log('📡 Price Broadcaster Started\n');
  
  // Directly update and broadcast via API
  setInterval(async () => {
    try {
      // Get current prices from DB
      const markets = await query(
        'SELECT mint, symbol, progress_bps FROM tokens WHERE status = $1 ORDER BY progress_bps DESC',
        ['active']
      );
      
      console.log('Current prices:');
      markets.forEach((m: any) => {
        const yesPrice = (m.progress_bps / 10000).toFixed(3);
        console.log(`  ${m.symbol}: YES $${yesPrice}`);
      });
      console.log('');
      
    } catch (error) {
      console.error('Error:', error);
    }
  }, 5000);
}

broadcastPrices();

