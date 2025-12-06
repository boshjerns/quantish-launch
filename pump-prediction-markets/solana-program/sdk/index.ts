/**
 * Quantish Markets Solana SDK
 * 
 * Client library for interacting with the Quantish prediction markets
 * Solana smart contract.
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";

// Program ID - UPDATE THIS after deployment
export const PROGRAM_ID = new PublicKey("QMkt1111111111111111111111111111111111111111");

// USDC Mint addresses
export const USDC_MINT_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"); // Devnet USDC
export const USDC_MINT_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // Mainnet USDC

// Constants matching the contract
export const BPS_PRECISION = 10_000n;
export const MIN_PRICE_BPS = 100n;
export const MAX_PRICE_BPS = 9_900n;
export const MIN_BET_USDC = 1_000_000n; // $1 in micro USDC

export type Side = "yes" | "no";

export interface MarketData {
  pumpTokenMint: PublicKey;
  authority: PublicKey;
  usdcVault: PublicKey;
  yesPool: bigint;
  noPool: bigint;
  totalYesShares: bigint;
  totalNoShares: bigint;
  progressBps: number;
  startTime: number;
  endTime: number;
  status: "active" | "paused" | "settled" | "cancelled";
  outcome: boolean | null;
}

export interface PositionData {
  user: PublicKey;
  market: PublicKey;
  side: Side;
  shares: bigint;
  costBasis: bigint;
  claimed: boolean;
}

export interface ProtocolData {
  authority: PublicKey;
  treasury: PublicKey;
  feeBps: number;
  totalMarkets: number;
  totalVolume: bigint;
}

export class QuantishMarketsClient {
  private connection: Connection;
  private programId: PublicKey;
  private usdcMint: PublicKey;

  constructor(
    connection: Connection,
    network: "devnet" | "mainnet" = "devnet",
    programId?: PublicKey
  ) {
    this.connection = connection;
    this.programId = programId || PROGRAM_ID;
    this.usdcMint = network === "mainnet" ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;
  }

  // ============================================================================
  // PDA Derivations
  // ============================================================================

  getProtocolPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("protocol")],
      this.programId
    );
  }

  getMarketPda(pumpTokenMint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("market"), pumpTokenMint.toBuffer()],
      this.programId
    );
  }

  getVaultPda(pumpTokenMint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), pumpTokenMint.toBuffer()],
      this.programId
    );
  }

  getPositionPda(marketPda: PublicKey, user: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("position"), marketPda.toBuffer(), user.toBuffer()],
      this.programId
    );
  }

  // ============================================================================
  // Account Fetchers
  // ============================================================================

  async getProtocol(): Promise<ProtocolData | null> {
    const [protocolPda] = this.getProtocolPda();
    const accountInfo = await this.connection.getAccountInfo(protocolPda);
    if (!accountInfo) return null;

    // Decode account data (simplified - use Anchor IDL in production)
    const data = accountInfo.data;
    return {
      authority: new PublicKey(data.slice(8, 40)),
      treasury: new PublicKey(data.slice(40, 72)),
      feeBps: new BN(data.slice(72, 80), "le").toNumber(),
      totalMarkets: new BN(data.slice(80, 88), "le").toNumber(),
      totalVolume: BigInt(new BN(data.slice(88, 96), "le").toString()),
    };
  }

  async getMarket(pumpTokenMint: PublicKey): Promise<MarketData | null> {
    const [marketPda] = this.getMarketPda(pumpTokenMint);
    const accountInfo = await this.connection.getAccountInfo(marketPda);
    if (!accountInfo) return null;

    const data = accountInfo.data;
    const statusByte = data[169];
    const status = ["active", "paused", "settled", "cancelled"][statusByte] as MarketData["status"];
    
    const outcomeByte = data[170];
    const outcome = outcomeByte === 0 ? null : outcomeByte === 1 ? false : true;

    return {
      pumpTokenMint: new PublicKey(data.slice(8, 40)),
      authority: new PublicKey(data.slice(40, 72)),
      usdcVault: new PublicKey(data.slice(72, 104)),
      yesPool: BigInt(new BN(data.slice(104, 112), "le").toString()),
      noPool: BigInt(new BN(data.slice(112, 120), "le").toString()),
      totalYesShares: BigInt(new BN(data.slice(120, 128), "le").toString()),
      totalNoShares: BigInt(new BN(data.slice(128, 136), "le").toString()),
      progressBps: new BN(data.slice(136, 144), "le").toNumber(),
      startTime: new BN(data.slice(144, 152), "le").toNumber(),
      endTime: new BN(data.slice(152, 160), "le").toNumber(),
      status,
      outcome,
    };
  }

  async getPosition(pumpTokenMint: PublicKey, user: PublicKey): Promise<PositionData | null> {
    const [marketPda] = this.getMarketPda(pumpTokenMint);
    const [positionPda] = this.getPositionPda(marketPda, user);
    const accountInfo = await this.connection.getAccountInfo(positionPda);
    if (!accountInfo) return null;

    const data = accountInfo.data;
    const sideByte = data[72];
    
    return {
      user: new PublicKey(data.slice(8, 40)),
      market: new PublicKey(data.slice(40, 72)),
      side: sideByte === 0 ? "yes" : "no",
      shares: BigInt(new BN(data.slice(73, 81), "le").toString()),
      costBasis: BigInt(new BN(data.slice(81, 89), "le").toString()),
      claimed: data[89] === 1,
    };
  }

  // ============================================================================
  // Math Helpers
  // ============================================================================

  /**
   * Calculate shares for a given amount and price
   */
  calculateShares(amountMicroUsdc: bigint, priceBps: bigint): bigint {
    return (amountMicroUsdc * BPS_PRECISION) / priceBps;
  }

  /**
   * Calculate cost for a given number of shares
   */
  calculateCost(shares: bigint, priceBps: bigint): bigint {
    return (shares * priceBps) / BPS_PRECISION;
  }

  /**
   * Calculate potential payout for a winning position
   */
  calculatePotentialPayout(shares: bigint, totalWinningShares: bigint, totalPool: bigint): bigint {
    if (totalWinningShares === 0n) return 0n;
    return (shares * totalPool) / totalWinningShares;
  }

  /**
   * Calculate YES/NO prices from progress
   */
  getPrices(progressBps: number): { yes: number; no: number } {
    return {
      yes: progressBps / 10000,
      no: (10000 - progressBps) / 10000,
    };
  }

  // ============================================================================
  // Transaction Builders
  // ============================================================================

  /**
   * Build instruction to place a bet
   */
  async buildPlaceBetInstruction(
    user: PublicKey,
    pumpTokenMint: PublicKey,
    side: Side,
    amountMicroUsdc: bigint
  ): Promise<TransactionInstruction> {
    const [protocolPda] = this.getProtocolPda();
    const [marketPda] = this.getMarketPda(pumpTokenMint);
    const [vaultPda] = this.getVaultPda(pumpTokenMint);
    const [positionPda] = this.getPositionPda(marketPda, user);
    
    const userUsdc = await getAssociatedTokenAddress(this.usdcMint, user);

    // Build instruction data
    // Discriminator for place_bet + side (1 byte) + amount (8 bytes)
    const discriminator = Buffer.from([/* place_bet discriminator */]);
    const sideData = Buffer.from([side === "yes" ? 0 : 1]);
    const amountData = Buffer.alloc(8);
    amountData.writeBigUInt64LE(amountMicroUsdc);

    const data = Buffer.concat([discriminator, sideData, amountData]);

    return new TransactionInstruction({
      keys: [
        { pubkey: protocolPda, isSigner: false, isWritable: true },
        { pubkey: marketPda, isSigner: false, isWritable: true },
        { pubkey: positionPda, isSigner: false, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: true },
        { pubkey: userUsdc, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
    });
  }

  /**
   * Build instruction to claim winnings
   */
  async buildClaimWinningsInstruction(
    user: PublicKey,
    pumpTokenMint: PublicKey,
    treasury: PublicKey
  ): Promise<TransactionInstruction> {
    const [protocolPda] = this.getProtocolPda();
    const [marketPda] = this.getMarketPda(pumpTokenMint);
    const [vaultPda] = this.getVaultPda(pumpTokenMint);
    const [positionPda] = this.getPositionPda(marketPda, user);
    
    const userUsdc = await getAssociatedTokenAddress(this.usdcMint, user);

    const discriminator = Buffer.from([/* claim_winnings discriminator */]);

    return new TransactionInstruction({
      keys: [
        { pubkey: protocolPda, isSigner: false, isWritable: false },
        { pubkey: marketPda, isSigner: false, isWritable: false },
        { pubkey: positionPda, isSigner: false, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: true },
        { pubkey: userUsdc, isSigner: false, isWritable: true },
        { pubkey: treasury, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: discriminator,
    });
  }

  // ============================================================================
  // Convenience Methods
  // ============================================================================

  /**
   * Get all active markets
   */
  async getActiveMarkets(): Promise<{ mint: PublicKey; data: MarketData }[]> {
    // In production, use getProgramAccounts with filters
    // This is a simplified version
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      filters: [
        { dataSize: 180 }, // Market account size
      ],
    });

    const markets: { mint: PublicKey; data: MarketData }[] = [];
    
    for (const account of accounts) {
      try {
        const data = account.account.data;
        const statusByte = data[169];
        
        if (statusByte === 0) { // Active
          const mint = new PublicKey(data.slice(8, 40));
          const marketData = await this.getMarket(mint);
          if (marketData) {
            markets.push({ mint, data: marketData });
          }
        }
      } catch (e) {
        // Skip invalid accounts
      }
    }

    return markets;
  }

  /**
   * Get user's positions across all markets
   */
  async getUserPositions(user: PublicKey): Promise<{ mint: PublicKey; position: PositionData }[]> {
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      filters: [
        { dataSize: 100 }, // Position account size
        {
          memcmp: {
            offset: 8, // After discriminator
            bytes: user.toBase58(),
          },
        },
      ],
    });

    const positions: { mint: PublicKey; position: PositionData }[] = [];

    for (const account of accounts) {
      try {
        const data = account.account.data;
        const marketPda = new PublicKey(data.slice(40, 72));
        
        // Fetch market to get mint
        const marketInfo = await this.connection.getAccountInfo(marketPda);
        if (marketInfo) {
          const mint = new PublicKey(marketInfo.data.slice(8, 40));
          const position = await this.getPosition(mint, user);
          if (position) {
            positions.push({ mint, position });
          }
        }
      } catch (e) {
        // Skip invalid accounts
      }
    }

    return positions;
  }
}

// Export default instance factory
export function createClient(
  rpcUrl: string,
  network: "devnet" | "mainnet" = "devnet"
): QuantishMarketsClient {
  const connection = new Connection(rpcUrl, "confirmed");
  return new QuantishMarketsClient(connection, network);
}

