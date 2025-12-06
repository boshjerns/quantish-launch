/**
 * QUANTISH AUTOMATED MARKET MANAGER
 * 
 * Runs continuously to:
 * 1. Create new 30-minute markets every cycle
 * 2. Settle expired markets
 * 3. Update prices from pump.fun data
 * 
 * NO HUMAN INTERVENTION REQUIRED
 */

require('dotenv').config({ path: '../base-contracts/.env' });
const { ethers } = require('ethers');
const cron = require('node-cron');

// Config
const RPC = process.env.ALCHEMY_RPC_URL || 'https://base-mainnet.g.alchemy.com/v2/RAGQigMKiV7byokgnvmbr';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT = '0x223d2E7195C703EF6b26ce8Ce5Fb4C0618078361'; // V3 ONE-SIDED PROTECTION
const ORACLE = '0x224c7735d0cD863815b60eaa1B95A012b115e404';

// Use DexScreener API (no Cloudflare blocking)
const DEXSCREENER_PROFILES = 'https://api.dexscreener.com/token-profiles/latest/v1';
const DEXSCREENER_BOOSTS = 'https://api.dexscreener.com/token-boosts/latest/v1';
const DEXSCREENER_TOKEN = 'https://api.dexscreener.com/latest/dex/tokens/';

// How many tokens to create markets for each cycle
const MARKETS_PER_CYCLE = 15;

// Pump.fun graduation threshold
const GRADUATION_MCAP = 69000;
const MIN_MARKET_CAP = 5000;

// Contract ABIs
const MARKETS_ABI = [
  'function getMarketCount() view returns (uint256)',
  'function allMarketIds(uint256) view returns (bytes32)',
  'function getMarket(bytes32) view returns (bytes32 solanaTokenMint, uint256 startTime, uint256 endTime, uint256 yesPool, uint256 noPool, uint256 currentPriceBps, bool settled, bool outcome)',
  'function createMarket(bytes32 solanaTokenMint, uint256 initialPriceBps) returns (bytes32)',
  'function owner() view returns (address)',
  'event MarketCreated(bytes32 indexed marketId, bytes32 solanaTokenMint, uint256 startTime, uint256 endTime, uint256 initialPriceBps)',
];

const ORACLE_ABI = [
  'function updatePriceFromOracle(bytes32 marketId, uint256 solanaLamports)',
  'function settleMarket(bytes32 marketId, bool graduated, bytes32 proof)',
];

// State
let provider;
let wallet;
let marketsContract;
let oracleContract;
let activeMarkets = new Map(); // marketId -> { mint, mintHash, endTime, token }
let processedMints = new Set(); // Track mints we've already created markets for this cycle

async function init() {
  console.log('\n========================================');
  console.log('  QUANTISH AUTOMATED MARKET MANAGER');
  console.log('========================================\n');
  
  if (!PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY not set in environment');
  }
  
  provider = new ethers.JsonRpcProvider(RPC);
  wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  marketsContract = new ethers.Contract(CONTRACT, MARKETS_ABI, wallet);
  oracleContract = new ethers.Contract(ORACLE, ORACLE_ABI, wallet);
  
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Contract: ${CONTRACT}`);
  console.log(`Oracle: ${ORACLE}`);
  
  // Verify we're the owner
  const owner = await marketsContract.owner();
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`Not contract owner. Owner is ${owner}`);
  }
  console.log('✓ Verified as contract owner\n');
  
  // Load existing active markets
  await loadActiveMarkets();
}

async function loadActiveMarkets() {
  console.log('Loading existing markets...');
  
  try {
    const count = await marketsContract.getMarketCount();
    const now = Math.floor(Date.now() / 1000);
    
    for (let i = 0; i < Number(count); i++) {
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
        
        if (endTime > now) {
          console.log(`  Active market: ${marketId.slice(0, 18)}... ends in ${Math.floor((endTime - now) / 60)}m`);
        } else {
          console.log(`  Expired market (needs settlement): ${marketId.slice(0, 18)}...`);
        }
      }
    }
    
    console.log(`Loaded ${activeMarkets.size} active markets\n`);
  } catch (e) {
    console.error('Error loading markets:', e.message);
  }
}

async function getTokenMetadata(mint) {
  try {
    const res = await fetch(DEXSCREENER_TOKEN + mint);
    const data = await res.json();
    
    if (data.pairs && data.pairs[0]) {
      const pair = data.pairs[0];
      return {
        name: pair.baseToken?.name || 'Unknown',
        symbol: pair.baseToken?.symbol || mint.slice(0, 6),
        price: parseFloat(pair.priceUsd || 0),
        marketCap: parseFloat(pair.marketCap || pair.fdv || 0),
        volume24h: parseFloat(pair.volume?.h24 || 0),
        createdAt: pair.pairCreatedAt || Date.now(),
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function fetchPumpTokens() {
  console.log('[DEXSCREENER] Fetching real pump.fun tokens...');
  
  try {
    // 1. Get latest token profiles
    const profilesRes = await fetch(DEXSCREENER_PROFILES);
    const profiles = await profilesRes.json();
    
    // Filter for pump.fun tokens (addresses end in 'pump')
    const pumpProfiles = profiles
      .filter(t => t.chainId === 'solana' && t.tokenAddress.endsWith('pump'))
      .slice(0, 30);
    
    console.log(`[DEXSCREENER] Found ${pumpProfiles.length} pump.fun tokens in latest profiles`);
    
    // 2. Also get boosted tokens for variety
    let boostedTokens = [];
    try {
      const boostsRes = await fetch(DEXSCREENER_BOOSTS);
      const boosts = await boostsRes.json();
      boostedTokens = boosts
        .filter(t => t.chainId === 'solana' && t.tokenAddress.endsWith('pump'))
        .slice(0, 10);
    } catch (e) {}
    
    // 3. Merge and dedupe
    const allTokenAddresses = new Set();
    const allProfiles = [];
    
    for (const p of [...pumpProfiles, ...boostedTokens]) {
      if (!allTokenAddresses.has(p.tokenAddress)) {
        allTokenAddresses.add(p.tokenAddress);
        allProfiles.push(p);
      }
    }
    
    // 4. Get detailed data for each token
    const tokens = [];
    
    for (const profile of allProfiles.slice(0, 25)) {
      try {
        const metadata = await getTokenMetadata(profile.tokenAddress);
        if (!metadata) continue;
        
        // Skip if below minimum market cap or already graduated
        if (metadata.marketCap < MIN_MARKET_CAP) continue;
        if (metadata.marketCap >= GRADUATION_MCAP) continue;
        
        const bondingProgress = Math.min(99, (metadata.marketCap / GRADUATION_MCAP) * 100);
        
        tokens.push({
          mint: profile.tokenAddress,
          name: metadata.name,
          symbol: metadata.symbol,
          marketCap: metadata.marketCap,
          bonding_curve_progress: bondingProgress,
          complete: false,
        });
        
        // Rate limit
        await new Promise(r => setTimeout(r, 150));
        
      } catch (e) {
        continue;
      }
    }
    
    console.log(`[DEXSCREENER] ${tokens.length} tokens qualify (MC $${MIN_MARKET_CAP}+ and not graduated)`);
    
    // Sort by bonding progress (most interesting = 30-90%)
    tokens.sort((a, b) => {
      const scoreA = a.bonding_curve_progress >= 30 && a.bonding_curve_progress <= 90 ? 1000 : 0;
      const scoreB = b.bonding_curve_progress >= 30 && b.bonding_curve_progress <= 90 ? 1000 : 0;
      return (scoreB + b.bonding_curve_progress) - (scoreA + a.bonding_curve_progress);
    });
    
    return tokens.slice(0, MARKETS_PER_CYCLE);
    
  } catch (e) {
    console.error('[DEXSCREENER] Error fetching tokens:', e.message);
    return [];
  }
}

async function createMarketsForTokens(tokens) {
  console.log(`\n[${new Date().toISOString()}] Creating markets for ${tokens.length} REAL pump.fun tokens...`);
  
  // Show what we're about to create
  console.log('\nTokens to process:');
  tokens.slice(0, 8).forEach(t => {
    console.log(`  ${t.symbol.padEnd(12)} ${t.bonding_curve_progress.toFixed(1).padStart(5)}% MC: $${(t.marketCap/1000).toFixed(1)}k`);
  });
  console.log('');
  
  let created = 0;
  let skipped = 0;
  
  for (const token of tokens) {
    try {
      // Hash the mint address to get bytes32
      const mintHash = ethers.keccak256(ethers.toUtf8Bytes(token.mint));
      
      // Check if we already have an active market for this token
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
        skipped++;
        continue;
      }
      
      // Calculate initial price from bonding progress
      const bondingProgress = token.bonding_curve_progress;
      const priceBps = Math.floor(Math.min(9900, Math.max(100, bondingProgress * 100)));
      
      console.log(`  Creating: ${token.symbol} (${token.name.slice(0, 20)}) ${bondingProgress.toFixed(1)}%...`);
      
      const tx = await marketsContract.createMarket(mintHash, priceBps);
      const receipt = await tx.wait();
      
      // Find MarketCreated event
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
        
        console.log(`    ✓ Market ID: ${marketId.slice(0, 18)}... ends at ${new Date(endTime * 1000).toISOString()}`);
        created++;
      }
      
      // Delay between transactions to avoid nonce issues
      await new Promise(r => setTimeout(r, 1500));
      
    } catch (e) {
      console.error(`    ✗ Failed: ${token.symbol}: ${e.message.slice(0, 100)}`);
    }
  }
  
  console.log(`\n✅ Created ${created} markets, skipped ${skipped} (already active)`);
}

async function settleExpiredMarkets() {
  console.log(`\n[${new Date().toISOString()}] Checking for expired markets...`);
  
  const now = Math.floor(Date.now() / 1000);
  let settled = 0;
  
  for (const [marketId, market] of activeMarkets) {
    if (market.settled) continue;
    if (market.endTime > now) continue;
    
    try {
      console.log(`  Settling market ${marketId.slice(0, 18)}...`);
      
      // Fetch current token status to determine if it graduated
      // For now, we'll check if bonding progress >= 100%
      let graduated = false;
      
      if (market.token && market.token.complete) {
        graduated = true;
      } else if (market.token && market.token.bonding_curve_progress >= 100) {
        graduated = true;
      }
      
      // Create a proof (in production, this would be from Wormhole)
      const proof = ethers.keccak256(ethers.toUtf8Bytes(`settlement_${marketId}_${Date.now()}`));
      
      const tx = await oracleContract.settleMarket(marketId, graduated, proof);
      await tx.wait();
      
      market.settled = true;
      console.log(`    ✓ Settled: ${graduated ? 'GRADUATED (YES wins)' : 'NOT GRADUATED (NO wins)'}`);
      settled++;
      
      await new Promise(r => setTimeout(r, 500));
      
    } catch (e) {
      console.error(`    ✗ Failed to settle: ${e.message}`);
    }
  }
  
  // Clean up settled markets from tracking
  for (const [marketId, market] of activeMarkets) {
    if (market.settled) {
      activeMarkets.delete(marketId);
    }
  }
  
  if (settled > 0) {
    console.log(`Settled ${settled} markets`);
  } else {
    console.log('No markets to settle');
  }
}

async function updatePrices() {
  console.log(`\n[${new Date().toISOString()}] Updating prices for active markets...`);
  
  const now = Math.floor(Date.now() / 1000);
  let updated = 0;
  let total = 0;
  
  for (const [marketId, market] of activeMarkets) {
    if (market.settled || market.endTime <= now) continue;
    total++;
    
    // Fetch current token data from DexScreener
    const mint = market.mint;
    if (!mint) continue;
    
    try {
      const metadata = await getTokenMetadata(mint);
      if (!metadata) continue;
      
      // Calculate bonding progress
      const bondingProgress = Math.min(99, (metadata.marketCap / GRADUATION_MCAP) * 100);
      
      // Convert to lamports for oracle
      const lamports = BigInt(Math.floor(bondingProgress * 1e9));
      
      const tx = await oracleContract.updatePriceFromOracle(marketId, lamports);
      await tx.wait();
      
      // Update stored token data
      market.token = {
        ...market.token,
        ...metadata,
        bonding_curve_progress: bondingProgress,
        complete: metadata.marketCap >= GRADUATION_MCAP,
      };
      
      console.log(`  ${market.token?.symbol || 'Unknown'}: ${bondingProgress.toFixed(1)}% (MC: $${(metadata.marketCap/1000).toFixed(1)}k)`);
      updated++;
      
      await new Promise(r => setTimeout(r, 500));
      
    } catch (e) {
      // Silently skip price update errors
    }
  }
  
  console.log(`Updated ${updated}/${total} market prices`);
}

async function runCycle() {
  console.log('\n' + '='.repeat(60));
  console.log(`MARKET CYCLE - ${new Date().toISOString()}`);
  console.log('='.repeat(60));
  
  try {
    // 1. Settle any expired markets
    await settleExpiredMarkets();
    
    // 2. Fetch current pump.fun tokens
    const tokens = await fetchPumpTokens();
    
    if (tokens.length === 0) {
      console.log('No tokens fetched, skipping market creation');
      return;
    }
    
    // 3. Create markets for tokens that don't have one
    await createMarketsForTokens(tokens);
    
    // 4. Update prices for active markets
    await updatePrices();
    
    console.log(`\nActive markets: ${activeMarkets.size}`);
    console.log('Next cycle in 30 minutes...\n');
    
  } catch (e) {
    console.error('Cycle error:', e.message);
  }
}

async function main() {
  await init();
  
  // Run immediately on start
  await runCycle();
  
  // Schedule to run every 30 minutes (at :00 and :30)
  cron.schedule('0,30 * * * *', async () => {
    await runCycle();
  });
  
  // Also update prices every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    if (activeMarkets.size > 0) {
      await updatePrices();
    }
  });
  
  console.log('Market manager running...');
  console.log('  - New markets created every 30 minutes');
  console.log('  - Prices updated every 5 minutes');
  console.log('  - Expired markets settled automatically\n');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});

