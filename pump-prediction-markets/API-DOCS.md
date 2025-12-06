# Pump.fun Prediction Markets API

## Base URL
```
Production: https://your-railway-app.railway.app
Development: http://localhost:3001
WebSocket: ws://localhost:3001/ws
```

## Overview

Binary prediction markets for pump.fun token graduation. Users bet on whether tokens will successfully "graduate" from the bonding curve (reach ~85 SOL threshold).

**Key Concept:** YES/NO prices are derived from the pump.fun bonding curve progress:
- 45% progress → YES = $0.45, NO = $0.55
- If token graduates → YES wins ($1), NO loses ($0)
- If token fails/expires → NO wins ($1), YES loses ($0)

---

## Public Endpoints

### GET /api/markets

List active prediction markets. **Response matches Quantish market card format.**

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | number | 50 | Max markets to return (max 200) |
| sort | string | "progress" | Sort by: progress, volume, created |

**Response:**
```json
{
  "success": true,
  "markets": [
    {
      "id": "pump_HeLp6NuQ",
      "platform": "pumpfun",
      "question": "Will $PEPE graduate from bonding curve?",
      "description": "Token: PEPE\nProgress: 45.2%\nSOL in curve: 38.4",
      "outcomes": [
        { "name": "Yes", "probability": 0.452, "price": 0.452 },
        { "name": "No", "probability": 0.548, "price": 0.548 }
      ],
      "volume": 15000,
      "liquidity": 76.8,
      "endDate": "2024-12-12T00:00:00Z",
      "category": "Crypto",
      "subcategory": "Pump.fun",
      "imageUrl": "https://pump.fun/token-image.png",
      "url": "https://pump.fun/HeLp...",
      
      // Pump.fun specific
      "tokenMint": "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n455pumP",
      "tokenSymbol": "PEPE",
      "tokenName": "Pepe Token",
      "bondingCurve": "BC...",
      "progressPercent": 45.2,
      "currentSol": 38.42,
      "graduationThreshold": 85,
      "createdAt": "2024-12-05T00:00:00Z",
      "creator": "Creator...",
      "twitter": "@pepetoken",
      "telegram": "t.me/pepe",
      "website": "https://pepe.fun"
    }
  ],
  "count": 50,
  "timestamp": 1701792000000
}
```

---

### GET /api/markets/:mint

Get single market details by token mint address.

**Response:** Same as market object above, wrapped in `{ success: true, market: {...} }`

---

### GET /api/markets/:mint/price

Fast endpoint for price updates (polling).

**Response:**
```json
{
  "success": true,
  "mint": "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n455pumP",
  "yesPrice": 0.452,
  "noPrice": 0.548,
  "progressPercent": 45.2,
  "currentSolLamports": "38420000000",
  "lastUpdated": 1701792000000
}
```

---

## Authenticated Endpoints

**Authentication:** Include `x-user-id` header with wallet address or user ID.

```javascript
const headers = {
  'Content-Type': 'application/json',
  'x-user-id': 'user-wallet-address-or-id'
};
```

---

### POST /api/orders/market

Place a market order (buy YES or NO at current price).

**Request:**
```json
{
  "marketMint": "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n455pumP",
  "side": "yes",
  "amount": 10.00,
  "maxSlippagePercent": 2
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| marketMint | string | Yes | Token mint address |
| side | string | Yes | "yes" or "no" |
| amount | number | Yes | USD amount to bet |
| maxSlippagePercent | number | No | Max slippage (default 2%) |

**Response:**
```json
{
  "success": true,
  "positionId": "uuid-here",
  "shares": "22123893",
  "effectivePrice": 0.452
}
```

---

### POST /api/orders/limit

Place a limit order (executes when price hits trigger).

**Request:**
```json
{
  "marketMint": "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n455pumP",
  "side": "yes",
  "amount": 100.00,
  "triggerPrice": 0.30,
  "expiresInHours": 24
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| marketMint | string | Yes | Token mint address |
| side | string | Yes | "yes" (trigger when ≤) or "no" (trigger when ≥) |
| amount | number | Yes | USD amount to bet |
| triggerPrice | number | Yes | Price to trigger execution (0.01 - 0.99) |
| expiresInHours | number | No | Hours until order expires (default 24) |

**Response:**
```json
{
  "success": true,
  "orderId": "uuid-here"
}
```

---

### DELETE /api/orders/limit/:orderId

Cancel a pending limit order.

**Response:**
```json
{
  "success": true,
  "orderId": "uuid-here"
}
```

---

### GET /api/users/:userId/positions

Get user's positions.

**Response:**
```json
{
  "success": true,
  "positions": [
    {
      "id": "uuid",
      "marketMint": "HeLp...",
      "side": "yes",
      "shares": "22123893",
      "sharesDisplay": "22.12",
      "costBasis": "10000000",
      "costBasisDisplay": "10.00",
      "entryPrice": 0.452,
      "isSettled": false,
      "payout": null,
      "createdAt": "2024-12-05T00:00:00Z"
    }
  ]
}
```

---

### GET /api/users/:userId/orders

Get user's pending limit orders.

---

## WebSocket API

Connect to `ws://localhost:3001/ws` for real-time updates.

**Events:**

### prices_updated
Broadcast every 30 seconds with latest prices.
```json
{
  "event": "prices_updated",
  "data": [
    {
      "mint": "HeLp...",
      "progressBps": 4520,
      "yesPrice": 0.452,
      "noPrice": 0.548
    }
  ],
  "timestamp": 1701792000000
}
```

### market_settled
When a market settles (graduation or expiry).
```json
{
  "event": "market_settled",
  "data": {
    "mint": "HeLp...",
    "outcome": "yes"
  },
  "timestamp": 1701792000000
}
```

### position_created
When a position is created.
```json
{
  "event": "position_created",
  "data": {
    "userId": "user-123",
    "marketMint": "HeLp...",
    "side": "yes",
    "shares": "22123893",
    "effectivePrice": 0.452
  },
  "timestamp": 1701792000000
}
```

---

## Integration Example (React)

```typescript
// hooks/usePumpMarkets.ts
import { useQuery } from '@tanstack/react-query';

const API_BASE = process.env.NEXT_PUBLIC_PUMP_API_URL;

export interface PumpMarket {
  id: string;
  platform: 'pumpfun';
  question: string;
  description: string;
  outcomes: [
    { name: 'Yes'; probability: number; price: number },
    { name: 'No'; probability: number; price: number }
  ];
  volume: number;
  liquidity: number;
  endDate: string;
  category: string;
  imageUrl: string;
  url: string;
  tokenMint: string;
  tokenSymbol: string;
  progressPercent: number;
  currentSol: number;
}

export function usePumpMarkets(limit = 50) {
  return useQuery({
    queryKey: ['pump-markets', limit],
    queryFn: async (): Promise<PumpMarket[]> => {
      const res = await fetch(`${API_BASE}/api/markets?limit=${limit}`);
      const data = await res.json();
      return data.markets;
    },
    refetchInterval: 30000, // Refresh every 30s
  });
}

// Usage in component
function PumpMarketsPage() {
  const { data: markets, isLoading } = usePumpMarkets(50);
  
  if (isLoading) return <Loading />;
  
  return (
    <div className="grid grid-cols-3 gap-4">
      {markets?.map(market => (
        <MarketCard 
          key={market.id}
          market={market}
          // Your existing MarketCard component should work!
        />
      ))}
    </div>
  );
}
```

---

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 400 | Missing required fields | Request body validation failed |
| 401 | Authentication required | x-user-id header missing |
| 403 | Forbidden | User trying to access another user's data |
| 404 | Market not found | Invalid token mint |
| 500 | Internal server error | Server-side error |

---

## Rate Limits

- Public endpoints: 100 requests/minute
- Authenticated endpoints: 30 requests/minute
- WebSocket: 1 connection per user

---

## Deployment

### Railway (Recommended)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

**Environment Variables:**
```
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
PORT=3001
DATABASE_PATH=./data/markets.db
```

---

## Next Steps

1. **Phase 1 (Current):** Centralized backend with SQLite
2. **Phase 2:** PostgreSQL on Railway for production
3. **Phase 3:** Solana smart contract for trustless settlement
4. **Phase 4:** Full SDK for third-party integrations


## Base URL
```
Production: https://your-railway-app.railway.app
Development: http://localhost:3001
WebSocket: ws://localhost:3001/ws
```

## Overview

Binary prediction markets for pump.fun token graduation. Users bet on whether tokens will successfully "graduate" from the bonding curve (reach ~85 SOL threshold).

**Key Concept:** YES/NO prices are derived from the pump.fun bonding curve progress:
- 45% progress → YES = $0.45, NO = $0.55
- If token graduates → YES wins ($1), NO loses ($0)
- If token fails/expires → NO wins ($1), YES loses ($0)

---

## Public Endpoints

### GET /api/markets

List active prediction markets. **Response matches Quantish market card format.**

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | number | 50 | Max markets to return (max 200) |
| sort | string | "progress" | Sort by: progress, volume, created |

**Response:**
```json
{
  "success": true,
  "markets": [
    {
      "id": "pump_HeLp6NuQ",
      "platform": "pumpfun",
      "question": "Will $PEPE graduate from bonding curve?",
      "description": "Token: PEPE\nProgress: 45.2%\nSOL in curve: 38.4",
      "outcomes": [
        { "name": "Yes", "probability": 0.452, "price": 0.452 },
        { "name": "No", "probability": 0.548, "price": 0.548 }
      ],
      "volume": 15000,
      "liquidity": 76.8,
      "endDate": "2024-12-12T00:00:00Z",
      "category": "Crypto",
      "subcategory": "Pump.fun",
      "imageUrl": "https://pump.fun/token-image.png",
      "url": "https://pump.fun/HeLp...",
      
      // Pump.fun specific
      "tokenMint": "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n455pumP",
      "tokenSymbol": "PEPE",
      "tokenName": "Pepe Token",
      "bondingCurve": "BC...",
      "progressPercent": 45.2,
      "currentSol": 38.42,
      "graduationThreshold": 85,
      "createdAt": "2024-12-05T00:00:00Z",
      "creator": "Creator...",
      "twitter": "@pepetoken",
      "telegram": "t.me/pepe",
      "website": "https://pepe.fun"
    }
  ],
  "count": 50,
  "timestamp": 1701792000000
}
```

---

### GET /api/markets/:mint

Get single market details by token mint address.

**Response:** Same as market object above, wrapped in `{ success: true, market: {...} }`

---

### GET /api/markets/:mint/price

Fast endpoint for price updates (polling).

**Response:**
```json
{
  "success": true,
  "mint": "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n455pumP",
  "yesPrice": 0.452,
  "noPrice": 0.548,
  "progressPercent": 45.2,
  "currentSolLamports": "38420000000",
  "lastUpdated": 1701792000000
}
```

---

## Authenticated Endpoints

**Authentication:** Include `x-user-id` header with wallet address or user ID.

```javascript
const headers = {
  'Content-Type': 'application/json',
  'x-user-id': 'user-wallet-address-or-id'
};
```

---

### POST /api/orders/market

Place a market order (buy YES or NO at current price).

**Request:**
```json
{
  "marketMint": "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n455pumP",
  "side": "yes",
  "amount": 10.00,
  "maxSlippagePercent": 2
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| marketMint | string | Yes | Token mint address |
| side | string | Yes | "yes" or "no" |
| amount | number | Yes | USD amount to bet |
| maxSlippagePercent | number | No | Max slippage (default 2%) |

**Response:**
```json
{
  "success": true,
  "positionId": "uuid-here",
  "shares": "22123893",
  "effectivePrice": 0.452
}
```

---

### POST /api/orders/limit

Place a limit order (executes when price hits trigger).

**Request:**
```json
{
  "marketMint": "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n455pumP",
  "side": "yes",
  "amount": 100.00,
  "triggerPrice": 0.30,
  "expiresInHours": 24
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| marketMint | string | Yes | Token mint address |
| side | string | Yes | "yes" (trigger when ≤) or "no" (trigger when ≥) |
| amount | number | Yes | USD amount to bet |
| triggerPrice | number | Yes | Price to trigger execution (0.01 - 0.99) |
| expiresInHours | number | No | Hours until order expires (default 24) |

**Response:**
```json
{
  "success": true,
  "orderId": "uuid-here"
}
```

---

### DELETE /api/orders/limit/:orderId

Cancel a pending limit order.

**Response:**
```json
{
  "success": true,
  "orderId": "uuid-here"
}
```

---

### GET /api/users/:userId/positions

Get user's positions.

**Response:**
```json
{
  "success": true,
  "positions": [
    {
      "id": "uuid",
      "marketMint": "HeLp...",
      "side": "yes",
      "shares": "22123893",
      "sharesDisplay": "22.12",
      "costBasis": "10000000",
      "costBasisDisplay": "10.00",
      "entryPrice": 0.452,
      "isSettled": false,
      "payout": null,
      "createdAt": "2024-12-05T00:00:00Z"
    }
  ]
}
```

---

### GET /api/users/:userId/orders

Get user's pending limit orders.

---

## WebSocket API

Connect to `ws://localhost:3001/ws` for real-time updates.

**Events:**

### prices_updated
Broadcast every 30 seconds with latest prices.
```json
{
  "event": "prices_updated",
  "data": [
    {
      "mint": "HeLp...",
      "progressBps": 4520,
      "yesPrice": 0.452,
      "noPrice": 0.548
    }
  ],
  "timestamp": 1701792000000
}
```

### market_settled
When a market settles (graduation or expiry).
```json
{
  "event": "market_settled",
  "data": {
    "mint": "HeLp...",
    "outcome": "yes"
  },
  "timestamp": 1701792000000
}
```

### position_created
When a position is created.
```json
{
  "event": "position_created",
  "data": {
    "userId": "user-123",
    "marketMint": "HeLp...",
    "side": "yes",
    "shares": "22123893",
    "effectivePrice": 0.452
  },
  "timestamp": 1701792000000
}
```

---

## Integration Example (React)

```typescript
// hooks/usePumpMarkets.ts
import { useQuery } from '@tanstack/react-query';

const API_BASE = process.env.NEXT_PUBLIC_PUMP_API_URL;

export interface PumpMarket {
  id: string;
  platform: 'pumpfun';
  question: string;
  description: string;
  outcomes: [
    { name: 'Yes'; probability: number; price: number },
    { name: 'No'; probability: number; price: number }
  ];
  volume: number;
  liquidity: number;
  endDate: string;
  category: string;
  imageUrl: string;
  url: string;
  tokenMint: string;
  tokenSymbol: string;
  progressPercent: number;
  currentSol: number;
}

export function usePumpMarkets(limit = 50) {
  return useQuery({
    queryKey: ['pump-markets', limit],
    queryFn: async (): Promise<PumpMarket[]> => {
      const res = await fetch(`${API_BASE}/api/markets?limit=${limit}`);
      const data = await res.json();
      return data.markets;
    },
    refetchInterval: 30000, // Refresh every 30s
  });
}

// Usage in component
function PumpMarketsPage() {
  const { data: markets, isLoading } = usePumpMarkets(50);
  
  if (isLoading) return <Loading />;
  
  return (
    <div className="grid grid-cols-3 gap-4">
      {markets?.map(market => (
        <MarketCard 
          key={market.id}
          market={market}
          // Your existing MarketCard component should work!
        />
      ))}
    </div>
  );
}
```

---

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 400 | Missing required fields | Request body validation failed |
| 401 | Authentication required | x-user-id header missing |
| 403 | Forbidden | User trying to access another user's data |
| 404 | Market not found | Invalid token mint |
| 500 | Internal server error | Server-side error |

---

## Rate Limits

- Public endpoints: 100 requests/minute
- Authenticated endpoints: 30 requests/minute
- WebSocket: 1 connection per user

---

## Deployment

### Railway (Recommended)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

**Environment Variables:**
```
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
PORT=3001
DATABASE_PATH=./data/markets.db
```

---

## Next Steps

1. **Phase 1 (Current):** Centralized backend with SQLite
2. **Phase 2:** PostgreSQL on Railway for production
3. **Phase 3:** Solana smart contract for trustless settlement
4. **Phase 4:** Full SDK for third-party integrations

