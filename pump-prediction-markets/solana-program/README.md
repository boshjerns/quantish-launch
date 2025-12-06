# Quantish Markets - Solana Smart Contract

Trustless prediction markets for pump.fun token graduation built on Solana.

## Overview

This Anchor program enables fully on-chain prediction markets where users bet on whether a pump.fun token will "graduate" (reach the 85 SOL bonding curve threshold).

### Key Features

- **30-minute market windows** - Each market runs for exactly 30 minutes
- **Price derived from bonding curve** - YES price = bonding curve progress %
- **Trustless settlement** - Outcomes determined by on-chain graduation status
- **USDC-denominated** - All bets and payouts in USDC
- **Protocol fees** - Configurable fee on winnings (default 1%)
- **Emergency controls** - Admin can pause/cancel markets if needed

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PROTOCOL (PDA)                                │
│  - authority: Admin pubkey                                           │
│  - treasury: Fee collection account                                  │
│  - fee_bps: Protocol fee (100 = 1%)                                 │
│  - total_markets: Counter                                            │
│  - total_volume: Cumulative volume                                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
    ┌─────────────────────────┐     ┌─────────────────────────┐
    │    MARKET (PDA)         │     │    MARKET (PDA)         │
    │  seed: pump_token_mint  │     │  seed: pump_token_mint  │
    │  - yes_pool: USDC       │     │  - yes_pool: USDC       │
    │  - no_pool: USDC        │     │  - no_pool: USDC        │
    │  - progress_bps         │     │  - progress_bps         │
    │  - status: Active       │     │  - status: Settled      │
    │  - outcome: None        │     │  - outcome: Some(true)  │
    └─────────────────────────┘     └─────────────────────────┘
              │                               │
              ▼                               ▼
    ┌─────────────────────────┐     ┌─────────────────────────┐
    │   USDC VAULT (PDA)      │     │   USDC VAULT (PDA)      │
    │  Token account holding  │     │  Token account holding  │
    │  all bets for market    │     │  remaining funds        │
    └─────────────────────────┘     └─────────────────────────┘
              │
    ┌─────────┴─────────┐
    ▼                   ▼
┌──────────┐      ┌──────────┐
│ POSITION │      │ POSITION │
│ User A   │      │ User B   │
│ YES/500  │      │ NO/300   │
│ shares   │      │ shares   │
└──────────┘      └──────────┘
```

## Installation

### Prerequisites

1. **Rust** (1.70+)
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

2. **Solana CLI** (1.17+)
```bash
sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)"
```

3. **Anchor** (0.29+)
```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest
```

4. **Node.js** (18+) for tests

### Setup

```bash
cd solana-program

# Install JS dependencies
yarn install

# Build the program
anchor build

# Run tests
anchor test
```

## Deployment

### Devnet Deployment

```bash
# Configure for devnet
solana config set --url devnet

# Create a new keypair or use existing
solana-keygen new -o ~/.config/solana/id.json

# Airdrop SOL for deployment
solana airdrop 5

# Build and deploy
anchor build
anchor deploy

# Note the program ID and update Anchor.toml and declare_id!
```

### Mainnet Deployment

```bash
# Configure for mainnet
solana config set --url mainnet-beta

# Ensure you have SOL for deployment (~3 SOL recommended)
solana balance

# Build with mainnet features
anchor build

# Deploy
anchor deploy --provider.cluster mainnet
```

## Usage

### Initialize Protocol (One-time)

```typescript
import * as anchor from "@coral-xyz/anchor";
import { QuantishMarkets } from "../target/types/quantish_markets";

const program = anchor.workspace.QuantishMarkets as Program<QuantishMarkets>;

// Initialize protocol with 1% fee
await program.methods
  .initializeProtocol(new anchor.BN(100)) // 100 BPS = 1%
  .accounts({
    protocol: protocolPda,
    treasury: treasuryPubkey,
    authority: wallet.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

### Create Market

```typescript
const pumpTokenMint = new PublicKey("PUMP_TOKEN_MINT_ADDRESS");
const initialProgressBps = 5000; // 50% bonded = $0.50 YES price

await program.methods
  .createMarket(pumpTokenMint, new anchor.BN(initialProgressBps))
  .accounts({
    protocol: protocolPda,
    market: marketPda,
    usdcVault: vaultPda,
    usdcMint: USDC_MINT,
    authority: wallet.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  })
  .rpc();
```

### Place Bet

```typescript
await program.methods
  .placeBet(
    { yes: {} }, // or { no: {} }
    new anchor.BN(10_000_000) // $10 USDC (6 decimals)
  )
  .accounts({
    protocol: protocolPda,
    market: marketPda,
    position: positionPda,
    usdcVault: vaultPda,
    userUsdc: userUsdcAccount,
    user: wallet.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

### Settle Market (Admin)

```typescript
await program.methods
  .settleMarket(true) // true = graduated, false = didn't graduate
  .accounts({
    protocol: protocolPda,
    market: marketPda,
    authority: adminWallet.publicKey,
  })
  .rpc();
```

### Claim Winnings

```typescript
await program.methods
  .claimWinnings()
  .accounts({
    protocol: protocolPda,
    market: marketPda,
    position: positionPda,
    usdcVault: vaultPda,
    userUsdc: userUsdcAccount,
    treasury: treasuryAccount,
    user: wallet.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
```

## Math Specifications

### Share Calculation

When placing a bet:
```
shares = (amount_usdc * 10000) / price_bps
```

Example: Betting $10 at 50% price:
```
shares = (10_000_000 * 10000) / 5000 = 20_000_000 shares
```

### Payout Calculation

For winners:
```
payout = (user_shares / total_winning_shares) * total_pool
net_payout = payout - (payout * fee_bps / 10000)
```

Example: User has 20M shares out of 100M total winning shares, pool is $500:
```
payout = (20_000_000 / 100_000_000) * 500_000_000 = 100_000_000 ($100)
fee = 100_000_000 * 100 / 10000 = 1_000_000 ($1)
net_payout = 99_000_000 ($99)
```

### Price Derivation

YES price = pump.fun bonding curve progress (1-99%)
NO price = 100% - YES price

The bonding curve progress is calculated from:
```
progress_bps = (real_sol_lamports * 10000) / 85_000_000_000
```

Where 85 SOL (85B lamports) is the graduation threshold.

## Security Considerations

1. **Integer Math Only** - All calculations use u64/u128 with explicit overflow checks
2. **PDA Seeds** - Markets and vaults are derived deterministically from pump token mint
3. **Access Control** - Only protocol authority can settle, pause, cancel markets
4. **No Reentrancy** - All state updates happen before CPI calls
5. **Bounds Checking** - Prices bounded to 1-99%, fees capped at 10%

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 6000 | InvalidPrice | Price must be 1-99% |
| 6001 | MarketNotActive | Market is paused/settled/cancelled |
| 6002 | MarketNotExpired | Cannot settle before end time |
| 6003 | MarketExpired | Cannot bet after end time |
| 6004 | MarketNotSettled | Cannot claim before settlement |
| 6005 | MarketNotPaused | Cannot resume non-paused market |
| 6006 | MarketNotCancelled | Cannot refund non-cancelled market |
| 6007 | CannotCancel | Market in invalid state for cancel |
| 6008 | AlreadyClaimed | Position already claimed |
| 6009 | NoOutcome | Market outcome not set |
| 6010 | MathOverflow | Arithmetic overflow |
| 6011 | BetTooSmall | Minimum bet is $1 |
| 6012 | SharesTooSmall | Calculated shares is 0 |
| 6013 | CannotSwitchSides | Must bet same side on existing position |
| 6014 | FeeTooHigh | Max fee is 10% |

## License

MIT

