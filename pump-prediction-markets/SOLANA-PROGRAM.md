# Pump.fun Prediction Markets - Solana Program Design

## Why Solana?

✅ **No Oracle Needed** - Bonding curve data is on-chain, we read it directly  
✅ **Trustless Settlement** - Contract verifies graduation by inspecting pump.fun accounts  
✅ **Atomic Operations** - Bet + price check in single transaction  
✅ **Native Integration** - Same chain as pump.fun, same wallets  
✅ **Low Cost** - ~$0.00025 per transaction  

## Program Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PREDICTION MARKET PROGRAM                        │
│                  (Anchor/Rust on Solana)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐     ┌─────────────────┐    ┌───────────────┐  │
│  │  MarketConfig   │     │     Market      │    │   Position    │  │
│  │     (PDA)       │     │     (PDA)       │    │    (PDA)      │  │
│  │                 │     │                 │    │               │  │
│  │ - admin         │     │ - mint          │    │ - market      │  │
│  │ - fee_bps       │     │ - bonding_curve │    │ - user        │  │
│  │ - treasury      │     │ - yes_pool      │    │ - side        │  │
│  │ - paused        │     │ - no_pool       │    │ - shares      │  │
│  └─────────────────┘     │ - status        │    │ - cost        │  │
│                          │ - expires_at    │    │ - settled     │  │
│                          │ - outcome       │    └───────────────┘  │
│                          └─────────────────┘                       │
│                                                                     │
│  Instructions:                                                      │
│  ├── initialize_config      - Set up program config                │
│  ├── create_market          - Create prediction market for token   │
│  ├── place_bet              - Bet YES or NO                        │
│  ├── settle_market          - Settle based on graduation status    │
│  ├── claim_winnings         - Claim settled position               │
│  └── close_position         - Emergency close (admin only)         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      PUMP.FUN PROGRAM                               │
│              (Read-only - we just inspect accounts)                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐                                               │
│  │  BondingCurve   │  ◄── We read this to determine:               │
│  │    Account      │      - real_sol_reserves (progress)           │
│  │                 │      - complete (graduated?)                   │
│  │ - virtual_sol   │                                               │
│  │ - virtual_token │                                               │
│  │ - real_sol      │  ◄── This is the key metric!                  │
│  │ - real_token    │                                               │
│  │ - complete      │  ◄── True = graduated, YES wins               │
│  └─────────────────┘                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Account Structures

### MarketConfig (Global - 1 per program)
```rust
#[account]
pub struct MarketConfig {
    pub admin: Pubkey,              // Admin authority
    pub treasury: Pubkey,           // Fee collection wallet
    pub fee_bps: u16,               // Protocol fee (e.g., 100 = 1%)
    pub min_bet_lamports: u64,      // Minimum bet (~$1 USDC worth)
    pub default_expiry_seconds: i64, // Default market duration
    pub paused: bool,               // Emergency pause
    pub bump: u8,
}
// Seeds: ["config"]
```

### Market (1 per pump.fun token)
```rust
#[account]
pub struct Market {
    pub mint: Pubkey,                    // Pump.fun token mint
    pub bonding_curve: Pubkey,           // Bonding curve PDA (for verification)
    
    // Pool state (in lamports for SOL betting, or USDC)
    pub yes_pool: u64,                   // Total SOL/USDC bet on YES
    pub no_pool: u64,                    // Total SOL/USDC bet on NO
    pub total_shares_yes: u64,           // Total YES shares issued
    pub total_shares_no: u64,            // Total NO shares issued
    
    // Market lifecycle
    pub status: MarketStatus,            // Active, Settled, Expired
    pub created_at: i64,
    pub expires_at: i64,                 // Unix timestamp
    pub settled_at: Option<i64>,
    pub outcome: Option<Outcome>,        // Yes or No (after settlement)
    
    // Snapshot at creation (for verification)
    pub initial_sol_reserves: u64,
    
    pub bump: u8,
}
// Seeds: ["market", mint.key()]

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum MarketStatus {
    Active,
    Settled,
    Expired,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum Outcome {
    Yes,  // Token graduated
    No,   // Token did not graduate
}
```

### Position (1 per user per market)
```rust
#[account]
pub struct Position {
    pub market: Pubkey,
    pub user: Pubkey,
    pub side: Side,                      // Yes or No
    pub shares: u64,                     // Shares owned (6 decimal precision)
    pub cost_basis: u64,                 // Total amount paid
    pub entry_price_bps: u16,            // Average entry price in BPS
    pub is_settled: bool,
    pub payout: Option<u64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}
// Seeds: ["position", market.key(), user.key()]

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum Side {
    Yes,
    No,
}
```

## Key Instructions

### 1. create_market
```rust
pub fn create_market(
    ctx: Context<CreateMarket>,
    expiry_offset_seconds: i64,  // How long until market expires
) -> Result<()> {
    // 1. Derive bonding curve PDA from mint
    // 2. Verify bonding curve account exists and is not complete
    // 3. Read initial_sol_reserves
    // 4. Create market account
    // 5. Set expiry = now + expiry_offset_seconds
}
```

### 2. place_bet
```rust
pub fn place_bet(
    ctx: Context<PlaceBet>,
    side: Side,
    amount: u64,           // SOL/USDC amount
    max_price_bps: u16,    // Slippage protection
) -> Result<()> {
    // 1. Verify market is Active and not expired
    // 2. Read current bonding curve state
    // 3. Calculate current price from real_sol_reserves
    // 4. Check slippage (actual price <= max_price_bps)
    // 5. Calculate shares = amount / price
    // 6. Transfer funds to market vault
    // 7. Update/Create position
    // 8. Update pool totals
}
```

### 3. settle_market
```rust
pub fn settle_market(
    ctx: Context<SettleMarket>,
) -> Result<()> {
    // 1. Read bonding curve account
    // 2. If complete == true:
    //    - Set outcome = Yes
    //    - YES holders win
    // 3. If expired && complete == false:
    //    - Set outcome = No  
    //    - NO holders win
    // 4. Set status = Settled
    // 5. Record settled_at timestamp
    
    // TRUSTLESS: No admin input needed!
    // Outcome is determined purely by on-chain state
}
```

### 4. claim_winnings
```rust
pub fn claim_winnings(
    ctx: Context<ClaimWinnings>,
) -> Result<()> {
    // 1. Verify market is Settled
    // 2. Verify position.side == market.outcome
    // 3. Calculate payout = shares (winners get $1 per share)
    // 4. Deduct protocol fee
    // 5. Transfer payout from vault to user
    // 6. Mark position as settled
}
```

## Price Calculation (On-Chain)

```rust
const GRADUATION_THRESHOLD: u64 = 85_000_000_000; // 85 SOL in lamports
const BPS_PRECISION: u64 = 10_000;
const MIN_PRICE_BPS: u64 = 100;  // 1%
const MAX_PRICE_BPS: u64 = 9900; // 99%

pub fn calculate_price_bps(real_sol_reserves: u64) -> u64 {
    // progress = real_sol / threshold
    let progress_bps = (real_sol_reserves as u128)
        .checked_mul(BPS_PRECISION as u128)
        .unwrap()
        .checked_div(GRADUATION_THRESHOLD as u128)
        .unwrap() as u64;
    
    // Clamp to bounds
    if progress_bps < MIN_PRICE_BPS {
        return MIN_PRICE_BPS;
    }
    if progress_bps > MAX_PRICE_BPS {
        return MAX_PRICE_BPS;
    }
    progress_bps
}

pub fn calculate_shares(amount: u64, price_bps: u64) -> u64 {
    // shares = amount * BPS_PRECISION / price_bps
    (amount as u128)
        .checked_mul(BPS_PRECISION as u128)
        .unwrap()
        .checked_div(price_bps as u128)
        .unwrap() as u64
}
```

## Reading Pump.fun Bonding Curve

The bonding curve account layout (we derived this in the sniper project):

```rust
// Offset 0-7: discriminator
// Offset 8-15: virtual_token_reserves (u64)
// Offset 16-23: virtual_sol_reserves (u64)  
// Offset 24-31: real_token_reserves (u64)
// Offset 32-39: real_sol_reserves (u64)      ◄── KEY METRIC
// Offset 40-47: token_total_supply (u64)
// Offset 48: complete (bool)                  ◄── GRADUATION FLAG
// Offset 49-80: creator (Pubkey)

pub fn parse_bonding_curve(data: &[u8]) -> Result<(u64, bool)> {
    require!(data.len() >= 49, ErrorCode::InvalidBondingCurve);
    
    let real_sol_reserves = u64::from_le_bytes(
        data[32..40].try_into().unwrap()
    );
    let complete = data[48] == 1;
    
    Ok((real_sol_reserves, complete))
}
```

## Security Considerations

### 1. Reentrancy Protection
- All state updates before transfers
- Use Anchor's built-in reentrancy guard

### 2. Price Manipulation
- Price derived from pump.fun state (not our pools)
- Users can't manipulate odds by trading
- Slippage protection on bets

### 3. Settlement Integrity
- Settlement reads bonding curve directly
- No admin can fake graduation
- Deterministic outcome from on-chain data

### 4. Overflow Protection
- All math uses checked operations
- u128 intermediate values for multiplication

### 5. Access Control
- Markets can be created by anyone
- Bets can be placed by anyone
- Settlement can be triggered by anyone (permissionless)
- Only admin can pause/unpause

## Betting Token Options

### Option A: SOL Native
- Users bet with SOL directly
- Simpler UX (no token approvals)
- Payouts in SOL
- Price volatility affects real value

### Option B: USDC (Recommended)
- Users bet with USDC (SPL token)
- Stable value
- More familiar for prediction markets
- Requires token approval

### Option C: Hybrid
- Accept both SOL and USDC
- Convert internally to standard unit
- More complex but flexible

## Development Phases

### Phase 1: Backend API (Current)
- ✅ Math engine with tests
- 🔄 Market fetching from pump.fun
- 🔄 Database schema
- 🔄 REST API for frontend

### Phase 2: Solana Program
- [ ] Write Anchor program
- [ ] Unit tests with bankrun
- [ ] Deploy to devnet
- [ ] Integration tests

### Phase 3: Production
- [ ] Security audit
- [ ] Mainnet deployment
- [ ] Frontend integration
- [ ] Documentation

## Program IDs (TBD)

```
Devnet: (to be deployed)
Mainnet: (after audit)
```

## Dependencies

```toml
[dependencies]
anchor-lang = "0.29.0"
anchor-spl = "0.29.0"
```


## Why Solana?

✅ **No Oracle Needed** - Bonding curve data is on-chain, we read it directly  
✅ **Trustless Settlement** - Contract verifies graduation by inspecting pump.fun accounts  
✅ **Atomic Operations** - Bet + price check in single transaction  
✅ **Native Integration** - Same chain as pump.fun, same wallets  
✅ **Low Cost** - ~$0.00025 per transaction  

## Program Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PREDICTION MARKET PROGRAM                        │
│                  (Anchor/Rust on Solana)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐     ┌─────────────────┐    ┌───────────────┐  │
│  │  MarketConfig   │     │     Market      │    │   Position    │  │
│  │     (PDA)       │     │     (PDA)       │    │    (PDA)      │  │
│  │                 │     │                 │    │               │  │
│  │ - admin         │     │ - mint          │    │ - market      │  │
│  │ - fee_bps       │     │ - bonding_curve │    │ - user        │  │
│  │ - treasury      │     │ - yes_pool      │    │ - side        │  │
│  │ - paused        │     │ - no_pool       │    │ - shares      │  │
│  └─────────────────┘     │ - status        │    │ - cost        │  │
│                          │ - expires_at    │    │ - settled     │  │
│                          │ - outcome       │    └───────────────┘  │
│                          └─────────────────┘                       │
│                                                                     │
│  Instructions:                                                      │
│  ├── initialize_config      - Set up program config                │
│  ├── create_market          - Create prediction market for token   │
│  ├── place_bet              - Bet YES or NO                        │
│  ├── settle_market          - Settle based on graduation status    │
│  ├── claim_winnings         - Claim settled position               │
│  └── close_position         - Emergency close (admin only)         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      PUMP.FUN PROGRAM                               │
│              (Read-only - we just inspect accounts)                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐                                               │
│  │  BondingCurve   │  ◄── We read this to determine:               │
│  │    Account      │      - real_sol_reserves (progress)           │
│  │                 │      - complete (graduated?)                   │
│  │ - virtual_sol   │                                               │
│  │ - virtual_token │                                               │
│  │ - real_sol      │  ◄── This is the key metric!                  │
│  │ - real_token    │                                               │
│  │ - complete      │  ◄── True = graduated, YES wins               │
│  └─────────────────┘                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Account Structures

### MarketConfig (Global - 1 per program)
```rust
#[account]
pub struct MarketConfig {
    pub admin: Pubkey,              // Admin authority
    pub treasury: Pubkey,           // Fee collection wallet
    pub fee_bps: u16,               // Protocol fee (e.g., 100 = 1%)
    pub min_bet_lamports: u64,      // Minimum bet (~$1 USDC worth)
    pub default_expiry_seconds: i64, // Default market duration
    pub paused: bool,               // Emergency pause
    pub bump: u8,
}
// Seeds: ["config"]
```

### Market (1 per pump.fun token)
```rust
#[account]
pub struct Market {
    pub mint: Pubkey,                    // Pump.fun token mint
    pub bonding_curve: Pubkey,           // Bonding curve PDA (for verification)
    
    // Pool state (in lamports for SOL betting, or USDC)
    pub yes_pool: u64,                   // Total SOL/USDC bet on YES
    pub no_pool: u64,                    // Total SOL/USDC bet on NO
    pub total_shares_yes: u64,           // Total YES shares issued
    pub total_shares_no: u64,            // Total NO shares issued
    
    // Market lifecycle
    pub status: MarketStatus,            // Active, Settled, Expired
    pub created_at: i64,
    pub expires_at: i64,                 // Unix timestamp
    pub settled_at: Option<i64>,
    pub outcome: Option<Outcome>,        // Yes or No (after settlement)
    
    // Snapshot at creation (for verification)
    pub initial_sol_reserves: u64,
    
    pub bump: u8,
}
// Seeds: ["market", mint.key()]

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum MarketStatus {
    Active,
    Settled,
    Expired,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum Outcome {
    Yes,  // Token graduated
    No,   // Token did not graduate
}
```

### Position (1 per user per market)
```rust
#[account]
pub struct Position {
    pub market: Pubkey,
    pub user: Pubkey,
    pub side: Side,                      // Yes or No
    pub shares: u64,                     // Shares owned (6 decimal precision)
    pub cost_basis: u64,                 // Total amount paid
    pub entry_price_bps: u16,            // Average entry price in BPS
    pub is_settled: bool,
    pub payout: Option<u64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}
// Seeds: ["position", market.key(), user.key()]

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum Side {
    Yes,
    No,
}
```

## Key Instructions

### 1. create_market
```rust
pub fn create_market(
    ctx: Context<CreateMarket>,
    expiry_offset_seconds: i64,  // How long until market expires
) -> Result<()> {
    // 1. Derive bonding curve PDA from mint
    // 2. Verify bonding curve account exists and is not complete
    // 3. Read initial_sol_reserves
    // 4. Create market account
    // 5. Set expiry = now + expiry_offset_seconds
}
```

### 2. place_bet
```rust
pub fn place_bet(
    ctx: Context<PlaceBet>,
    side: Side,
    amount: u64,           // SOL/USDC amount
    max_price_bps: u16,    // Slippage protection
) -> Result<()> {
    // 1. Verify market is Active and not expired
    // 2. Read current bonding curve state
    // 3. Calculate current price from real_sol_reserves
    // 4. Check slippage (actual price <= max_price_bps)
    // 5. Calculate shares = amount / price
    // 6. Transfer funds to market vault
    // 7. Update/Create position
    // 8. Update pool totals
}
```

### 3. settle_market
```rust
pub fn settle_market(
    ctx: Context<SettleMarket>,
) -> Result<()> {
    // 1. Read bonding curve account
    // 2. If complete == true:
    //    - Set outcome = Yes
    //    - YES holders win
    // 3. If expired && complete == false:
    //    - Set outcome = No  
    //    - NO holders win
    // 4. Set status = Settled
    // 5. Record settled_at timestamp
    
    // TRUSTLESS: No admin input needed!
    // Outcome is determined purely by on-chain state
}
```

### 4. claim_winnings
```rust
pub fn claim_winnings(
    ctx: Context<ClaimWinnings>,
) -> Result<()> {
    // 1. Verify market is Settled
    // 2. Verify position.side == market.outcome
    // 3. Calculate payout = shares (winners get $1 per share)
    // 4. Deduct protocol fee
    // 5. Transfer payout from vault to user
    // 6. Mark position as settled
}
```

## Price Calculation (On-Chain)

```rust
const GRADUATION_THRESHOLD: u64 = 85_000_000_000; // 85 SOL in lamports
const BPS_PRECISION: u64 = 10_000;
const MIN_PRICE_BPS: u64 = 100;  // 1%
const MAX_PRICE_BPS: u64 = 9900; // 99%

pub fn calculate_price_bps(real_sol_reserves: u64) -> u64 {
    // progress = real_sol / threshold
    let progress_bps = (real_sol_reserves as u128)
        .checked_mul(BPS_PRECISION as u128)
        .unwrap()
        .checked_div(GRADUATION_THRESHOLD as u128)
        .unwrap() as u64;
    
    // Clamp to bounds
    if progress_bps < MIN_PRICE_BPS {
        return MIN_PRICE_BPS;
    }
    if progress_bps > MAX_PRICE_BPS {
        return MAX_PRICE_BPS;
    }
    progress_bps
}

pub fn calculate_shares(amount: u64, price_bps: u64) -> u64 {
    // shares = amount * BPS_PRECISION / price_bps
    (amount as u128)
        .checked_mul(BPS_PRECISION as u128)
        .unwrap()
        .checked_div(price_bps as u128)
        .unwrap() as u64
}
```

## Reading Pump.fun Bonding Curve

The bonding curve account layout (we derived this in the sniper project):

```rust
// Offset 0-7: discriminator
// Offset 8-15: virtual_token_reserves (u64)
// Offset 16-23: virtual_sol_reserves (u64)  
// Offset 24-31: real_token_reserves (u64)
// Offset 32-39: real_sol_reserves (u64)      ◄── KEY METRIC
// Offset 40-47: token_total_supply (u64)
// Offset 48: complete (bool)                  ◄── GRADUATION FLAG
// Offset 49-80: creator (Pubkey)

pub fn parse_bonding_curve(data: &[u8]) -> Result<(u64, bool)> {
    require!(data.len() >= 49, ErrorCode::InvalidBondingCurve);
    
    let real_sol_reserves = u64::from_le_bytes(
        data[32..40].try_into().unwrap()
    );
    let complete = data[48] == 1;
    
    Ok((real_sol_reserves, complete))
}
```

## Security Considerations

### 1. Reentrancy Protection
- All state updates before transfers
- Use Anchor's built-in reentrancy guard

### 2. Price Manipulation
- Price derived from pump.fun state (not our pools)
- Users can't manipulate odds by trading
- Slippage protection on bets

### 3. Settlement Integrity
- Settlement reads bonding curve directly
- No admin can fake graduation
- Deterministic outcome from on-chain data

### 4. Overflow Protection
- All math uses checked operations
- u128 intermediate values for multiplication

### 5. Access Control
- Markets can be created by anyone
- Bets can be placed by anyone
- Settlement can be triggered by anyone (permissionless)
- Only admin can pause/unpause

## Betting Token Options

### Option A: SOL Native
- Users bet with SOL directly
- Simpler UX (no token approvals)
- Payouts in SOL
- Price volatility affects real value

### Option B: USDC (Recommended)
- Users bet with USDC (SPL token)
- Stable value
- More familiar for prediction markets
- Requires token approval

### Option C: Hybrid
- Accept both SOL and USDC
- Convert internally to standard unit
- More complex but flexible

## Development Phases

### Phase 1: Backend API (Current)
- ✅ Math engine with tests
- 🔄 Market fetching from pump.fun
- 🔄 Database schema
- 🔄 REST API for frontend

### Phase 2: Solana Program
- [ ] Write Anchor program
- [ ] Unit tests with bankrun
- [ ] Deploy to devnet
- [ ] Integration tests

### Phase 3: Production
- [ ] Security audit
- [ ] Mainnet deployment
- [ ] Frontend integration
- [ ] Documentation

## Program IDs (TBD)

```
Devnet: (to be deployed)
Mainnet: (after audit)
```

## Dependencies

```toml
[dependencies]
anchor-lang = "0.29.0"
anchor-spl = "0.29.0"
```

