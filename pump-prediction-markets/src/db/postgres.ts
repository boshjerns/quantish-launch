/**
 * PostgreSQL Database Module
 * 
 * Uses pg package for Railway PostgreSQL connection.
 * Falls back to SQLite for local development.
 */

import pg from 'pg';
const { Pool } = pg;

// Database connection pool
let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
    
    if (!connectionString) {
      throw new Error('DATABASE_URL or DATABASE_PUBLIC_URL environment variable required');
    }
    
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('railway') ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    
    pool.on('error', (err) => {
      console.error('Unexpected PostgreSQL error:', err);
    });
  }
  
  return pool;
}

export async function initializePostgresDatabase(): Promise<void> {
  const pool = getPool();
  
  console.log('Initializing PostgreSQL database...');
  
  // Create tables
  await pool.query(`
    -- Tokens table (pump.fun token metadata + on-chain state)
    CREATE TABLE IF NOT EXISTS tokens (
      mint TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      description TEXT DEFAULT '',
      image_uri TEXT,
      bonding_curve TEXT NOT NULL,
      associated_bonding_curve TEXT,
      creator TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      
      -- Social links
      twitter TEXT,
      telegram TEXT,
      website TEXT,
      
      -- On-chain state
      real_sol_lamports TEXT NOT NULL DEFAULT '0',
      progress_bps INTEGER NOT NULL DEFAULT 0,
      is_graduated INTEGER NOT NULL DEFAULT 0,
      
      -- Market state
      status TEXT NOT NULL DEFAULT 'active',
      expires_at BIGINT NOT NULL,
      settled_at BIGINT,
      settlement_outcome TEXT,
      
      -- Pool totals
      yes_pool TEXT NOT NULL DEFAULT '0',
      no_pool TEXT NOT NULL DEFAULT '0',
      
      updated_at BIGINT NOT NULL
    );
    
    -- Positions table
    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      market_mint TEXT NOT NULL REFERENCES tokens(mint),
      
      side TEXT NOT NULL CHECK(side IN ('yes', 'no')),
      shares TEXT NOT NULL,
      cost_basis TEXT NOT NULL,
      entry_price_bps INTEGER NOT NULL,
      
      is_settled INTEGER NOT NULL DEFAULT 0,
      payout TEXT,
      
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      settled_at BIGINT
    );
    
    -- Limit orders table
    CREATE TABLE IF NOT EXISTS limit_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      market_mint TEXT NOT NULL REFERENCES tokens(mint),
      
      side TEXT NOT NULL CHECK(side IN ('yes', 'no')),
      amount_micro TEXT NOT NULL,
      
      trigger_price_bps INTEGER NOT NULL,
      trigger_direction TEXT NOT NULL CHECK(trigger_direction IN ('lte', 'gte')),
      
      status TEXT NOT NULL DEFAULT 'pending',
      
      executed_at BIGINT,
      executed_price_bps INTEGER,
      position_id TEXT REFERENCES positions(id),
      
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL
    );
    
    -- Price history table
    CREATE TABLE IF NOT EXISTS price_history (
      id SERIAL PRIMARY KEY,
      market_mint TEXT NOT NULL REFERENCES tokens(mint),
      progress_bps INTEGER NOT NULL,
      sol_lamports TEXT NOT NULL,
      timestamp BIGINT NOT NULL
    );
    
    -- Audit log table
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      user_id TEXT,
      market_mint TEXT,
      position_id TEXT,
      order_id TEXT,
      details JSONB,
      created_at BIGINT NOT NULL
    );
  `);
  
  // Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
    CREATE INDEX IF NOT EXISTS idx_tokens_progress ON tokens(progress_bps DESC);
    CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_id);
    CREATE INDEX IF NOT EXISTS idx_positions_market ON positions(market_mint);
    CREATE INDEX IF NOT EXISTS idx_limit_orders_pending ON limit_orders(status, market_mint);
    CREATE INDEX IF NOT EXISTS idx_price_history_market ON price_history(market_mint, timestamp DESC);
  `);
  
  console.log('✅ PostgreSQL database initialized');
}

// Query helpers
export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] || null;
}

export async function execute(sql: string, params?: any[]): Promise<number> {
  const pool = getPool();
  const result = await pool.query(sql, params);
  return result.rowCount || 0;
}

// ============================================================================
// ATOMIC TRANSACTION SUPPORT
// ============================================================================

export type TransactionClient = pg.PoolClient;

/**
 * Execute a function within an atomic database transaction
 * 
 * CRITICAL: All bet placements MUST use this to prevent:
 * - Race conditions (two users betting at same price)
 * - Partial updates (position created but pool not updated)
 * - Data inconsistency
 */
export async function withTransaction<T>(
  fn: (client: TransactionClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute query within a transaction
 */
export async function txQuery<T = any>(
  client: TransactionClient,
  sql: string,
  params?: any[]
): Promise<T[]> {
  const result = await client.query(sql, params);
  return result.rows as T[];
}

export async function txQueryOne<T = any>(
  client: TransactionClient,
  sql: string,
  params?: any[]
): Promise<T | null> {
  const rows = await txQuery<T>(client, sql, params);
  return rows[0] || null;
}

export async function txExecute(
  client: TransactionClient,
  sql: string,
  params?: any[]
): Promise<number> {
  const result = await client.query(sql, params);
  return result.rowCount || 0;
}

/**
 * Lock a market row for update (prevents concurrent modifications)
 */
export async function lockMarketForUpdate(
  client: TransactionClient,
  mint: string
): Promise<any | null> {
  return txQueryOne(client, `
    SELECT * FROM tokens WHERE mint = $1 FOR UPDATE
  `, [mint]);
}

/**
 * Lock a user's position for update
 */
export async function lockPositionForUpdate(
  client: TransactionClient,
  positionId: string
): Promise<any | null> {
  return txQueryOne(client, `
    SELECT * FROM positions WHERE id = $1 FOR UPDATE
  `, [positionId]);
}

// Upsert market
export async function upsertMarketPg(market: {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image_uri: string;
  bonding_curve: string;
  associated_bonding_curve: string;
  creator: string;
  created_at: number;
  twitter?: string;
  telegram?: string;
  website?: string;
  real_sol_lamports: string;
  progress_bps: number;
  is_graduated: number;
  status: string;
  expires_at: number;
  yes_pool: string;
  no_pool: string;
  updated_at: number;
}): Promise<void> {
  await execute(`
    INSERT INTO tokens (
      mint, name, symbol, description, image_uri, bonding_curve,
      associated_bonding_curve, creator, created_at, twitter, telegram, website,
      real_sol_lamports, progress_bps, is_graduated, status, expires_at, updated_at,
      yes_pool, no_pool
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
    ON CONFLICT(mint) DO UPDATE SET
      real_sol_lamports = $13,
      progress_bps = $14,
      is_graduated = $15,
      status = $16,
      updated_at = $18
  `, [
    market.mint, market.name, market.symbol, market.description, market.image_uri,
    market.bonding_curve, market.associated_bonding_curve, market.creator, market.created_at,
    market.twitter, market.telegram, market.website,
    market.real_sol_lamports, market.progress_bps, market.is_graduated, market.status,
    market.expires_at, market.updated_at, market.yes_pool, market.no_pool
  ]);
}

// Get active markets
export async function getActiveMarketsPg(limit: number = 50): Promise<any[]> {
  return query(`
    SELECT * FROM tokens 
    WHERE status = 'active' 
    ORDER BY progress_bps DESC, updated_at DESC
    LIMIT $1
  `, [limit]);
}

// Get market by mint
export async function getMarketByMintPg(mint: string): Promise<any | null> {
  return queryOne('SELECT * FROM tokens WHERE mint = $1', [mint]);
}

// Create position
export async function createPositionPg(position: {
  id: string;
  user_id: string;
  market_mint: string;
  side: string;
  shares: string;
  cost_basis: string;
  entry_price_bps: number;
  created_at: number;
  updated_at: number;
}): Promise<void> {
  await execute(`
    INSERT INTO positions (id, user_id, market_mint, side, shares, cost_basis, entry_price_bps, is_settled, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9)
  `, [
    position.id, position.user_id, position.market_mint, position.side,
    position.shares, position.cost_basis, position.entry_price_bps,
    position.created_at, position.updated_at
  ]);
}

// Get user position
export async function getUserPositionPg(userId: string, marketMint: string, side: string): Promise<any | null> {
  return queryOne(`
    SELECT * FROM positions 
    WHERE user_id = $1 AND market_mint = $2 AND side = $3 AND is_settled = 0
  `, [userId, marketMint, side]);
}

// Update position
export async function updatePositionPg(id: string, updates: { shares: string; cost_basis: string; entry_price_bps: number; updated_at: number }): Promise<void> {
  await execute(`
    UPDATE positions SET shares = $1, cost_basis = $2, entry_price_bps = $3, updated_at = $4
    WHERE id = $5
  `, [updates.shares, updates.cost_basis, updates.entry_price_bps, updates.updated_at, id]);
}

// Update market pool
export async function updateMarketPoolPg(mint: string, side: 'yes' | 'no', amount: string): Promise<void> {
  const column = side === 'yes' ? 'yes_pool' : 'no_pool';
  await execute(`
    UPDATE tokens SET ${column} = (CAST(${column} AS BIGINT) + $1)::TEXT WHERE mint = $2
  `, [amount, mint]);
}

// Get user positions
export async function getUserPositionsPg(userId: string): Promise<any[]> {
  return query(`
    SELECT p.*, t.symbol, t.name, t.progress_bps, t.status as market_status
    FROM positions p
    JOIN tokens t ON p.market_mint = t.mint
    WHERE p.user_id = $1
    ORDER BY p.created_at DESC
  `, [userId]);
}

// Settle market
export async function settleMarketPg(mint: string, outcome: 'yes' | 'no'): Promise<void> {
  const now = Date.now();
  await execute(`
    UPDATE tokens SET status = 'settled', settlement_outcome = $1, settled_at = $2
    WHERE mint = $3 AND status IN ('active', 'graduated', 'expired')
  `, [outcome, now, mint]);
}

// Get unsettled positions for market
export async function getUnsettledPositionsPg(marketMint: string): Promise<any[]> {
  return query(`
    SELECT * FROM positions WHERE market_mint = $1 AND is_settled = 0
  `, [marketMint]);
}

// Settle position
export async function settlePositionPg(id: string, payout: string): Promise<void> {
  const now = Date.now();
  await execute(`
    UPDATE positions SET is_settled = 1, payout = $1, settled_at = $2 WHERE id = $3
  `, [payout, now, id]);
}

// Update market prices
export async function updateMarketPricesPg(mint: string, realSolLamports: string, progressBps: number, isGraduated: boolean): Promise<void> {
  const status = isGraduated ? 'graduated' : 'active';
  const now = Date.now();
  await execute(`
    UPDATE tokens SET real_sol_lamports = $1, progress_bps = $2, is_graduated = $3, status = $4, updated_at = $5
    WHERE mint = $6
  `, [realSolLamports, progressBps, isGraduated ? 1 : 0, status, now, mint]);
}
