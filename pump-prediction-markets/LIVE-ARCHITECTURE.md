# Live Price Architecture

## How Prices Will Be Fetched

### Option 1: Pump.fun API Polling (Simple)
```
Every 10-30 seconds:
  1. Fetch /coins?limit=200 from pump.fun API
  2. Update database with new progress values
  3. Broadcast to all WebSocket clients
  
Pros: Simple, works with their existing API
Cons: 10-30 second delay, API rate limits
```

### Option 2: On-Chain Polling (More Reliable)
```
Every 5-10 seconds:
  1. Batch fetch bonding curve accounts from Solana RPC
  2. Parse real_sol_reserves from each
  3. Calculate progress percentages
  4. Broadcast to all clients
  
Pros: No API dependency, more reliable
Cons: RPC costs, slightly more complex
```

### Option 3: Solana WebSocket Subscription (Real-Time)
```
Subscribe to account changes:
  connection.onAccountChange(bondingCurveAddress, callback)
  
When bonding curve changes:
  1. Parse new reserves
  2. Calculate new price
  3. Broadcast immediately
  
Pros: TRUE real-time (sub-second)
Cons: Complex, need subscription per market
```

## Recommended Approach: Hybrid

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCTION SETUP                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │  Pump.fun    │     │   Solana     │     │   Helius     │     │
│  │    API       │     │    RPC       │     │  Webhooks    │     │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘     │
│         │                    │                    │              │
│         ▼                    ▼                    ▼              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              PRICE AGGREGATOR SERVICE                    │    │
│  │                                                          │    │
│  │  - Fetches from multiple sources                        │    │
│  │  - Validates data consistency                           │    │
│  │  - Caches for performance                               │    │
│  │  - Batches updates (max 1 broadcast per second)         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  WEBSOCKET SERVER                        │    │
│  │                                                          │    │
│  │  Single connection per client                           │    │
│  │  Broadcasts batched price updates                       │    │
│  │  Supports 1000s of concurrent clients                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                 │
│         ▼                  ▼                  ▼                 │
│    ┌─────────┐        ┌─────────┐        ┌─────────┐           │
│    │ Client  │        │ Client  │        │ Client  │           │
│    │   1     │        │   2     │        │  ...N   │           │
│    └─────────┘        └─────────┘        └─────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## NOT Needed: Per-Coin Sockets

❌ **Wrong approach:**
```javascript
// DON'T DO THIS - scales terribly
markets.forEach(market => {
  const ws = new WebSocket(`ws://server/market/${market.mint}`);
});
// 200 markets = 200 connections per client = disaster
```

✅ **Right approach:**
```javascript
// ONE socket, receives ALL price updates
const ws = new WebSocket('ws://server/ws');
ws.onmessage = (event) => {
  const { data } = JSON.parse(event.data);
  // data contains ALL market prices
  data.forEach(price => updateMarketCard(price));
};
```

## Scaling Considerations

### For 50-200 Markets
- Single WebSocket per client ✅
- Batch all prices in one message ✅
- Broadcast every 5-10 seconds ✅
- No special infrastructure needed

### For 1000+ Markets
- Paginate price broadcasts by category
- Let clients subscribe to specific markets
- Use Redis pub/sub for horizontal scaling
- Consider CDN-based WebSocket (Cloudflare, Ably)

### For 10,000+ Concurrent Users
- Load balancer for WebSocket servers
- Redis for state sharing between servers
- Consider managed services (Pusher, Ably, Socket.io Cloud)

## Bandwidth Calculation

```
Per broadcast:
  - 5 markets × ~100 bytes = 500 bytes
  - 50 markets × ~100 bytes = 5 KB
  - 200 markets × ~100 bytes = 20 KB

Per client per minute (10s interval):
  - 6 broadcasts × 20 KB = 120 KB/min

1000 clients:
  - 120 MB/min outbound
  - Very manageable for a single server
```

## Implementation Priority

1. **Phase 1 (Current)**: Polling + periodic broadcast ✅
2. **Phase 2**: On-chain batch fetching (no API dependency)
3. **Phase 3**: Helius webhooks for real-time graduation events
4. **Phase 4**: Full Solana account subscriptions (if needed)

## Code for On-Chain Batch Fetching

```typescript
async function fetchAllBondingCurves(mints: string[]): Promise<Map<string, number>> {
  const connection = new Connection(rpcUrl);
  
  // Derive all bonding curve PDAs
  const bondingCurves = mints.map(mint => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), new PublicKey(mint).toBuffer()],
      PUMP_PROGRAM_ID
    );
    return pda;
  });
  
  // Batch fetch all accounts (max 100 per request)
  const accounts = await connection.getMultipleAccountsInfo(bondingCurves);
  
  // Parse and return progress
  const prices = new Map();
  accounts.forEach((account, i) => {
    if (account) {
      const realSol = account.data.readBigUInt64LE(32);
      const progress = Number(realSol) / (85 * 1e9); // 85 SOL threshold
      prices.set(mints[i], Math.min(progress, 0.99));
    }
  });
  
  return prices;
}
```

## Helius Webhooks (For Graduation Events)

```typescript
// Register webhook for bonding curve "complete" changes
const webhook = await helius.createWebhook({
  webhookURL: 'https://your-api.railway.app/webhook/graduation',
  transactionTypes: ['PROGRAM_INVOKE'],
  accountAddresses: bondingCurveAddresses,
});

// Handle graduation event
app.post('/webhook/graduation', (req, res) => {
  const { mint, complete } = parsePumpFunEvent(req.body);
  if (complete) {
    settleMarket(mint, 'yes'); // Instant settlement!
    broadcast('market_graduated', { mint });
  }
});
```

## Summary

| Approach | Latency | Complexity | Cost |
|----------|---------|------------|------|
| API Polling | 10-30s | Low | Free |
| RPC Polling | 5-10s | Medium | ~$50/mo |
| Helius Webhooks | <1s | Medium | ~$20/mo |
| Full Subscriptions | <100ms | High | ~$100/mo |

**Recommendation for MVP**: Start with RPC polling (Option 2), add Helius webhooks for graduation events.


## How Prices Will Be Fetched

### Option 1: Pump.fun API Polling (Simple)
```
Every 10-30 seconds:
  1. Fetch /coins?limit=200 from pump.fun API
  2. Update database with new progress values
  3. Broadcast to all WebSocket clients
  
Pros: Simple, works with their existing API
Cons: 10-30 second delay, API rate limits
```

### Option 2: On-Chain Polling (More Reliable)
```
Every 5-10 seconds:
  1. Batch fetch bonding curve accounts from Solana RPC
  2. Parse real_sol_reserves from each
  3. Calculate progress percentages
  4. Broadcast to all clients
  
Pros: No API dependency, more reliable
Cons: RPC costs, slightly more complex
```

### Option 3: Solana WebSocket Subscription (Real-Time)
```
Subscribe to account changes:
  connection.onAccountChange(bondingCurveAddress, callback)
  
When bonding curve changes:
  1. Parse new reserves
  2. Calculate new price
  3. Broadcast immediately
  
Pros: TRUE real-time (sub-second)
Cons: Complex, need subscription per market
```

## Recommended Approach: Hybrid

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCTION SETUP                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │  Pump.fun    │     │   Solana     │     │   Helius     │     │
│  │    API       │     │    RPC       │     │  Webhooks    │     │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘     │
│         │                    │                    │              │
│         ▼                    ▼                    ▼              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              PRICE AGGREGATOR SERVICE                    │    │
│  │                                                          │    │
│  │  - Fetches from multiple sources                        │    │
│  │  - Validates data consistency                           │    │
│  │  - Caches for performance                               │    │
│  │  - Batches updates (max 1 broadcast per second)         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  WEBSOCKET SERVER                        │    │
│  │                                                          │    │
│  │  Single connection per client                           │    │
│  │  Broadcasts batched price updates                       │    │
│  │  Supports 1000s of concurrent clients                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                 │
│         ▼                  ▼                  ▼                 │
│    ┌─────────┐        ┌─────────┐        ┌─────────┐           │
│    │ Client  │        │ Client  │        │ Client  │           │
│    │   1     │        │   2     │        │  ...N   │           │
│    └─────────┘        └─────────┘        └─────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## NOT Needed: Per-Coin Sockets

❌ **Wrong approach:**
```javascript
// DON'T DO THIS - scales terribly
markets.forEach(market => {
  const ws = new WebSocket(`ws://server/market/${market.mint}`);
});
// 200 markets = 200 connections per client = disaster
```

✅ **Right approach:**
```javascript
// ONE socket, receives ALL price updates
const ws = new WebSocket('ws://server/ws');
ws.onmessage = (event) => {
  const { data } = JSON.parse(event.data);
  // data contains ALL market prices
  data.forEach(price => updateMarketCard(price));
};
```

## Scaling Considerations

### For 50-200 Markets
- Single WebSocket per client ✅
- Batch all prices in one message ✅
- Broadcast every 5-10 seconds ✅
- No special infrastructure needed

### For 1000+ Markets
- Paginate price broadcasts by category
- Let clients subscribe to specific markets
- Use Redis pub/sub for horizontal scaling
- Consider CDN-based WebSocket (Cloudflare, Ably)

### For 10,000+ Concurrent Users
- Load balancer for WebSocket servers
- Redis for state sharing between servers
- Consider managed services (Pusher, Ably, Socket.io Cloud)

## Bandwidth Calculation

```
Per broadcast:
  - 5 markets × ~100 bytes = 500 bytes
  - 50 markets × ~100 bytes = 5 KB
  - 200 markets × ~100 bytes = 20 KB

Per client per minute (10s interval):
  - 6 broadcasts × 20 KB = 120 KB/min

1000 clients:
  - 120 MB/min outbound
  - Very manageable for a single server
```

## Implementation Priority

1. **Phase 1 (Current)**: Polling + periodic broadcast ✅
2. **Phase 2**: On-chain batch fetching (no API dependency)
3. **Phase 3**: Helius webhooks for real-time graduation events
4. **Phase 4**: Full Solana account subscriptions (if needed)

## Code for On-Chain Batch Fetching

```typescript
async function fetchAllBondingCurves(mints: string[]): Promise<Map<string, number>> {
  const connection = new Connection(rpcUrl);
  
  // Derive all bonding curve PDAs
  const bondingCurves = mints.map(mint => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), new PublicKey(mint).toBuffer()],
      PUMP_PROGRAM_ID
    );
    return pda;
  });
  
  // Batch fetch all accounts (max 100 per request)
  const accounts = await connection.getMultipleAccountsInfo(bondingCurves);
  
  // Parse and return progress
  const prices = new Map();
  accounts.forEach((account, i) => {
    if (account) {
      const realSol = account.data.readBigUInt64LE(32);
      const progress = Number(realSol) / (85 * 1e9); // 85 SOL threshold
      prices.set(mints[i], Math.min(progress, 0.99));
    }
  });
  
  return prices;
}
```

## Helius Webhooks (For Graduation Events)

```typescript
// Register webhook for bonding curve "complete" changes
const webhook = await helius.createWebhook({
  webhookURL: 'https://your-api.railway.app/webhook/graduation',
  transactionTypes: ['PROGRAM_INVOKE'],
  accountAddresses: bondingCurveAddresses,
});

// Handle graduation event
app.post('/webhook/graduation', (req, res) => {
  const { mint, complete } = parsePumpFunEvent(req.body);
  if (complete) {
    settleMarket(mint, 'yes'); // Instant settlement!
    broadcast('market_graduated', { mint });
  }
});
```

## Summary

| Approach | Latency | Complexity | Cost |
|----------|---------|------------|------|
| API Polling | 10-30s | Low | Free |
| RPC Polling | 5-10s | Medium | ~$50/mo |
| Helius Webhooks | <1s | Medium | ~$20/mo |
| Full Subscriptions | <100ms | High | ~$100/mo |

**Recommendation for MVP**: Start with RPC polling (Option 2), add Helius webhooks for graduation events.

