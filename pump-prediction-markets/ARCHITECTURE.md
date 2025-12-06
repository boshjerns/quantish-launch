# Pump.fun Prediction Markets - System Architecture

## Overview

Binary prediction markets on pump.fun token graduation. Users bet on whether a token will successfully "graduate" from the bonding curve (reach ~85 SOL threshold).

## Core Concept

```
YES = "This token will graduate from bonding curve"
NO  = "This token will NOT graduate"

If graduates:  YES pays $1, NO pays $0
If fails:      YES pays $0, NO pays $1
```

## Price Discovery

**The bonding curve progress directly maps to YES probability:**

```
Progress = real_sol_reserves / graduation_threshold (85 SOL)
YES Price = Progress (capped at 0.99)
NO Price  = 1 - YES Price
```

Example:
- Token has 42.5 SOL in curve → 50% progress → YES = $0.50, NO = $0.50
- Token has 76.5 SOL in curve → 90% progress → YES = $0.90, NO = $0.10

## Market Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                     MARKET STATES                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ACTIVE ────────────────────────────┬──────────► GRADUATED       │
│    │                                │               │            │
│    │ Token on bonding curve         │ Graduates     │ YES wins   │
│    │ Accepting bets                 │               │ NO loses   │
│    │                                │               ▼            │
│    │                                │           SETTLED          │
│    │                                │                            │
│    └───────────────────────────────────────────► EXPIRED         │
│                                     │               │            │
│                              No graduation          │ YES loses  │
│                              within timeout         │ NO wins    │
│                                                     ▼            │
│                                                 SETTLED          │
└─────────────────────────────────────────────────────────────────┘
```

## Critical Requirements

### 1. Perfect Precision Math
- Use integer math with fixed-point representation (6 decimals)
- All calculations in USDC base units (1 USDC = 1,000,000)
- No floating point in financial calculations
- Every operation must be auditable

### 2. Market Persistence
- Markets with ANY active positions NEVER disappear
- Only markets with zero positions can be pruned
- Graduated/Expired markets kept for 30 days post-settlement

### 3. Non-Gameable Design
- Prices derived ONLY from on-chain bonding curve data
- No user can manipulate odds (they reflect reality)
- Settlement is deterministic from blockchain state
- Timeout-based expiry prevents indefinite markets

## Architecture Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│                    (Quantish.live)                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     REST API (Railway)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Markets    │  │  Positions  │  │  Settlement │              │
│  │  Endpoint   │  │  Endpoint   │  │  Endpoint   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   PostgreSQL    │  │  Price Oracle   │  │  Smart Contract │
│   (Railway)     │  │  (Pump.fun)     │  │  (Base/Solana)  │
│                 │  │                 │  │                 │
│  - Markets      │  │  - Bonding      │  │  - Escrow       │
│  - Positions    │  │    curve data   │  │  - Settlement   │
│  - Settlements  │  │  - Graduation   │  │  - Trustless    │
│  - Audit logs   │  │    events       │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Database Schema

### Markets Table
```sql
markets (
  id              UUID PRIMARY KEY,
  mint            TEXT UNIQUE NOT NULL,      -- pump.fun token mint
  bonding_curve   TEXT NOT NULL,             -- bonding curve PDA
  name            TEXT,
  symbol          TEXT,
  image_uri       TEXT,
  
  -- Current state (updated by oracle)
  current_sol     BIGINT NOT NULL DEFAULT 0, -- lamports in curve
  progress_bps    INT NOT NULL DEFAULT 0,    -- 0-10000 (basis points)
  
  -- Market state
  status          TEXT NOT NULL DEFAULT 'active', -- active, graduated, expired, settled
  created_at      TIMESTAMP NOT NULL,
  expires_at      TIMESTAMP NOT NULL,        -- 7 days from creation
  settled_at      TIMESTAMP,
  settlement_outcome TEXT,                   -- 'yes' or 'no'
  
  -- Pool totals (integer math, 6 decimals)
  yes_pool        BIGINT NOT NULL DEFAULT 0, -- total USDC in YES
  no_pool         BIGINT NOT NULL DEFAULT 0, -- total USDC in NO
  
  updated_at      TIMESTAMP NOT NULL
)
```

### Positions Table
```sql
positions (
  id              UUID PRIMARY KEY,
  market_id       UUID REFERENCES markets(id),
  user_id         TEXT NOT NULL,             -- wallet address or user ID
  
  side            TEXT NOT NULL,             -- 'yes' or 'no'
  amount          BIGINT NOT NULL,           -- USDC amount (6 decimals)
  shares          BIGINT NOT NULL,           -- shares received
  entry_price_bps INT NOT NULL,              -- price at entry in BPS
  
  -- Settlement
  is_settled      BOOLEAN NOT NULL DEFAULT FALSE,
  payout          BIGINT,                    -- settled payout amount
  
  created_at      TIMESTAMP NOT NULL,
  settled_at      TIMESTAMP
)
```

### Audit Log Table
```sql
audit_log (
  id              UUID PRIMARY KEY,
  market_id       UUID,
  position_id     UUID,
  action          TEXT NOT NULL,             -- 'bet', 'settle', 'price_update', etc
  details         JSONB NOT NULL,
  created_at      TIMESTAMP NOT NULL
)
```

## Mathematical Model

### Share Calculation (CPMM - Constant Product)

When user bets $X on YES at progress P:

```
YES_Price = P (from bonding curve)
Shares = X / YES_Price

Example: Bet $100 on YES at 40% progress
Shares = $100 / $0.40 = 250 shares

If token graduates: Payout = 250 shares × $1 = $250
If token fails:     Payout = 250 shares × $0 = $0
```

### Integer Math Implementation

All amounts in micro-USDC (1 USDC = 1,000,000 units):

```typescript
const PRECISION = 1_000_000n; // 6 decimal places
const BPS_PRECISION = 10_000n; // basis points

function calculateShares(amountMicro: bigint, priceBps: bigint): bigint {
  // shares = amount / price
  // shares = amount * BPS_PRECISION / priceBps
  return (amountMicro * BPS_PRECISION) / priceBps;
}

function calculatePayout(shares: bigint, isWinner: boolean): bigint {
  // Winner gets $1 per share, loser gets $0
  return isWinner ? shares : 0n;
}
```

## Edge Cases & Protections

### 1. Race Condition: Price Change During Bet
- Lock price at time of bet submission
- Maximum 2% slippage allowed
- Reject if price moved more than tolerance

### 2. Market Expiry with Active Positions
- Markets CANNOT be deleted if positions exist
- Expired markets auto-settle as NO wins
- 7-day default expiry (configurable)

### 3. Token Graduates Between Price Updates
- Oracle checks graduation status every 10 seconds
- Settlement triggered immediately on graduation detection
- All YES positions win, all NO positions lose

### 4. Extreme Prices (< 1% or > 99%)
- Floor: YES price minimum 1% ($0.01)
- Ceiling: YES price maximum 99% ($0.99)
- Prevents infinite leverage attacks

### 5. Dust Positions
- Minimum bet: $1 USDC (1,000,000 micro-USDC)
- Prevents griefing with micro-positions

### 6. Rounding
- Always round DOWN for user benefit calculations
- Always round UP for protocol fees
- Document rounding direction for each operation

## API Endpoints

### Public Endpoints
```
GET  /api/markets                    - List active markets
GET  /api/markets/:mint              - Get market details
GET  /api/markets/:mint/positions    - Get all positions for market
GET  /api/markets/:mint/history      - Price history
```

### Authenticated Endpoints
```
POST /api/positions                  - Create new position (bet)
GET  /api/users/:id/positions        - Get user's positions
POST /api/positions/:id/settle       - Claim settlement
```

### Admin/Oracle Endpoints
```
POST /api/oracle/update              - Update market prices (authenticated)
POST /api/oracle/settle/:mint        - Settle graduated market
```

## Security Considerations

### 1. Oracle Security
- Price updates require signed authentication
- Rate limiting on updates (max 1 per 5 seconds per market)
- All updates logged with before/after values

### 2. API Security
- JWT authentication for user actions
- Rate limiting per user
- Input validation on all endpoints

### 3. Smart Contract (Phase 2)
- Funds held in escrow until settlement
- Settlement requires merkle proof of graduation
- Emergency pause functionality
- Timelock on admin functions

## Deployment Architecture

```
Railway Project
├── API Service (Node.js)
│   ├── Express REST API
│   ├── WebSocket for real-time updates
│   └── Cron jobs for oracle
│
├── PostgreSQL Database
│   ├── Primary instance
│   └── Connection pooling
│
└── Redis (optional, for caching)
    └── Price cache
```

## Integration with Quantish

### API Response Format (matching existing structure)
```json
{
  "id": "pump_HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n455pumP",
  "platform": "pumpfun",
  "question": "Will $PEPE graduate from bonding curve?",
  "description": "Token: PEPE (HeLp...umP)\nProgress: 45.2%\nSOL in curve: 38.4",
  "outcomes": [
    {"name": "Yes", "probability": 0.452, "price": 0.452},
    {"name": "No", "probability": 0.548, "price": 0.548}
  ],
  "volume": 15000,
  "liquidity": 25000,
  "endDate": "2024-12-12T00:00:00Z",
  "category": "Crypto",
  "imageUrl": "https://pump.fun/token-image.png",
  "url": "https://pump.fun/HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n455pumP"
}
```

## Phase 1 (Current): Centralized MVP
- Backend API on Railway
- PostgreSQL for state
- Manual settlement (admin trigger)
- Frontend integration

## Phase 2: Smart Contract
- Deploy to Base (EVM) for easier tooling
- Escrow contract for trustless deposits
- Oracle integration for price feeds
- Automated settlement

## Phase 3: Full Decentralization
- On-chain order book (optional)
- Multi-sig for admin functions
- Open source SDK
- Third-party oracle integration


## Overview

Binary prediction markets on pump.fun token graduation. Users bet on whether a token will successfully "graduate" from the bonding curve (reach ~85 SOL threshold).

## Core Concept

```
YES = "This token will graduate from bonding curve"
NO  = "This token will NOT graduate"

If graduates:  YES pays $1, NO pays $0
If fails:      YES pays $0, NO pays $1
```

## Price Discovery

**The bonding curve progress directly maps to YES probability:**

```
Progress = real_sol_reserves / graduation_threshold (85 SOL)
YES Price = Progress (capped at 0.99)
NO Price  = 1 - YES Price
```

Example:
- Token has 42.5 SOL in curve → 50% progress → YES = $0.50, NO = $0.50
- Token has 76.5 SOL in curve → 90% progress → YES = $0.90, NO = $0.10

## Market Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                     MARKET STATES                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ACTIVE ────────────────────────────┬──────────► GRADUATED       │
│    │                                │               │            │
│    │ Token on bonding curve         │ Graduates     │ YES wins   │
│    │ Accepting bets                 │               │ NO loses   │
│    │                                │               ▼            │
│    │                                │           SETTLED          │
│    │                                │                            │
│    └───────────────────────────────────────────► EXPIRED         │
│                                     │               │            │
│                              No graduation          │ YES loses  │
│                              within timeout         │ NO wins    │
│                                                     ▼            │
│                                                 SETTLED          │
└─────────────────────────────────────────────────────────────────┘
```

## Critical Requirements

### 1. Perfect Precision Math
- Use integer math with fixed-point representation (6 decimals)
- All calculations in USDC base units (1 USDC = 1,000,000)
- No floating point in financial calculations
- Every operation must be auditable

### 2. Market Persistence
- Markets with ANY active positions NEVER disappear
- Only markets with zero positions can be pruned
- Graduated/Expired markets kept for 30 days post-settlement

### 3. Non-Gameable Design
- Prices derived ONLY from on-chain bonding curve data
- No user can manipulate odds (they reflect reality)
- Settlement is deterministic from blockchain state
- Timeout-based expiry prevents indefinite markets

## Architecture Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│                    (Quantish.live)                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     REST API (Railway)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Markets    │  │  Positions  │  │  Settlement │              │
│  │  Endpoint   │  │  Endpoint   │  │  Endpoint   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   PostgreSQL    │  │  Price Oracle   │  │  Smart Contract │
│   (Railway)     │  │  (Pump.fun)     │  │  (Base/Solana)  │
│                 │  │                 │  │                 │
│  - Markets      │  │  - Bonding      │  │  - Escrow       │
│  - Positions    │  │    curve data   │  │  - Settlement   │
│  - Settlements  │  │  - Graduation   │  │  - Trustless    │
│  - Audit logs   │  │    events       │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Database Schema

### Markets Table
```sql
markets (
  id              UUID PRIMARY KEY,
  mint            TEXT UNIQUE NOT NULL,      -- pump.fun token mint
  bonding_curve   TEXT NOT NULL,             -- bonding curve PDA
  name            TEXT,
  symbol          TEXT,
  image_uri       TEXT,
  
  -- Current state (updated by oracle)
  current_sol     BIGINT NOT NULL DEFAULT 0, -- lamports in curve
  progress_bps    INT NOT NULL DEFAULT 0,    -- 0-10000 (basis points)
  
  -- Market state
  status          TEXT NOT NULL DEFAULT 'active', -- active, graduated, expired, settled
  created_at      TIMESTAMP NOT NULL,
  expires_at      TIMESTAMP NOT NULL,        -- 7 days from creation
  settled_at      TIMESTAMP,
  settlement_outcome TEXT,                   -- 'yes' or 'no'
  
  -- Pool totals (integer math, 6 decimals)
  yes_pool        BIGINT NOT NULL DEFAULT 0, -- total USDC in YES
  no_pool         BIGINT NOT NULL DEFAULT 0, -- total USDC in NO
  
  updated_at      TIMESTAMP NOT NULL
)
```

### Positions Table
```sql
positions (
  id              UUID PRIMARY KEY,
  market_id       UUID REFERENCES markets(id),
  user_id         TEXT NOT NULL,             -- wallet address or user ID
  
  side            TEXT NOT NULL,             -- 'yes' or 'no'
  amount          BIGINT NOT NULL,           -- USDC amount (6 decimals)
  shares          BIGINT NOT NULL,           -- shares received
  entry_price_bps INT NOT NULL,              -- price at entry in BPS
  
  -- Settlement
  is_settled      BOOLEAN NOT NULL DEFAULT FALSE,
  payout          BIGINT,                    -- settled payout amount
  
  created_at      TIMESTAMP NOT NULL,
  settled_at      TIMESTAMP
)
```

### Audit Log Table
```sql
audit_log (
  id              UUID PRIMARY KEY,
  market_id       UUID,
  position_id     UUID,
  action          TEXT NOT NULL,             -- 'bet', 'settle', 'price_update', etc
  details         JSONB NOT NULL,
  created_at      TIMESTAMP NOT NULL
)
```

## Mathematical Model

### Share Calculation (CPMM - Constant Product)

When user bets $X on YES at progress P:

```
YES_Price = P (from bonding curve)
Shares = X / YES_Price

Example: Bet $100 on YES at 40% progress
Shares = $100 / $0.40 = 250 shares

If token graduates: Payout = 250 shares × $1 = $250
If token fails:     Payout = 250 shares × $0 = $0
```

### Integer Math Implementation

All amounts in micro-USDC (1 USDC = 1,000,000 units):

```typescript
const PRECISION = 1_000_000n; // 6 decimal places
const BPS_PRECISION = 10_000n; // basis points

function calculateShares(amountMicro: bigint, priceBps: bigint): bigint {
  // shares = amount / price
  // shares = amount * BPS_PRECISION / priceBps
  return (amountMicro * BPS_PRECISION) / priceBps;
}

function calculatePayout(shares: bigint, isWinner: boolean): bigint {
  // Winner gets $1 per share, loser gets $0
  return isWinner ? shares : 0n;
}
```

## Edge Cases & Protections

### 1. Race Condition: Price Change During Bet
- Lock price at time of bet submission
- Maximum 2% slippage allowed
- Reject if price moved more than tolerance

### 2. Market Expiry with Active Positions
- Markets CANNOT be deleted if positions exist
- Expired markets auto-settle as NO wins
- 7-day default expiry (configurable)

### 3. Token Graduates Between Price Updates
- Oracle checks graduation status every 10 seconds
- Settlement triggered immediately on graduation detection
- All YES positions win, all NO positions lose

### 4. Extreme Prices (< 1% or > 99%)
- Floor: YES price minimum 1% ($0.01)
- Ceiling: YES price maximum 99% ($0.99)
- Prevents infinite leverage attacks

### 5. Dust Positions
- Minimum bet: $1 USDC (1,000,000 micro-USDC)
- Prevents griefing with micro-positions

### 6. Rounding
- Always round DOWN for user benefit calculations
- Always round UP for protocol fees
- Document rounding direction for each operation

## API Endpoints

### Public Endpoints
```
GET  /api/markets                    - List active markets
GET  /api/markets/:mint              - Get market details
GET  /api/markets/:mint/positions    - Get all positions for market
GET  /api/markets/:mint/history      - Price history
```

### Authenticated Endpoints
```
POST /api/positions                  - Create new position (bet)
GET  /api/users/:id/positions        - Get user's positions
POST /api/positions/:id/settle       - Claim settlement
```

### Admin/Oracle Endpoints
```
POST /api/oracle/update              - Update market prices (authenticated)
POST /api/oracle/settle/:mint        - Settle graduated market
```

## Security Considerations

### 1. Oracle Security
- Price updates require signed authentication
- Rate limiting on updates (max 1 per 5 seconds per market)
- All updates logged with before/after values

### 2. API Security
- JWT authentication for user actions
- Rate limiting per user
- Input validation on all endpoints

### 3. Smart Contract (Phase 2)
- Funds held in escrow until settlement
- Settlement requires merkle proof of graduation
- Emergency pause functionality
- Timelock on admin functions

## Deployment Architecture

```
Railway Project
├── API Service (Node.js)
│   ├── Express REST API
│   ├── WebSocket for real-time updates
│   └── Cron jobs for oracle
│
├── PostgreSQL Database
│   ├── Primary instance
│   └── Connection pooling
│
└── Redis (optional, for caching)
    └── Price cache
```

## Integration with Quantish

### API Response Format (matching existing structure)
```json
{
  "id": "pump_HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n455pumP",
  "platform": "pumpfun",
  "question": "Will $PEPE graduate from bonding curve?",
  "description": "Token: PEPE (HeLp...umP)\nProgress: 45.2%\nSOL in curve: 38.4",
  "outcomes": [
    {"name": "Yes", "probability": 0.452, "price": 0.452},
    {"name": "No", "probability": 0.548, "price": 0.548}
  ],
  "volume": 15000,
  "liquidity": 25000,
  "endDate": "2024-12-12T00:00:00Z",
  "category": "Crypto",
  "imageUrl": "https://pump.fun/token-image.png",
  "url": "https://pump.fun/HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n455pumP"
}
```

## Phase 1 (Current): Centralized MVP
- Backend API on Railway
- PostgreSQL for state
- Manual settlement (admin trigger)
- Frontend integration

## Phase 2: Smart Contract
- Deploy to Base (EVM) for easier tooling
- Escrow contract for trustless deposits
- Oracle integration for price feeds
- Automated settlement

## Phase 3: Full Decentralization
- On-chain order book (optional)
- Multi-sig for admin functions
- Open source SDK
- Third-party oracle integration

