/**
 * Comprehensive tests for the math engine
 * 
 * RUN: npx tsx src/core/math.test.ts
 */

import {
  calculatePriceFromProgress,
  calculateShares,
  calculatePayout,
  validateSlippage,
  microUsdcToDisplay,
  displayToMicroUsdc,
  bpsToPercent,
  bpsToPrice,
  verifyShareCalculation,
  USDC_PRECISION,
  BPS_PRECISION,
  LAMPORTS_PER_SOL,
  GRADUATION_THRESHOLD_LAMPORTS,
  MIN_PRICE_BPS,
  MAX_PRICE_BPS,
  MIN_BET_MICRO_USDC,
} from './math.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.log(`  ✗ ${message}`);
  }
}

function assertEqual(actual: any, expected: any, message: string) {
  const pass = actual === expected || 
    (typeof actual === 'bigint' && typeof expected === 'bigint' && actual === expected);
  if (pass) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.log(`  ✗ ${message}: expected ${expected}, got ${actual}`);
  }
}

function assertApprox(actual: number, expected: number, tolerance: number, message: string) {
  const pass = Math.abs(actual - expected) <= tolerance;
  if (pass) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.log(`  ✗ ${message}: expected ~${expected}, got ${actual}`);
  }
}

// ============================================================================
// PRICE CALCULATION TESTS
// ============================================================================

console.log('\n📊 Price Calculation Tests\n');

// Test 1: 0% progress
{
  const price = calculatePriceFromProgress(0n);
  assertEqual(price.progressBps, 0n, '0 SOL = 0% progress');
  assertEqual(price.yesPriceBps, MIN_PRICE_BPS, 'YES price floored at 1%');
  assertEqual(price.noPriceBps, BPS_PRECISION - MIN_PRICE_BPS, 'NO price = 99%');
}

// Test 2: 50% progress (42.5 SOL)
{
  const halfwayLamports = GRADUATION_THRESHOLD_LAMPORTS / 2n;
  const price = calculatePriceFromProgress(halfwayLamports);
  assertEqual(price.progressBps, 5000n, '42.5 SOL = 50% progress');
  assertEqual(price.yesPriceBps, 5000n, 'YES price = 50%');
  assertEqual(price.noPriceBps, 5000n, 'NO price = 50%');
}

// Test 3: 90% progress (76.5 SOL)
{
  const ninetyPercentLamports = (GRADUATION_THRESHOLD_LAMPORTS * 9n) / 10n;
  const price = calculatePriceFromProgress(ninetyPercentLamports);
  assertEqual(price.progressBps, 9000n, '76.5 SOL = 90% progress');
  assertEqual(price.yesPriceBps, 9000n, 'YES price = 90%');
  assertEqual(price.noPriceBps, 1000n, 'NO price = 10%');
}

// Test 4: 100% progress (85 SOL - graduated)
{
  const price = calculatePriceFromProgress(GRADUATION_THRESHOLD_LAMPORTS);
  assertEqual(price.progressBps, 10000n, '85 SOL = 100% progress');
  assertEqual(price.yesPriceBps, MAX_PRICE_BPS, 'YES price capped at 99%');
  assertEqual(price.noPriceBps, BPS_PRECISION - MAX_PRICE_BPS, 'NO price = 1%');
}

// Test 5: Over 100% (should cap at 100%)
{
  const overLamports = GRADUATION_THRESHOLD_LAMPORTS * 2n;
  const price = calculatePriceFromProgress(overLamports);
  assertEqual(price.progressBps, 10000n, 'Over threshold caps at 100%');
  assertEqual(price.yesPriceBps, MAX_PRICE_BPS, 'YES price capped at 99%');
}

// Test 6: Very small amount (< 1% progress)
{
  const tinyLamports = GRADUATION_THRESHOLD_LAMPORTS / 200n; // 0.5%
  const price = calculatePriceFromProgress(tinyLamports);
  assertEqual(price.yesPriceBps, MIN_PRICE_BPS, 'Tiny progress floored at 1%');
}

// ============================================================================
// SHARE CALCULATION TESTS
// ============================================================================

console.log('\n🎲 Share Calculation Tests\n');

// Test 1: $100 bet at 50% price
{
  const amount = 100n * USDC_PRECISION; // $100
  const price = 5000n; // 50%
  
  const calc = calculateShares(amount, price);
  
  // Expected: $100 / $0.50 = 200 shares (worth $200 if win)
  const expectedShares = 200n * USDC_PRECISION;
  assertEqual(calc.shares, expectedShares, '$100 at 50% = 200 shares');
  
  // Verify invariant
  assert(verifyShareCalculation(calc), 'Share calculation invariant holds');
}

// Test 2: $50 bet at 25% price
{
  const amount = 50n * USDC_PRECISION; // $50
  const price = 2500n; // 25%
  
  const calc = calculateShares(amount, price);
  
  // Expected: $50 / $0.25 = 200 shares (worth $200 if win)
  const expectedShares = 200n * USDC_PRECISION;
  assertEqual(calc.shares, expectedShares, '$50 at 25% = 200 shares');
}

// Test 3: $10 bet at 90% price
{
  const amount = 10n * USDC_PRECISION; // $10
  const price = 9000n; // 90%
  
  const calc = calculateShares(amount, price);
  
  // Expected: $10 / $0.90 = 11.11 shares
  // In micro-USDC: 10_000_000 * 10000 / 9000 = 11_111_111
  const expectedShares = 11_111_111n;
  assertEqual(calc.shares, expectedShares, '$10 at 90% = ~11.11 shares');
}

// Test 4: Minimum bet ($1)
{
  const amount = MIN_BET_MICRO_USDC;
  const price = 5000n;
  
  const calc = calculateShares(amount, price);
  assertEqual(calc.shares, 2n * USDC_PRECISION, '$1 at 50% = 2 shares');
}

// Test 5: Should reject below minimum bet
{
  let threw = false;
  try {
    calculateShares(500_000n, 5000n); // $0.50
  } catch (e) {
    threw = true;
  }
  assert(threw, 'Rejects bet below minimum');
}

// Test 6: Edge case - 1% price (max leverage)
{
  const amount = 100n * USDC_PRECISION;
  const price = MIN_PRICE_BPS; // 1%
  
  const calc = calculateShares(amount, price);
  
  // $100 at 1% = 10,000 shares (100x leverage!)
  const expectedShares = 10_000n * USDC_PRECISION;
  assertEqual(calc.shares, expectedShares, '$100 at 1% = 10,000 shares');
}

// ============================================================================
// PAYOUT CALCULATION TESTS
// ============================================================================

console.log('\n💰 Payout Calculation Tests\n');

// Test 1: Winner gets $1 per share
{
  const shares = 100n * USDC_PRECISION; // 100 shares
  const cost = 50n * USDC_PRECISION; // Paid $50
  
  const payout = calculatePayout(shares, true, cost);
  
  assertEqual(payout.grossPayoutMicro, 100n * USDC_PRECISION, 'Winner gets $100');
  assertEqual(payout.netPayoutMicro, 100n * USDC_PRECISION, 'No fee = net equals gross');
  assertEqual(payout.profitMicro, 50n * USDC_PRECISION, 'Profit = $50');
}

// Test 2: Loser gets $0
{
  const shares = 100n * USDC_PRECISION;
  const cost = 50n * USDC_PRECISION;
  
  const payout = calculatePayout(shares, false, cost);
  
  assertEqual(payout.grossPayoutMicro, 0n, 'Loser gets $0');
  assertEqual(payout.netPayoutMicro, 0n, 'No payout');
  assertEqual(payout.profitMicro, -50n * USDC_PRECISION, 'Loss = -$50');
}

// Test 3: With protocol fee (1%)
{
  const shares = 100n * USDC_PRECISION;
  const cost = 50n * USDC_PRECISION;
  const feeRate = 100n; // 1%
  
  const payout = calculatePayout(shares, true, cost, feeRate);
  
  assertEqual(payout.grossPayoutMicro, 100n * USDC_PRECISION, 'Gross still $100');
  assertEqual(payout.feeMicro, 1n * USDC_PRECISION, 'Fee = $1');
  assertEqual(payout.netPayoutMicro, 99n * USDC_PRECISION, 'Net = $99');
}

// Test 4: Break-even scenario
{
  const shares = 50n * USDC_PRECISION; // 50 shares
  const cost = 50n * USDC_PRECISION; // Paid $50 (bought at exactly $1 per share)
  
  const payout = calculatePayout(shares, true, cost);
  assertEqual(payout.profitMicro, 0n, 'Break even when price was $1');
}

// ============================================================================
// SLIPPAGE VALIDATION TESTS
// ============================================================================

console.log('\n⚠️ Slippage Validation Tests\n');

// Test 1: No slippage
{
  const result = validateSlippage(5000n, 5000n);
  assert(result.valid, 'No slippage is valid');
  assertEqual(result.slippageBps, 0n, 'Slippage = 0%');
}

// Test 2: Small slippage (within tolerance)
{
  const result = validateSlippage(5000n, 5050n); // 1% move
  assert(result.valid, '1% slippage is valid (under 2% default)');
}

// Test 3: Large slippage (exceeds tolerance)
{
  const result = validateSlippage(5000n, 5500n); // 10% move
  assert(!result.valid, '10% slippage is rejected');
}

// Test 4: Custom tolerance
{
  const result = validateSlippage(5000n, 5500n, 1000n); // 10% tolerance
  assert(result.valid, '10% slippage valid with 10% tolerance');
}

// ============================================================================
// UTILITY FUNCTION TESTS
// ============================================================================

console.log('\n🔧 Utility Function Tests\n');

// Micro-USDC conversion
{
  assertEqual(microUsdcToDisplay(1_000_000n), '1.000000', '$1 display');
  assertEqual(microUsdcToDisplay(123_456_789n), '123.456789', 'Decimal display');
  assertEqual(microUsdcToDisplay(100n), '0.000100', 'Tiny amount display');
}

// Display to micro-USDC
{
  assertEqual(displayToMicroUsdc('1'), 1_000_000n, 'Parse $1');
  assertEqual(displayToMicroUsdc('0.01'), 10_000n, 'Parse $0.01');
  assertEqual(displayToMicroUsdc(100.5), 100_500_000n, 'Parse number');
}

// BPS conversions
{
  assertEqual(bpsToPercent(5000n), '50.00%', '5000 BPS = 50%');
  assertEqual(bpsToPercent(100n), '1.00%', '100 BPS = 1%');
  assertApprox(bpsToPrice(5000n), 0.5, 0.001, '5000 BPS = $0.50');
}

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

console.log('\n🔥 Edge Case Tests\n');

// Test: Very large bet
{
  const hugeBet = 1_000_000n * USDC_PRECISION; // $1M
  const price = 5000n;
  
  const calc = calculateShares(hugeBet, price);
  assertEqual(calc.shares, 2_000_000n * USDC_PRECISION, 'Large bet calculates correctly');
  assert(verifyShareCalculation(calc), 'Large bet invariant holds');
}

// Test: Rounding behavior
{
  // $1.00 at 30% = 3.333... shares
  const amount = USDC_PRECISION;
  const price = 3000n;
  
  const calc = calculateShares(amount, price);
  
  // Should round down: 1_000_000 * 10_000 / 3_000 = 3_333_333
  assertEqual(calc.shares, 3_333_333n, 'Rounds down on share calculation');
  
  // Verify we don't give away money
  const payout = calculatePayout(calc.shares, true, amount);
  assert(payout.grossPayoutMicro >= amount, 'Winner always gets at least their money back');
}

// Test: Price at exact boundaries
{
  const priceAtMin = calculatePriceFromProgress(GRADUATION_THRESHOLD_LAMPORTS / 100n);
  assert(priceAtMin.yesPriceBps >= MIN_PRICE_BPS, 'Price never below minimum');
  
  const priceAtMax = calculatePriceFromProgress(GRADUATION_THRESHOLD_LAMPORTS);
  assert(priceAtMax.yesPriceBps <= MAX_PRICE_BPS, 'Price never above maximum');
}

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`\n📋 Test Summary: ${testsPassed} passed, ${testsFailed} failed\n`);

if (testsFailed > 0) {
  console.log('❌ Some tests failed! Review the failures above.\n');
  process.exit(1);
} else {
  console.log('✅ All tests passed! Math engine is solid.\n');
}

 * Comprehensive tests for the math engine
 * 
 * RUN: npx tsx src/core/math.test.ts
 */

import {
  calculatePriceFromProgress,
  calculateShares,
  calculatePayout,
  validateSlippage,
  microUsdcToDisplay,
  displayToMicroUsdc,
  bpsToPercent,
  bpsToPrice,
  verifyShareCalculation,
  USDC_PRECISION,
  BPS_PRECISION,
  LAMPORTS_PER_SOL,
  GRADUATION_THRESHOLD_LAMPORTS,
  MIN_PRICE_BPS,
  MAX_PRICE_BPS,
  MIN_BET_MICRO_USDC,
} from './math.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.log(`  ✗ ${message}`);
  }
}

function assertEqual(actual: any, expected: any, message: string) {
  const pass = actual === expected || 
    (typeof actual === 'bigint' && typeof expected === 'bigint' && actual === expected);
  if (pass) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.log(`  ✗ ${message}: expected ${expected}, got ${actual}`);
  }
}

function assertApprox(actual: number, expected: number, tolerance: number, message: string) {
  const pass = Math.abs(actual - expected) <= tolerance;
  if (pass) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.log(`  ✗ ${message}: expected ~${expected}, got ${actual}`);
  }
}

// ============================================================================
// PRICE CALCULATION TESTS
// ============================================================================

console.log('\n📊 Price Calculation Tests\n');

// Test 1: 0% progress
{
  const price = calculatePriceFromProgress(0n);
  assertEqual(price.progressBps, 0n, '0 SOL = 0% progress');
  assertEqual(price.yesPriceBps, MIN_PRICE_BPS, 'YES price floored at 1%');
  assertEqual(price.noPriceBps, BPS_PRECISION - MIN_PRICE_BPS, 'NO price = 99%');
}

// Test 2: 50% progress (42.5 SOL)
{
  const halfwayLamports = GRADUATION_THRESHOLD_LAMPORTS / 2n;
  const price = calculatePriceFromProgress(halfwayLamports);
  assertEqual(price.progressBps, 5000n, '42.5 SOL = 50% progress');
  assertEqual(price.yesPriceBps, 5000n, 'YES price = 50%');
  assertEqual(price.noPriceBps, 5000n, 'NO price = 50%');
}

// Test 3: 90% progress (76.5 SOL)
{
  const ninetyPercentLamports = (GRADUATION_THRESHOLD_LAMPORTS * 9n) / 10n;
  const price = calculatePriceFromProgress(ninetyPercentLamports);
  assertEqual(price.progressBps, 9000n, '76.5 SOL = 90% progress');
  assertEqual(price.yesPriceBps, 9000n, 'YES price = 90%');
  assertEqual(price.noPriceBps, 1000n, 'NO price = 10%');
}

// Test 4: 100% progress (85 SOL - graduated)
{
  const price = calculatePriceFromProgress(GRADUATION_THRESHOLD_LAMPORTS);
  assertEqual(price.progressBps, 10000n, '85 SOL = 100% progress');
  assertEqual(price.yesPriceBps, MAX_PRICE_BPS, 'YES price capped at 99%');
  assertEqual(price.noPriceBps, BPS_PRECISION - MAX_PRICE_BPS, 'NO price = 1%');
}

// Test 5: Over 100% (should cap at 100%)
{
  const overLamports = GRADUATION_THRESHOLD_LAMPORTS * 2n;
  const price = calculatePriceFromProgress(overLamports);
  assertEqual(price.progressBps, 10000n, 'Over threshold caps at 100%');
  assertEqual(price.yesPriceBps, MAX_PRICE_BPS, 'YES price capped at 99%');
}

// Test 6: Very small amount (< 1% progress)
{
  const tinyLamports = GRADUATION_THRESHOLD_LAMPORTS / 200n; // 0.5%
  const price = calculatePriceFromProgress(tinyLamports);
  assertEqual(price.yesPriceBps, MIN_PRICE_BPS, 'Tiny progress floored at 1%');
}

// ============================================================================
// SHARE CALCULATION TESTS
// ============================================================================

console.log('\n🎲 Share Calculation Tests\n');

// Test 1: $100 bet at 50% price
{
  const amount = 100n * USDC_PRECISION; // $100
  const price = 5000n; // 50%
  
  const calc = calculateShares(amount, price);
  
  // Expected: $100 / $0.50 = 200 shares (worth $200 if win)
  const expectedShares = 200n * USDC_PRECISION;
  assertEqual(calc.shares, expectedShares, '$100 at 50% = 200 shares');
  
  // Verify invariant
  assert(verifyShareCalculation(calc), 'Share calculation invariant holds');
}

// Test 2: $50 bet at 25% price
{
  const amount = 50n * USDC_PRECISION; // $50
  const price = 2500n; // 25%
  
  const calc = calculateShares(amount, price);
  
  // Expected: $50 / $0.25 = 200 shares (worth $200 if win)
  const expectedShares = 200n * USDC_PRECISION;
  assertEqual(calc.shares, expectedShares, '$50 at 25% = 200 shares');
}

// Test 3: $10 bet at 90% price
{
  const amount = 10n * USDC_PRECISION; // $10
  const price = 9000n; // 90%
  
  const calc = calculateShares(amount, price);
  
  // Expected: $10 / $0.90 = 11.11 shares
  // In micro-USDC: 10_000_000 * 10000 / 9000 = 11_111_111
  const expectedShares = 11_111_111n;
  assertEqual(calc.shares, expectedShares, '$10 at 90% = ~11.11 shares');
}

// Test 4: Minimum bet ($1)
{
  const amount = MIN_BET_MICRO_USDC;
  const price = 5000n;
  
  const calc = calculateShares(amount, price);
  assertEqual(calc.shares, 2n * USDC_PRECISION, '$1 at 50% = 2 shares');
}

// Test 5: Should reject below minimum bet
{
  let threw = false;
  try {
    calculateShares(500_000n, 5000n); // $0.50
  } catch (e) {
    threw = true;
  }
  assert(threw, 'Rejects bet below minimum');
}

// Test 6: Edge case - 1% price (max leverage)
{
  const amount = 100n * USDC_PRECISION;
  const price = MIN_PRICE_BPS; // 1%
  
  const calc = calculateShares(amount, price);
  
  // $100 at 1% = 10,000 shares (100x leverage!)
  const expectedShares = 10_000n * USDC_PRECISION;
  assertEqual(calc.shares, expectedShares, '$100 at 1% = 10,000 shares');
}

// ============================================================================
// PAYOUT CALCULATION TESTS
// ============================================================================

console.log('\n💰 Payout Calculation Tests\n');

// Test 1: Winner gets $1 per share
{
  const shares = 100n * USDC_PRECISION; // 100 shares
  const cost = 50n * USDC_PRECISION; // Paid $50
  
  const payout = calculatePayout(shares, true, cost);
  
  assertEqual(payout.grossPayoutMicro, 100n * USDC_PRECISION, 'Winner gets $100');
  assertEqual(payout.netPayoutMicro, 100n * USDC_PRECISION, 'No fee = net equals gross');
  assertEqual(payout.profitMicro, 50n * USDC_PRECISION, 'Profit = $50');
}

// Test 2: Loser gets $0
{
  const shares = 100n * USDC_PRECISION;
  const cost = 50n * USDC_PRECISION;
  
  const payout = calculatePayout(shares, false, cost);
  
  assertEqual(payout.grossPayoutMicro, 0n, 'Loser gets $0');
  assertEqual(payout.netPayoutMicro, 0n, 'No payout');
  assertEqual(payout.profitMicro, -50n * USDC_PRECISION, 'Loss = -$50');
}

// Test 3: With protocol fee (1%)
{
  const shares = 100n * USDC_PRECISION;
  const cost = 50n * USDC_PRECISION;
  const feeRate = 100n; // 1%
  
  const payout = calculatePayout(shares, true, cost, feeRate);
  
  assertEqual(payout.grossPayoutMicro, 100n * USDC_PRECISION, 'Gross still $100');
  assertEqual(payout.feeMicro, 1n * USDC_PRECISION, 'Fee = $1');
  assertEqual(payout.netPayoutMicro, 99n * USDC_PRECISION, 'Net = $99');
}

// Test 4: Break-even scenario
{
  const shares = 50n * USDC_PRECISION; // 50 shares
  const cost = 50n * USDC_PRECISION; // Paid $50 (bought at exactly $1 per share)
  
  const payout = calculatePayout(shares, true, cost);
  assertEqual(payout.profitMicro, 0n, 'Break even when price was $1');
}

// ============================================================================
// SLIPPAGE VALIDATION TESTS
// ============================================================================

console.log('\n⚠️ Slippage Validation Tests\n');

// Test 1: No slippage
{
  const result = validateSlippage(5000n, 5000n);
  assert(result.valid, 'No slippage is valid');
  assertEqual(result.slippageBps, 0n, 'Slippage = 0%');
}

// Test 2: Small slippage (within tolerance)
{
  const result = validateSlippage(5000n, 5050n); // 1% move
  assert(result.valid, '1% slippage is valid (under 2% default)');
}

// Test 3: Large slippage (exceeds tolerance)
{
  const result = validateSlippage(5000n, 5500n); // 10% move
  assert(!result.valid, '10% slippage is rejected');
}

// Test 4: Custom tolerance
{
  const result = validateSlippage(5000n, 5500n, 1000n); // 10% tolerance
  assert(result.valid, '10% slippage valid with 10% tolerance');
}

// ============================================================================
// UTILITY FUNCTION TESTS
// ============================================================================

console.log('\n🔧 Utility Function Tests\n');

// Micro-USDC conversion
{
  assertEqual(microUsdcToDisplay(1_000_000n), '1.000000', '$1 display');
  assertEqual(microUsdcToDisplay(123_456_789n), '123.456789', 'Decimal display');
  assertEqual(microUsdcToDisplay(100n), '0.000100', 'Tiny amount display');
}

// Display to micro-USDC
{
  assertEqual(displayToMicroUsdc('1'), 1_000_000n, 'Parse $1');
  assertEqual(displayToMicroUsdc('0.01'), 10_000n, 'Parse $0.01');
  assertEqual(displayToMicroUsdc(100.5), 100_500_000n, 'Parse number');
}

// BPS conversions
{
  assertEqual(bpsToPercent(5000n), '50.00%', '5000 BPS = 50%');
  assertEqual(bpsToPercent(100n), '1.00%', '100 BPS = 1%');
  assertApprox(bpsToPrice(5000n), 0.5, 0.001, '5000 BPS = $0.50');
}

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

console.log('\n🔥 Edge Case Tests\n');

// Test: Very large bet
{
  const hugeBet = 1_000_000n * USDC_PRECISION; // $1M
  const price = 5000n;
  
  const calc = calculateShares(hugeBet, price);
  assertEqual(calc.shares, 2_000_000n * USDC_PRECISION, 'Large bet calculates correctly');
  assert(verifyShareCalculation(calc), 'Large bet invariant holds');
}

// Test: Rounding behavior
{
  // $1.00 at 30% = 3.333... shares
  const amount = USDC_PRECISION;
  const price = 3000n;
  
  const calc = calculateShares(amount, price);
  
  // Should round down: 1_000_000 * 10_000 / 3_000 = 3_333_333
  assertEqual(calc.shares, 3_333_333n, 'Rounds down on share calculation');
  
  // Verify we don't give away money
  const payout = calculatePayout(calc.shares, true, amount);
  assert(payout.grossPayoutMicro >= amount, 'Winner always gets at least their money back');
}

// Test: Price at exact boundaries
{
  const priceAtMin = calculatePriceFromProgress(GRADUATION_THRESHOLD_LAMPORTS / 100n);
  assert(priceAtMin.yesPriceBps >= MIN_PRICE_BPS, 'Price never below minimum');
  
  const priceAtMax = calculatePriceFromProgress(GRADUATION_THRESHOLD_LAMPORTS);
  assert(priceAtMax.yesPriceBps <= MAX_PRICE_BPS, 'Price never above maximum');
}

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`\n📋 Test Summary: ${testsPassed} passed, ${testsFailed} failed\n`);

if (testsFailed > 0) {
  console.log('❌ Some tests failed! Review the failures above.\n');
  process.exit(1);
} else {
  console.log('✅ All tests passed! Math engine is solid.\n');
}

