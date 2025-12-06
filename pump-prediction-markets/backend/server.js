const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    https.get({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: { 'Accept': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

// Get token details from DexScreener
async function getTokenDetails(address) {
  try {
    const data = await fetchJSON(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    if (data.pairs && data.pairs.length > 0) {
      const p = data.pairs[0];
      return {
        name: p.baseToken?.name || 'Unknown',
        symbol: p.baseToken?.symbol || '???',
        priceUsd: parseFloat(p.priceUsd) || 0,
        marketCap: parseFloat(p.fdv) || 0,
        volume24h: parseFloat(p.volume?.h24) || 0,
        priceChange24h: parseFloat(p.priceChange?.h24) || 0,
        liquidity: parseFloat(p.liquidity?.usd) || 0,
        dexUrl: p.url,
      };
    }
  } catch (e) {
    console.log('Failed to get details for', address);
  }
  return null;
}

app.get('/api/tokens', async (req, res) => {
  const limit = parseInt(req.query.limit) || 30;
  
  console.log('\n--- Fetching REAL Solana token data ---');
  
  try {
    // Get token profiles (images)
    const profiles = await fetchJSON('https://api.dexscreener.com/token-profiles/latest/v1');
    const profileMap = {};
    for (const p of profiles) {
      if (p.chainId === 'solana') {
        profileMap[p.tokenAddress] = { image: p.icon };
      }
    }
    console.log(`Got ${Object.keys(profileMap).length} profiles with images`);
    
    // Get boosted/trending tokens
    const boosts = await fetchJSON('https://api.dexscreener.com/token-boosts/latest/v1');
    const solanaBoosts = boosts.filter(b => b.chainId === 'solana').slice(0, limit);
    console.log(`Got ${solanaBoosts.length} boosted Solana tokens`);
    
    // Get details for each token
    const tokens = [];
    for (const boost of solanaBoosts.slice(0, Math.min(limit, 20))) {
      const details = await getTokenDetails(boost.tokenAddress);
      if (details) {
        const profile = profileMap[boost.tokenAddress];
        tokens.push({
          mint: boost.tokenAddress,
          ...details,
          image: profile?.image || null,
          isPumpFun: boost.tokenAddress.endsWith('pump'),
        });
      }
    }
    
    // Sort by volume
    tokens.sort((a, b) => b.volume24h - a.volume24h);
    
    console.log(`Returning ${tokens.length} REAL tokens with data`);
    res.json(tokens);
    
  } catch (e) {
    console.error('Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(3001, () => console.log('✓ Backend at http://localhost:3001'));
