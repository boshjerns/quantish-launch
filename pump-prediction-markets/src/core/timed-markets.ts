/**
 * 30-Minute Timed Markets
 * 
 * Instead of "Will this token ever graduate?", we have:
 * "Will this token be above X% progress at the end of this 30-minute window?"
 * 
 * Market Types:
 * 1. GRADUATION: "Will token graduate (100%) by end of window?"
 * 2. THRESHOLD: "Will token be above current% by end of window?"
 * 3. PRICE_MOVE: "Will token gain 10%+ progress by end of window?"
 */

export interface TimedMarket {
  id: string;
  tokenMint: string;
  tokenSymbol: string;
  
  // Timing
  windowStart: number;      // Unix timestamp
  windowEnd: number;        // windowStart + 30 minutes
  windowDurationMs: number; // 30 * 60 * 1000 = 1,800,000
  
  // Market type
  marketType: 'graduation' | 'threshold' | 'price_move';
  
  // Target (what we're betting on)
  startingProgress: number;  // Progress when market opened (e.g., 45%)
  targetProgress: number;    // Target to hit (e.g., 50% or 100% for graduation)
  
  // Current state
  currentProgress: number;
  
  // Pools
  yesPool: bigint;
  noPool: bigint;
  
  // Settlement
  status: 'active' | 'settled';
  outcome?: 'yes' | 'no';
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const WINDOW_DURATION_MS = 30 * 60 * 1000; // 30 minutes
export const WINDOW_DURATION_SECONDS = 30 * 60;

// ============================================================================
// MARKET CREATION
// ============================================================================

/**
 * Create a new 30-minute market window
 */
export function createTimedMarket(
  tokenMint: string,
  tokenSymbol: string,
  currentProgress: number,
  marketType: 'graduation' | 'threshold' | 'price_move' = 'threshold'
): TimedMarket {
  const now = Date.now();
  
  // Round to nearest 30-minute boundary for clean start times
  const windowStart = Math.ceil(now / WINDOW_DURATION_MS) * WINDOW_DURATION_MS;
  const windowEnd = windowStart + WINDOW_DURATION_MS;
  
  // Determine target based on market type
  let targetProgress: number;
  switch (marketType) {
    case 'graduation':
      targetProgress = 100; // Must fully graduate
      break;
    case 'price_move':
      targetProgress = Math.min(currentProgress + 10, 100); // Gain 10%
      break;
    case 'threshold':
    default:
      targetProgress = currentProgress; // Stay above current
      break;
  }
  
  return {
    id: `${tokenMint}_${windowStart}`,
    tokenMint,
    tokenSymbol,
    windowStart,
    windowEnd,
    windowDurationMs: WINDOW_DURATION_MS,
    marketType,
    startingProgress: currentProgress,
    targetProgress,
    currentProgress,
    yesPool: 0n,
    noPool: 0n,
    status: 'active',
  };
}

/**
 * Generate market question based on type
 */
export function getMarketQuestion(market: TimedMarket): string {
  const endTime = new Date(market.windowEnd).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  switch (market.marketType) {
    case 'graduation':
      return `Will $${market.tokenSymbol} graduate by ${endTime}?`;
    case 'price_move':
      return `Will $${market.tokenSymbol} gain 10%+ by ${endTime}?`;
    case 'threshold':
    default:
      return `Will $${market.tokenSymbol} stay above ${market.startingProgress.toFixed(1)}% by ${endTime}?`;
  }
}

/**
 * Calculate time remaining in window
 */
export function getTimeRemaining(market: TimedMarket): {
  ms: number;
  seconds: number;
  minutes: number;
  display: string;
} {
  const now = Date.now();
  const ms = Math.max(0, market.windowEnd - now);
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  return {
    ms,
    seconds,
    minutes,
    display: `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  };
}

/**
 * Check if market should be settled
 */
export function shouldSettle(market: TimedMarket): boolean {
  return Date.now() >= market.windowEnd && market.status === 'active';
}

/**
 * Determine outcome based on final progress
 */
export function determineOutcome(market: TimedMarket, finalProgress: number): 'yes' | 'no' {
  switch (market.marketType) {
    case 'graduation':
      return finalProgress >= 100 ? 'yes' : 'no';
    case 'price_move':
      return finalProgress >= market.targetProgress ? 'yes' : 'no';
    case 'threshold':
    default:
      return finalProgress >= market.startingProgress ? 'yes' : 'no';
  }
}

// ============================================================================
// WINDOW SCHEDULING
// ============================================================================

/**
 * Get current window boundaries
 */
export function getCurrentWindow(): { start: number; end: number } {
  const now = Date.now();
  const start = Math.floor(now / WINDOW_DURATION_MS) * WINDOW_DURATION_MS;
  const end = start + WINDOW_DURATION_MS;
  return { start, end };
}

/**
 * Get next window boundaries
 */
export function getNextWindow(): { start: number; end: number } {
  const current = getCurrentWindow();
  return {
    start: current.end,
    end: current.end + WINDOW_DURATION_MS
  };
}

/**
 * Format window time for display
 */
export function formatWindowTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

 * 30-Minute Timed Markets
 * 
 * Instead of "Will this token ever graduate?", we have:
 * "Will this token be above X% progress at the end of this 30-minute window?"
 * 
 * Market Types:
 * 1. GRADUATION: "Will token graduate (100%) by end of window?"
 * 2. THRESHOLD: "Will token be above current% by end of window?"
 * 3. PRICE_MOVE: "Will token gain 10%+ progress by end of window?"
 */

export interface TimedMarket {
  id: string;
  tokenMint: string;
  tokenSymbol: string;
  
  // Timing
  windowStart: number;      // Unix timestamp
  windowEnd: number;        // windowStart + 30 minutes
  windowDurationMs: number; // 30 * 60 * 1000 = 1,800,000
  
  // Market type
  marketType: 'graduation' | 'threshold' | 'price_move';
  
  // Target (what we're betting on)
  startingProgress: number;  // Progress when market opened (e.g., 45%)
  targetProgress: number;    // Target to hit (e.g., 50% or 100% for graduation)
  
  // Current state
  currentProgress: number;
  
  // Pools
  yesPool: bigint;
  noPool: bigint;
  
  // Settlement
  status: 'active' | 'settled';
  outcome?: 'yes' | 'no';
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const WINDOW_DURATION_MS = 30 * 60 * 1000; // 30 minutes
export const WINDOW_DURATION_SECONDS = 30 * 60;

// ============================================================================
// MARKET CREATION
// ============================================================================

/**
 * Create a new 30-minute market window
 */
export function createTimedMarket(
  tokenMint: string,
  tokenSymbol: string,
  currentProgress: number,
  marketType: 'graduation' | 'threshold' | 'price_move' = 'threshold'
): TimedMarket {
  const now = Date.now();
  
  // Round to nearest 30-minute boundary for clean start times
  const windowStart = Math.ceil(now / WINDOW_DURATION_MS) * WINDOW_DURATION_MS;
  const windowEnd = windowStart + WINDOW_DURATION_MS;
  
  // Determine target based on market type
  let targetProgress: number;
  switch (marketType) {
    case 'graduation':
      targetProgress = 100; // Must fully graduate
      break;
    case 'price_move':
      targetProgress = Math.min(currentProgress + 10, 100); // Gain 10%
      break;
    case 'threshold':
    default:
      targetProgress = currentProgress; // Stay above current
      break;
  }
  
  return {
    id: `${tokenMint}_${windowStart}`,
    tokenMint,
    tokenSymbol,
    windowStart,
    windowEnd,
    windowDurationMs: WINDOW_DURATION_MS,
    marketType,
    startingProgress: currentProgress,
    targetProgress,
    currentProgress,
    yesPool: 0n,
    noPool: 0n,
    status: 'active',
  };
}

/**
 * Generate market question based on type
 */
export function getMarketQuestion(market: TimedMarket): string {
  const endTime = new Date(market.windowEnd).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  switch (market.marketType) {
    case 'graduation':
      return `Will $${market.tokenSymbol} graduate by ${endTime}?`;
    case 'price_move':
      return `Will $${market.tokenSymbol} gain 10%+ by ${endTime}?`;
    case 'threshold':
    default:
      return `Will $${market.tokenSymbol} stay above ${market.startingProgress.toFixed(1)}% by ${endTime}?`;
  }
}

/**
 * Calculate time remaining in window
 */
export function getTimeRemaining(market: TimedMarket): {
  ms: number;
  seconds: number;
  minutes: number;
  display: string;
} {
  const now = Date.now();
  const ms = Math.max(0, market.windowEnd - now);
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  return {
    ms,
    seconds,
    minutes,
    display: `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  };
}

/**
 * Check if market should be settled
 */
export function shouldSettle(market: TimedMarket): boolean {
  return Date.now() >= market.windowEnd && market.status === 'active';
}

/**
 * Determine outcome based on final progress
 */
export function determineOutcome(market: TimedMarket, finalProgress: number): 'yes' | 'no' {
  switch (market.marketType) {
    case 'graduation':
      return finalProgress >= 100 ? 'yes' : 'no';
    case 'price_move':
      return finalProgress >= market.targetProgress ? 'yes' : 'no';
    case 'threshold':
    default:
      return finalProgress >= market.startingProgress ? 'yes' : 'no';
  }
}

// ============================================================================
// WINDOW SCHEDULING
// ============================================================================

/**
 * Get current window boundaries
 */
export function getCurrentWindow(): { start: number; end: number } {
  const now = Date.now();
  const start = Math.floor(now / WINDOW_DURATION_MS) * WINDOW_DURATION_MS;
  const end = start + WINDOW_DURATION_MS;
  return { start, end };
}

/**
 * Get next window boundaries
 */
export function getNextWindow(): { start: number; end: number } {
  const current = getCurrentWindow();
  return {
    start: current.end,
    end: current.end + WINDOW_DURATION_MS
  };
}

/**
 * Format window time for display
 */
export function formatWindowTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

