import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { QuantishMarkets } from "../target/types/quantish_markets";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("quantish_markets", () => {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.QuantishMarkets as Program<QuantishMarkets>;
  const wallet = provider.wallet as anchor.Wallet;

  // Test accounts
  let usdcMint: PublicKey;
  let treasuryUsdc: PublicKey;
  let userUsdc: PublicKey;
  let protocolPda: PublicKey;
  let protocolBump: number;

  // Test pump token (simulated)
  const pumpTokenMint = Keypair.generate().publicKey;

  before(async () => {
    // Create USDC mint
    usdcMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6 // 6 decimals like real USDC
    );

    // Create treasury USDC account
    treasuryUsdc = await createAccount(
      provider.connection,
      wallet.payer,
      usdcMint,
      wallet.publicKey
    );

    // Create user USDC account and mint some tokens
    userUsdc = await createAccount(
      provider.connection,
      wallet.payer,
      usdcMint,
      wallet.publicKey
    );

    // Mint 1000 USDC to user
    await mintTo(
      provider.connection,
      wallet.payer,
      usdcMint,
      userUsdc,
      wallet.publicKey,
      1000_000_000 // 1000 USDC
    );

    // Derive protocol PDA
    [protocolPda, protocolBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol")],
      program.programId
    );
  });

  it("Initializes the protocol", async () => {
    const feeBps = new anchor.BN(100); // 1% fee

    await program.methods
      .initializeProtocol(feeBps)
      .accounts({
        protocol: protocolPda,
        treasury: treasuryUsdc,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const protocol = await program.account.protocol.fetch(protocolPda);
    expect(protocol.authority.toString()).to.equal(wallet.publicKey.toString());
    expect(protocol.treasury.toString()).to.equal(treasuryUsdc.toString());
    expect(protocol.feeBps.toNumber()).to.equal(100);
    expect(protocol.totalMarkets.toNumber()).to.equal(0);
    expect(protocol.totalVolume.toNumber()).to.equal(0);
  });

  describe("Market Operations", () => {
    let marketPda: PublicKey;
    let marketBump: number;
    let vaultPda: PublicKey;
    let vaultBump: number;
    let positionPda: PublicKey;

    before(async () => {
      // Derive market PDA
      [marketPda, marketBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), pumpTokenMint.toBuffer()],
        program.programId
      );

      // Derive vault PDA
      [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), pumpTokenMint.toBuffer()],
        program.programId
      );

      // Derive position PDA
      [positionPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("position"),
          marketPda.toBuffer(),
          wallet.publicKey.toBuffer(),
        ],
        program.programId
      );
    });

    it("Creates a market", async () => {
      const initialProgressBps = new anchor.BN(5000); // 50%

      await program.methods
        .createMarket(pumpTokenMint, initialProgressBps)
        .accounts({
          protocol: protocolPda,
          market: marketPda,
          usdcVault: vaultPda,
          usdcMint: usdcMint,
          authority: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      const market = await program.account.market.fetch(marketPda);
      expect(market.pumpTokenMint.toString()).to.equal(pumpTokenMint.toString());
      expect(market.progressBps.toNumber()).to.equal(5000);
      expect(market.yesPool.toNumber()).to.equal(0);
      expect(market.noPool.toNumber()).to.equal(0);
      expect(market.status).to.deep.equal({ active: {} });

      const protocol = await program.account.protocol.fetch(protocolPda);
      expect(protocol.totalMarkets.toNumber()).to.equal(1);
    });

    it("Places a YES bet", async () => {
      const betAmount = new anchor.BN(10_000_000); // $10 USDC

      await program.methods
        .placeBet({ yes: {} }, betAmount)
        .accounts({
          protocol: protocolPda,
          market: marketPda,
          position: positionPda,
          usdcVault: vaultPda,
          userUsdc: userUsdc,
          user: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const market = await program.account.market.fetch(marketPda);
      expect(market.yesPool.toNumber()).to.equal(10_000_000);
      expect(market.noPool.toNumber()).to.equal(0);

      const position = await program.account.position.fetch(positionPda);
      expect(position.side).to.deep.equal({ yes: {} });
      expect(position.costBasis.toNumber()).to.equal(10_000_000);
      // shares = (10_000_000 * 10000) / 5000 = 20_000_000
      expect(position.shares.toNumber()).to.equal(20_000_000);

      const protocol = await program.account.protocol.fetch(protocolPda);
      expect(protocol.totalVolume.toNumber()).to.equal(10_000_000);
    });

    it("Updates market price", async () => {
      const newProgressBps = new anchor.BN(7500); // 75%

      await program.methods
        .updatePrice(newProgressBps)
        .accounts({
          protocol: protocolPda,
          market: marketPda,
          authority: wallet.publicKey,
        })
        .rpc();

      const market = await program.account.market.fetch(marketPda);
      expect(market.progressBps.toNumber()).to.equal(7500);
    });

    it("Fails to place bet with invalid price", async () => {
      const betAmount = new anchor.BN(1_000_000);

      // Create a new market with invalid initial price
      const badPumpMint = Keypair.generate().publicKey;
      const [badMarketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), badPumpMint.toBuffer()],
        program.programId
      );
      const [badVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), badPumpMint.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .createMarket(badPumpMint, new anchor.BN(10000)) // 100% - invalid
          .accounts({
            protocol: protocolPda,
            market: badMarketPda,
            usdcVault: badVaultPda,
            usdcMint: usdcMint,
            authority: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .rpc();
        expect.fail("Should have thrown InvalidPrice error");
      } catch (err) {
        expect(err.message).to.contain("InvalidPrice");
      }
    });

    it("Fails to bet below minimum", async () => {
      try {
        await program.methods
          .placeBet({ yes: {} }, new anchor.BN(100_000)) // $0.10 - too small
          .accounts({
            protocol: protocolPda,
            market: marketPda,
            position: positionPda,
            usdcVault: vaultPda,
            userUsdc: userUsdc,
            user: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have thrown BetTooSmall error");
      } catch (err) {
        expect(err.message).to.contain("BetTooSmall");
      }
    });

    it("Pauses and resumes market", async () => {
      await program.methods
        .pauseMarket()
        .accounts({
          protocol: protocolPda,
          market: marketPda,
          authority: wallet.publicKey,
        })
        .rpc();

      let market = await program.account.market.fetch(marketPda);
      expect(market.status).to.deep.equal({ paused: {} });

      await program.methods
        .resumeMarket()
        .accounts({
          protocol: protocolPda,
          market: marketPda,
          authority: wallet.publicKey,
        })
        .rpc();

      market = await program.account.market.fetch(marketPda);
      expect(market.status).to.deep.equal({ active: {} });
    });
  });

  describe("Settlement and Claims", () => {
    let marketPda: PublicKey;
    let vaultPda: PublicKey;
    let positionPda: PublicKey;
    const settlementPumpMint = Keypair.generate().publicKey;

    before(async () => {
      // Derive PDAs
      [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), settlementPumpMint.toBuffer()],
        program.programId
      );
      [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), settlementPumpMint.toBuffer()],
        program.programId
      );
      [positionPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("position"),
          marketPda.toBuffer(),
          wallet.publicKey.toBuffer(),
        ],
        program.programId
      );

      // Create market
      await program.methods
        .createMarket(settlementPumpMint, new anchor.BN(5000))
        .accounts({
          protocol: protocolPda,
          market: marketPda,
          usdcVault: vaultPda,
          usdcMint: usdcMint,
          authority: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      // Place bet
      await program.methods
        .placeBet({ yes: {} }, new anchor.BN(50_000_000)) // $50
        .accounts({
          protocol: protocolPda,
          market: marketPda,
          position: positionPda,
          usdcVault: vaultPda,
          userUsdc: userUsdc,
          user: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("Fails to settle before end time", async () => {
      try {
        await program.methods
          .settleMarket(true)
          .accounts({
            protocol: protocolPda,
            market: marketPda,
            authority: wallet.publicKey,
          })
          .rpc();
        expect.fail("Should have thrown MarketNotExpired error");
      } catch (err) {
        expect(err.message).to.contain("MarketNotExpired");
      }
    });

    // Note: Full settlement tests would require time manipulation
    // or setting up a market with past end_time
  });

  describe("Edge Cases", () => {
    it("Prevents non-authority from settling", async () => {
      const [testMarketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), pumpTokenMint.toBuffer()],
        program.programId
      );

      const fakeAuthority = Keypair.generate();

      try {
        await program.methods
          .settleMarket(true)
          .accounts({
            protocol: protocolPda,
            market: testMarketPda,
            authority: fakeAuthority.publicKey,
          })
          .signers([fakeAuthority])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err.message).to.contain("ConstraintHasOne");
      }
    });

    it("Handles maximum bet size", async () => {
      const maxBetMint = Keypair.generate().publicKey;
      const [maxMarketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), maxBetMint.toBuffer()],
        program.programId
      );
      const [maxVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), maxBetMint.toBuffer()],
        program.programId
      );
      const [maxPositionPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("position"),
          maxMarketPda.toBuffer(),
          wallet.publicKey.toBuffer(),
        ],
        program.programId
      );

      // Create market
      await program.methods
        .createMarket(maxBetMint, new anchor.BN(5000))
        .accounts({
          protocol: protocolPda,
          market: maxMarketPda,
          usdcVault: maxVaultPda,
          usdcMint: usdcMint,
          authority: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      // Mint more USDC for large bet test
      const largeUserUsdc = await createAccount(
        provider.connection,
        wallet.payer,
        usdcMint,
        wallet.publicKey
      );
      await mintTo(
        provider.connection,
        wallet.payer,
        usdcMint,
        largeUserUsdc,
        wallet.publicKey,
        1_000_000_000_000 // 1M USDC
      );

      // Place large bet
      const largeBet = new anchor.BN(100_000_000_000); // $100,000
      await program.methods
        .placeBet({ yes: {} }, largeBet)
        .accounts({
          protocol: protocolPda,
          market: maxMarketPda,
          position: maxPositionPda,
          usdcVault: maxVaultPda,
          userUsdc: largeUserUsdc,
          user: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const position = await program.account.position.fetch(maxPositionPda);
      // shares = (100_000_000_000 * 10000) / 5000 = 200_000_000_000
      expect(position.shares.toNumber()).to.equal(200_000_000_000);
    });
  });
});

