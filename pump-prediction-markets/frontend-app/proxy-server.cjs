const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

/**
 * Fetch tokens from DexScreener - gets real Solana meme tokens
 * These are the tokens that are actively trading
 */
async function fetchFromDexScreener() {
  try {
    // Get trending Solana tokens
    const response = await fetch('https://api.dexscreener.com/latest/dex/tokens/solana', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) throw new Error(`DexScreener returned ${response.status}`);
    
    const data = await response.json();
    
    if (data.pairs && data.pairs.length > 0) {
      console.log(`DexScreener returned ${data.pairs.length} Solana pairs`);
      
      // Get unique tokens, prefer ones with "pump" in address (actual pump.fun tokens)
      const seen = new Set();
      const tokens = [];
      
      for (const pair of data.pairs) {
        if (!pair.baseToken?.address || seen.has(pair.baseToken.address)) continue;
        seen.add(pair.baseToken.address);
        
        const mcap = parseFloat(pair.marketCap || pair.fdv || 0);
        const liquidity = parseFloat(pair.liquidity?.usd || 0);
        
        // Skip very low liquidity tokens
        if (liquidity < 1000) continue;
        
        // Calculate bonding progress based on market cap
        // Pump.fun typically graduates around $60-80k market cap
        const GRADUATION_MCAP = 69000;
        const progress = mcap >= GRADUATION_MCAP ? 100 : Math.min(99, (mcap / GRADUATION_MCAP) * 100);
        
        tokens.push({
          mint: pair.baseToken.address,
          name: pair.baseToken.name || 'Unknown',
          symbol: pair.baseToken.symbol || '???',
          description: pair.info?.description || '',
          image_uri: pair.info?.imageUrl || null,
          bonding_curve_progress: progress,
          market_cap: mcap,
          created_timestamp: pair.pairCreatedAt || Date.now(),
          complete: progress >= 100,
          price_usd: parseFloat(pair.priceUsd || 0),
          volume_24h: parseFloat(pair.volume?.h24 || 0),
          liquidity_usd: liquidity,
          price_change_24h: parseFloat(pair.priceChange?.h24 || 0),
          is_pump_token: pair.baseToken.address.endsWith('pump'),
        });
        
        if (tokens.length >= 50) break;
      }
      
      return tokens;
    }
    
    throw new Error('No pairs found');
  } catch (e) {
    console.log('DexScreener tokens failed:', e.message);
    return null;
  }
}

/**
 * Alternative: Search for pump.fun specific tokens
 */
async function fetchPumpTokensFromSearch() {
  try {
    // Search specifically for pump.fun tokens
    const response = await fetch('https://api.dexscreener.com/latest/dex/search?q=pump.fun%20solana', {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.pairs) {
      const solanaPairs = data.pairs.filter(p => p.chainId === 'solana');
      console.log(`Search found ${solanaPairs.length} Solana pump pairs`);
      
      const seen = new Set();
      const tokens = [];
      
      for (const pair of solanaPairs) {
        if (!pair.baseToken?.address || seen.has(pair.baseToken.address)) continue;
        seen.add(pair.baseToken.address);
        
        const mcap = parseFloat(pair.marketCap || 0);
        const progress = Math.min(99, (mcap / 69000) * 100);
        
        tokens.push({
          mint: pair.baseToken.address,
          name: pair.baseToken.name,
          symbol: pair.baseToken.symbol,
          description: '',
          image_uri: pair.info?.imageUrl || null,
          bonding_curve_progress: progress,
          market_cap: mcap,
          created_timestamp: pair.pairCreatedAt || Date.now(),
          complete: progress >= 100,
          price_usd: parseFloat(pair.priceUsd || 0),
          volume_24h: parseFloat(pair.volume?.h24 || 0),
          liquidity_usd: parseFloat(pair.liquidity?.usd || 0),
          price_change_24h: parseFloat(pair.priceChange?.h24 || 0),
          is_pump_token: true,
        });
        
        if (tokens.length >= 50) break;
      }
      
      return tokens;
    }
    
    return null;
  } catch (e) {
    console.log('Pump search failed:', e.message);
    return null;
  }
}

/**
 * Get token profiles from DexScreener (includes images/descriptions)
 */
async function fetchTokenProfiles() {
  try {
    const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1', {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    // Filter for Solana tokens only
    const solanaTokens = data.filter(t => 
      t.chainId === 'solana' || 
      (t.tokenAddress && t.tokenAddress.length > 40)
    );
    
    console.log(`Token profiles: ${solanaTokens.length} Solana tokens`);
    
    return solanaTokens.slice(0, 50).map(token => ({
      mint: token.tokenAddress,
      name: token.description?.split('\n')[0]?.slice(0, 50) || 'Token',
      symbol: token.symbol || '???',
      description: token.description || '',
      image_uri: token.icon || token.header || null,
      bonding_curve_progress: 50, // Will be updated with price data
      market_cap: 0,
      created_timestamp: Date.now(),
      complete: false,
    }));
  } catch (e) {
    console.log('Token profiles failed:', e.message);
    return null;
  }
}

/**
 * Fetch REAL pump.fun tokens using token-profiles endpoint
 * ONLY returns tokens with addresses ending in 'pump'
 */
async function fetchRealPumpTokens() {
  try {
    console.log('Fetching pump.fun tokens from token-profiles...');
    const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
    const profiles = await response.json();
    
    // STRICT FILTER: Only tokens with addresses ending in 'pump'
    const pumpProfiles = profiles.filter(t => 
      t.chainId === 'solana' && 
      t.tokenAddress && 
      t.tokenAddress.endsWith('pump')
    ).slice(0, 25);
    
    console.log(`Found ${pumpProfiles.length} tokens ending in 'pump'`);
    
    if (pumpProfiles.length === 0) {
      console.log('No pump.fun tokens found in profiles!');
      return [];
    }
    
    const tokens = [];
    const GRADUATION_MCAP = 69000;
    
    for (const profile of pumpProfiles) {
      try {
        // Double-check it ends in 'pump'
        if (!profile.tokenAddress.endsWith('pump')) continue;
        
        // Get market data from DexScreener
        const dataRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${profile.tokenAddress}`);
        const data = await dataRes.json();
        
        if (data.pairs && data.pairs[0]) {
          const pair = data.pairs[0];
          const mcap = parseFloat(pair.marketCap || pair.fdv || 0);
          
          // Skip if already graduated
          if (mcap >= GRADUATION_MCAP) {
            console.log(`  Skip ${pair.baseToken?.symbol} - graduated ($${(mcap/1000).toFixed(0)}k)`);
            continue;
          }
          
          // Skip if market cap too low
          if (mcap < 5000) {
            continue;
          }
          
          const progress = Math.min(99, (mcap / GRADUATION_MCAP) * 100);
          
          tokens.push({
            mint: profile.tokenAddress,
            name: pair.baseToken?.name || 'Unknown',
            symbol: pair.baseToken?.symbol || '???',
            description: profile.description || '',
            image_uri: profile.icon || pair.info?.imageUrl || null,
            bonding_curve_progress: progress,
            market_cap: mcap,
            created_timestamp: pair.pairCreatedAt || Date.now(),
            complete: false,
            price_usd: parseFloat(pair.priceUsd || 0),
            volume_24h: parseFloat(pair.volume?.h24 || 0),
            liquidity_usd: parseFloat(pair.liquidity?.usd || 0),
            price_change_24h: parseFloat(pair.priceChange?.h24 || 0),
            is_pump_token: true,
          });
          
          console.log(`  ✓ ${pair.baseToken?.symbol} ${progress.toFixed(0)}% $${(mcap/1000).toFixed(0)}k`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 150));
        
      } catch (e) {
        continue;
      }
    }
    
    console.log(`Returning ${tokens.length} valid pump.fun tokens`);
    return tokens;
  } catch (e) {
    console.error('Error fetching pump tokens:', e.message);
    return [];
  }
}

/**
 * Main endpoint - get ONLY real pump.fun tokens (addresses end in 'pump')
 */
app.get('/api/pump/coins', async (req, res) => {
  console.log('\n=== Fetching REAL pump.fun tokens ONLY ===');
  
  // Get real pump.fun tokens - NO FALLBACKS to general tokens
  let tokens = await fetchRealPumpTokens();
  
  if (!tokens || tokens.length === 0) {
    console.log('No pump.fun tokens found, returning empty');
    return res.json([]);
  }
  
  // STRICT FILTER: Only tokens with addresses ending in 'pump'
  tokens = tokens.filter(t => t.mint && t.mint.endsWith('pump'));
  
  // Filter out graduated tokens (>= 100% or market cap >= $69k)
  tokens = tokens.filter(t => t.bonding_curve_progress < 100 && t.market_cap < 69000);
  
  // Remove duplicates
  const seen = new Set();
  tokens = tokens.filter(t => {
    if (seen.has(t.mint)) return false;
    seen.add(t.mint);
    return true;
  });
  
  // Sort by bonding curve progress (closest to graduating = most interesting)
  tokens.sort((a, b) => {
    // Prioritize tokens between 30-90% (most exciting range)
    const scoreA = a.bonding_curve_progress >= 30 && a.bonding_curve_progress <= 90 ? 1000 : 0;
    const scoreB = b.bonding_curve_progress >= 30 && b.bonding_curve_progress <= 90 ? 1000 : 0;
    return (scoreB + b.bonding_curve_progress) - (scoreA + a.bonding_curve_progress);
  });
  
  console.log(`✅ Returning ${tokens.length} pump.fun tokens (addresses end in 'pump')`);
  if (tokens.length > 0) {
    console.log('Tokens:', tokens.slice(0, 5).map(t => 
      `${t.symbol} ${t.bonding_curve_progress.toFixed(0)}% $${(t.market_cap/1000).toFixed(0)}k`
    ).join(', '));
  }
  
  res.json(tokens);
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    source: 'DexScreener (pump.fun API blocked by Cloudflare)'
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log('');
  console.log('==========================================');
  console.log('  PUMP.FUN TOKEN PROXY (REAL DATA)');
  console.log(`  http://localhost:${PORT}`);
  console.log('');
  console.log('  Note: pump.fun API blocked by Cloudflare');
  console.log('  Using DexScreener for real Solana tokens');
  console.log('');
  console.log('  Market cap → Bonding curve progress:');
  console.log('    $0 → 0%');
  console.log('    $69k → 100% (graduated)');
  console.log('==========================================');
  console.log('');
});
