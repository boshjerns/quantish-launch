/**
 * REAL-TIME PUMP.FUN PRICE SERVER
 * 
 * Architecture:
 * 1. DexScreener → Token discovery only
 * 2. Solana RPC → Fetch bonding curve data directly on-chain
 * 3. WebSocket → Stream updates to frontend
 * 
 * Bonding curve data is READ DIRECTLY FROM SOLANA - no third party APIs for prices
 */

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const { Connection, PublicKey } = require('@solana/web3.js');

const app = express();
app.use(cors());

// Solana connection - use Helius for better rate limits if available
const SOLANA_RPC = process.env.HELIUS_RPC || 'https://api.mainnet-beta.solana.com';
const SOLANA_WS = process.env.HELIUS_WS || 'wss://api.mainnet-beta.solana.com';
const PUMP_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Graduation threshold
const GRADUATION_SOL = 85;
const LAMPORTS_PER_SOL = 1_000_000_000;

// Cache of tracked tokens with their bonding curve addresses
const trackedTokens = new Map();
let solanaConnection = null;
let wsServer = null;
let wsClients = new Set();

/**
 * Parse bonding curve account data
 * Layout:
 * - discriminator: 8 bytes
 * - virtualTokenReserves: u64 (8 bytes)
 * - virtualSolReserves: u64 (8 bytes)  
 * - realTokenReserves: u64 (8 bytes)
 * - realSolReserves: u64 (8 bytes)
 * - tokenTotalSupply: u64 (8 bytes)
 * - complete: bool (1 byte)
 */
function parseBondingCurve(data) {
  if (!data || data.length < 49) return null;
  
  try {
    const virtualTokenReserves = data.readBigUInt64LE(8);
    const virtualSolReserves = data.readBigUInt64LE(16);
    const realTokenReserves = data.readBigUInt64LE(24);
    const realSolReserves = data.readBigUInt64LE(32);
    const tokenTotalSupply = data.readBigUInt64LE(40);
    const complete = data[48] === 1;
    
    // Calculate progress (0-100%)
    const solInCurve = Number(realSolReserves) / LAMPORTS_PER_SOL;
    const progress = Math.min(100, (solInCurve / GRADUATION_SOL) * 100);
    
    // Calculate price
    const price = Number(virtualSolReserves) / Number(virtualTokenReserves);
    const marketCap = price * Number(tokenTotalSupply) / LAMPORTS_PER_SOL;
    
    return {
      virtualTokenReserves: virtualTokenReserves.toString(),
      virtualSolReserves: virtualSolReserves.toString(),
      realSolReserves: realSolReserves.toString(),
      solInCurve,
      progress,
      marketCap,
      complete,
    };
  } catch (e) {
    console.error('Error parsing bonding curve:', e.message);
    return null;
  }
}

/**
 * Derive bonding curve PDA for a token
 */
function getBondingCurvePDA(mint) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), new PublicKey(mint).toBuffer()],
    PUMP_PROGRAM
  );
  return pda;
}

/**
 * Fetch bonding curve data directly from Solana
 */
async function fetchBondingCurve(mint) {
  try {
    const bondingCurvePDA = getBondingCurvePDA(mint);
    const accountInfo = await solanaConnection.getAccountInfo(bondingCurvePDA);
    
    if (!accountInfo) return null;
    
    return parseBondingCurve(accountInfo.data);
  } catch (e) {
    console.error(`Error fetching bonding curve for ${mint}:`, e.message);
    return null;
  }
}

/**
 * Discover tokens from DexScreener (discovery only, not for prices)
 */
async function discoverTokens() {
  try {
    console.log('[DISCOVERY] Fetching new pump.fun tokens from DexScreener...');
    
    const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
    const profiles = await response.json();
    
    const pumpTokens = profiles
      .filter(t => t.chainId === 'solana' && t.tokenAddress?.endsWith('pump'))
      .slice(0, 20);
    
    console.log(`[DISCOVERY] Found ${pumpTokens.length} pump.fun tokens`);
    
    // Get metadata for each
    for (const profile of pumpTokens) {
      if (trackedTokens.has(profile.tokenAddress)) continue;
      
      try {
        const metaRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${profile.tokenAddress}`);
        const metaData = await metaRes.json();
        
        if (metaData.pairs && metaData.pairs[0]) {
          const pair = metaData.pairs[0];
          trackedTokens.set(profile.tokenAddress, {
            mint: profile.tokenAddress,
            name: pair.baseToken?.name || 'Unknown',
            symbol: pair.baseToken?.symbol || '???',
            image: profile.icon || pair.info?.imageUrl,
            bondingCurvePDA: getBondingCurvePDA(profile.tokenAddress).toBase58(),
          });
        }
      } catch (e) {
        // Skip
      }
    }
    
    console.log(`[DISCOVERY] Now tracking ${trackedTokens.size} tokens`);
    return Array.from(trackedTokens.values());
  } catch (e) {
    console.error('[DISCOVERY] Error:', e.message);
    return [];
  }
}

/**
 * Update all token prices from Solana on-chain
 */
async function updateAllPrices() {
  const updates = [];
  
  for (const [mint, token] of trackedTokens) {
    try {
      const bondingData = await fetchBondingCurve(mint);
      
      if (bondingData) {
        // Skip graduated tokens
        if (bondingData.complete || bondingData.progress >= 100) {
          trackedTokens.delete(mint);
          continue;
        }
        
        // Skip very low progress
        if (bondingData.progress < 5) continue;
        
        const update = {
          mint,
          name: token.name,
          symbol: token.symbol,
          image: token.image,
          progress: bondingData.progress,
          solInCurve: bondingData.solInCurve,
          marketCap: bondingData.marketCap,
          complete: bondingData.complete,
          timestamp: Date.now(),
        };
        
        updates.push(update);
      }
    } catch (e) {
      // Skip failed fetches
    }
  }
  
  return updates;
}

/**
 * Broadcast updates to all WebSocket clients
 */
function broadcast(data) {
  const message = JSON.stringify(data);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

/**
 * Main price update loop
 */
async function priceUpdateLoop() {
  while (true) {
    try {
      const updates = await updateAllPrices();
      
      if (updates.length > 0) {
        console.log(`[PRICES] Updated ${updates.length} tokens from Solana on-chain`);
        
        // Broadcast to WebSocket clients
        broadcast({
          type: 'prices',
          tokens: updates,
          timestamp: Date.now(),
        });
      }
    } catch (e) {
      console.error('[PRICES] Update error:', e.message);
    }
    
    // Update every 2 seconds
    await new Promise(r => setTimeout(r, 2000));
  }
}

/**
 * Discovery loop - find new tokens periodically
 */
async function discoveryLoop() {
  while (true) {
    await discoverTokens();
    // Discover new tokens every 30 seconds
    await new Promise(r => setTimeout(r, 30000));
  }
}

// REST API endpoint for initial data
app.get('/api/pump/coins', async (req, res) => {
  try {
    const updates = await updateAllPrices();
    
    // Sort by progress
    updates.sort((a, b) => {
      const scoreA = a.progress >= 30 && a.progress <= 90 ? 1000 : 0;
      const scoreB = b.progress >= 30 && b.progress <= 90 ? 1000 : 0;
      return (scoreB + b.progress) - (scoreA + a.progress);
    });
    
    // Convert to expected format
    const tokens = updates.map(u => ({
      mint: u.mint,
      name: u.name,
      symbol: u.symbol,
      image_uri: u.image,
      bonding_curve_progress: u.progress,
      market_cap: u.marketCap,
      sol_in_curve: u.solInCurve,
      complete: u.complete,
    }));
    
    res.json(tokens);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    trackedTokens: trackedTokens.size,
    wsClients: wsClients.size,
    source: 'Solana On-Chain (direct RPC)',
  });
});

// Initialize
async function init() {
  console.log('');
  console.log('='.repeat(50));
  console.log('  REAL-TIME PUMP.FUN PRICE SERVER');
  console.log('  Reading directly from Solana on-chain');
  console.log('='.repeat(50));
  console.log('');
  
  // Connect to Solana
  console.log('[INIT] Connecting to Solana RPC:', SOLANA_RPC.slice(0, 40) + '...');
  solanaConnection = new Connection(SOLANA_RPC, 'confirmed');
  
  // Test connection
  const slot = await solanaConnection.getSlot();
  console.log('[INIT] Connected to Solana, current slot:', slot);
  
  // Initial token discovery
  await discoverTokens();
  
  // Start HTTP server
  const PORT = 3001;
  const server = app.listen(PORT, () => {
    console.log(`[HTTP] Server running on http://localhost:${PORT}`);
  });
  
  // Start WebSocket server
  wsServer = new WebSocket.Server({ server, path: '/ws' });
  
  wsServer.on('connection', (ws) => {
    console.log('[WS] Client connected');
    wsClients.add(ws);
    
    ws.on('close', () => {
      console.log('[WS] Client disconnected');
      wsClients.delete(ws);
    });
    
    // Send current data immediately
    updateAllPrices().then(updates => {
      ws.send(JSON.stringify({
        type: 'prices',
        tokens: updates,
        timestamp: Date.now(),
      }));
    });
  });
  
  console.log(`[WS] WebSocket server running on ws://localhost:${PORT}/ws`);
  
  // Start update loops
  priceUpdateLoop();
  discoveryLoop();
  
  console.log('');
  console.log('[READY] Server running with:');
  console.log('  - Price updates every 2 seconds from Solana on-chain');
  console.log('  - Token discovery every 30 seconds from DexScreener');
  console.log('  - WebSocket for real-time streaming to frontend');
  console.log('');
}

init().catch(console.error);

