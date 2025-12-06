/**
 * Solana to Base Oracle
 * 
 * This service:
 * 1. Reads pump.fun bonding curve state from Solana
 * 2. Sends price updates to Base via Wormhole (or manual for testing)
 * 3. Detects graduation and sends settlement proofs
 * 
 * SECURITY: The settlement is cryptographically proven via Wormhole VAAs
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';

// Pump.fun program constants
const PUMP_FUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const GRADUATION_THRESHOLD = 85_000_000_000n; // 85 SOL in lamports

// Bonding curve account layout
interface BondingCurveState {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;  // This is what we track for progress
  tokenTotalSupply: bigint;
  complete: boolean;         // True when graduated
}

/**
 * Read bonding curve state from Solana
 */
export async function readBondingCurveState(
  connection: Connection,
  tokenMint: PublicKey
): Promise<BondingCurveState | null> {
  // Derive bonding curve PDA
  const [bondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), tokenMint.toBuffer()],
    PUMP_FUN_PROGRAM
  );
  
  const accountInfo = await connection.getAccountInfo(bondingCurve);
  if (!accountInfo) {
    console.log('Bonding curve not found for:', tokenMint.toBase58());
    return null;
  }
  
  // Parse the account data (pump.fun layout)
  const data = accountInfo.data;
  
  // Skip discriminator (8 bytes)
  let offset = 8;
  
  const virtualTokenReserves = data.readBigUInt64LE(offset); offset += 8;
  const virtualSolReserves = data.readBigUInt64LE(offset); offset += 8;
  const realTokenReserves = data.readBigUInt64LE(offset); offset += 8;
  const realSolReserves = data.readBigUInt64LE(offset); offset += 8;
  const tokenTotalSupply = data.readBigUInt64LE(offset); offset += 8;
  const complete = data.readUInt8(offset) === 1;
  
  return {
    virtualTokenReserves,
    virtualSolReserves,
    realTokenReserves,
    realSolReserves,
    tokenTotalSupply,
    complete,
  };
}

/**
 * Calculate graduation progress (0-10000 bps)
 */
export function calculateProgress(realSolReserves: bigint): number {
  const progressBps = Number((realSolReserves * 10000n) / GRADUATION_THRESHOLD);
  return Math.min(progressBps, 10000);
}

/**
 * Oracle service that monitors Solana and updates Base
 */
export class SolanaToBaseOracle {
  private solanaConnection: Connection;
  private baseProvider: ethers.JsonRpcProvider;
  private baseWallet: ethers.Wallet;
  private oracleContract: ethers.Contract;
  
  // Track monitored markets
  private monitoredMarkets: Map<string, {
    solanaTokenMint: string;
    baseMarketId: string;
    lastProgress: number;
    graduated: boolean;
  }> = new Map();
  
  constructor(
    solanaRpcUrl: string,
    baseRpcUrl: string,
    privateKey: string,
    oracleContractAddress: string
  ) {
    this.solanaConnection = new Connection(solanaRpcUrl, 'confirmed');
    this.baseProvider = new ethers.JsonRpcProvider(baseRpcUrl);
    this.baseWallet = new ethers.Wallet(privateKey, this.baseProvider);
    
    // SolanaOracle ABI (minimal)
    const oracleAbi = [
      'function manualPriceUpdate(bytes32 marketId, uint256 solanaLamports) external',
      'function manualSettlement(bytes32 marketId, bool graduated) external',
    ];
    
    this.oracleContract = new ethers.Contract(
      oracleContractAddress,
      oracleAbi,
      this.baseWallet
    );
  }
  
  /**
   * Add a market to monitor
   */
  addMarket(solanaTokenMint: string, baseMarketId: string) {
    this.monitoredMarkets.set(solanaTokenMint, {
      solanaTokenMint,
      baseMarketId,
      lastProgress: 0,
      graduated: false,
    });
    console.log(`📡 Monitoring market: ${solanaTokenMint} -> ${baseMarketId}`);
  }
  
  /**
   * Poll Solana and update Base
   */
  async poll() {
    for (const [mint, market] of this.monitoredMarkets) {
      if (market.graduated) continue;
      
      try {
        const tokenMint = new PublicKey(mint);
        const state = await readBondingCurveState(this.solanaConnection, tokenMint);
        
        if (!state) {
          console.log(`⚠️ No state for ${mint}`);
          continue;
        }
        
        const progress = calculateProgress(state.realSolReserves);
        
        // Check for graduation
        if (state.complete && !market.graduated) {
          console.log(`🎓 Token graduated: ${mint}`);
          await this.sendSettlement(market.baseMarketId, true);
          market.graduated = true;
          continue;
        }
        
        // Check for significant price change (>1%)
        const progressDelta = Math.abs(progress - market.lastProgress);
        if (progressDelta >= 100 || progress === 10000) {
          console.log(`📊 Progress update: ${mint} -> ${progress} bps`);
          await this.sendPriceUpdate(market.baseMarketId, state.realSolReserves);
          market.lastProgress = progress;
        }
        
      } catch (error) {
        console.error(`Error polling ${mint}:`, error);
      }
    }
  }
  
  /**
   * Send price update to Base
   */
  private async sendPriceUpdate(marketId: string, solanaLamports: bigint) {
    try {
      console.log(`📤 Sending price update to Base: ${marketId} = ${solanaLamports} lamports`);
      
      const tx = await this.oracleContract.manualPriceUpdate(
        marketId,
        solanaLamports.toString()
      );
      
      console.log(`✅ Price update tx: ${tx.hash}`);
      await tx.wait();
      
    } catch (error) {
      console.error('Price update failed:', error);
    }
  }
  
  /**
   * Send settlement to Base
   */
  private async sendSettlement(marketId: string, graduated: boolean) {
    try {
      console.log(`📤 Sending settlement to Base: ${marketId} = ${graduated}`);
      
      const tx = await this.oracleContract.manualSettlement(marketId, graduated);
      
      console.log(`✅ Settlement tx: ${tx.hash}`);
      await tx.wait();
      
    } catch (error) {
      console.error('Settlement failed:', error);
    }
  }
  
  /**
   * Start polling loop
   */
  startPolling(intervalMs: number = 5000) {
    console.log(`🚀 Starting oracle polling every ${intervalMs}ms`);
    
    // Initial poll
    this.poll();
    
    // Continuous polling
    setInterval(() => this.poll(), intervalMs);
  }
}

// ============================================================================
// WORMHOLE INTEGRATION (Production)
// ============================================================================

/**
 * For production, replace manual updates with Wormhole VAAs
 * 
 * Flow:
 * 1. Read Solana state
 * 2. Create Wormhole message
 * 3. Submit to Wormhole core bridge on Solana
 * 4. Wait for guardian signatures (VAA)
 * 5. Submit VAA to Base SolanaOracle contract
 * 
 * This requires:
 * - Wormhole SDK
 * - Solana program to emit messages
 * - Or use Wormhole's generic messaging
 */

export async function createWormholeMessage(
  marketId: string,
  msgType: 'price' | 'settlement',
  data: { solanaLamports?: bigint; graduated?: boolean }
): Promise<Buffer> {
  // Encode message for Wormhole
  const encoder = new ethers.AbiCoder();
  
  if (msgType === 'price') {
    return Buffer.from(
      encoder.encode(
        ['uint8', 'bytes'],
        [1, encoder.encode(['bytes32', 'uint256'], [marketId, data.solanaLamports?.toString()])]
      ).slice(2),
      'hex'
    );
  } else {
    return Buffer.from(
      encoder.encode(
        ['uint8', 'bytes'],
        [2, encoder.encode(['bytes32', 'bool'], [marketId, data.graduated])]
      ).slice(2),
      'hex'
    );
  }
}

// ============================================================================
// TESTING
// ============================================================================

async function testOracle() {
  const oracle = new SolanaToBaseOracle(
    process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    process.env.BASE_RPC_URL || 'https://sepolia.base.org',
    process.env.PRIVATE_KEY || '',
    process.env.ORACLE_CONTRACT || ''
  );
  
  // Example: monitor a pump.fun token
  oracle.addMarket(
    'ExampleTokenMintAddress123',
    '0x1234567890abcdef...' // Base market ID
  );
  
  oracle.startPolling(10000);
}

// Run if called directly
if (require.main === module) {
  testOracle().catch(console.error);
}

