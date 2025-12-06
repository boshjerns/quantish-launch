# Order Book Design: Market Orders vs Limit Orders

## The Key Insight: Our System is Different

Traditional prediction markets (Polymarket, Kalshi) use a **Central Limit Order Book (CLOB)**:
- Users place bids and asks
- Matching engine pairs orders
- Price discovery happens IN the market
- Betting volume affects odds

**Our system is fundamentally different:**
- Price comes from an EXTERNAL source (pump.fun bonding curve)
- Users betting on our platform DON'T change the odds
- Only people trading the actual pump.fun token affect the price
- We're offering **binary options on an external price feed**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TRADITIONAL PREDICTION MARKET                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   User A bids $0.40 on YES ──┐                                     │
│                               ├──► Matching Engine ──► Price = $0.42│
│   User B asks $0.44 on YES ──┘                                     │
│                                                                     │
│   More YES bets = Higher YES price (internal price discovery)       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    OUR PUMP.FUN PREDICTION MARKET                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Pump.fun Bonding Curve ─────────────────────► YES Price = 45%     │
│   (42.5 SOL in curve = 50% progress)                               │
│                                                                     │
│   User A bets on YES ──► Gets shares at 45% ──► No price change!   │
│   User B bets on NO ───► Gets shares at 55% ──► No price change!   │
│                                                                     │
│   Price only changes when someone trades the ACTUAL pump.fun token  │
└─────────────────────────────────────────────────────────────────────┘
```

## What This Means for Order Types

### Market Orders (Simple - MVP)
- User buys YES or NO at current price
- Slippage protection (max 2% from quoted price)
- Instant execution
- **This is sufficient for most users!**

### Limit Orders (Advanced)
Even though users can't affect prices, they might want:
- "Buy YES if price drops to 30%" (buy the dip)
- "Buy NO if price rises above 80%" (fade the pump)
- These are essentially **price alerts with auto-execution**

## Three Approaches to Limit Orders

### Approach 1: Off-Chain Limit Orders (Recommended for MVP)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      OFF-CHAIN LIMIT ORDER SYSTEM                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. User submits limit order ──► Stored in PostgreSQL               │
│     "Buy 100 YES at 30% or better"                                  │
│                                                                     │
│  2. Price Oracle monitors pump.fun ──► Every 10 seconds             │
│                                                                     │
│  3. When price hits 30%:                                            │
│     - Lock user's funds (USDC/SOL)                                  │
│     - Execute order at 30%                                          │
│     - Create position                                               │
│                                                                     │
│  Pros: Simple, cheap, fast                                          │
│  Cons: Requires trust in our backend                                │
└─────────────────────────────────────────────────────────────────────┘
```

### Approach 2: On-Chain Limit Orders with Crankers

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ON-CHAIN LIMIT ORDER SYSTEM                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. User submits limit order ──► Creates on-chain account           │
│     - Locks funds in escrow                                         │
│     - Specifies trigger price                                       │
│                                                                     │
│  2. Cranker bots monitor prices                                     │
│     - Anyone can run a cranker                                      │
│     - Incentivized with small fee                                   │
│                                                                     │
│  3. When price hits trigger:                                        │
│     - Cranker calls execute_limit_order                             │
│     - Contract verifies price from bonding curve                    │
│     - Executes trade, creates position                              │
│                                                                     │
│  Pros: Trustless, decentralized                                     │
│  Cons: More complex, gas costs for order creation                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Approach 3: Hybrid (Best of Both)

```
Phase 1: Off-chain limit orders (fast to ship)
Phase 2: On-chain migration for users who want trustlessness
```

## Bid/Ask Spread: We Don't Have One!

Traditional markets have spreads because:
- Market makers quote bid/ask
- Spread = their profit margin
- Tighter spread = more competitive

**Our market has NO spread** because:
- There's no order book
- Price is externally determined
- Users trade against the protocol, not each other

```
Traditional:  BID $0.48 ──── SPREAD $0.04 ──── ASK $0.52

Ours:         YES Price = 50% (from bonding curve)
              NO Price  = 50% (always 1 - YES)
              
              Buy YES at $0.50
              Buy NO at $0.50
              No spread!
```

## The "Spread" We DO Have: Protocol Fee

Instead of a bid/ask spread, we can charge a small fee:

```typescript
// User wants to buy $100 of YES at 50%
const amount = 100_000_000n; // $100 in micro-USDC
const price = 5000n; // 50% in BPS
const protocolFeeBps = 50n; // 0.5% fee

// Shares before fee
const grossShares = (amount * 10000n) / price; // 200 shares

// Protocol takes 0.5%
const fee = (amount * protocolFeeBps) / 10000n; // $0.50
const netAmount = amount - fee; // $99.50

// Final shares
const shares = (netAmount * 10000n) / price; // 199 shares
```

## Order Types We Should Support

### MVP (Phase 1)
1. **Market Buy YES** - Buy YES at current price
2. **Market Buy NO** - Buy NO at current price
3. **Claim Winnings** - Settle position after market ends

### Phase 2
4. **Limit Buy YES** - Buy YES if price drops to X
5. **Limit Buy NO** - Buy NO if price rises to X
6. **Stop Loss** - Sell position if price moves against you

### Phase 3 (Maybe)
7. **Sell Position** - Secondary market for positions
   - This WOULD require an order book
   - Users selling to other users
   - More complex, maybe not needed

## Database Schema for Limit Orders

```sql
CREATE TABLE limit_orders (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  market_mint TEXT NOT NULL REFERENCES tokens(mint),
  
  -- Order details
  side TEXT NOT NULL,           -- 'yes' or 'no'
  order_type TEXT NOT NULL,     -- 'limit_buy', 'stop_loss'
  amount_micro BIGINT NOT NULL, -- USDC amount to spend
  
  -- Trigger conditions
  trigger_price_bps INT NOT NULL,    -- Price to trigger at
  trigger_direction TEXT NOT NULL,   -- 'lte' (<=) or 'gte' (>=)
  
  -- Execution
  status TEXT NOT NULL DEFAULT 'pending', -- pending, executed, cancelled, expired
  executed_at TIMESTAMP,
  executed_price_bps INT,
  position_id UUID REFERENCES positions(id),
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,      -- Auto-cancel after this
  
  CONSTRAINT valid_trigger CHECK (
    (order_type = 'limit_buy' AND side = 'yes' AND trigger_direction = 'lte') OR
    (order_type = 'limit_buy' AND side = 'no' AND trigger_direction = 'gte') OR
    (order_type = 'stop_loss')
  )
);

CREATE INDEX idx_limit_orders_pending ON limit_orders(market_mint, status) 
  WHERE status = 'pending';
```

## Limit Order Execution Logic

```typescript
interface LimitOrder {
  id: string;
  marketMint: string;
  side: 'yes' | 'no';
  amountMicro: bigint;
  triggerPriceBps: number;
  triggerDirection: 'lte' | 'gte';
  status: 'pending' | 'executed' | 'cancelled';
}

async function checkAndExecuteLimitOrders(): Promise<void> {
  // Get all pending orders
  const pendingOrders = db.prepare(`
    SELECT lo.*, t.progress_bps as current_price_bps
    FROM limit_orders lo
    JOIN tokens t ON lo.market_mint = t.mint
    WHERE lo.status = 'pending'
      AND lo.expires_at > datetime('now')
      AND t.status = 'active'
  `).all() as (LimitOrder & { current_price_bps: number })[];
  
  for (const order of pendingOrders) {
    const shouldExecute = 
      (order.triggerDirection === 'lte' && order.current_price_bps <= order.triggerPriceBps) ||
      (order.triggerDirection === 'gte' && order.current_price_bps >= order.triggerPriceBps);
    
    if (shouldExecute) {
      await executeLimitOrder(order);
    }
  }
}

async function executeLimitOrder(order: LimitOrder): Promise<void> {
  // 1. Verify user still has funds locked
  // 2. Get current exact price from chain
  // 3. Execute at the BETTER of trigger price or current price
  // 4. Create position
  // 5. Update order status
  // 6. Emit event for websocket
}
```

## Why This Works Without an Order Book

The key insight is that our "counterparty" is the protocol itself:

```
Traditional Market:
  Buyer ←──matches──► Seller
  (need order book to find matches)

Our Market:
  Buyer ──► Protocol ──► Issues Shares
  (protocol is always the counterparty)
  
  At settlement:
  Winner ──► Protocol ──► Pays out from pool
  (pool funded by losers)
```

This is called a **Parimutuel-like** system with external price feed.

## Summary: What We're Building

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SYSTEM OVERVIEW                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Price Source: Pump.fun bonding curve (external, on-chain)          │
│  Market Type:  Binary options with parimutuel settlement            │
│  Order Types:  Market orders (MVP), Limit orders (Phase 2)          │
│  Spread:       None! (just protocol fee)                            │
│  Settlement:   Trustless (reads graduation status from chain)       │
│                                                                     │
│  Key Advantage:                                                     │
│  - No market makers needed                                          │
│  - No liquidity bootstrapping                                       │
│  - Price discovery happens on pump.fun                              │
│  - We just provide the betting layer                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Recommended Implementation Order

1. **Week 1**: Market orders only (buy YES/NO at current price)
2. **Week 2**: Basic limit orders (off-chain, checked every 10 seconds)
3. **Week 3**: WebSocket for real-time price updates
4. **Week 4**: On-chain limit orders (optional, for trustlessness)


## The Key Insight: Our System is Different

Traditional prediction markets (Polymarket, Kalshi) use a **Central Limit Order Book (CLOB)**:
- Users place bids and asks
- Matching engine pairs orders
- Price discovery happens IN the market
- Betting volume affects odds

**Our system is fundamentally different:**
- Price comes from an EXTERNAL source (pump.fun bonding curve)
- Users betting on our platform DON'T change the odds
- Only people trading the actual pump.fun token affect the price
- We're offering **binary options on an external price feed**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TRADITIONAL PREDICTION MARKET                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   User A bids $0.40 on YES ──┐                                     │
│                               ├──► Matching Engine ──► Price = $0.42│
│   User B asks $0.44 on YES ──┘                                     │
│                                                                     │
│   More YES bets = Higher YES price (internal price discovery)       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    OUR PUMP.FUN PREDICTION MARKET                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Pump.fun Bonding Curve ─────────────────────► YES Price = 45%     │
│   (42.5 SOL in curve = 50% progress)                               │
│                                                                     │
│   User A bets on YES ──► Gets shares at 45% ──► No price change!   │
│   User B bets on NO ───► Gets shares at 55% ──► No price change!   │
│                                                                     │
│   Price only changes when someone trades the ACTUAL pump.fun token  │
└─────────────────────────────────────────────────────────────────────┘
```

## What This Means for Order Types

### Market Orders (Simple - MVP)
- User buys YES or NO at current price
- Slippage protection (max 2% from quoted price)
- Instant execution
- **This is sufficient for most users!**

### Limit Orders (Advanced)
Even though users can't affect prices, they might want:
- "Buy YES if price drops to 30%" (buy the dip)
- "Buy NO if price rises above 80%" (fade the pump)
- These are essentially **price alerts with auto-execution**

## Three Approaches to Limit Orders

### Approach 1: Off-Chain Limit Orders (Recommended for MVP)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      OFF-CHAIN LIMIT ORDER SYSTEM                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. User submits limit order ──► Stored in PostgreSQL               │
│     "Buy 100 YES at 30% or better"                                  │
│                                                                     │
│  2. Price Oracle monitors pump.fun ──► Every 10 seconds             │
│                                                                     │
│  3. When price hits 30%:                                            │
│     - Lock user's funds (USDC/SOL)                                  │
│     - Execute order at 30%                                          │
│     - Create position                                               │
│                                                                     │
│  Pros: Simple, cheap, fast                                          │
│  Cons: Requires trust in our backend                                │
└─────────────────────────────────────────────────────────────────────┘
```

### Approach 2: On-Chain Limit Orders with Crankers

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ON-CHAIN LIMIT ORDER SYSTEM                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. User submits limit order ──► Creates on-chain account           │
│     - Locks funds in escrow                                         │
│     - Specifies trigger price                                       │
│                                                                     │
│  2. Cranker bots monitor prices                                     │
│     - Anyone can run a cranker                                      │
│     - Incentivized with small fee                                   │
│                                                                     │
│  3. When price hits trigger:                                        │
│     - Cranker calls execute_limit_order                             │
│     - Contract verifies price from bonding curve                    │
│     - Executes trade, creates position                              │
│                                                                     │
│  Pros: Trustless, decentralized                                     │
│  Cons: More complex, gas costs for order creation                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Approach 3: Hybrid (Best of Both)

```
Phase 1: Off-chain limit orders (fast to ship)
Phase 2: On-chain migration for users who want trustlessness
```

## Bid/Ask Spread: We Don't Have One!

Traditional markets have spreads because:
- Market makers quote bid/ask
- Spread = their profit margin
- Tighter spread = more competitive

**Our market has NO spread** because:
- There's no order book
- Price is externally determined
- Users trade against the protocol, not each other

```
Traditional:  BID $0.48 ──── SPREAD $0.04 ──── ASK $0.52

Ours:         YES Price = 50% (from bonding curve)
              NO Price  = 50% (always 1 - YES)
              
              Buy YES at $0.50
              Buy NO at $0.50
              No spread!
```

## The "Spread" We DO Have: Protocol Fee

Instead of a bid/ask spread, we can charge a small fee:

```typescript
// User wants to buy $100 of YES at 50%
const amount = 100_000_000n; // $100 in micro-USDC
const price = 5000n; // 50% in BPS
const protocolFeeBps = 50n; // 0.5% fee

// Shares before fee
const grossShares = (amount * 10000n) / price; // 200 shares

// Protocol takes 0.5%
const fee = (amount * protocolFeeBps) / 10000n; // $0.50
const netAmount = amount - fee; // $99.50

// Final shares
const shares = (netAmount * 10000n) / price; // 199 shares
```

## Order Types We Should Support

### MVP (Phase 1)
1. **Market Buy YES** - Buy YES at current price
2. **Market Buy NO** - Buy NO at current price
3. **Claim Winnings** - Settle position after market ends

### Phase 2
4. **Limit Buy YES** - Buy YES if price drops to X
5. **Limit Buy NO** - Buy NO if price rises to X
6. **Stop Loss** - Sell position if price moves against you

### Phase 3 (Maybe)
7. **Sell Position** - Secondary market for positions
   - This WOULD require an order book
   - Users selling to other users
   - More complex, maybe not needed

## Database Schema for Limit Orders

```sql
CREATE TABLE limit_orders (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  market_mint TEXT NOT NULL REFERENCES tokens(mint),
  
  -- Order details
  side TEXT NOT NULL,           -- 'yes' or 'no'
  order_type TEXT NOT NULL,     -- 'limit_buy', 'stop_loss'
  amount_micro BIGINT NOT NULL, -- USDC amount to spend
  
  -- Trigger conditions
  trigger_price_bps INT NOT NULL,    -- Price to trigger at
  trigger_direction TEXT NOT NULL,   -- 'lte' (<=) or 'gte' (>=)
  
  -- Execution
  status TEXT NOT NULL DEFAULT 'pending', -- pending, executed, cancelled, expired
  executed_at TIMESTAMP,
  executed_price_bps INT,
  position_id UUID REFERENCES positions(id),
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,      -- Auto-cancel after this
  
  CONSTRAINT valid_trigger CHECK (
    (order_type = 'limit_buy' AND side = 'yes' AND trigger_direction = 'lte') OR
    (order_type = 'limit_buy' AND side = 'no' AND trigger_direction = 'gte') OR
    (order_type = 'stop_loss')
  )
);

CREATE INDEX idx_limit_orders_pending ON limit_orders(market_mint, status) 
  WHERE status = 'pending';
```

## Limit Order Execution Logic

```typescript
interface LimitOrder {
  id: string;
  marketMint: string;
  side: 'yes' | 'no';
  amountMicro: bigint;
  triggerPriceBps: number;
  triggerDirection: 'lte' | 'gte';
  status: 'pending' | 'executed' | 'cancelled';
}

async function checkAndExecuteLimitOrders(): Promise<void> {
  // Get all pending orders
  const pendingOrders = db.prepare(`
    SELECT lo.*, t.progress_bps as current_price_bps
    FROM limit_orders lo
    JOIN tokens t ON lo.market_mint = t.mint
    WHERE lo.status = 'pending'
      AND lo.expires_at > datetime('now')
      AND t.status = 'active'
  `).all() as (LimitOrder & { current_price_bps: number })[];
  
  for (const order of pendingOrders) {
    const shouldExecute = 
      (order.triggerDirection === 'lte' && order.current_price_bps <= order.triggerPriceBps) ||
      (order.triggerDirection === 'gte' && order.current_price_bps >= order.triggerPriceBps);
    
    if (shouldExecute) {
      await executeLimitOrder(order);
    }
  }
}

async function executeLimitOrder(order: LimitOrder): Promise<void> {
  // 1. Verify user still has funds locked
  // 2. Get current exact price from chain
  // 3. Execute at the BETTER of trigger price or current price
  // 4. Create position
  // 5. Update order status
  // 6. Emit event for websocket
}
```

## Why This Works Without an Order Book

The key insight is that our "counterparty" is the protocol itself:

```
Traditional Market:
  Buyer ←──matches──► Seller
  (need order book to find matches)

Our Market:
  Buyer ──► Protocol ──► Issues Shares
  (protocol is always the counterparty)
  
  At settlement:
  Winner ──► Protocol ──► Pays out from pool
  (pool funded by losers)
```

This is called a **Parimutuel-like** system with external price feed.

## Summary: What We're Building

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SYSTEM OVERVIEW                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Price Source: Pump.fun bonding curve (external, on-chain)          │
│  Market Type:  Binary options with parimutuel settlement            │
│  Order Types:  Market orders (MVP), Limit orders (Phase 2)          │
│  Spread:       None! (just protocol fee)                            │
│  Settlement:   Trustless (reads graduation status from chain)       │
│                                                                     │
│  Key Advantage:                                                     │
│  - No market makers needed                                          │
│  - No liquidity bootstrapping                                       │
│  - Price discovery happens on pump.fun                              │
│  - We just provide the betting layer                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Recommended Implementation Order

1. **Week 1**: Market orders only (buy YES/NO at current price)
2. **Week 2**: Basic limit orders (off-chain, checked every 10 seconds)
3. **Week 3**: WebSocket for real-time price updates
4. **Week 4**: On-chain limit orders (optional, for trustlessness)

