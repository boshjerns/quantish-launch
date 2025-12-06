/**
 * CRITICAL: Core math engine for prediction market calculations
 * 
 * ALL financial calculations use integer math to prevent floating point errors.
 * 
 * Conventions:
 * - All USDC amounts in micro-USDC (1 USDC = 1,000,000 units)
 * - All percentages in basis points (1% = 100 BPS, 100% = 10,000 BPS)
 * - All SOL amounts in lamports (1 SOL = 1,000,000,000 lamports)
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** 6 decimal places for USDC */
export const USDC_DECIMALS = 6n;
export const USDC_PRECISION = 10n ** USDC_DECIMALS; // 1,000,000

/** Basis points precision (100% = 10,000) */
export const BPS_PRECISION = 10_000n;

/** SOL decimals */
export const SOL_DECIMALS = 9n;
export const LAMPORTS_PER_SOL = 10n ** SOL_DECIMALS; // 1,000,000,000

/** Graduation threshold in lamports (~85 SOL) */
export const GRADUATION_THRESHOLD_LAMPORTS = 85n * LAMPORTS_PER_SOL;

/** Price bounds (in BPS) to prevent extreme leverage */
export const MIN_PRICE_BPS = 100n;   // 1% minimum ($0.01)
export const MAX_PRICE_BPS = 9900n;  // 99% maximum ($0.99)

/** Minimum bet in micro-USDC ($1.00) */
export const MIN_BET_MICRO_USDC = USDC_PRECISION;

/** Maximum slippage allowed (2% = 200 BPS) */
export const MAX_SLIPPAGE_BPS = 200n;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface PriceQuote {
  yesPriceBps: bigint;      // YES price in basis points (0-10000)
  noPriceBps: bigint;       // NO price in basis points (0-10000)
  progressBps: bigint;      // Bonding curve progress in BPS
  timestamp: number;
}

export interface ShareCalculation {
  shares: bigint;           // Number of shares received
  effectivePriceBps: bigint; // Effective price paid per share
  totalCostMicro: bigint;   // Total cost in micro-USDC
}

export interface PayoutCalculation {
  grossPayoutMicro: bigint;  // Payout before fees
  feeMicro: bigint;          // Protocol fee
  netPayoutMicro: bigint;    // Payout after fees
  profitMicro: bigint;       // Net profit (can be negative)
}

// ============================================================================
// CORE CALCULATIONS
// ============================================================================

/**
 * Calculate YES/NO prices from bonding curve progress
 * 
 * @param realSolLamports - Current SOL in bonding curve (lamports)
 * @returns Price quote with YES/NO prices
 */
export function calculatePriceFromProgress(realSolLamports: bigint): PriceQuote {
  // Progress = real_sol / graduation_threshold
  // Using BPS for precision: progressBps = (realSol * 10000) / threshold
  let progressBps = (realSolLamports * BPS_PRECISION) / GRADUATION_THRESHOLD_LAMPORTS;
  
  // Cap at 100%
  if (progressBps > BPS_PRECISION) {
    progressBps = BPS_PRECISION;
  }
  
  // Apply price bounds
  let yesPriceBps = progressBps;
  
  // Floor: minimum 1% (100 BPS)
  if (yesPriceBps < MIN_PRICE_BPS) {
    yesPriceBps = MIN_PRICE_BPS;
  }
  
  // Ceiling: maximum 99% (9900 BPS)
  if (yesPriceBps > MAX_PRICE_BPS) {
    yesPriceBps = MAX_PRICE_BPS;
  }
  
  // NO price is complement of YES
  const noPriceBps = BPS_PRECISION - yesPriceBps;
  
  return {
    yesPriceBps,
    noPriceBps,
    progressBps,
    timestamp: Date.now(),
  };
}

/**
 * Calculate shares received for a bet
 * 
 * Shares represent the payout if you win:
 * - If you bet $X on YES at price P, you get X/P shares
 * - If YES wins, each share pays $1
 * 
 * @param amountMicroUsdc - Bet amount in micro-USDC
 * @param priceBps - Current price in basis points
 * @returns Share calculation details
 */
export function calculateShares(
  amountMicroUsdc: bigint,
  priceBps: bigint
): ShareCalculation {
  // Validate inputs
  if (amountMicroUsdc < MIN_BET_MICRO_USDC) {
    throw new Error(`Minimum bet is ${MIN_BET_MICRO_USDC} micro-USDC ($1.00)`);
  }
  
  if (priceBps < MIN_PRICE_BPS || priceBps > MAX_PRICE_BPS) {
    throw new Error(`Price ${priceBps} BPS out of bounds [${MIN_PRICE_BPS}, ${MAX_PRICE_BPS}]`);
  }
  
  // shares = amount / price
  // In integer math: shares = (amount * BPS_PRECISION) / priceBps
  // But we want shares in micro-USDC units, so:
  // shares (in micro-USDC) = amount * BPS_PRECISION / priceBps
  const shares = (amountMicroUsdc * BPS_PRECISION) / priceBps;
  
  // Effective price = amount / shares (in BPS)
  // effectivePrice = (amount * BPS_PRECISION) / shares
  const effectivePriceBps = (amountMicroUsdc * BPS_PRECISION) / shares;
  
  return {
    shares,
    effectivePriceBps,
    totalCostMicro: amountMicroUsdc,
  };
}

/**
 * Calculate payout for a settled position
 * 
 * @param shares - Number of shares held
 * @param isWinner - Whether this side won
 * @param costBasisMicro - Original cost (for profit calculation)
 * @param feeRateBps - Protocol fee rate (default 0 for now)
 * @returns Payout calculation details
 */
export function calculatePayout(
  shares: bigint,
  isWinner: boolean,
  costBasisMicro: bigint,
  feeRateBps: bigint = 0n
): PayoutCalculation {
  // Winners get $1 per share, losers get $0
  const grossPayoutMicro = isWinner ? shares : 0n;
  
  // Calculate fee (rounds UP to favor protocol)
  const feeMicro = (grossPayoutMicro * feeRateBps + BPS_PRECISION - 1n) / BPS_PRECISION;
  
  // Net payout
  const netPayoutMicro = grossPayoutMicro - feeMicro;
  
  // Profit (can be negative)
  const profitMicro = netPayoutMicro - costBasisMicro;
  
  return {
    grossPayoutMicro,
    feeMicro,
    netPayoutMicro,
    profitMicro,
  };
}

/**
 * Validate that a price hasn't moved too much (slippage protection)
 * 
 * @param expectedPriceBps - Price user expected
 * @param actualPriceBps - Current market price
 * @param maxSlippageBps - Maximum allowed slippage
 * @returns Whether the trade should proceed
 */
export function validateSlippage(
  expectedPriceBps: bigint,
  actualPriceBps: bigint,
  maxSlippageBps: bigint = MAX_SLIPPAGE_BPS
): { valid: boolean; slippageBps: bigint } {
  // Calculate absolute difference
  const diff = expectedPriceBps > actualPriceBps 
    ? expectedPriceBps - actualPriceBps 
    : actualPriceBps - expectedPriceBps;
  
  // Slippage as BPS of expected price
  const slippageBps = (diff * BPS_PRECISION) / expectedPriceBps;
  
  return {
    valid: slippageBps <= maxSlippageBps,
    slippageBps,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert micro-USDC to display string
 */
export function microUsdcToDisplay(microUsdc: bigint): string {
  const wholePart = microUsdc / USDC_PRECISION;
  const fractionalPart = microUsdc % USDC_PRECISION;
  const fractionalStr = fractionalPart.toString().padStart(6, '0');
  return `${wholePart}.${fractionalStr}`;
}

/**
 * Convert display USDC to micro-USDC
 */
export function displayToMicroUsdc(display: string | number): bigint {
  const num = typeof display === 'string' ? parseFloat(display) : display;
  return BigInt(Math.round(num * 1_000_000));
}

/**
 * Convert BPS to percentage string
 */
export function bpsToPercent(bps: bigint): string {
  const percent = Number(bps) / 100;
  return `${percent.toFixed(2)}%`;
}

/**
 * Convert BPS to decimal price
 */
export function bpsToPrice(bps: bigint): number {
  return Number(bps) / 10000;
}

/**
 * Convert lamports to SOL display
 */
export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / Number(LAMPORTS_PER_SOL);
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate a bet amount
 */
export function validateBetAmount(amountMicroUsdc: bigint): { valid: boolean; error?: string } {
  if (amountMicroUsdc < MIN_BET_MICRO_USDC) {
    return { valid: false, error: `Minimum bet is $1.00 (${MIN_BET_MICRO_USDC} micro-USDC)` };
  }
  
  // Add maximum bet if needed
  const MAX_BET = 100_000n * USDC_PRECISION; // $100,000 max
  if (amountMicroUsdc > MAX_BET) {
    return { valid: false, error: `Maximum bet is $100,000` };
  }
  
  return { valid: true };
}

/**
 * Validate market can accept bets
 */
export function validateMarketActive(
  status: string,
  expiresAt: Date
): { valid: boolean; error?: string } {
  if (status !== 'active') {
    return { valid: false, error: `Market is ${status}, not accepting bets` };
  }
  
  if (new Date() >= expiresAt) {
    return { valid: false, error: 'Market has expired' };
  }
  
  return { valid: true };
}

// ============================================================================
// POOL CALCULATIONS (for CPMM if we go that route)
// ============================================================================

/**
 * Calculate price from pool balances (Constant Product AMM style)
 * 
 * This is an alternative to direct bonding-curve-based pricing.
 * Price = yesPool / (yesPool + noPool)
 */
export function calculatePoolPrice(
  yesPoolMicro: bigint,
  noPoolMicro: bigint
): PriceQuote {
  const totalPool = yesPoolMicro + noPoolMicro;
  
  if (totalPool === 0n) {
    // No liquidity, return 50/50
    return {
      yesPriceBps: 5000n,
      noPriceBps: 5000n,
      progressBps: 5000n,
      timestamp: Date.now(),
    };
  }
  
  // YES price = noPool / totalPool (more NO bets = higher YES price)
  // Wait, that's backwards for prediction markets...
  // Actually in CPMM: price = pool of the OTHER side / total
  // So if lots of people bet YES, yesPool is big, YES price goes UP
  
  // For prediction markets, we use: yesPriceBps = yesPool / totalPool
  let yesPriceBps = (yesPoolMicro * BPS_PRECISION) / totalPool;
  
  // Apply bounds
  if (yesPriceBps < MIN_PRICE_BPS) yesPriceBps = MIN_PRICE_BPS;
  if (yesPriceBps > MAX_PRICE_BPS) yesPriceBps = MAX_PRICE_BPS;
  
  const noPriceBps = BPS_PRECISION - yesPriceBps;
  
  return {
    yesPriceBps,
    noPriceBps,
    progressBps: yesPriceBps,
    timestamp: Date.now(),
  };
}

// ============================================================================
// INVARIANT CHECKS
// ============================================================================

/**
 * Verify calculation consistency
 * 
 * Invariant: shares * price = cost (within rounding tolerance)
 */
export function verifyShareCalculation(calc: ShareCalculation): boolean {
  // Reconstruct cost from shares and price
  const reconstructedCost = (calc.shares * calc.effectivePriceBps) / BPS_PRECISION;
  
  // Allow 1 micro-USDC rounding error
  const diff = calc.totalCostMicro > reconstructedCost 
    ? calc.totalCostMicro - reconstructedCost
    : reconstructedCost - calc.totalCostMicro;
    
  return diff <= 1n;
}

/**
 * Verify pool balance consistency
 * 
 * Invariant: total deposits = yes_pool + no_pool
 */
export function verifyPoolBalance(
  totalDeposits: bigint,
  yesPool: bigint,
  noPool: bigint
): boolean {
  return totalDeposits === yesPool + noPool;
}

/**
 * Verify settlement payout consistency
 * 
 * Invariant: total payouts <= total deposits (for zero-sum market)
 */
export function verifySettlementPayouts(
  totalDeposits: bigint,
  totalPayouts: bigint
): boolean {
  return totalPayouts <= totalDeposits;
}

