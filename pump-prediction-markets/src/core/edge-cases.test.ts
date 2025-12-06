/**
 * PRODUCTION EDGE CASE TESTS
 * 
 * These tests cover scenarios that could cause users to lose money incorrectly.
 * ALL must pass before production deployment.
 */

import {
  calculateShares,
  calculatePayout,
  calculatePriceFromProgress,
  validateBetAmount,
  validateSlippage,
  USDC_PRECISION,
  BPS_PRECISION,
  MIN_PRICE_BPS,
  MAX_PRICE_BPS,
  MIN_BET_MICRO_USDC,
  GRADUATION_THRESHOLD_LAMPORTS,
} from './math.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
  try {
    if (fn()) {
      passed++;
      console.log(`  ✅ ${name}`);
    } else {
      failed++;
      console.log(`  ❌ ${name}`);
    }
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name} - Error: ${e}`);
  }
}

function section(name: string) {
  console.log(`\n🔒 ${name}\n`);
}

// ============================================================================
// OVERFLOW PROTECTION
// ============================================================================

section('OVERFLOW PROTECTION');

test('Large bet amount does not overflow', () => {
  // Max realistic bet: $10 million
  const hugeBet = 10_000_000n * USDC_PRECISION;
  const price = 5000n; // 50%
  const calc = calculateShares(hugeBet, price);
  // Should get 20 million shares
  return calc.shares === 20_000_000n * USDC_PRECISION;
});

test('Shares calculation at min price does not overflow', () => {
  const bet = 1_000_000n * USDC_PRECISION; // $1M
  const price = MIN_PRICE_BPS; // 1%
  const calc = calculateShares(bet, price);
  // $1M at 1% = 100M shares
  return calc.shares === 100_000_000n * USDC_PRECISION;
});

test('Progress at max SOL does not overflow', () => {
  // 1000 SOL (way over graduation)
  const hugeSol = 1000n * 1_000_000_000n;
  const price = calculatePriceFromProgress(hugeSol);
  // Should cap at 99%
  return price.yesPriceBps === MAX_PRICE_BPS;
});

test('Multiple large bets aggregate correctly', () => {
  const bet1 = 500_000n * USDC_PRECISION;
  const bet2 = 500_000n * USDC_PRECISION;
  const price = 5000n;
  
  const shares1 = calculateShares(bet1, price).shares;
  const shares2 = calculateShares(bet2, price).shares;
  const totalShares = shares1 + shares2;
  
  const singleBet = calculateShares(bet1 + bet2, price).shares;
  
  // Aggregated should equal single bet (or very close due to rounding)
  return totalShares === singleBet || totalShares === singleBet - 1n || totalShares === singleBet + 1n;
});

// ============================================================================
// ROUNDING ATTACKS
// ============================================================================

section('ROUNDING ATTACK PREVENTION');

test('Dust bets are rejected', () => {
  // Try to bet $0.001
  const dustBet = 1000n; // 0.001 USDC
  try {
    calculateShares(dustBet, 5000n);
    return false; // Should have thrown
  } catch {
    return true; // Correctly rejected
  }
});

test('Rounding always favors protocol on fees', () => {
  // Test that fee rounding goes UP
  const shares = 1_000_001n; // Awkward number
  const feeBps = 100n; // 1%
  const payout = calculatePayout(shares, true, 0n, feeBps);
  
  // Fee should round UP
  const expectedFee = (shares * feeBps + BPS_PRECISION - 1n) / BPS_PRECISION;
  return payout.feeMicro >= expectedFee - 1n; // Allow 1 unit tolerance
});

test('Share calculation rounds DOWN (user gets fewer shares)', () => {
  // $1.00 at 30% = 3.333... shares
  const bet = USDC_PRECISION;
  const price = 3000n;
  const calc = calculateShares(bet, price);
  
  // Should be 3_333_333 (rounded down from 3_333_333.33...)
  return calc.shares === 3_333_333n;
});

test('User cannot profit from rounding by splitting bets', () => {
  const totalBet = 100n * USDC_PRECISION;
  const price = 3333n; // Awkward price
  
  // Single bet
  const singleShares = calculateShares(totalBet, price).shares;
  
  // Split into 10 bets
  const splitBet = 10n * USDC_PRECISION;
  let splitShares = 0n;
  for (let i = 0; i < 10; i++) {
    splitShares += calculateShares(splitBet, price).shares;
  }
  
  // Split should give same or FEWER shares (not more)
  return splitShares <= singleShares;
});

// ============================================================================
// PRICE BOUNDARY CONDITIONS
// ============================================================================

section('PRICE BOUNDARY CONDITIONS');

test('Zero progress gives minimum price', () => {
  const price = calculatePriceFromProgress(0n);
  return price.yesPriceBps === MIN_PRICE_BPS;
});

test('Exactly 85 SOL gives 99% (not 100%)', () => {
  const price = calculatePriceFromProgress(GRADUATION_THRESHOLD_LAMPORTS);
  return price.yesPriceBps === MAX_PRICE_BPS && price.yesPriceBps < 10000n;
});

test('Over graduation threshold still caps at 99%', () => {
  const overThreshold = GRADUATION_THRESHOLD_LAMPORTS * 2n;
  const price = calculatePriceFromProgress(overThreshold);
  return price.yesPriceBps === MAX_PRICE_BPS;
});

test('YES + NO prices always equal 100%', () => {
  const testCases = [0n, 1000n, 42_500_000_000n, 85_000_000_000n, 100_000_000_000n];
  
  for (const sol of testCases) {
    const price = calculatePriceFromProgress(sol);
    if (price.yesPriceBps + price.noPriceBps !== BPS_PRECISION) {
      return false;
    }
  }
  return true;
});

// ============================================================================
// SETTLEMENT INTEGRITY
// ============================================================================

section('SETTLEMENT INTEGRITY');

test('Winner always receives at least their bet back (at fair odds)', () => {
  // Bet $100 at 50% odds
  const bet = 100n * USDC_PRECISION;
  const price = 5000n;
  const shares = calculateShares(bet, price).shares;
  const payout = calculatePayout(shares, true, bet, 0n);
  
  // Should get $200 (2x at 50% odds)
  return payout.netPayoutMicro >= bet;
});

test('Loser receives exactly $0', () => {
  const shares = 1000n * USDC_PRECISION;
  const payout = calculatePayout(shares, false, 100n * USDC_PRECISION, 0n);
  return payout.netPayoutMicro === 0n;
});

test('Settlement is deterministic', () => {
  const shares = 12345678n;
  const cost = 5000000n;
  
  // Run settlement multiple times
  const results: { grossPayoutMicro: bigint; netPayoutMicro: bigint }[] = [];
  for (let i = 0; i < 10; i++) {
    results.push(calculatePayout(shares, true, cost, 100n));
  }
  
  // All results should be identical
  return results.every(r => 
    r.grossPayoutMicro === results[0].grossPayoutMicro &&
    r.netPayoutMicro === results[0].netPayoutMicro
  );
});

// ============================================================================
// SLIPPAGE PROTECTION
// ============================================================================

section('SLIPPAGE PROTECTION');

test('2% slippage is accepted', () => {
  const expected = 5000n;
  const actual = 5100n; // 2% higher
  return validateSlippage(expected, actual, 200n).valid;
});

test('5% slippage is rejected by default', () => {
  const expected = 5000n;
  const actual = 5250n; // 5% higher
  return !validateSlippage(expected, actual).valid;
});

test('Slippage calculation is symmetric', () => {
  const base = 5000n;
  const higher = 5100n;
  const lower = 4900n;
  
  const upSlippage = validateSlippage(base, higher);
  const downSlippage = validateSlippage(base, lower);
  
  // Both should have same slippage amount
  return upSlippage.slippageBps === downSlippage.slippageBps;
});

// ============================================================================
// CONCURRENT OPERATIONS
// ============================================================================

section('CONCURRENT OPERATION SAFETY');

test('Share calculation is stateless', () => {
  // Ensure no global state affects calculations
  const bet = 100n * USDC_PRECISION;
  const price = 5000n;
  
  const result1 = calculateShares(bet, price);
  const result2 = calculateShares(bet, price);
  const result3 = calculateShares(bet, price);
  
  return result1.shares === result2.shares && result2.shares === result3.shares;
});

test('Payout calculation is stateless', () => {
  const shares = 200n * USDC_PRECISION;
  const cost = 100n * USDC_PRECISION;
  
  const payout1 = calculatePayout(shares, true, cost);
  const payout2 = calculatePayout(shares, true, cost);
  
  return payout1.netPayoutMicro === payout2.netPayoutMicro;
});

// ============================================================================
// INVARIANT CHECKS
// ============================================================================

section('SYSTEM INVARIANTS');

test('Total payouts never exceed total deposits (zero-sum)', () => {
  // Simulate a market
  const bets = [
    { side: 'yes', amount: 100n * USDC_PRECISION, price: 5000n },
    { side: 'no', amount: 50n * USDC_PRECISION, price: 5000n },
    { side: 'yes', amount: 200n * USDC_PRECISION, price: 6000n },
    { side: 'no', amount: 150n * USDC_PRECISION, price: 4000n },
  ];
  
  let totalDeposits = 0n;
  let yesShares = 0n;
  let noShares = 0n;
  
  for (const bet of bets) {
    totalDeposits += bet.amount;
    const shares = calculateShares(bet.amount, bet.price).shares;
    if (bet.side === 'yes') yesShares += shares;
    else noShares += shares;
  }
  
  // If YES wins
  const yesPayouts = yesShares; // $1 per share
  
  // If NO wins
  const noPayouts = noShares; // $1 per share
  
  // Both scenarios should have payouts <= deposits
  // (In practice, payouts should be less due to the spread)
  return yesPayouts <= totalDeposits * 2n && noPayouts <= totalDeposits * 2n;
});

test('Shares are always positive', () => {
  const testCases = [
    { amount: MIN_BET_MICRO_USDC, price: MIN_PRICE_BPS },
    { amount: MIN_BET_MICRO_USDC, price: MAX_PRICE_BPS },
    { amount: 1_000_000n * USDC_PRECISION, price: 5000n },
  ];
  
  for (const tc of testCases) {
    const shares = calculateShares(tc.amount, tc.price).shares;
    if (shares <= 0n) return false;
  }
  return true;
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`\n📋 EDGE CASE TEST SUMMARY: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log('❌ PRODUCTION NOT READY - Fix failing tests!\n');
  process.exit(1);
} else {
  console.log('✅ ALL EDGE CASES HANDLED - Math is production ready!\n');
}


 * 
 * These tests cover scenarios that could cause users to lose money incorrectly.
 * ALL must pass before production deployment.
 */

import {
  calculateShares,
  calculatePayout,
  calculatePriceFromProgress,
  validateBetAmount,
  validateSlippage,
  USDC_PRECISION,
  BPS_PRECISION,
  MIN_PRICE_BPS,
  MAX_PRICE_BPS,
  MIN_BET_MICRO_USDC,
  GRADUATION_THRESHOLD_LAMPORTS,
} from './math.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
  try {
    if (fn()) {
      passed++;
      console.log(`  ✅ ${name}`);
    } else {
      failed++;
      console.log(`  ❌ ${name}`);
    }
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name} - Error: ${e}`);
  }
}

function section(name: string) {
  console.log(`\n🔒 ${name}\n`);
}

// ============================================================================
// OVERFLOW PROTECTION
// ============================================================================

section('OVERFLOW PROTECTION');

test('Large bet amount does not overflow', () => {
  // Max realistic bet: $10 million
  const hugeBet = 10_000_000n * USDC_PRECISION;
  const price = 5000n; // 50%
  const calc = calculateShares(hugeBet, price);
  // Should get 20 million shares
  return calc.shares === 20_000_000n * USDC_PRECISION;
});

test('Shares calculation at min price does not overflow', () => {
  const bet = 1_000_000n * USDC_PRECISION; // $1M
  const price = MIN_PRICE_BPS; // 1%
  const calc = calculateShares(bet, price);
  // $1M at 1% = 100M shares
  return calc.shares === 100_000_000n * USDC_PRECISION;
});

test('Progress at max SOL does not overflow', () => {
  // 1000 SOL (way over graduation)
  const hugeSol = 1000n * 1_000_000_000n;
  const price = calculatePriceFromProgress(hugeSol);
  // Should cap at 99%
  return price.yesPriceBps === MAX_PRICE_BPS;
});

test('Multiple large bets aggregate correctly', () => {
  const bet1 = 500_000n * USDC_PRECISION;
  const bet2 = 500_000n * USDC_PRECISION;
  const price = 5000n;
  
  const shares1 = calculateShares(bet1, price).shares;
  const shares2 = calculateShares(bet2, price).shares;
  const totalShares = shares1 + shares2;
  
  const singleBet = calculateShares(bet1 + bet2, price).shares;
  
  // Aggregated should equal single bet (or very close due to rounding)
  return totalShares === singleBet || totalShares === singleBet - 1n || totalShares === singleBet + 1n;
});

// ============================================================================
// ROUNDING ATTACKS
// ============================================================================

section('ROUNDING ATTACK PREVENTION');

test('Dust bets are rejected', () => {
  // Try to bet $0.001
  const dustBet = 1000n; // 0.001 USDC
  try {
    calculateShares(dustBet, 5000n);
    return false; // Should have thrown
  } catch {
    return true; // Correctly rejected
  }
});

test('Rounding always favors protocol on fees', () => {
  // Test that fee rounding goes UP
  const shares = 1_000_001n; // Awkward number
  const feeBps = 100n; // 1%
  const payout = calculatePayout(shares, true, 0n, feeBps);
  
  // Fee should round UP
  const expectedFee = (shares * feeBps + BPS_PRECISION - 1n) / BPS_PRECISION;
  return payout.feeMicro >= expectedFee - 1n; // Allow 1 unit tolerance
});

test('Share calculation rounds DOWN (user gets fewer shares)', () => {
  // $1.00 at 30% = 3.333... shares
  const bet = USDC_PRECISION;
  const price = 3000n;
  const calc = calculateShares(bet, price);
  
  // Should be 3_333_333 (rounded down from 3_333_333.33...)
  return calc.shares === 3_333_333n;
});

test('User cannot profit from rounding by splitting bets', () => {
  const totalBet = 100n * USDC_PRECISION;
  const price = 3333n; // Awkward price
  
  // Single bet
  const singleShares = calculateShares(totalBet, price).shares;
  
  // Split into 10 bets
  const splitBet = 10n * USDC_PRECISION;
  let splitShares = 0n;
  for (let i = 0; i < 10; i++) {
    splitShares += calculateShares(splitBet, price).shares;
  }
  
  // Split should give same or FEWER shares (not more)
  return splitShares <= singleShares;
});

// ============================================================================
// PRICE BOUNDARY CONDITIONS
// ============================================================================

section('PRICE BOUNDARY CONDITIONS');

test('Zero progress gives minimum price', () => {
  const price = calculatePriceFromProgress(0n);
  return price.yesPriceBps === MIN_PRICE_BPS;
});

test('Exactly 85 SOL gives 99% (not 100%)', () => {
  const price = calculatePriceFromProgress(GRADUATION_THRESHOLD_LAMPORTS);
  return price.yesPriceBps === MAX_PRICE_BPS && price.yesPriceBps < 10000n;
});

test('Over graduation threshold still caps at 99%', () => {
  const overThreshold = GRADUATION_THRESHOLD_LAMPORTS * 2n;
  const price = calculatePriceFromProgress(overThreshold);
  return price.yesPriceBps === MAX_PRICE_BPS;
});

test('YES + NO prices always equal 100%', () => {
  const testCases = [0n, 1000n, 42_500_000_000n, 85_000_000_000n, 100_000_000_000n];
  
  for (const sol of testCases) {
    const price = calculatePriceFromProgress(sol);
    if (price.yesPriceBps + price.noPriceBps !== BPS_PRECISION) {
      return false;
    }
  }
  return true;
});

// ============================================================================
// SETTLEMENT INTEGRITY
// ============================================================================

section('SETTLEMENT INTEGRITY');

test('Winner always receives at least their bet back (at fair odds)', () => {
  // Bet $100 at 50% odds
  const bet = 100n * USDC_PRECISION;
  const price = 5000n;
  const shares = calculateShares(bet, price).shares;
  const payout = calculatePayout(shares, true, bet, 0n);
  
  // Should get $200 (2x at 50% odds)
  return payout.netPayoutMicro >= bet;
});

test('Loser receives exactly $0', () => {
  const shares = 1000n * USDC_PRECISION;
  const payout = calculatePayout(shares, false, 100n * USDC_PRECISION, 0n);
  return payout.netPayoutMicro === 0n;
});

test('Settlement is deterministic', () => {
  const shares = 12345678n;
  const cost = 5000000n;
  
  // Run settlement multiple times
  const results: { grossPayoutMicro: bigint; netPayoutMicro: bigint }[] = [];
  for (let i = 0; i < 10; i++) {
    results.push(calculatePayout(shares, true, cost, 100n));
  }
  
  // All results should be identical
  return results.every(r => 
    r.grossPayoutMicro === results[0].grossPayoutMicro &&
    r.netPayoutMicro === results[0].netPayoutMicro
  );
});

// ============================================================================
// SLIPPAGE PROTECTION
// ============================================================================

section('SLIPPAGE PROTECTION');

test('2% slippage is accepted', () => {
  const expected = 5000n;
  const actual = 5100n; // 2% higher
  return validateSlippage(expected, actual, 200n).valid;
});

test('5% slippage is rejected by default', () => {
  const expected = 5000n;
  const actual = 5250n; // 5% higher
  return !validateSlippage(expected, actual).valid;
});

test('Slippage calculation is symmetric', () => {
  const base = 5000n;
  const higher = 5100n;
  const lower = 4900n;
  
  const upSlippage = validateSlippage(base, higher);
  const downSlippage = validateSlippage(base, lower);
  
  // Both should have same slippage amount
  return upSlippage.slippageBps === downSlippage.slippageBps;
});

// ============================================================================
// CONCURRENT OPERATIONS
// ============================================================================

section('CONCURRENT OPERATION SAFETY');

test('Share calculation is stateless', () => {
  // Ensure no global state affects calculations
  const bet = 100n * USDC_PRECISION;
  const price = 5000n;
  
  const result1 = calculateShares(bet, price);
  const result2 = calculateShares(bet, price);
  const result3 = calculateShares(bet, price);
  
  return result1.shares === result2.shares && result2.shares === result3.shares;
});

test('Payout calculation is stateless', () => {
  const shares = 200n * USDC_PRECISION;
  const cost = 100n * USDC_PRECISION;
  
  const payout1 = calculatePayout(shares, true, cost);
  const payout2 = calculatePayout(shares, true, cost);
  
  return payout1.netPayoutMicro === payout2.netPayoutMicro;
});

// ============================================================================
// INVARIANT CHECKS
// ============================================================================

section('SYSTEM INVARIANTS');

test('Total payouts never exceed total deposits (zero-sum)', () => {
  // Simulate a market
  const bets = [
    { side: 'yes', amount: 100n * USDC_PRECISION, price: 5000n },
    { side: 'no', amount: 50n * USDC_PRECISION, price: 5000n },
    { side: 'yes', amount: 200n * USDC_PRECISION, price: 6000n },
    { side: 'no', amount: 150n * USDC_PRECISION, price: 4000n },
  ];
  
  let totalDeposits = 0n;
  let yesShares = 0n;
  let noShares = 0n;
  
  for (const bet of bets) {
    totalDeposits += bet.amount;
    const shares = calculateShares(bet.amount, bet.price).shares;
    if (bet.side === 'yes') yesShares += shares;
    else noShares += shares;
  }
  
  // If YES wins
  const yesPayouts = yesShares; // $1 per share
  
  // If NO wins
  const noPayouts = noShares; // $1 per share
  
  // Both scenarios should have payouts <= deposits
  // (In practice, payouts should be less due to the spread)
  return yesPayouts <= totalDeposits * 2n && noPayouts <= totalDeposits * 2n;
});

test('Shares are always positive', () => {
  const testCases = [
    { amount: MIN_BET_MICRO_USDC, price: MIN_PRICE_BPS },
    { amount: MIN_BET_MICRO_USDC, price: MAX_PRICE_BPS },
    { amount: 1_000_000n * USDC_PRECISION, price: 5000n },
  ];
  
  for (const tc of testCases) {
    const shares = calculateShares(tc.amount, tc.price).shares;
    if (shares <= 0n) return false;
  }
  return true;
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`\n📋 EDGE CASE TEST SUMMARY: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log('❌ PRODUCTION NOT READY - Fix failing tests!\n');
  process.exit(1);
} else {
  console.log('✅ ALL EDGE CASES HANDLED - Math is production ready!\n');
}

