# How Our Pricing Works (No Order Book Needed!)

## The Key Difference

### Polymarket (CLOB - Central Limit Order Book)
```
User A: "I'll buy YES at $0.45"
User B: "I'll sell YES at $0.47"
User C: "I'll buy YES at $0.46"

Matching engine pairs buyers & sellers
Price moves based on supply/demand of BETS
```

### Our System (External Price Feed)
```
Pump.fun bonding curve: 45% progress
→ YES price = $0.45
→ NO price = $0.55

User A buys YES → gets shares at $0.45
User B buys NO → gets shares at $0.55

Price only changes when PUMP.FUN activity changes!
Users betting with us DON'T affect our prices.
```

## Why This Works

### Price Discovery is EXTERNAL

```
┌─────────────────────────────────────────────────────────────────┐
│                    PUMP.FUN (External)                          │
│                                                                  │
│  Real traders buying/selling the token                          │
│  → Changes bonding curve reserves                               │
│  → Changes progress percentage                                  │
│  → Our prices automatically reflect this                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OUR PREDICTION MARKET                         │
│                                                                  │
│  We READ the progress, we don't SET it                          │
│  Users buy shares at current progress price                     │
│  At settlement: YES shares = $1, NO shares = $0                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Example Walkthrough

### Scenario: Token at 45% Progress

**Initial State:**
- Token progress: 45%
- YES price: $0.45
- NO price: $0.55

**User A bets $100 on YES:**
```
Shares = $100 / $0.45 = 222.22 shares
Cost = $100
```

**Token progresses to 50%:**
- YES price now: $0.50
- User A's shares still: 222.22
- User A's shares are NOW worth more if sold early!

**User B bets $100 on YES (at new price):**
```
Shares = $100 / $0.50 = 200 shares
Cost = $100
```

**At Settlement (token graduated = YES wins):**
```
User A: 222.22 shares × $1 = $222.22 (122% profit)
User B: 200.00 shares × $1 = $200.00 (100% profit)
```

**If NO wins (token didn't graduate):**
```
User A: 222.22 shares × $0 = $0 (100% loss)
User B: 200.00 shares × $0 = $0 (100% loss)
```

## How We Track User Value

### What We Store Per Position
```typescript
interface Position {
  userId: string;
  marketMint: string;
  side: 'yes' | 'no';
  shares: bigint;        // How many shares they own
  costBasis: bigint;     // How much they paid
  entryPriceBps: number; // Price when they bought (for stats)
}
```

### User's Current Value Calculation
```typescript
function getCurrentValue(position: Position, currentPriceBps: number): number {
  // Method 1: If they could sell now (theoretical)
  const theoreticalValue = position.shares * currentPriceBps / 10000;
  
  // Method 2: Expected value based on probability
  const yesPrice = currentPriceBps / 10000;
  const expectedValue = position.side === 'yes' 
    ? position.shares * yesPrice      // YES: worth $1 × probability
    : position.shares * (1 - yesPrice); // NO: worth $1 × (1-probability)
  
  return expectedValue;
}
```

### Example: Tracking Value Changes

```
Time 0: User buys 222 YES shares at $0.45
  - Cost basis: $100
  - Current value: 222 × $0.45 = $100

Time 1: Price moves to $0.60
  - Shares: still 222
  - Current value: 222 × $0.60 = $133.20
  - Unrealized profit: $33.20

Time 2: Price drops to $0.40
  - Shares: still 222
  - Current value: 222 × $0.40 = $88.80
  - Unrealized loss: $11.20

Settlement: YES wins
  - Final value: 222 × $1.00 = $222.00
  - Net profit: $122.00
```

## Why We DON'T Need an Order Book

| Feature | Order Book (Polymarket) | Our System |
|---------|------------------------|------------|
| Price discovery | Internal (bets) | External (pump.fun) |
| Market makers | Required | Not needed |
| Liquidity | Can dry up | Always available* |
| Slippage | Yes (big orders) | No (price is fixed) |
| Matching | Complex algorithm | None needed |
| Settlement | Based on order matches | Based on shares × outcome |

*Liquidity limited by protocol treasury, not market makers

## The "Pool" Is Just Accounting

```
Market State:
  yesPool: $5,000 (total bet on YES)
  noPool: $3,000 (total bet on NO)
  totalPool: $8,000

This tells us:
  - Total volume: $8,000
  - But does NOT affect price!
  - Price is STILL just the pump.fun progress %
```

## How Settlement Works

```
At market end:
  1. Check pump.fun bonding curve
  2. If graduated: outcome = YES
  3. If not: outcome = NO

For each position:
  - If position.side === outcome:
      payout = position.shares  (each share = $1)
  - Else:
      payout = 0
```

## Summary

**Our system is a "Parimutuel-like" market with external price feed:**

1. ✅ Price comes from pump.fun (external, trustworthy)
2. ✅ Users buy shares at current price
3. ✅ Shares = (bet amount) / (current price)
4. ✅ Winners get $1 per share
5. ✅ Losers get $0 per share
6. ✅ No matching, no order book, no market makers

**Think of it like:**
- Binary options on pump.fun progress
- Fixed payout ($1 or $0)
- Dynamic entry price (based on progress)

