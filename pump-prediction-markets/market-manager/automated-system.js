/**
 * QUANTISH AUTOMATED PREDICTION MARKET SYSTEM
 * 
 * This system:
 * 1. Tracks pump.fun factory for new tokens (via Solana RPC)
 * 2. Creates prediction markets on Base for qualifying tokens
 * 3. Updates oracle prices in real-time from bonding curve data
 * 4. Settles markets based on actual graduation status
 * 5. Runs 24/7 automatically
 */

require('dotenv').config();
const { ethers } = require('ethers');
const WebSocket = require('ws');
const cron = require('node-cron');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Solana
  SOLANA_RPC: 'https://api.mainnet-beta.solana.com',
  SOLANA_WS: 'wss://api.mainnet-beta.solana.com',
  PUMP_PROGRAM: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  
  // Base
  BASE_RPC: process.env.BASE_RPC || 'https://base-mainnet.g.alchemy.com/v2/RAGQigMKiV7byokgnvmbr',
  PRIVATE_KEY: process.env.PRIVATE_KEY,
  
  // Contracts on Base
  MARKETS_CONTRACT: '0x223d2E7195C703EF6b26ce8Ce5Fb4C0618078361', // V3
  ORACLE_CONTRACT: '0x224c7735d0cD863815b60eaa1B95A012b115e404',
  
  // Market parameters
  MARKETS_PER_CYCLE: 15,
  MARKET_DURATION_SECONDS: 30 * 60, // 30 minutes
  MIN_MARKET_CAP: 5000, // $5k minimum to create market
  GRADUATION_MCAP: 69000, // $69k = graduated
  
  // Timing
  CYCLE_INTERVAL_MS: 30 * 60 * 1000, // 30 minutes
  PRICE_UPDATE_INTERVAL_MS: 60 * 1000, // 1 minute
  SETTLEMENT_CHECK_INTERVAL_MS: 30 * 1000, // 30 seconds
};

// Contract ABIs
const MARKETS_ABI = [
  'function createMarket(bytes32 solanaTokenMint, uint256 initialPriceBps) external returns (bytes32)',
  'function updatePrice(bytes32 marketId, uint256 newPriceBps) external',
  'function settleMarket(bytes32 marketId, bool outcome) external',
  'function getMarket(bytes32 marketId) external view returns (bytes32 solanaTokenMint, uint256 startTime, uint256 endTime, uint256 yesPool, uint256 noPool, uint256 currentPriceBps, bool settled, bool outcome)',
  'function getMarketCount() external view returns (uint256)',
  'function allMarketIds(uint256 index) external view returns (bytes32)',
  'function owner() external view returns (address)',
  'event MarketCreated(bytes32 indexed marketId, bytes32 solanaTokenMint, uint256 startTime, uint256 endTime, uint256 initialPriceBps)',
  'event MarketSettled(bytes32 indexed marketId, bool outcome)',
];

const ORACLE_ABI = [
  'function updatePrice(bytes32 marketId, uint256 priceBps) external',
  'function owner() external view returns (address)',
];

// ============================================================================
// STATE
// ============================================================================

let provider, wallet, marketsContract, oracleContract;
const trackedTokens = new Map(); // mint -> { data, marketId, lastPrice }
const activeMarkets = new Map(); // marketId -> { mint, endTime, settled }
let ws = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initialize() {
  console.log('='.repeat(60));
  console.log('  QUANTISH AUTOMATED PREDICTION MARKET SYSTEM');
  console.log('='.repeat(60));
  console.log('');
  
  // Initialize Base connection
  provider = new ethers.JsonRpcProvider(CONFIG.BASE_RPC);
  wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
  marketsContract = new ethers.Contract(CONFIG.MARKETS_CONTRACT, MARKETS_ABI, wallet);
  oracleContract = new ethers.Contract(CONFIG.ORACLE_CONTRACT, ORACLE_ABI, wallet);
  
  console.log('Base wallet:', wallet.address);
  console.log('Markets contract:', CONFIG.MARKETS_CONTRACT);
  console.log('Oracle contract:', CONFIG.ORACLE_CONTRACT);
  
  // Verify ownership
  const owner = await marketsContract.owner();
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`Not contract owner. Owner is ${owner}`);
  }
  console.log('✓ Verified as contract owner\n');
  
  // Load existing markets
  await loadExistingMarkets();
  
  console.log('');
  console.log('System initialized successfully!');
  console.log('');
}

async function loadExistingMarkets() {
  console.log('Loading existing markets...');
  
  const count = await marketsContract.getMarketCount();
  const now = Math.floor(Date.now() / 1000);
  
  for (let i = Math.max(0, Number(count) - 50); i < Number(count); i++) {
    try {
      const marketId = await marketsContract.allMarketIds(i);
      const market = await marketsContract.getMarket(marketId);
      
      const endTime = Number(market[2]);
      const settled = market[6];
      
      if (!settled) {
        activeMarkets.set(marketId, {
          mintHash: market[0],
          endTime,
          settled: false,
        });
      }
    } catch (e) {
      // Skip
    }
  }
  
  console.log(`Loaded ${activeMarkets.size} active markets`);
}

// ============================================================================
// PUMP.FUN TRACKING (SOLANA)
// ============================================================================

/**
 * Fetch recent pump.fun tokens using DexScreener API
 * (More reliable than pump.fun API which has Cloudflare protection)
 */
async function fetchPumpTokens() {
  console.log('\n[DEXSCREENER] Fetching pump.fun tokens...');
  
  try {
    // Method 1: Get latest token profiles (new listings)
    const profilesRes = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
    const profiles = await profilesRes.json();
    
    // Filter for pump.fun tokens (addresses end in 'pump')
    const pumpProfiles = profiles
      .filter(t => t.chainId === 'solana' && t.tokenAddress.endsWith('pump'))
      .slice(0, 30);
    
    console.log(`[DEXSCREENER] Found ${pumpProfiles.length} pump.fun tokens in latest profiles`);
    
    // Get detailed data for each token
    const tokens = [];
    
    for (const profile of pumpProfiles) {
      try {
        const metadata = await getTokenMetadata(profile.tokenAddress);
        if (!metadata) continue;
        
        // Skip if below minimum market cap or already graduated
        if (metadata.marketCap < CONFIG.MIN_MARKET_CAP) continue;
        if (metadata.marketCap >= CONFIG.GRADUATION_MCAP) continue;
        
        const bondingProgress = Math.min(99, (metadata.marketCap / CONFIG.GRADUATION_MCAP) * 100);
        
        tokens.push({
          mint: profile.tokenAddress,
          ...metadata,
          bondingProgress,
          graduated: false,
        });
        
        trackedTokens.set(profile.tokenAddress, { mint: profile.tokenAddress, ...metadata });
        
        // Rate limit DexScreener requests
        await new Promise(r => setTimeout(r, 200));
        
      } catch (e) {
        // Skip tokens that fail to fetch
        continue;
      }
    }
    
    console.log(`[DEXSCREENER] ${tokens.length} tokens qualify (MC $${CONFIG.MIN_MARKET_CAP}+ and not graduated)`);
    
    // Sort by bonding progress (most interesting = 30-90%)
    tokens.sort((a, b) => {
      const scoreA = a.bondingProgress >= 30 && a.bondingProgress <= 90 ? 1000 : 0;
      const scoreB = b.bondingProgress >= 30 && b.bondingProgress <= 90 ? 1000 : 0;
      return (scoreB + b.bondingProgress) - (scoreA + a.bondingProgress);
    });
    
    return tokens.slice(0, CONFIG.MARKETS_PER_CYCLE);
    
  } catch (e) {
    console.error('[DEXSCREENER] Error fetching tokens:', e.message);
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
        name: pair.baseToken?.name || 'Unknown',
        symbol: pair.baseToken?.symbol || mint.slice(0, 6),
        price: parseFloat(pair.priceUsd || 0),
        marketCap: parseFloat(pair.marketCap || pair.fdv || 0),
        image: pair.info?.imageUrl || null,
        volume24h: parseFloat(pair.volume?.h24 || 0),
        priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
        createdAt: pair.pairCreatedAt || Date.now(),
      };
    }
    return null;
  } catch (e) {
    console.error(`[DEXSCREENER] Error fetching ${mint.slice(0, 10)}...: ${e.message}`);
    return null;
  }
}

/**
 * Fetch additional pump.fun tokens from DexScreener boosted tokens
 * These are tokens with paid promotions - often active trading
 */
async function fetchBoostedPumpTokens() {
  try {
    const res = await fetch('https://api.dexscreener.com/token-boosts/latest/v1');
    const boosts = await res.json();
    
    const pumpTokens = boosts
      .filter(t => t.chainId === 'solana' && t.tokenAddress.endsWith('pump'))
      .slice(0, 10);
    
    const tokens = [];
    for (const boost of pumpTokens) {
      const metadata = await getTokenMetadata(boost.tokenAddress);
      if (metadata && metadata.marketCap >= CONFIG.MIN_MARKET_CAP && metadata.marketCap < CONFIG.GRADUATION_MCAP) {
        tokens.push({
          mint: boost.tokenAddress,
          ...metadata,
          bondingProgress: Math.min(99, (metadata.marketCap / CONFIG.GRADUATION_MCAP) * 100),
          graduated: false,
          boosted: true,
        });
      }
      await new Promise(r => setTimeout(r, 200));
    }
    
    return tokens;
  } catch (e) {
    return [];
  }
}

/**
 * Periodic token discovery (replaces unreliable WebSocket)
 * Runs every 2 minutes to find new tokens
 */
let discoveryInterval = null;

function startTokenDiscovery() {
  console.log('\n[DISCOVERY] Starting periodic token discovery...');
  
  discoveryInterval = setInterval(async () => {
    try {
      // Fetch latest token profiles
      const profilesRes = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
      const profiles = await profilesRes.json();
      
      const newPumpTokens = profiles.filter(t => 
        t.chainId === 'solana' && 
        t.tokenAddress.endsWith('pump') &&
        !trackedTokens.has(t.tokenAddress)
      );
      
      if (newPumpTokens.length > 0) {
        console.log(`[DISCOVERY] 🆕 Found ${newPumpTokens.length} new pump.fun tokens!`);
        
        for (const token of newPumpTokens.slice(0, 5)) {
          const metadata = await getTokenMetadata(token.tokenAddress);
          if (metadata) {
            trackedTokens.set(token.tokenAddress, { mint: token.tokenAddress, ...metadata });
            console.log(`  + ${metadata.symbol} (${metadata.name}) MC: $${(metadata.marketCap/1000).toFixed(1)}k`);
          }
          await new Promise(r => setTimeout(r, 300));
        }
      }
    } catch (e) {
      // Silent fail for discovery
    }
  }, 2 * 60 * 1000); // Every 2 minutes
  
  console.log('[DISCOVERY] Running every 2 minutes');
}

// ============================================================================
// MARKET CREATION (BASE)
// ============================================================================

/**
 * Create prediction markets for tokens
 */
async function createMarketsForTokens(tokens) {
  console.log(`\n[BASE] Creating markets for ${tokens.length} tokens...`);
  
  let created = 0;
  
  for (const token of tokens) {
    try {
      // Generate mint hash (same as frontend does)
      const mintHash = ethers.keccak256(ethers.toUtf8Bytes(token.mint));
      
      // Check if market already exists for this token
      let hasActiveMarket = false;
      const now = Math.floor(Date.now() / 1000);
      
      for (const [marketId, market] of activeMarkets) {
        if (market.mintHash === mintHash && market.endTime > now && !market.settled) {
          hasActiveMarket = true;
          break;
        }
      }
      
      if (hasActiveMarket) {
        console.log(`  [SKIP] ${token.symbol} - already has active market`);
        continue;
      }
      
      // Calculate initial price from bonding progress
      const priceBps = Math.floor(Math.min(9900, Math.max(100, token.bondingProgress * 100)));
      
      console.log(`  Creating: ${token.symbol} (${token.bondingProgress.toFixed(1)}%)...`);
      
      const tx = await marketsContract.createMarket(mintHash, priceBps);
      const receipt = await tx.wait();
      
      // Extract market ID from event
      const event = receipt.logs.find(log => {
        try {
          return marketsContract.interface.parseLog(log)?.name === 'MarketCreated';
        } catch { return false; }
      });
      
      if (event) {
        const parsed = marketsContract.interface.parseLog(event);
        const marketId = parsed.args[0];
        const endTime = Number(parsed.args[3]);
        
        activeMarkets.set(marketId, {
          mintHash,
          mint: token.mint,
          endTime,
          settled: false,
          token,
        });
        
        console.log(`    ✓ Market created: ${marketId.slice(0, 18)}...`);
        created++;
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 1500));
      
    } catch (e) {
      console.error(`    ✗ Failed: ${e.message}`);
    }
  }
  
  console.log(`[BASE] Created ${created} markets`);
}

// ============================================================================
// PRICE UPDATES (ORACLE)
// ============================================================================

/**
 * Update prices for all active markets
 */
async function updateAllPrices() {
  console.log('\n[ORACLE] Updating prices...');
  
  const now = Math.floor(Date.now() / 1000);
  let updated = 0;
  
  for (const [marketId, market] of activeMarkets) {
    // Skip settled or expired markets
    if (market.settled || market.endTime <= now) continue;
    
    try {
      // Get current token data
      const mint = market.mint || trackedTokens.get(market.mintHash)?.mint;
      if (!mint) continue;
      
      const metadata = await getTokenMetadata(mint);
      if (!metadata) continue;
      
      // Calculate new price from bonding progress
      const bondingProgress = Math.min(99, (metadata.marketCap / CONFIG.GRADUATION_MCAP) * 100);
      const newPriceBps = Math.floor(Math.min(9900, Math.max(100, bondingProgress * 100)));
      
      // Update oracle
      const tx = await oracleContract.updatePrice(marketId, newPriceBps);
      await tx.wait();
      
      console.log(`  ${market.token?.symbol || 'Unknown'}: ${bondingProgress.toFixed(1)}% -> ${newPriceBps} BPS`);
      updated++;
      
      // Rate limit
      await new Promise(r => setTimeout(r, 500));
      
    } catch (e) {
      // Oracle updates may fail due to rate limits - that's OK
      if (!e.message.includes('Too soon')) {
        console.error(`  Error updating ${marketId.slice(0, 10)}...: ${e.message}`);
      }
    }
  }
  
  console.log(`[ORACLE] Updated ${updated} prices`);
}

// ============================================================================
// SETTLEMENT
// ============================================================================

/**
 * Check and settle expired markets
 */
async function settleExpiredMarkets() {
  const now = Math.floor(Date.now() / 1000);
  let settled = 0;
  
  for (const [marketId, market] of activeMarkets) {
    // Skip if not expired or already settled
    if (market.settled || market.endTime > now) continue;
    
    try {
      // Get current token status
      const mint = market.mint || trackedTokens.get(market.mintHash)?.mint;
      let graduated = false;
      
      if (mint) {
        const metadata = await getTokenMetadata(mint);
        if (metadata) {
          graduated = metadata.marketCap >= CONFIG.GRADUATION_MCAP;
        }
      }
      
      console.log(`[SETTLE] ${market.token?.symbol || marketId.slice(0, 10)}... -> ${graduated ? 'YES (graduated)' : 'NO (not graduated)'}`);
      
      // Settle on-chain
      const tx = await marketsContract.settleMarket(marketId, graduated);
      await tx.wait();
      
      market.settled = true;
      console.log(`  ✓ Settled!`);
      settled++;
      
      // Rate limit
      await new Promise(r => setTimeout(r, 1000));
      
    } catch (e) {
      console.error(`  ✗ Settlement failed: ${e.message}`);
    }
  }
  
  if (settled > 0) {
    console.log(`[SETTLE] Settled ${settled} markets`);
  }
}

// ============================================================================
// MAIN CYCLE
// ============================================================================

/**
 * Run one complete cycle
 */
async function runCycle() {
  console.log('\n' + '='.repeat(60));
  console.log(`  CYCLE START: ${new Date().toISOString()}`);
  console.log('='.repeat(60));
  
  try {
    // 1. Fetch new tokens from DexScreener (latest profiles)
    let tokens = await fetchPumpTokens();
    
    // 2. Also fetch boosted tokens for variety
    const boostedTokens = await fetchBoostedPumpTokens();
    
    // Merge and dedupe
    const seenMints = new Set(tokens.map(t => t.mint));
    for (const bt of boostedTokens) {
      if (!seenMints.has(bt.mint)) {
        tokens.push(bt);
        seenMints.add(bt.mint);
      }
    }
    
    // Sort again after merge
    tokens.sort((a, b) => {
      const scoreA = a.bondingProgress >= 30 && a.bondingProgress <= 90 ? 1000 : 0;
      const scoreB = b.bondingProgress >= 30 && b.bondingProgress <= 90 ? 1000 : 0;
      return (scoreB + b.bondingProgress) - (scoreA + a.bondingProgress);
    });
    
    tokens = tokens.slice(0, CONFIG.MARKETS_PER_CYCLE);
    
    if (tokens.length > 0) {
      console.log(`\nTop ${tokens.length} tokens found:`);
      tokens.slice(0, 8).forEach(t => {
        const boosted = t.boosted ? ' ⭐' : '';
        console.log(`  ${t.symbol.padEnd(10)} ${t.bondingProgress.toFixed(1).padStart(5)}% MC: $${(t.marketCap/1000).toFixed(1)}k${boosted}`);
      });
      
      // 3. Create markets
      await createMarketsForTokens(tokens);
    } else {
      console.log('\nNo qualifying tokens found this cycle');
    }
    
    // 4. Settle expired markets
    await settleExpiredMarkets();
    
  } catch (e) {
    console.error('Cycle error:', e.message);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('  CYCLE COMPLETE');
  console.log('='.repeat(60));
}

// ============================================================================
// STARTUP
// ============================================================================

async function main() {
  try {
    await initialize();
    
    // Start periodic token discovery (DexScreener-based)
    startTokenDiscovery();
    
    // Run initial cycle
    await runCycle();
    
    // Schedule cycles every 30 minutes (at :00 and :30)
    cron.schedule('0,30 * * * *', async () => {
      console.log('\n🔄 Scheduled cycle triggered');
      await runCycle();
    });
    
    // Update prices every minute
    setInterval(async () => {
      try {
        await updateAllPrices();
      } catch (e) {
        console.error('Price update error:', e.message);
      }
    }, CONFIG.PRICE_UPDATE_INTERVAL_MS);
    
    // Check settlements every 30 seconds
    setInterval(async () => {
      try {
        await settleExpiredMarkets();
      } catch (e) {
        console.error('Settlement check error:', e.message);
      }
    }, CONFIG.SETTLEMENT_CHECK_INTERVAL_MS);
    
    console.log('\n✅ AUTOMATED SYSTEM RUNNING');
    console.log('   - Cycles: every 30 minutes');
    console.log('   - Price updates: every 1 minute');
    console.log('   - Settlement checks: every 30 seconds');
    console.log('   - Token discovery: every 2 minutes (DexScreener)');
    console.log('\nPress Ctrl+C to stop\n');
    
  } catch (e) {
    console.error('Fatal error:', e.message);
    process.exit(1);
  }
}

main();

