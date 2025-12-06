/**
 * TIMED MARKET WINDOWS SYSTEM
 * 
 * Creates fixed 30-minute prediction market windows:
 * - Markets start at :00 and :30 of each hour
 * - Markets close exactly 30 minutes after start
 * - Settlement happens after window closes
 * - Clear, predictable timing for users
 */

import { v4 as uuidv4 } from 'uuid';
import { query, execute, getMarketByMintPg, upsertMarketPg } from '../db/postgres.js';
import { calculatePriceFromProgress, GRADUATION_THRESHOLD_LAMPORTS } from '../core/math.js';
import { fetchPumpFunTokens, fetchBondingCurveState } from './pump-api.js';
import { Connection } from '@solana/web3.js';
import { config } from '../config/index.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const WINDOW_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const SETTLEMENT_DELAY_MS = 60 * 1000; // 1 minute after close

// ============================================================================
// TYPES
// ============================================================================

export interface TimedMarketWindow {
  id: string;
  mint: string;
  symbol: string;
  windowStart: number;  // Unix timestamp
  windowEnd: number;    // Unix timestamp
  settlementTime: number; // When settlement will occur
  status: 'upcoming' | 'active' | 'closed' | 'settling' | 'settled';
  startProgress: number; // Progress at window start (0-100)
  endProgress?: number;  // Progress at window end
  outcome?: 'yes' | 'no';
}

export interface WindowSchedule {
  current: TimedMarketWindow | null;
  next: TimedMarketWindow | null;
  recent: TimedMarketWindow[];
}

// ============================================================================
// WINDOW TIME CALCULATIONS
// ============================================================================

/**
 * Get the start of the current 30-minute window
 */
export function getCurrentWindowStart(timestamp?: number): number {
  const now = timestamp || Date.now();
  const date = new Date(now);
  
  // Round down to nearest 30 minutes
  const minutes = date.getMinutes();
  const roundedMinutes = minutes < 30 ? 0 : 30;
  
  date.setMinutes(roundedMinutes, 0, 0);
  return date.getTime();
}

/**
 * Get the start of the next 30-minute window
 */
export function getNextWindowStart(timestamp?: number): number {
  const currentStart = getCurrentWindowStart(timestamp);
  return currentStart + WINDOW_DURATION_MS;
}

/**
 * Get the end of a window
 */
export function getWindowEnd(windowStart: number): number {
  return windowStart + WINDOW_DURATION_MS;
}

/**
 * Get human-readable window time range
 */
export function formatWindowTime(windowStart: number): string {
  const start = new Date(windowStart);
  const end = new Date(windowStart + WINDOW_DURATION_MS);
  
  const formatTime = (d: Date) => 
    `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  
  return `${formatTime(start)} - ${formatTime(end)}`;
}

/**
 * Check if we're currently in a betting window
 */
export function isInBettingWindow(windowStart: number, now?: number): boolean {
  const currentTime = now || Date.now();
  const windowEnd = getWindowEnd(windowStart);
  return currentTime >= windowStart && currentTime < windowEnd;
}

/**
 * Get time remaining in current window
 */
export function getTimeRemaining(windowStart: number, now?: number): number {
  const currentTime = now || Date.now();
  const windowEnd = getWindowEnd(windowStart);
  return Math.max(0, windowEnd - currentTime);
}

// ============================================================================
// MARKET WINDOW CREATION
// ============================================================================

/**
 * Create a new timed market window for a token
 */
export async function createTimedMarketWindow(
  mint: string,
  windowStart?: number
): Promise<TimedMarketWindow | null> {
  const connection = new Connection(config.rpcUrl, 'confirmed');
  
  // Get token info
  const market = await getMarketByMintPg(mint);
  if (!market) {
    console.error(`Token ${mint} not found`);
    return null;
  }
  
  // Don't create windows for graduated tokens
  if (market.is_graduated) {
    console.log(`Token ${market.symbol} already graduated, skipping`);
    return null;
  }
  
  const start = windowStart || getCurrentWindowStart();
  const end = getWindowEnd(start);
  const settlementTime = end + SETTLEMENT_DELAY_MS;
  
  // Get current progress
  const realSolLamports = BigInt(market.real_sol_lamports || '0');
  const priceQuote = calculatePriceFromProgress(realSolLamports);
  const currentProgress = Number(priceQuote.progressBps) / 100;
  
  // Create window record
  const windowId = `${mint}_${start}`;
  
  await execute(`
    INSERT INTO market_windows (id, mint, symbol, window_start, window_end, settlement_time, status, start_progress, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (id) DO NOTHING
  `, [windowId, mint, market.symbol, start, end, settlementTime, 'active', currentProgress, Date.now()]);
  
  console.log(`📅 Created market window for ${market.symbol}: ${formatWindowTime(start)}`);
  
  return {
    id: windowId,
    mint,
    symbol: market.symbol,
    windowStart: start,
    windowEnd: end,
    settlementTime,
    status: 'active',
    startProgress: currentProgress,
  };
}

/**
 * Create windows for top tokens
 */
export async function createWindowsForTopTokens(limit: number = 50): Promise<TimedMarketWindow[]> {
  const windowStart = getCurrentWindowStart();
  const windows: TimedMarketWindow[] = [];
  
  // Get active tokens sorted by activity
  const tokens = await query(`
    SELECT mint, symbol FROM tokens
    WHERE status = 'active' AND is_graduated = 0
    ORDER BY updated_at DESC
    LIMIT $1
  `, [limit]);
  
  for (const token of tokens) {
    try {
      const window = await createTimedMarketWindow(token.mint, windowStart);
      if (window) {
        windows.push(window);
      }
    } catch (e) {
      // Continue on individual errors
    }
  }
  
  return windows;
}

// ============================================================================
// WINDOW STATUS MANAGEMENT
// ============================================================================

/**
 * Get current and upcoming windows for a token
 */
export async function getWindowSchedule(mint: string): Promise<WindowSchedule> {
  const now = Date.now();
  const currentStart = getCurrentWindowStart();
  const nextStart = getNextWindowStart();
  
  // Get current window
  const currentWindows = await query(`
    SELECT * FROM market_windows
    WHERE mint = $1 AND window_start = $2
  `, [mint, currentStart]);
  
  // Get next window (may not exist yet)
  const nextWindows = await query(`
    SELECT * FROM market_windows
    WHERE mint = $1 AND window_start = $2
  `, [mint, nextStart]);
  
  // Get recent settled windows
  const recentWindows = await query(`
    SELECT * FROM market_windows
    WHERE mint = $1 AND status = 'settled'
    ORDER BY window_end DESC
    LIMIT 5
  `, [mint]);
  
  return {
    current: currentWindows[0] ? mapWindowRow(currentWindows[0]) : null,
    next: nextWindows[0] ? mapWindowRow(nextWindows[0]) : null,
    recent: recentWindows.map(mapWindowRow),
  };
}

function mapWindowRow(row: any): TimedMarketWindow {
  return {
    id: row.id,
    mint: row.mint,
    symbol: row.symbol,
    windowStart: Number(row.window_start),
    windowEnd: Number(row.window_end),
    settlementTime: Number(row.settlement_time),
    status: row.status,
    startProgress: row.start_progress,
    endProgress: row.end_progress,
    outcome: row.outcome,
  };
}

/**
 * Close expired windows and prepare for settlement
 */
export async function closeExpiredWindows(): Promise<number> {
  const now = Date.now();
  
  // Find active windows that have ended
  const expiredWindows = await query(`
    SELECT * FROM market_windows
    WHERE status = 'active' AND window_end <= $1
  `, [now]);
  
  const connection = new Connection(config.rpcUrl, 'confirmed');
  let closed = 0;
  
  for (const window of expiredWindows) {
    try {
      // Get final progress
      const market = await getMarketByMintPg(window.mint);
      if (!market) continue;
      
      const realSolLamports = BigInt(market.real_sol_lamports || '0');
      const priceQuote = calculatePriceFromProgress(realSolLamports);
      const endProgress = Number(priceQuote.progressBps) / 100;
      
      // Determine outcome: YES if progress increased significantly or graduated
      // For simplicity: YES if progress is >= threshold or graduated
      const outcome = market.is_graduated || endProgress >= 100 ? 'yes' : 'no';
      
      await execute(`
        UPDATE market_windows
        SET status = 'closed', end_progress = $1, outcome = $2
        WHERE id = $3
      `, [endProgress, outcome, window.id]);
      
      closed++;
      console.log(`🔒 Closed window ${window.symbol}: ${window.start_progress}% → ${endProgress}% = ${outcome.toUpperCase()}`);
    } catch (e) {
      console.error(`Failed to close window ${window.id}:`, e);
    }
  }
  
  return closed;
}

/**
 * Settle closed windows
 */
export async function settleClosedWindows(): Promise<number> {
  const now = Date.now();
  
  // Find closed windows ready for settlement
  const readyWindows = await query(`
    SELECT * FROM market_windows
    WHERE status = 'closed' AND settlement_time <= $1
  `, [now]);
  
  let settled = 0;
  
  for (const window of readyWindows) {
    try {
      // Update to settling
      await execute(`
        UPDATE market_windows SET status = 'settling' WHERE id = $1
      `, [window.id]);
      
      // TODO: Call actual settlement logic here
      // await settleMarketSafe({ marketMint: window.mint, outcome: window.outcome });
      
      // Mark as settled
      await execute(`
        UPDATE market_windows SET status = 'settled', settled_at = $1 WHERE id = $2
      `, [Date.now(), window.id]);
      
      settled++;
      console.log(`✅ Settled window ${window.symbol}: ${window.outcome}`);
    } catch (e) {
      console.error(`Failed to settle window ${window.id}:`, e);
      // Revert to closed so it can retry
      await execute(`
        UPDATE market_windows SET status = 'closed' WHERE id = $1
      `, [window.id]);
    }
  }
  
  return settled;
}

// ============================================================================
// CRON SCHEDULE
// ============================================================================

/**
 * Main cron handler - run every minute
 */
export async function timedMarketsCronHandler(): Promise<void> {
  const now = Date.now();
  const currentWindowStart = getCurrentWindowStart();
  
  console.log(`⏰ Timed markets check at ${new Date().toISOString()}`);
  console.log(`   Current window: ${formatWindowTime(currentWindowStart)}`);
  console.log(`   Time remaining: ${Math.floor(getTimeRemaining(currentWindowStart) / 1000)}s`);
  
  // 1. Close any expired windows
  const closed = await closeExpiredWindows();
  if (closed > 0) {
    console.log(`   Closed ${closed} windows`);
  }
  
  // 2. Settle any ready windows
  const settled = await settleClosedWindows();
  if (settled > 0) {
    console.log(`   Settled ${settled} windows`);
  }
  
  // 3. Create new windows at window boundaries
  const minutes = new Date().getMinutes();
  if (minutes === 0 || minutes === 30) {
    console.log('   Creating new windows...');
    const windows = await createWindowsForTopTokens(50);
    console.log(`   Created ${windows.length} new windows`);
  }
}

// ============================================================================
// DATABASE SCHEMA FOR WINDOWS
// ============================================================================

export async function initializeWindowsTable(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS market_windows (
      id TEXT PRIMARY KEY,
      mint TEXT NOT NULL,
      symbol TEXT NOT NULL,
      window_start BIGINT NOT NULL,
      window_end BIGINT NOT NULL,
      settlement_time BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      start_progress REAL NOT NULL,
      end_progress REAL,
      outcome TEXT,
      created_at BIGINT NOT NULL,
      settled_at BIGINT,
      
      CONSTRAINT valid_status CHECK (status IN ('upcoming', 'active', 'closed', 'settling', 'settled'))
    );
    
    CREATE INDEX IF NOT EXISTS idx_windows_mint_start ON market_windows(mint, window_start);
    CREATE INDEX IF NOT EXISTS idx_windows_status ON market_windows(status);
    CREATE INDEX IF NOT EXISTS idx_windows_end ON market_windows(window_end);
  `);
  
  console.log('✅ Market windows table initialized');
}

 * TIMED MARKET WINDOWS SYSTEM
 * 
 * Creates fixed 30-minute prediction market windows:
 * - Markets start at :00 and :30 of each hour
 * - Markets close exactly 30 minutes after start
 * - Settlement happens after window closes
 * - Clear, predictable timing for users
 */

import { v4 as uuidv4 } from 'uuid';
import { query, execute, getMarketByMintPg, upsertMarketPg } from '../db/postgres.js';
import { calculatePriceFromProgress, GRADUATION_THRESHOLD_LAMPORTS } from '../core/math.js';
import { fetchPumpFunTokens, fetchBondingCurveState } from './pump-api.js';
import { Connection } from '@solana/web3.js';
import { config } from '../config/index.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const WINDOW_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const SETTLEMENT_DELAY_MS = 60 * 1000; // 1 minute after close

// ============================================================================
// TYPES
// ============================================================================

export interface TimedMarketWindow {
  id: string;
  mint: string;
  symbol: string;
  windowStart: number;  // Unix timestamp
  windowEnd: number;    // Unix timestamp
  settlementTime: number; // When settlement will occur
  status: 'upcoming' | 'active' | 'closed' | 'settling' | 'settled';
  startProgress: number; // Progress at window start (0-100)
  endProgress?: number;  // Progress at window end
  outcome?: 'yes' | 'no';
}

export interface WindowSchedule {
  current: TimedMarketWindow | null;
  next: TimedMarketWindow | null;
  recent: TimedMarketWindow[];
}

// ============================================================================
// WINDOW TIME CALCULATIONS
// ============================================================================

/**
 * Get the start of the current 30-minute window
 */
export function getCurrentWindowStart(timestamp?: number): number {
  const now = timestamp || Date.now();
  const date = new Date(now);
  
  // Round down to nearest 30 minutes
  const minutes = date.getMinutes();
  const roundedMinutes = minutes < 30 ? 0 : 30;
  
  date.setMinutes(roundedMinutes, 0, 0);
  return date.getTime();
}

/**
 * Get the start of the next 30-minute window
 */
export function getNextWindowStart(timestamp?: number): number {
  const currentStart = getCurrentWindowStart(timestamp);
  return currentStart + WINDOW_DURATION_MS;
}

/**
 * Get the end of a window
 */
export function getWindowEnd(windowStart: number): number {
  return windowStart + WINDOW_DURATION_MS;
}

/**
 * Get human-readable window time range
 */
export function formatWindowTime(windowStart: number): string {
  const start = new Date(windowStart);
  const end = new Date(windowStart + WINDOW_DURATION_MS);
  
  const formatTime = (d: Date) => 
    `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  
  return `${formatTime(start)} - ${formatTime(end)}`;
}

/**
 * Check if we're currently in a betting window
 */
export function isInBettingWindow(windowStart: number, now?: number): boolean {
  const currentTime = now || Date.now();
  const windowEnd = getWindowEnd(windowStart);
  return currentTime >= windowStart && currentTime < windowEnd;
}

/**
 * Get time remaining in current window
 */
export function getTimeRemaining(windowStart: number, now?: number): number {
  const currentTime = now || Date.now();
  const windowEnd = getWindowEnd(windowStart);
  return Math.max(0, windowEnd - currentTime);
}

// ============================================================================
// MARKET WINDOW CREATION
// ============================================================================

/**
 * Create a new timed market window for a token
 */
export async function createTimedMarketWindow(
  mint: string,
  windowStart?: number
): Promise<TimedMarketWindow | null> {
  const connection = new Connection(config.rpcUrl, 'confirmed');
  
  // Get token info
  const market = await getMarketByMintPg(mint);
  if (!market) {
    console.error(`Token ${mint} not found`);
    return null;
  }
  
  // Don't create windows for graduated tokens
  if (market.is_graduated) {
    console.log(`Token ${market.symbol} already graduated, skipping`);
    return null;
  }
  
  const start = windowStart || getCurrentWindowStart();
  const end = getWindowEnd(start);
  const settlementTime = end + SETTLEMENT_DELAY_MS;
  
  // Get current progress
  const realSolLamports = BigInt(market.real_sol_lamports || '0');
  const priceQuote = calculatePriceFromProgress(realSolLamports);
  const currentProgress = Number(priceQuote.progressBps) / 100;
  
  // Create window record
  const windowId = `${mint}_${start}`;
  
  await execute(`
    INSERT INTO market_windows (id, mint, symbol, window_start, window_end, settlement_time, status, start_progress, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (id) DO NOTHING
  `, [windowId, mint, market.symbol, start, end, settlementTime, 'active', currentProgress, Date.now()]);
  
  console.log(`📅 Created market window for ${market.symbol}: ${formatWindowTime(start)}`);
  
  return {
    id: windowId,
    mint,
    symbol: market.symbol,
    windowStart: start,
    windowEnd: end,
    settlementTime,
    status: 'active',
    startProgress: currentProgress,
  };
}

/**
 * Create windows for top tokens
 */
export async function createWindowsForTopTokens(limit: number = 50): Promise<TimedMarketWindow[]> {
  const windowStart = getCurrentWindowStart();
  const windows: TimedMarketWindow[] = [];
  
  // Get active tokens sorted by activity
  const tokens = await query(`
    SELECT mint, symbol FROM tokens
    WHERE status = 'active' AND is_graduated = 0
    ORDER BY updated_at DESC
    LIMIT $1
  `, [limit]);
  
  for (const token of tokens) {
    try {
      const window = await createTimedMarketWindow(token.mint, windowStart);
      if (window) {
        windows.push(window);
      }
    } catch (e) {
      // Continue on individual errors
    }
  }
  
  return windows;
}

// ============================================================================
// WINDOW STATUS MANAGEMENT
// ============================================================================

/**
 * Get current and upcoming windows for a token
 */
export async function getWindowSchedule(mint: string): Promise<WindowSchedule> {
  const now = Date.now();
  const currentStart = getCurrentWindowStart();
  const nextStart = getNextWindowStart();
  
  // Get current window
  const currentWindows = await query(`
    SELECT * FROM market_windows
    WHERE mint = $1 AND window_start = $2
  `, [mint, currentStart]);
  
  // Get next window (may not exist yet)
  const nextWindows = await query(`
    SELECT * FROM market_windows
    WHERE mint = $1 AND window_start = $2
  `, [mint, nextStart]);
  
  // Get recent settled windows
  const recentWindows = await query(`
    SELECT * FROM market_windows
    WHERE mint = $1 AND status = 'settled'
    ORDER BY window_end DESC
    LIMIT 5
  `, [mint]);
  
  return {
    current: currentWindows[0] ? mapWindowRow(currentWindows[0]) : null,
    next: nextWindows[0] ? mapWindowRow(nextWindows[0]) : null,
    recent: recentWindows.map(mapWindowRow),
  };
}

function mapWindowRow(row: any): TimedMarketWindow {
  return {
    id: row.id,
    mint: row.mint,
    symbol: row.symbol,
    windowStart: Number(row.window_start),
    windowEnd: Number(row.window_end),
    settlementTime: Number(row.settlement_time),
    status: row.status,
    startProgress: row.start_progress,
    endProgress: row.end_progress,
    outcome: row.outcome,
  };
}

/**
 * Close expired windows and prepare for settlement
 */
export async function closeExpiredWindows(): Promise<number> {
  const now = Date.now();
  
  // Find active windows that have ended
  const expiredWindows = await query(`
    SELECT * FROM market_windows
    WHERE status = 'active' AND window_end <= $1
  `, [now]);
  
  const connection = new Connection(config.rpcUrl, 'confirmed');
  let closed = 0;
  
  for (const window of expiredWindows) {
    try {
      // Get final progress
      const market = await getMarketByMintPg(window.mint);
      if (!market) continue;
      
      const realSolLamports = BigInt(market.real_sol_lamports || '0');
      const priceQuote = calculatePriceFromProgress(realSolLamports);
      const endProgress = Number(priceQuote.progressBps) / 100;
      
      // Determine outcome: YES if progress increased significantly or graduated
      // For simplicity: YES if progress is >= threshold or graduated
      const outcome = market.is_graduated || endProgress >= 100 ? 'yes' : 'no';
      
      await execute(`
        UPDATE market_windows
        SET status = 'closed', end_progress = $1, outcome = $2
        WHERE id = $3
      `, [endProgress, outcome, window.id]);
      
      closed++;
      console.log(`🔒 Closed window ${window.symbol}: ${window.start_progress}% → ${endProgress}% = ${outcome.toUpperCase()}`);
    } catch (e) {
      console.error(`Failed to close window ${window.id}:`, e);
    }
  }
  
  return closed;
}

/**
 * Settle closed windows
 */
export async function settleClosedWindows(): Promise<number> {
  const now = Date.now();
  
  // Find closed windows ready for settlement
  const readyWindows = await query(`
    SELECT * FROM market_windows
    WHERE status = 'closed' AND settlement_time <= $1
  `, [now]);
  
  let settled = 0;
  
  for (const window of readyWindows) {
    try {
      // Update to settling
      await execute(`
        UPDATE market_windows SET status = 'settling' WHERE id = $1
      `, [window.id]);
      
      // TODO: Call actual settlement logic here
      // await settleMarketSafe({ marketMint: window.mint, outcome: window.outcome });
      
      // Mark as settled
      await execute(`
        UPDATE market_windows SET status = 'settled', settled_at = $1 WHERE id = $2
      `, [Date.now(), window.id]);
      
      settled++;
      console.log(`✅ Settled window ${window.symbol}: ${window.outcome}`);
    } catch (e) {
      console.error(`Failed to settle window ${window.id}:`, e);
      // Revert to closed so it can retry
      await execute(`
        UPDATE market_windows SET status = 'closed' WHERE id = $1
      `, [window.id]);
    }
  }
  
  return settled;
}

// ============================================================================
// CRON SCHEDULE
// ============================================================================

/**
 * Main cron handler - run every minute
 */
export async function timedMarketsCronHandler(): Promise<void> {
  const now = Date.now();
  const currentWindowStart = getCurrentWindowStart();
  
  console.log(`⏰ Timed markets check at ${new Date().toISOString()}`);
  console.log(`   Current window: ${formatWindowTime(currentWindowStart)}`);
  console.log(`   Time remaining: ${Math.floor(getTimeRemaining(currentWindowStart) / 1000)}s`);
  
  // 1. Close any expired windows
  const closed = await closeExpiredWindows();
  if (closed > 0) {
    console.log(`   Closed ${closed} windows`);
  }
  
  // 2. Settle any ready windows
  const settled = await settleClosedWindows();
  if (settled > 0) {
    console.log(`   Settled ${settled} windows`);
  }
  
  // 3. Create new windows at window boundaries
  const minutes = new Date().getMinutes();
  if (minutes === 0 || minutes === 30) {
    console.log('   Creating new windows...');
    const windows = await createWindowsForTopTokens(50);
    console.log(`   Created ${windows.length} new windows`);
  }
}

// ============================================================================
// DATABASE SCHEMA FOR WINDOWS
// ============================================================================

export async function initializeWindowsTable(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS market_windows (
      id TEXT PRIMARY KEY,
      mint TEXT NOT NULL,
      symbol TEXT NOT NULL,
      window_start BIGINT NOT NULL,
      window_end BIGINT NOT NULL,
      settlement_time BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      start_progress REAL NOT NULL,
      end_progress REAL,
      outcome TEXT,
      created_at BIGINT NOT NULL,
      settled_at BIGINT,
      
      CONSTRAINT valid_status CHECK (status IN ('upcoming', 'active', 'closed', 'settling', 'settled'))
    );
    
    CREATE INDEX IF NOT EXISTS idx_windows_mint_start ON market_windows(mint, window_start);
    CREATE INDEX IF NOT EXISTS idx_windows_status ON market_windows(status);
    CREATE INDEX IF NOT EXISTS idx_windows_end ON market_windows(window_end);
  `);
  
  console.log('✅ Market windows table initialized');
}

