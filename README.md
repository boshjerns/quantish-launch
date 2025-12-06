# 🎯 Solana Multi-Wallet Sniper

A secure, multi-wallet token sniping system for Solana. Supports pump.fun bonding curve purchases and Jupiter DEX swaps.

## ⚠️ Security Warning

**This software handles real cryptocurrency. Use at your own risk.**

- Never share your private keys or encryption password
- Never commit `.env` or `wallets/` folder to version control
- Start with small amounts on devnet before using mainnet
- This is experimental software with no guarantees

## Features

- 🔐 **Secure Wallet Generation**: AES-256-GCM encrypted storage
- 💰 **Master Wallet Distribution**: Easily fund multiple sub-wallets
- 🎯 **Multi-Platform Sniping**: Supports pump.fun and Jupiter DEX
- ⚡ **Parallel Execution**: All wallets buy simultaneously
- 📊 **Status Dashboard**: Monitor all wallet balances
- 🔄 **Auto Platform Detection**: Automatically detects the right DEX

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example config and edit it:

```bash
cp env.example .env
```

Edit `.env` with your settings:
- `SOLANA_NETWORK`: Use `devnet` for testing, `mainnet-beta` for production
- `MASTER_WALLET_PRIVATE_KEY`: Your funding wallet's private key (Base58)
- `WALLET_ENCRYPTION_PASSWORD`: Password to encrypt generated wallets

### 3. Generate Wallets

```bash
npm run generate-wallets
```

Options:
- `-c, --count <number>`: Number of wallets (default: 10)
- `--generate-password`: Auto-generate a secure password

### 4. Fund Master Wallet

Send SOL to your master wallet address shown in the output.

### 5. Distribute SOL to Sub-Wallets

```bash
npm run distribute
```

Options:
- `--status`: View all wallet balances
- `--collect`: Return all SOL to master wallet

### 6. Execute a Snipe

```bash
npm run snipe
```

Options:
- `-t, --token <address>`: Token mint address
- `-a, --amount <number>`: SOL per wallet
- `--platform <platform>`: `pump-fun`, `jupiter`, or `auto`
- `--slippage <bps>`: Slippage in basis points (500 = 5%)
- `--dry-run`: Simulate without executing

## Commands Reference

| Command | Description |
|---------|-------------|
| `npm run generate-wallets` | Create new encrypted wallets |
| `npm run distribute` | Distribute SOL to sub-wallets |
| `npm run snipe` | Execute multi-wallet buy |
| `npm run status` | View wallet balances and config |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Master Wallet                            │
│                   (Funding Source)                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
          ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ Wallet 0 │  │ Wallet 1 │  │ Wallet N │
    └────┬─────┘  └────┬─────┘  └────┬─────┘
         │             │             │
         └─────────────┼─────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  Token Sniper  │
              │  (Parallel)    │
              └────────┬───────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ pump.fun │  │  Jupiter │  │ Raydium  │
    │  (curve) │  │   (DEX)  │  │  (DEX)   │
    └──────────┘  └──────────┘  └──────────┘
```

## Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `SOLANA_NETWORK` | `devnet` | Network to use |
| `SOLANA_RPC_URL` | (auto) | Custom RPC endpoint |
| `DEFAULT_SLIPPAGE_BPS` | `500` | 5% slippage |
| `PRIORITY_FEE_MICROLAMPORTS` | `100000` | Priority fee for faster TXs |
| `MIN_BUY_AMOUNT_SOL` | `0.01` | Minimum buy per wallet |
| `MAX_BUY_AMOUNT_SOL` | `0.1` | Maximum buy per wallet |

## Pump.fun Integration

Tokens on pump.fun use a bonding curve until they "graduate" to Raydium. This sniper:

1. Detects if token is on bonding curve or DEX
2. Uses appropriate method (direct pump.fun or Jupiter)
3. Handles token account creation automatically

## Testing

1. Use `devnet` network for testing
2. Get devnet SOL from a faucet: https://faucet.solana.com
3. Find test tokens on pump.fun (many are on devnet)
4. Start with the `--dry-run` flag

## Troubleshooting

### "Insufficient balance"
Make sure your master wallet has enough SOL and run `npm run distribute`

### "Token not found"
Verify the token mint address is correct and the token exists

### "Transaction failed"
- Increase slippage with `--slippage 1000` (10%)
- Increase priority fee in `.env`
- Check RPC rate limits

### "Invalid password"
The encryption password must match what was used to generate wallets

## Legal Disclaimer

This software is for educational purposes only. Trading cryptocurrency involves significant risk. You are solely responsible for any losses incurred. Always do your own research and never invest more than you can afford to lose.

## License

MIT



A secure, multi-wallet token sniping system for Solana. Supports pump.fun bonding curve purchases and Jupiter DEX swaps.

## ⚠️ Security Warning

**This software handles real cryptocurrency. Use at your own risk.**

- Never share your private keys or encryption password
- Never commit `.env` or `wallets/` folder to version control
- Start with small amounts on devnet before using mainnet
- This is experimental software with no guarantees

## Features

- 🔐 **Secure Wallet Generation**: AES-256-GCM encrypted storage
- 💰 **Master Wallet Distribution**: Easily fund multiple sub-wallets
- 🎯 **Multi-Platform Sniping**: Supports pump.fun and Jupiter DEX
- ⚡ **Parallel Execution**: All wallets buy simultaneously
- 📊 **Status Dashboard**: Monitor all wallet balances
- 🔄 **Auto Platform Detection**: Automatically detects the right DEX

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example config and edit it:

```bash
cp env.example .env
```

Edit `.env` with your settings:
- `SOLANA_NETWORK`: Use `devnet` for testing, `mainnet-beta` for production
- `MASTER_WALLET_PRIVATE_KEY`: Your funding wallet's private key (Base58)
- `WALLET_ENCRYPTION_PASSWORD`: Password to encrypt generated wallets

### 3. Generate Wallets

```bash
npm run generate-wallets
```

Options:
- `-c, --count <number>`: Number of wallets (default: 10)
- `--generate-password`: Auto-generate a secure password

### 4. Fund Master Wallet

Send SOL to your master wallet address shown in the output.

### 5. Distribute SOL to Sub-Wallets

```bash
npm run distribute
```

Options:
- `--status`: View all wallet balances
- `--collect`: Return all SOL to master wallet

### 6. Execute a Snipe

```bash
npm run snipe
```

Options:
- `-t, --token <address>`: Token mint address
- `-a, --amount <number>`: SOL per wallet
- `--platform <platform>`: `pump-fun`, `jupiter`, or `auto`
- `--slippage <bps>`: Slippage in basis points (500 = 5%)
- `--dry-run`: Simulate without executing

## Commands Reference

| Command | Description |
|---------|-------------|
| `npm run generate-wallets` | Create new encrypted wallets |
| `npm run distribute` | Distribute SOL to sub-wallets |
| `npm run snipe` | Execute multi-wallet buy |
| `npm run status` | View wallet balances and config |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Master Wallet                            │
│                   (Funding Source)                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
          ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ Wallet 0 │  │ Wallet 1 │  │ Wallet N │
    └────┬─────┘  └────┬─────┘  └────┬─────┘
         │             │             │
         └─────────────┼─────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  Token Sniper  │
              │  (Parallel)    │
              └────────┬───────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ pump.fun │  │  Jupiter │  │ Raydium  │
    │  (curve) │  │   (DEX)  │  │  (DEX)   │
    └──────────┘  └──────────┘  └──────────┘
```

## Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `SOLANA_NETWORK` | `devnet` | Network to use |
| `SOLANA_RPC_URL` | (auto) | Custom RPC endpoint |
| `DEFAULT_SLIPPAGE_BPS` | `500` | 5% slippage |
| `PRIORITY_FEE_MICROLAMPORTS` | `100000` | Priority fee for faster TXs |
| `MIN_BUY_AMOUNT_SOL` | `0.01` | Minimum buy per wallet |
| `MAX_BUY_AMOUNT_SOL` | `0.1` | Maximum buy per wallet |

## Pump.fun Integration

Tokens on pump.fun use a bonding curve until they "graduate" to Raydium. This sniper:

1. Detects if token is on bonding curve or DEX
2. Uses appropriate method (direct pump.fun or Jupiter)
3. Handles token account creation automatically

## Testing

1. Use `devnet` network for testing
2. Get devnet SOL from a faucet: https://faucet.solana.com
3. Find test tokens on pump.fun (many are on devnet)
4. Start with the `--dry-run` flag

## Troubleshooting

### "Insufficient balance"
Make sure your master wallet has enough SOL and run `npm run distribute`

### "Token not found"
Verify the token mint address is correct and the token exists

### "Transaction failed"
- Increase slippage with `--slippage 1000` (10%)
- Increase priority fee in `.env`
- Check RPC rate limits

### "Invalid password"
The encryption password must match what was used to generate wallets

## Legal Disclaimer

This software is for educational purposes only. Trading cryptocurrency involves significant risk. You are solely responsible for any losses incurred. Always do your own research and never invest more than you can afford to lose.

## License

MIT


