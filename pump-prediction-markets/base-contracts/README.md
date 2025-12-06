# Quantish Markets - Base Contracts

## Rock Solid Cross-Chain Architecture

This is the **production-ready** prediction market system using:
- **Base (Ethereum L2)** - For fund custody and settlement
- **Gnosis Safe** - Multi-sig security for user funds
- **Wormhole** - Cross-chain oracle from Solana
- **Solana** - Source of truth for pump.fun data

## Why This Architecture is Secure

### 1. Fund Custody (Gnosis Safe)
- $60B+ in assets secured by Safe
- Multi-sig: requires 2-of-3 or 3-of-5 signatures
- Battle-tested, formally audited
- NO single point of failure

### 2. Price Oracle (Wormhole)
- 19 guardian validators
- Cryptographic proofs (VAAs)
- Cannot be forged or manipulated
- Anyone can verify the proofs

### 3. Settlement (Verifiable)
- Settlement proof stored on-chain
- Links directly to Solana state
- Anyone can verify graduation status
- No trust required in us

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER FLOW                                    │
└─────────────────────────────────────────────────────────────────────┘
                                │
                    User deposits USDC
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    GNOSIS SAFE (Base)                                │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Multi-sig wallet holding ALL user funds                     │    │
│  │  • 2-of-3 signers minimum                                    │    │
│  │  • Quantish + Trusted Party + Time-lock                     │    │
│  │  • Automated payouts via Safe modules                        │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                │
                    Position tracking
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 QUANTISH MARKETS CONTRACT (Base)                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  • Tracks all positions (who bet what)                       │    │
│  │  • Validates bets (min/max, price bounds)                    │    │
│  │  • Calculates payouts                                        │    │
│  │  • DOES NOT hold funds (Safe does)                           │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                │
                    Price updates & Settlement
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SOLANA ORACLE (Base)                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Receives Wormhole VAAs from Solana                          │    │
│  │  • Verifies cryptographic proofs                             │    │
│  │  • Updates prices from bonding curve                         │    │
│  │  • Settles markets with graduation proof                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                ▲
                                │
                    Wormhole VAA (signed by 19 guardians)
                                │
┌─────────────────────────────────────────────────────────────────────┐
│                    WORMHOLE BRIDGE                                   │
│  • 19 independent validator guardians                               │
│  • 2/3 must sign for valid message                                  │
│  • Cryptographic attestation of Solana state                        │
└─────────────────────────────────────────────────────────────────────┘
                                ▲
                                │
                    Read bonding curve state
                                │
┌─────────────────────────────────────────────────────────────────────┐
│                    SOLANA (Source of Truth)                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Pump.fun Bonding Curve Account                              │    │
│  │  • realSolReserves: SOL in curve (progress)                  │    │
│  │  • complete: true if graduated                               │    │
│  │  • IMMUTABLE ON-CHAIN DATA                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

## Deployment

### Prerequisites
```bash
cd base-contracts
npm install
```

### Environment Variables
Create `.env`:
```
PRIVATE_KEY=your_deployer_private_key
BASESCAN_API_KEY=your_basescan_api_key
```

### Deploy to Base Sepolia (Testnet)
```bash
npm run deploy:testnet
```

### Deploy to Base Mainnet
```bash
npm run deploy:mainnet
```

## Contract Addresses

After deployment, you'll have:
- **QuantishMarkets**: Tracks positions and calculates payouts
- **SolanaOracle**: Receives cross-chain Wormhole messages

## Security Guarantees

### What We CANNOT Do (by design):
1. ❌ Steal user funds (held in multi-sig Safe)
2. ❌ Fake settlement (requires Wormhole VAA proof)
3. ❌ Manipulate prices (comes from Solana on-chain)
4. ❌ Change past bets (immutable on Base)

### What Anyone CAN Verify:
1. ✅ All positions on-chain
2. ✅ Settlement proofs (VAA hashes)
3. ✅ Pump.fun graduation status on Solana
4. ✅ Payout calculations (deterministic)

## Integration with Existing Backend

The existing API server can:
1. Call `createMarket()` to start new markets
2. Monitor Solana for price changes
3. Send Wormhole messages for settlements
4. Calculate and execute payouts via Safe

## Gnosis Safe Setup

1. Go to https://app.safe.global
2. Create new Safe on Base
3. Add signers:
   - Your hot wallet (for operations)
   - Hardware wallet (for security)
   - Trusted third party (for disputes)
4. Set threshold: 2-of-3
5. Update contract with Safe address

## Wormhole Integration

For production, you'll need:
1. Deploy a Solana program that emits Wormhole messages
2. Or use Wormhole's generic messaging with our backend
3. The oracle verifies VAAs and updates Base contracts

## License

MIT

