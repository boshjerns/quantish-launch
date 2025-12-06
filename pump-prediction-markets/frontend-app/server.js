import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());

// Proxy for pump.fun API - REAL DATA ONLY
app.get('/api/pump/coins', async (req, res) => {
  try {
    const { offset = 0, limit = 100, sort = 'created_timestamp', order = 'DESC' } = req.query;
    const url = `https://frontend-api.pump.fun/coins?offset=${offset}&limit=${limit}&sort=${sort}&order=${order}&includeNsfw=false`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://pump.fun/',
      }
    });
    
    if (!response.ok) {
      console.error('Pump.fun API error:', response.status, response.statusText);
      return res.status(response.status).json({ error: 'Pump.fun API error' });
    }
    
    const data = await response.json();
    console.log(`Fetched ${data.length} real tokens from pump.fun`);
    res.json(data);
  } catch (e) {
    console.error('Proxy error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Get specific coin
app.get('/api/pump/coin/:mint', async (req, res) => {
  try {
    const url = `https://frontend-api.pump.fun/coins/${req.params.mint}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://pump.fun/',
      }
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Not found' });
    }
    
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n✓ Pump.fun Proxy running on http://localhost:${PORT}`);
  console.log(`  Fetching REAL data from pump.fun API\n`);
});
