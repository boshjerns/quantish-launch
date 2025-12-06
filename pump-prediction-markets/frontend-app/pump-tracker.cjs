/**
 * PUMP.FUN FACTORY TRACKER
 * 
 * Monitors the pump.fun program on Solana to track:
 * 1. New token creations
 * 2. Bonding curve state (SOL reserves = progress)
 * 3. Token graduations
 * 
 * Pump.fun addresses:
 * - Program: 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
 * - Fee account: CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM
 * - Global account: 4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf
 */

const WebSocket = require('ws');

const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const SOLANA_WS = 'wss://api.mainnet-beta.solana.com';
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

// Bonding curve graduation threshold (in SOL)
const GRADUATION_SOL = 85;

// Track discovered tokens
const tokens = new Map();

/**
 * Get bonding curve account for a token
 * The bonding curve PDA is derived from the mint
 */
async function getBondingCurveAddress(mint) {
  // The bonding curve is a PDA derived from seeds: ["bonding-curve", mint]
  // For now, we'll track it from transactions
  return null;
}

/**
 * Parse pump.fun transaction to extract token info
 */
function parseTransaction(tx) {
  const result = {
    type: null,
    mint: null,
    solAmount: 0,
    tokenAmount: 0,
  };
  
  if (!tx.meta || !tx.meta.innerInstructions) return result;
  
  // Look for pump token mints (end in "pump")
  for (const inner of tx.meta.innerInstructions) {
    for (const ix of inner.instructions) {
      if (ix.parsed?.info?.mint && ix.parsed.info.mint.endsWith('pump')) {
        result.mint = ix.parsed.info.mint;
      }
      if (ix.parsed?.type === 'transfer' && ix.parsed?.info?.lamports) {
        result.solAmount += ix.parsed.info.lamports / 1e9;
      }
    }
  }
  
  // Determine transaction type from logs
  if (tx.meta.logMessages) {
    const logs = tx.meta.logMessages.join(' ');
    if (logs.includes('Create')) result.type = 'create';
    else if (logs.includes('Buy')) result.type = 'buy';
    else if (logs.includes('Sell')) result.type = 'sell';
  }
  
  return result;
}

/**
 * Fetch recent pump.fun transactions
 */
async function fetchRecentTransactions(limit = 20) {
  console.log(`\nFetching last ${limit} pump.fun transactions...`);
  
  try {
    // Get signatures
    const sigRes = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [PUMP_PROGRAM, { limit }]
      })
    });
    
    const sigData = await sigRes.json();
    if (!sigData.result) {
      console.log('No signatures found');
      return [];
    }
    
    console.log(`Got ${sigData.result.length} signatures`);
    
    // Get transaction details (batch)
    const txPromises = sigData.result.slice(0, 10).map(async (sig) => {
      const txRes = await fetch(SOLANA_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
        })
      });
      return txRes.json();
    });
    
    const txResults = await Promise.all(txPromises);
    
    const parsedTokens = [];
    for (const tx of txResults) {
      if (tx.result) {
        const parsed = parseTransaction(tx.result);
        if (parsed.mint) {
          parsedTokens.push(parsed);
          tokens.set(parsed.mint, {
            ...parsed,
            lastSeen: Date.now(),
          });
        }
      }
    }
    
    console.log(`Found ${parsedTokens.length} pump.fun tokens in recent transactions`);
    return parsedTokens;
    
  } catch (e) {
    console.error('Error fetching transactions:', e.message);
    return [];
  }
}

/**
 * Get token metadata from DexScreener
 */
async function getTokenMetadata(mint) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const data = await res.json();
    
    if (data.pairs && data.pairs.length > 0) {
      const pair = data.pairs[0];
      return {
        name: pair.baseToken.name,
        symbol: pair.baseToken.symbol,
        price: parseFloat(pair.priceUsd || 0),
        marketCap: parseFloat(pair.marketCap || 0),
        liquidity: parseFloat(pair.liquidity?.usd || 0),
        volume24h: parseFloat(pair.volume?.h24 || 0),
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Calculate bonding curve progress from market cap
 * Pump.fun graduates at ~$69k market cap (85 SOL @ ~$200/SOL)
 */
function calculateProgress(marketCap) {
  const GRADUATION_MCAP = 69000;
  return Math.min(100, (marketCap / GRADUATION_MCAP) * 100);
}

/**
 * Get all tracked tokens with enriched data
 */
async function getAllTokens() {
  // First, fetch recent transactions to discover tokens
  await fetchRecentTransactions(30);
  
  // Enrich with metadata
  const enrichedTokens = [];
  
  for (const [mint, data] of tokens) {
    const metadata = await getTokenMetadata(mint);
    
    if (metadata) {
      enrichedTokens.push({
        mint,
        name: metadata.name,
        symbol: metadata.symbol,
        price: metadata.price,
        marketCap: metadata.marketCap,
        bondingProgress: calculateProgress(metadata.marketCap),
        liquidity: metadata.liquidity,
        volume24h: metadata.volume24h,
        complete: metadata.marketCap >= 69000,
        lastSeen: data.lastSeen,
      });
    } else {
      // Token exists but no DEX data yet (very new)
      enrichedTokens.push({
        mint,
        name: 'New Token',
        symbol: mint.slice(0, 6),
        price: 0,
        marketCap: 0,
        bondingProgress: 0,
        complete: false,
        lastSeen: data.lastSeen,
      });
    }
  }
  
  // Sort by bonding progress (closest to graduation first)
  enrichedTokens.sort((a, b) => {
    // Prioritize 30-90% range
    const scoreA = a.bondingProgress >= 30 && a.bondingProgress <= 90 ? 1000 : 0;
    const scoreB = b.bondingProgress >= 30 && b.bondingProgress <= 90 ? 1000 : 0;
    return (scoreB + b.bondingProgress) - (scoreA + a.bondingProgress);
  });
  
  return enrichedTokens;
}

/**
 * WebSocket subscription to pump.fun program (real-time updates)
 */
function subscribeToProgram(onTransaction) {
  console.log('Connecting to Solana WebSocket...');
  
  const ws = new WebSocket(SOLANA_WS);
  
  ws.on('open', () => {
    console.log('WebSocket connected, subscribing to pump.fun program...');
    
    // Subscribe to program logs
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'logsSubscribe',
      params: [
        { mentions: [PUMP_PROGRAM] },
        { commitment: 'confirmed' }
      ]
    }));
  });
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      if (msg.method === 'logsNotification') {
        const logs = msg.params?.result?.value?.logs || [];
        const signature = msg.params?.result?.value?.signature;
        
        // Check for pump.fun activity
        const logsStr = logs.join(' ');
        if (logsStr.includes('pump')) {
          console.log(`\n🔔 Pump.fun activity detected: ${signature?.slice(0, 20)}...`);
          
          // Determine type
          if (logsStr.includes('Create')) {
            console.log('   Type: NEW TOKEN CREATED');
          } else if (logsStr.includes('Buy')) {
            console.log('   Type: BUY');
          } else if (logsStr.includes('Sell')) {
            console.log('   Type: SELL');
          }
          
          if (onTransaction) {
            onTransaction({ signature, logs });
          }
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
  
  ws.on('close', () => {
    console.log('WebSocket closed, reconnecting in 5s...');
    setTimeout(() => subscribeToProgram(onTransaction), 5000);
  });
  
  return ws;
}

// Export for use in proxy server
module.exports = {
  getAllTokens,
  fetchRecentTransactions,
  subscribeToProgram,
  getTokenMetadata,
  calculateProgress,
  PUMP_PROGRAM,
};

// Run standalone for testing
if (require.main === module) {
  console.log('=== PUMP.FUN FACTORY TRACKER ===');
  console.log('Program:', PUMP_PROGRAM);
  console.log('');
  
  // Test: fetch recent tokens
  getAllTokens().then(tokens => {
    console.log('\n=== DISCOVERED TOKENS ===');
    tokens.slice(0, 10).forEach(t => {
      console.log(`${t.symbol.padEnd(10)} ${t.name.slice(0, 20).padEnd(20)} ${t.bondingProgress.toFixed(1).padStart(5)}% MC: $${(t.marketCap/1000).toFixed(1)}k`);
    });
    
    // Start real-time subscription
    console.log('\n=== STARTING REAL-TIME TRACKING ===');
    subscribeToProgram((tx) => {
      console.log('New activity:', tx.signature);
    });
  });
}

