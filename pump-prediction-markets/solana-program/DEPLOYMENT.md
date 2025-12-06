# Solana Contract Deployment Guide

## Prerequisites

The Solana development tools are not available on Windows natively. You have several options:

### Option 1: WSL (Windows Subsystem for Linux) - Recommended

1. Install WSL:
```powershell
wsl --install
```

2. Open Ubuntu/WSL and install dependencies:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest

# Verify installations
solana --version
anchor --version
```

### Option 2: Linux/Mac Machine

Use a cloud VM, separate Linux machine, or Mac to deploy.

### Option 3: GitHub Actions (CI/CD)

Create a deployment workflow that builds and deploys on Linux.

## Deployment Steps

### 1. Configure Solana

```bash
# Set network (devnet for testing)
solana config set --url devnet

# Create deployer keypair (save this securely!)
solana-keygen new -o ~/.config/solana/deployer.json

# Get the public key
solana address -k ~/.config/solana/deployer.json

# For devnet - airdrop SOL
solana airdrop 5 -k ~/.config/solana/deployer.json
```

### 2. Build the Program

```bash
cd pump-prediction-markets/solana-program

# Build
anchor build

# Get the program ID
solana address -k target/deploy/quantish_markets-keypair.json
```

### 3. Update Program ID

Replace the placeholder ID in these files:
- `programs/quantish_markets/src/lib.rs` - `declare_id!("...")`
- `Anchor.toml` - `[programs.devnet]`
- `sdk/index.ts` - `PROGRAM_ID`

```bash
# Rebuild with correct ID
anchor build
```

### 4. Deploy

```bash
# Deploy to devnet
anchor deploy --provider.cluster devnet

# Or deploy to mainnet (requires real SOL)
anchor deploy --provider.cluster mainnet
```

### 5. Initialize Protocol

```typescript
import { createClient } from './sdk';
import { Keypair, Connection } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';

const connection = new Connection('https://api.devnet.solana.com');
const wallet = Keypair.fromSecretKey(/* your deployer key */);

const provider = new anchor.AnchorProvider(
  connection,
  new anchor.Wallet(wallet),
  { commitment: 'confirmed' }
);

const program = /* load program with IDL */;

// Initialize with 1% fee
await program.methods
  .initializeProtocol(new anchor.BN(100))
  .accounts({
    protocol: protocolPda,
    treasury: treasuryPubkey,
    authority: wallet.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

console.log('Protocol initialized!');
```

## Post-Deployment Checklist

- [ ] Program deployed and verified
- [ ] Program ID updated in all files
- [ ] Protocol initialized with correct treasury
- [ ] Test market creation works
- [ ] Test bet placement works
- [ ] Test settlement works
- [ ] SDK updated with correct program ID
- [ ] Backend integration tested

## Mainnet Deployment Considerations

1. **Audit** - Get the contract audited before mainnet
2. **Multisig** - Use a multisig for protocol authority
3. **Gradual rollout** - Start with low limits
4. **Monitoring** - Set up transaction monitoring
5. **Backup keys** - Securely store all keypairs

## Costs

Approximate deployment costs:
- **Devnet**: Free (uses airdrop SOL)
- **Mainnet**: ~3 SOL for deployment + rent

## Troubleshooting

### "Account not found"
- Make sure you have enough SOL for rent
- Check the program ID is correct

### "Transaction simulation failed"
- Verify all PDAs are derived correctly
- Check account ownership and permissions

### "Anchor build failed"
- Update Rust: `rustup update`
- Clear cache: `anchor clean`
- Check Anchor version matches Cargo.toml

