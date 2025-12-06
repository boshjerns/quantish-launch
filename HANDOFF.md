# 🚀 Project Handoff Document

## Project Overview

This repository contains **two main projects**:

1. **Pump.fun Prediction Markets** (`pump-prediction-markets/`) - A prediction market platform for betting on whether pump.fun tokens will graduate from their bonding curves
2. **Multi-Wallet Sniper Bot** (root level) - A Solana trading bot for sniping tokens across multiple wallets

**Repository:** https://github.com/boshjerns/quantish-launch

---

## 📁 Project Structure

```
quantish-launch/
├── pump-prediction-markets/          # Main prediction markets app
│   ├── src/
│   │   ├── server-prod.ts           # Production server (main entry point)
│   │   ├── config/index.ts          # Configuration
│   │   ├── db/postgres.ts           # PostgreSQL database layer
│   │   ├── core/math.ts             # Pricing/math engine
│   │   ├── services/                # Business logic services
│   │   └── middleware/security.ts   # Auth, rate limiting, CORS
│   ├── frontend-app/                # React frontend
│   ├── backend/                     # Simple proxy server
│   ├── market-manager/              # Market sync automation
│   ├── base-contracts/              # Solidity smart contracts
│   └── solana-program/              # Anchor/Solana program
│
├── src/                             # Sniper bot code
│   ├── cli/                         # CLI commands
│   ├── trading/                     # Trading logic
│   └── wallet/                      # Wallet management
│
└── wallets/                         # ⚠️ ENCRYPTED wallet storage (gitignored)
```

---

## 🎯 Main Application: Prediction Markets

### What It Does

Binary prediction markets where users bet YES/NO on whether pump.fun tokens will graduate (reach ~85 SOL in bonding curve). Prices are derived from the bonding curve progress.

### Tech Stack

- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL (Railway)
- **Frontend:** React (Vite)
- **Real-time:** WebSocket
- **Blockchain:** Solana (read-only for price data)

---

## 🔧 Setup Instructions

### Prerequisites

- Node.js 18+
- PostgreSQL database (Railway or local)
- Solana RPC endpoint (Helius recommended)

### 1. Install Dependencies

```bash
# Root level (sniper bot)
npm install

# Prediction markets
cd pump-prediction-markets
npm install
```

### 2. Environment Variables

**Create `.env` file in `pump-prediction-markets/` directory:**

```bash
# Solana RPC (REQUIRED)
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY

# Server
PORT=3001
WS_PORT=3002

# Database (REQUIRED for production)
DATABASE_URL=postgresql://user:pass@host:port/dbname
# OR
DATABASE_PUBLIC_URL=postgresql://user:pass@host:port/dbname

# Optional
TOKEN_REFRESH_INTERVAL=30000
PRICE_REFRESH_INTERVAL=10000
MIN_MARKET_CAP_SOL=1
MAX_MARKETS=200
```

**⚠️ IMPORTANT:** The file `run-local.ps1` contains hardcoded credentials. These should be moved to `.env` file (which is gitignored).

### 3. Database Setup

The app uses PostgreSQL. Database schema is auto-created on first run via `initializePostgresDatabase()` in `src/db/postgres.ts`.

**Tables:**
- `tokens` - Market data
- `positions` - User bets/positions
- `audit_log` - All actions logged

### 4. Run the Application

```bash
cd pump-prediction-markets

# Development
npm run dev

# Production
npm start
```

**Server starts on:** `http://localhost:3001`

---

## 📡 API Endpoints

### Public Endpoints

```
GET  /api/markets              - List all active markets
GET  /api/markets/:mint        - Get market by token mint
GET  /api/markets/:mint/price  - Get current prices (for polling)
GET  /health                   - Health check
```

### Authenticated Endpoints

**Authentication:** Include `x-user-id` header (wallet address or user ID)

```
POST /api/orders/market        - Place a bet (YES/NO)
GET  /api/users/:userId/positions - Get user's positions
```

### Admin Endpoints

```
POST /api/admin/sync           - Sync markets from pump.fun
POST /api/admin/settle/:mint   - Settle a market manually
GET  /api/admin/audit          - View audit logs
GET  /api/admin/health         - Detailed health metrics
```

**Full API docs:** See `pump-prediction-markets/API-DOCS.md`

---

## 🔐 Security & Credentials

### ⚠️ Sensitive Files (DO NOT COMMIT)

- `.env` - Environment variables
- `BACKUP-KEYS.txt` - Wallet private keys backup
- `wallets/` - Encrypted wallet storage
- `*.wallet.json` - Wallet files
- `run-local.ps1` - Contains database credentials (should be cleaned)

### Current Credentials Location

**Database:** Check `pump-prediction-markets/run-local.ps1` (line 3)
- Railway PostgreSQL connection string

**Solana RPC:** Check `pump-prediction-markets/run-local.ps1` (line 4)
- Helius API key

**⚠️ ACTION REQUIRED:** Move these to `.env` file and remove from `run-local.ps1`

---

## 🏃 How to Run Live

### Option 1: Local Development

```bash
cd pump-prediction-markets
npm start
```

### Option 2: Using PowerShell Script

```powershell
cd pump-prediction-markets
.\run-local.ps1
```

### Option 3: Railway Deployment

The app is configured for Railway deployment:
- Uses `DATABASE_PUBLIC_URL` environment variable
- See `pump-prediction-markets/.railwayignore`

---

## 📊 Key Features

### Prediction Markets

1. **Real-time Price Updates** - Prices derived from bonding curve progress
2. **WebSocket Support** - Real-time price broadcasts every 5 seconds
3. **Atomic Transactions** - PostgreSQL ensures no partial updates
4. **Audit Logging** - All actions logged
5. **Rate Limiting** - 60 req/min general, 10 bets/min
6. **Settlement Verification** - On-chain verification before settlement

### Sniper Bot

1. **Multi-wallet Support** - Parallel execution across wallets
2. **Pump.fun Integration** - Direct bonding curve purchases
3. **Jupiter DEX** - DEX swaps for graduated tokens
4. **Encrypted Storage** - AES-256-GCM wallet encryption

---

## 🗄️ Database Schema

**PostgreSQL Tables:**

```sql
-- Markets/Tokens
CREATE TABLE tokens (
  mint TEXT PRIMARY KEY,
  name TEXT,
  symbol TEXT,
  description TEXT,
  image_uri TEXT,
  bonding_curve TEXT,
  real_sol_lamports TEXT,  -- BigInt as string
  progress_bps INTEGER,     -- Progress in basis points (0-10000)
  is_graduated INTEGER,     -- 0 or 1
  status TEXT,              -- 'active', 'graduated', 'expired'
  expires_at BIGINT,
  yes_pool TEXT,            -- BigInt as string
  no_pool TEXT,             -- BigInt as string
  created_at BIGINT,
  updated_at BIGINT
);

-- User Positions
CREATE TABLE positions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  market_mint TEXT,
  side TEXT,                -- 'yes' or 'no'
  shares TEXT,              -- BigInt as string (micro-USDC)
  cost_basis TEXT,           -- BigInt as string
  entry_price_bps INTEGER,
  is_settled INTEGER,
  payout TEXT,
  created_at BIGINT
);

-- Audit Log
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT,
  details JSONB,
  created_at BIGINT
);
```

---

## 🔄 Background Jobs

**Cron Jobs (in `server-prod.ts`):**

1. **Market Sync** - Every 5 minutes
   - Fetches latest tokens from pump.fun API
   - Updates bonding curve state from Solana
   - Creates/updates markets in database

2. **Price Broadcast** - Every 5 seconds
   - Reads current prices from database
   - Broadcasts to all WebSocket clients

---

## 🎨 Frontend

**Location:** `pump-prediction-markets/frontend-app/`

**Tech:** React + Vite

**Run frontend:**
```bash
cd pump-prediction-markets/frontend-app
npm install
npm run dev
```

**Frontend connects to:** `http://localhost:3001` (backend API)

---

## 📝 Important Files

| File | Purpose |
|------|---------|
| `pump-prediction-markets/src/server-prod.ts` | Main production server |
| `pump-prediction-markets/src/config/index.ts` | Configuration loader |
| `pump-prediction-markets/src/db/postgres.ts` | Database layer |
| `pump-prediction-markets/src/core/math.ts` | Pricing calculations |
| `pump-prediction-markets/src/services/safe-order-service.ts` | Order placement logic |
| `pump-prediction-markets/src/services/pump-api.ts` | Pump.fun API integration |
| `pump-prediction-markets/src/middleware/security.ts` | Auth, rate limiting, CORS |
| `pump-prediction-markets/PRODUCTION-READY.md` | Production status report |
| `pump-prediction-markets/API-DOCS.md` | Full API documentation |

---

## 🚨 Current State & Known Issues

### ✅ Production Ready

- Math engine (22/22 edge case tests passing)
- Database integrity (atomic transactions)
- API security (rate limiting, auth)
- Settlement verification
- Monitoring & health checks

### ⚠️ Not Production Ready

- **Centralized Settlement** - Currently operator-controlled (not trustless)
- **No On-chain Escrow** - Funds not held in smart contract
- **Smart Contract** - Solana program exists but not fully integrated

### 🔧 Immediate Actions Needed

1. **Move credentials from `run-local.ps1` to `.env`**
2. **Set up production `.env` file with:**
   - `DATABASE_URL` or `DATABASE_PUBLIC_URL`
   - `SOLANA_RPC_URL`
   - `PORT` (if different from 3001)
3. **Test database connection** before running
4. **Verify RPC endpoint** has sufficient rate limits

---

## 🧪 Testing

```bash
# Run math engine tests
cd pump-prediction-markets
npx tsx src/core/edge-cases.test.ts

# Test API locally
curl http://localhost:3001/health
curl http://localhost:3001/api/markets
```

---

## 📚 Documentation Files

- `pump-prediction-markets/API-DOCS.md` - Complete API reference
- `pump-prediction-markets/ARCHITECTURE.md` - System architecture
- `pump-prediction-markets/PRODUCTION-READY.md` - Production status
- `pump-prediction-markets/PRICING-EXPLAINED.md` - How pricing works
- `README.md` - Sniper bot documentation

---

## 🔗 External Dependencies

1. **Solana RPC** - Helius (recommended) or public RPC
2. **PostgreSQL** - Railway (currently) or self-hosted
3. **Pump.fun API** - `https://frontend-api.pump.fun/coins`
4. **DexScreener** - For token metadata (optional)

---

## 🚀 Deployment Checklist

- [ ] Set `DATABASE_URL` environment variable
- [ ] Set `SOLANA_RPC_URL` environment variable
- [ ] Set `PORT` (default: 3001)
- [ ] Run `npm install` in `pump-prediction-markets/`
- [ ] Run `npm start` or `npm run dev`
- [ ] Verify `/health` endpoint returns `{"status":"ok"}`
- [ ] Test `/api/markets` endpoint
- [ ] Configure CORS origins for production domain
- [ ] Set up monitoring/alerting (optional)

---

## 💡 Quick Start Commands

```bash
# Install everything
npm install
cd pump-prediction-markets && npm install

# Set environment (PowerShell)
$env:DATABASE_PUBLIC_URL = "postgresql://..."
$env:SOLANA_RPC_URL = "https://..."
$env:PORT = "3001"

# Start server
cd pump-prediction-markets
npm start

# Check health
curl http://localhost:3001/health

# View markets
curl http://localhost:3001/api/markets
```

---

## 🆘 Troubleshooting

### "Database connection failed"
- Check `DATABASE_URL` is set correctly
- Verify database is accessible
- Check Railway dashboard if using Railway

### "RPC rate limit exceeded"
- Get a Helius API key (free tier available)
- Update `SOLANA_RPC_URL` in `.env`

### "No markets returned"
- Check Solana RPC is working
- Verify pump.fun API is accessible
- Check server logs for sync errors

### "WebSocket not connecting"
- Verify server is running
- Check `WS_PORT` if using separate port
- Frontend should connect to `ws://localhost:3001/ws`

---

## 📞 Support & Next Steps

1. **Review `PRODUCTION-READY.md`** for full production status
2. **Read `API-DOCS.md`** for complete API reference
3. **Check `ARCHITECTURE.md`** for system design
4. **Test locally** before deploying to production
5. **Set up monitoring** for production deployment

---

## 🔑 Key Contacts/Resources

- **GitHub Repo:** https://github.com/boshjerns/quantish-launch
- **Railway Dashboard:** (check your Railway account)
- **Helius Dashboard:** (check your Helius account for RPC key)

---

**Last Updated:** December 6, 2025
**Project Status:** Beta - Ready for testing, not production-ready for real money

