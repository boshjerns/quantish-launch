/**
 * PRODUCTION SERVER - Pump.fun Prediction Markets
 * 
 * Features:
 * - PostgreSQL with atomic transactions
 * - API key authentication
 * - Rate limiting
 * - Full audit logging
 * - WebSocket real-time updates
 * - Settlement verification
 */

import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import cron from 'node-cron';
import { config } from './config/index.js';
import {
  initializePostgresDatabase,
  getActiveMarketsPg,
  getMarketByMintPg,
  upsertMarketPg,
  getUserPositionsPg,
  settleMarketPg,
  getUnsettledPositionsPg,
  settlePositionPg,
  query,
} from './db/postgres.js';
import {
  calculatePriceFromProgress,
  calculatePayout,
  microUsdcToDisplay,
  bpsToPrice,
  lamportsToSol,
} from './core/math.js';
import { fetchPumpFunTokens, fetchBondingCurveState } from './services/pump-api.js';
import { createMockMarkets } from './services/on-chain-fetcher.js';
import { Connection } from '@solana/web3.js';
import {
  placeMarketOrderSafe,
  settleMarketSafe,
  getUserPortfolioSafe,
} from './services/safe-order-service.js';
import {
  corsMiddleware,
  requestLogMiddleware,
  errorHandler,
  rateLimitMiddleware,
  authMiddleware,
  validateOrderInput,
  secureOrderRoute,
  publicRoute,
} from './middleware/security.js';

// ============================================================================
// SERVER SETUP
// ============================================================================

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Global BigInt serialization fix
(BigInt.prototype as any).toJSON = function() {
  return this.toString();
};

// Middleware stack
app.use(corsMiddleware);
app.use(express.json());
app.use(requestLogMiddleware);

// Connected WebSocket clients
const wsClients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  console.log('WebSocket client connected');
  
  ws.on('close', () => {
    wsClients.delete(ws);
  });
});

function broadcast(event: string, data: any) {
  const message = JSON.stringify({ event, data, timestamp: Date.now() });
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ============================================================================
// HELPER: Convert DB market to API card format
// ============================================================================

function dbMarketToCard(market: any) {
  const realSolLamports = BigInt(market.real_sol_lamports);
  const priceQuote = calculatePriceFromProgress(realSolLamports);
  const yesPrice = bpsToPrice(priceQuote.yesPriceBps);
  const noPrice = bpsToPrice(priceQuote.noPriceBps);
  const progressPercent = Number(priceQuote.progressBps) / 100;

  return {
    id: `pump_${market.mint.slice(0, 8)}`,
    platform: 'pumpfun',
    question: `Will $${market.symbol} graduate from bonding curve?`,
    description: market.description || `Prediction market on ${market.name}`,
    outcomes: [
      { name: 'Yes', probability: yesPrice, price: yesPrice },
      { name: 'No', probability: noPrice, price: noPrice },
    ],
    volume: Number(BigInt(market.yes_pool || '0') + BigInt(market.no_pool || '0')) / 1e6,
    liquidity: lamportsToSol(realSolLamports) * 2,
    endDate: new Date(Number(market.expires_at)).toISOString(),
    category: 'Crypto',
    subcategory: 'Pump.fun',
    imageUrl: market.image_uri || 'https://pump.fun/logo.png',
    url: `https://pump.fun/${market.mint}`,
    tokenMint: market.mint,
    tokenSymbol: market.symbol,
    tokenName: market.name,
    bondingCurve: market.bonding_curve,
    progressPercent,
    currentSol: lamportsToSol(realSolLamports),
    graduationThreshold: 85,
    createdAt: new Date(Number(market.created_at)).toISOString(),
    creator: market.creator,
    twitter: market.twitter,
    telegram: market.telegram,
    website: market.website,
  };
}

// ============================================================================
// PUBLIC ENDPOINTS
// ============================================================================

app.get('/api/markets', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const markets = await getActiveMarketsPg(Math.min(limit, 200));
    const cards = markets.map(dbMarketToCard);
    
    res.json({
      success: true,
      markets: cards,
      count: cards.length,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error fetching markets:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/api/markets/:mint', async (req, res) => {
  try {
    const { mint } = req.params;
    const market = await getMarketByMintPg(mint);
    
    if (!market) {
      return res.status(404).json({ success: false, error: 'Market not found' });
    }
    
    res.json({ success: true, market: dbMarketToCard(market) });
  } catch (error) {
    console.error('Error fetching market:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/api/markets/:mint/price', async (req, res) => {
  try {
    const { mint } = req.params;
    const market = await getMarketByMintPg(mint);
    
    if (!market) {
      return res.status(404).json({ success: false, error: 'Market not found' });
    }
    
    res.json({
      success: true,
      mint,
      yesPrice: market.progress_bps / 10000,
      noPrice: (10000 - market.progress_bps) / 10000,
      progressPercent: market.progress_bps / 100,
      currentSolLamports: market.real_sol_lamports,
      lastUpdated: market.updated_at,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================================
// AUTHENTICATED ENDPOINTS - Using Safe Order Service with Atomic Transactions
// ============================================================================

app.post('/api/orders/market', ...secureOrderRoute, async (req, res) => {
  try {
    const userId = req.userId!;
    const { marketMint, side, amount, amountUsdc, maxSlippagePercent } = req.body;
    
    // Use safe order service with atomic transactions
    const result = await placeMarketOrderSafe({
      userId,
      marketMint,
      side,
      amountUsdc: amount || amountUsdc,
      maxSlippagePercent,
    });
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    // Broadcast to WebSocket clients
    broadcast('position_created', {
      userId,
      marketMint,
      side,
      shares: result.shares,
      price: result.effectivePrice,
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('Error placing order:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

app.get('/api/users/:userId/positions', authMiddleware(true), async (req, res) => {
  try {
    const userId = req.userId!;
    if (req.params.userId !== userId && req.params.userId !== 'me') {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    
    // Use safe portfolio service with unrealized P&L
    const portfolio = await getUserPortfolioSafe(userId);
    
    res.json({
      success: true,
      positions: portfolio.positions.map(p => ({
        id: p.id,
        marketMint: p.market_mint,
        symbol: p.symbol,
        name: p.name,
        side: p.side,
        shares: p.shares,
        sharesDisplay: microUsdcToDisplay(BigInt(p.shares)),
        costBasis: p.cost_basis,
        costBasisDisplay: '$' + microUsdcToDisplay(BigInt(p.cost_basis)),
        entryPrice: p.entry_price_bps / 10000,
        currentPrice: p.currentPrice,
        currentValue: '$' + microUsdcToDisplay(BigInt(p.currentValue)),
        unrealizedPnl: '$' + microUsdcToDisplay(BigInt(p.unrealizedPnl)),
        pnlPercent: ((Number(p.unrealizedPnl) / Number(p.cost_basis)) * 100).toFixed(2) + '%',
        isSettled: p.is_settled === 1,
        payout: p.payout,
        marketStatus: p.market_status,
        createdAt: new Date(Number(p.created_at)).toISOString(),
      })),
      summary: {
        totalValue: '$' + microUsdcToDisplay(BigInt(portfolio.totalValue)),
        unrealizedPnl: '$' + microUsdcToDisplay(BigInt(portfolio.unrealizedPnl)),
      },
    });
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

app.post('/api/admin/sync', async (req, res) => {
  try {
    const count = await syncMarkets(100);
    res.json({ success: true, synced: count });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Sync failed' });
  }
});

app.post('/api/admin/settle/:mint', rateLimitMiddleware('general'), async (req, res) => {
  try {
    const { mint } = req.params;
    const { outcome, verificationTxSignature } = req.body;
    
    // Use safe settlement with atomic transactions
    const result = await settleMarketSafe({
      marketMint: mint,
      outcome,
      verificationTxSignature,
    });
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    broadcast('market_settled', { mint, outcome, totalPayouts: result.totalPayouts });
    res.json(result);
  } catch (error) {
    console.error('Settlement error:', error);
    res.status(500).json({ success: false, error: 'Settlement failed' });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    wsClients: wsClients.size,
    database: 'postgresql',
  });
});

// Full health endpoint with metrics
app.get('/api/admin/health', rateLimitMiddleware('general'), async (req, res) => {
  try {
    const { getHealthStatus, setWsConnectionCount } = await import('./services/monitoring.js');
    setWsConnectionCount(wsClients.size);
    const health = await getHealthStatus();
    res.json(health);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      status: 'unhealthy',
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    name: 'Pump.fun Prediction Markets API',
    version: '2.0.0-production',
    features: [
      'Atomic transactions',
      'API key authentication',
      'Rate limiting',
      'Audit logging',
      'WebSocket real-time updates',
    ],
    endpoints: {
      markets: 'GET /api/markets',
      marketDetail: 'GET /api/markets/:mint',
      placeOrder: 'POST /api/orders/market',
      positions: 'GET /api/users/:userId/positions',
      settle: 'POST /api/admin/settle/:mint',
      auditLog: 'GET /api/admin/audit',
      health: 'GET /health',
    },
  });
});

// ============================================================================
// AUDIT LOG ENDPOINT
// ============================================================================

app.get('/api/admin/audit', rateLimitMiddleware('general'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const action = req.query.action as string;
    const userId = req.query.userId as string;
    
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;
    
    if (action) {
      sql += ` AND action = $${paramIndex++}`;
      params.push(action);
    }
    if (userId) {
      sql += ` AND user_id = $${paramIndex++}`;
      params.push(userId);
    }
    
    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);
    
    const logs = await query(sql, params);
    
    res.json({
      success: true,
      count: logs.length,
      logs: logs.map(l => ({
        ...l,
        createdAt: new Date(Number(l.created_at)).toISOString(),
      })),
    });
  } catch (error) {
    console.error('Audit log error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
});

// ============================================================================
// ERROR HANDLER (must be last)
// ============================================================================

app.use(errorHandler);

// ============================================================================
// SYNC FUNCTION
// ============================================================================

async function syncMarkets(limit: number = 100): Promise<number> {
  const connection = new Connection(config.rpcUrl, 'confirmed');
  
  console.log(`Syncing markets (limit: ${limit})...`);
  
  let tokens = await fetchPumpFunTokens('last_trade_timestamp', limit);
  
  // Use mock data if API unavailable
  if (tokens.length === 0) {
    console.log('API unavailable, using mock data...');
    const mocks = createMockMarkets();
    
    for (const mock of mocks) {
      await upsertMarketPg(mock);
    }
    
    return mocks.length;
  }
  
  let updated = 0;
  
  for (const token of tokens) {
    try {
      const onChainState = await fetchBondingCurveState(connection, token.mint);
      if (onChainState?.complete) continue;
      
      const priceQuote = calculatePriceFromProgress(onChainState?.realSolReserves || 0n);
      const expiresAt = token.created_timestamp + 7 * 24 * 60 * 60 * 1000;
      
      await upsertMarketPg({
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        description: token.description || '',
        image_uri: token.image_uri || '',
        bonding_curve: token.bonding_curve,
        associated_bonding_curve: token.associated_bonding_curve,
        creator: token.creator,
        created_at: token.created_timestamp,
        twitter: token.twitter || undefined,
        telegram: token.telegram || undefined,
        website: token.website || undefined,
        real_sol_lamports: (onChainState?.realSolReserves || 0n).toString(),
        progress_bps: Number(priceQuote.progressBps),
        is_graduated: onChainState?.complete ? 1 : 0,
        status: onChainState?.complete ? 'graduated' : 'active',
        expires_at: expiresAt,
        yes_pool: '0',
        no_pool: '0',
        updated_at: Date.now(),
      });
      
      updated++;
    } catch (e) {
      // Continue on individual errors
    }
  }
  
  console.log(`Synced ${updated} markets`);
  return updated;
}

// ============================================================================
// CRON JOBS
// ============================================================================

// Sync every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    await syncMarkets(100);
  } catch (error) {
    console.error('Sync failed:', error);
  }
});

// Broadcast prices every 5 seconds (reads from DB - simulator updates this)
cron.schedule('*/5 * * * * *', async () => {
  try {
    // Read current prices from database (simulator updates these)
    const markets = await getActiveMarketsPg(50);
    
    const prices = markets.map(m => ({
      mint: m.mint,
      symbol: m.symbol,
      progressBps: m.progress_bps,
      yesPrice: m.progress_bps / 10000,
      noPrice: (10000 - m.progress_bps) / 10000,
    }));
    
    // Broadcast to all WebSocket clients
    if (wsClients.size > 0) {
      broadcast('prices_updated', prices);
      console.log(`📡 Broadcast prices to ${wsClients.size} client(s)`);
    }
  } catch (error) {
    console.error('Price broadcast error:', error);
  }
});

// ============================================================================
// START SERVER
// ============================================================================

const PORT = config.port;

async function start() {
  try {
    // Initialize database
    await initializePostgresDatabase();
    
    // Start server
    server.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════════╗
║        PUMP.FUN PREDICTION MARKETS API (Production)           ║
╠═══════════════════════════════════════════════════════════════╣
║  REST API:    http://0.0.0.0:${PORT}                             ║
║  WebSocket:   ws://0.0.0.0:${PORT}/ws                            ║
║  Database:    PostgreSQL                                      ║
╠═══════════════════════════════════════════════════════════════╣
║  GET  /api/markets          - List markets                    ║
║  GET  /api/markets/:mint    - Market details                  ║
║  POST /api/orders/market    - Place market order              ║
║  GET  /api/users/:id/positions - User positions               ║
╚═══════════════════════════════════════════════════════════════╝
      `);
      
      // Initial sync
      syncMarkets(50).catch(console.error);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
