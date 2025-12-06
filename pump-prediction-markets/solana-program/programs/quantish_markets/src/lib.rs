use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};

declare_id!("Hup1Acc33SmS6GttJmYLUfprFEPE97ojG4FTNdHE2h8u");

// ============================================================================
// CONSTANTS
// ============================================================================

/// 85 SOL graduation threshold in lamports (pump.fun standard)
pub const GRADUATION_THRESHOLD_LAMPORTS: u64 = 85_000_000_000;

/// Basis points precision (10000 = 100%)
pub const BPS_PRECISION: u64 = 10_000;

/// USDC decimals (6 decimal places)
pub const USDC_DECIMALS: u8 = 6;

/// Minimum price in BPS (1% = $0.01)
pub const MIN_PRICE_BPS: u64 = 100;

/// Maximum price in BPS (99% = $0.99)
pub const MAX_PRICE_BPS: u64 = 9_900;

/// Market duration: 30 minutes in seconds
pub const MARKET_DURATION_SECONDS: i64 = 30 * 60;

/// Protocol fee in BPS (1% = 100 BPS)
pub const PROTOCOL_FEE_BPS: u64 = 100;

// ============================================================================
// PROGRAM
// ============================================================================

#[program]
pub mod quantish_markets {
    use super::*;

    /// Initialize the protocol with admin settings
    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        fee_bps: u64,
    ) -> Result<()> {
        require!(fee_bps <= 1000, QuantishError::FeeTooHigh); // Max 10%
        
        let protocol = &mut ctx.accounts.protocol;
        protocol.authority = ctx.accounts.authority.key();
        protocol.treasury = ctx.accounts.treasury.key();
        protocol.fee_bps = fee_bps;
        protocol.total_markets = 0;
        protocol.total_volume = 0;
        protocol.bump = ctx.bumps.protocol;
        
        emit!(ProtocolInitialized {
            authority: protocol.authority,
            treasury: protocol.treasury,
            fee_bps,
        });
        
        Ok(())
    }

    /// Create a new prediction market for a pump.fun token
    pub fn create_market(
        ctx: Context<CreateMarket>,
        pump_token_mint: Pubkey,
        initial_progress_bps: u64,
    ) -> Result<()> {
        require!(
            initial_progress_bps >= MIN_PRICE_BPS && initial_progress_bps <= MAX_PRICE_BPS,
            QuantishError::InvalidPrice
        );
        
        let clock = Clock::get()?;
        let market = &mut ctx.accounts.market;
        
        market.pump_token_mint = pump_token_mint;
        market.authority = ctx.accounts.authority.key();
        market.usdc_vault = ctx.accounts.usdc_vault.key();
        market.yes_pool = 0;
        market.no_pool = 0;
        market.total_yes_shares = 0;
        market.total_no_shares = 0;
        market.progress_bps = initial_progress_bps;
        market.start_time = clock.unix_timestamp;
        market.end_time = clock.unix_timestamp + MARKET_DURATION_SECONDS;
        market.status = MarketStatus::Active;
        market.outcome = None;
        market.bump = ctx.bumps.market;
        market.vault_bump = ctx.bumps.usdc_vault;
        
        // Increment protocol stats
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_markets += 1;
        
        emit!(MarketCreated {
            market: ctx.accounts.market.key(),
            pump_token_mint,
            start_time: market.start_time,
            end_time: market.end_time,
            initial_price_bps: initial_progress_bps,
        });
        
        Ok(())
    }

    /// Place a bet on a market (YES or NO)
    pub fn place_bet(
        ctx: Context<PlaceBet>,
        side: Side,
        amount: u64,
    ) -> Result<()> {
        require!(amount >= 1_000_000, QuantishError::BetTooSmall); // Min $1 USDC
        
        let market = &ctx.accounts.market;
        let clock = Clock::get()?;
        
        // Validate market is active
        require!(
            market.status == MarketStatus::Active,
            QuantishError::MarketNotActive
        );
        require!(
            clock.unix_timestamp < market.end_time,
            QuantishError::MarketExpired
        );
        
        // Calculate shares based on current price
        let price_bps = match side {
            Side::Yes => market.progress_bps,
            Side::No => BPS_PRECISION - market.progress_bps,
        };
        
        // shares = (amount * BPS_PRECISION) / price_bps
        // This gives shares in USDC micro units
        let shares = amount
            .checked_mul(BPS_PRECISION)
            .ok_or(QuantishError::MathOverflow)?
            .checked_div(price_bps)
            .ok_or(QuantishError::MathOverflow)?;
        
        require!(shares > 0, QuantishError::SharesTooSmall);
        
        // Transfer USDC from user to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_usdc.to_account_info(),
            to: ctx.accounts.usdc_vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;
        
        // Update market pools
        let market = &mut ctx.accounts.market;
        match side {
            Side::Yes => {
                market.yes_pool = market.yes_pool.checked_add(amount).ok_or(QuantishError::MathOverflow)?;
                market.total_yes_shares = market.total_yes_shares.checked_add(shares).ok_or(QuantishError::MathOverflow)?;
            }
            Side::No => {
                market.no_pool = market.no_pool.checked_add(amount).ok_or(QuantishError::MathOverflow)?;
                market.total_no_shares = market.total_no_shares.checked_add(shares).ok_or(QuantishError::MathOverflow)?;
            }
        }
        
        // Update or create position
        let position = &mut ctx.accounts.position;
        if position.shares == 0 {
            // New position
            position.user = ctx.accounts.user.key();
            position.market = ctx.accounts.market.key();
            position.side = side;
            position.shares = shares;
            position.cost_basis = amount;
            position.claimed = false;
            position.bump = ctx.bumps.position;
        } else {
            // Existing position - must be same side
            require!(position.side == side, QuantishError::CannotSwitchSides);
            position.shares = position.shares.checked_add(shares).ok_or(QuantishError::MathOverflow)?;
            position.cost_basis = position.cost_basis.checked_add(amount).ok_or(QuantishError::MathOverflow)?;
        }
        
        // Update protocol volume
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_volume = protocol.total_volume.checked_add(amount).ok_or(QuantishError::MathOverflow)?;
        
        emit!(BetPlaced {
            market: ctx.accounts.market.key(),
            user: ctx.accounts.user.key(),
            side,
            amount,
            shares,
            price_bps,
        });
        
        Ok(())
    }

    /// Update market price based on pump.fun bonding curve progress
    /// Only callable by authorized oracle/admin
    pub fn update_price(
        ctx: Context<UpdatePrice>,
        new_progress_bps: u64,
    ) -> Result<()> {
        require!(
            new_progress_bps >= MIN_PRICE_BPS && new_progress_bps <= MAX_PRICE_BPS,
            QuantishError::InvalidPrice
        );
        
        let market = &mut ctx.accounts.market;
        require!(
            market.status == MarketStatus::Active,
            QuantishError::MarketNotActive
        );
        
        let old_price = market.progress_bps;
        market.progress_bps = new_progress_bps;
        
        emit!(PriceUpdated {
            market: ctx.accounts.market.key(),
            old_price_bps: old_price,
            new_price_bps: new_progress_bps,
        });
        
        Ok(())
    }

    /// Settle a market based on pump.fun graduation status
    pub fn settle_market(
        ctx: Context<SettleMarket>,
        graduated: bool,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let clock = Clock::get()?;
        
        require!(
            market.status == MarketStatus::Active,
            QuantishError::MarketNotActive
        );
        require!(
            clock.unix_timestamp >= market.end_time,
            QuantishError::MarketNotExpired
        );
        
        market.status = MarketStatus::Settled;
        market.outcome = Some(graduated);
        
        emit!(MarketSettled {
            market: ctx.accounts.market.key(),
            outcome: graduated,
            yes_pool: market.yes_pool,
            no_pool: market.no_pool,
        });
        
        Ok(())
    }

    /// Claim winnings from a settled market
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let market = &ctx.accounts.market;
        let position = &ctx.accounts.position;
        
        require!(
            market.status == MarketStatus::Settled,
            QuantishError::MarketNotSettled
        );
        require!(!position.claimed, QuantishError::AlreadyClaimed);
        
        let outcome = market.outcome.ok_or(QuantishError::NoOutcome)?;
        
        // Determine if position won
        let is_winner = match (position.side, outcome) {
            (Side::Yes, true) => true,
            (Side::No, false) => true,
            _ => false,
        };
        
        let payout: u64;
        if is_winner {
            // Winner gets their shares back as full dollars
            // shares represent potential payout at $1 per share
            let total_pool = market.yes_pool
                .checked_add(market.no_pool)
                .ok_or(QuantishError::MathOverflow)?;
            
            let winning_shares = if outcome {
                market.total_yes_shares
            } else {
                market.total_no_shares
            };
            
            // Payout = (position.shares / winning_shares) * total_pool
            // Using u128 for intermediate calculation to prevent overflow
            let payout_u128 = (position.shares as u128)
                .checked_mul(total_pool as u128)
                .ok_or(QuantishError::MathOverflow)?
                .checked_div(winning_shares as u128)
                .ok_or(QuantishError::MathOverflow)?;
            
            payout = u64::try_from(payout_u128).map_err(|_| QuantishError::MathOverflow)?;
        } else {
            // Losers get nothing
            payout = 0;
        }
        
        if payout > 0 {
            // Calculate protocol fee
            let fee = payout
                .checked_mul(ctx.accounts.protocol.fee_bps)
                .ok_or(QuantishError::MathOverflow)?
                .checked_div(BPS_PRECISION)
                .ok_or(QuantishError::MathOverflow)?;
            
            let user_payout = payout.checked_sub(fee).ok_or(QuantishError::MathOverflow)?;
            
            // Transfer from vault to user
            let market_key = market.pump_token_mint;
            let seeds = &[
                b"vault",
                market_key.as_ref(),
                &[market.vault_bump],
            ];
            let signer_seeds = &[&seeds[..]];
            
            // Transfer user payout
            let cpi_accounts = Transfer {
                from: ctx.accounts.usdc_vault.to_account_info(),
                to: ctx.accounts.user_usdc.to_account_info(),
                authority: ctx.accounts.usdc_vault.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
            token::transfer(cpi_ctx, user_payout)?;
            
            // Transfer fee to treasury
            if fee > 0 {
                let cpi_accounts_fee = Transfer {
                    from: ctx.accounts.usdc_vault.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                    authority: ctx.accounts.usdc_vault.to_account_info(),
                };
                let cpi_program_fee = ctx.accounts.token_program.to_account_info();
                let cpi_ctx_fee = CpiContext::new_with_signer(cpi_program_fee, cpi_accounts_fee, signer_seeds);
                token::transfer(cpi_ctx_fee, fee)?;
            }
        }
        
        // Mark position as claimed
        let position = &mut ctx.accounts.position;
        position.claimed = true;
        
        emit!(WinningsClaimed {
            market: ctx.accounts.market.key(),
            user: ctx.accounts.user.key(),
            payout,
            is_winner,
        });
        
        Ok(())
    }

    /// Emergency pause a market (admin only)
    pub fn pause_market(ctx: Context<AdminAction>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(
            market.status == MarketStatus::Active,
            QuantishError::MarketNotActive
        );
        
        market.status = MarketStatus::Paused;
        
        emit!(MarketPaused {
            market: ctx.accounts.market.key(),
        });
        
        Ok(())
    }

    /// Resume a paused market (admin only)
    pub fn resume_market(ctx: Context<AdminAction>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(
            market.status == MarketStatus::Paused,
            QuantishError::MarketNotPaused
        );
        
        market.status = MarketStatus::Active;
        
        emit!(MarketResumed {
            market: ctx.accounts.market.key(),
        });
        
        Ok(())
    }

    /// Refund all positions if market is cancelled (admin only)
    pub fn cancel_market(ctx: Context<AdminAction>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(
            market.status == MarketStatus::Active || market.status == MarketStatus::Paused,
            QuantishError::CannotCancel
        );
        
        market.status = MarketStatus::Cancelled;
        
        emit!(MarketCancelled {
            market: ctx.accounts.market.key(),
        });
        
        Ok(())
    }

    /// Claim refund from a cancelled market
    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        let market = &ctx.accounts.market;
        let position = &ctx.accounts.position;
        
        require!(
            market.status == MarketStatus::Cancelled,
            QuantishError::MarketNotCancelled
        );
        require!(!position.claimed, QuantishError::AlreadyClaimed);
        
        let refund_amount = position.cost_basis;
        
        if refund_amount > 0 {
            // Transfer from vault to user
            let market_key = market.pump_token_mint;
            let seeds = &[
                b"vault",
                market_key.as_ref(),
                &[market.vault_bump],
            ];
            let signer_seeds = &[&seeds[..]];
            
            let cpi_accounts = Transfer {
                from: ctx.accounts.usdc_vault.to_account_info(),
                to: ctx.accounts.user_usdc.to_account_info(),
                authority: ctx.accounts.usdc_vault.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
            token::transfer(cpi_ctx, refund_amount)?;
        }
        
        // Mark position as claimed
        let position = &mut ctx.accounts.position;
        position.claimed = true;
        
        emit!(RefundClaimed {
            market: ctx.accounts.market.key(),
            user: ctx.accounts.user.key(),
            amount: refund_amount,
        });
        
        Ok(())
    }
}

// ============================================================================
// ACCOUNTS
// ============================================================================

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Protocol::INIT_SPACE,
        seeds = [b"protocol"],
        bump
    )]
    pub protocol: Account<'info, Protocol>,
    
    /// CHECK: Treasury account for protocol fees
    pub treasury: AccountInfo<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(pump_token_mint: Pubkey)]
pub struct CreateMarket<'info> {
    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol.bump,
    )]
    pub protocol: Account<'info, Protocol>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", pump_token_mint.as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    
    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = usdc_vault,
        seeds = [b"vault", pump_token_mint.as_ref()],
        bump
    )]
    pub usdc_vault: Account<'info, TokenAccount>,
    
    pub usdc_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol.bump,
    )]
    pub protocol: Account<'info, Protocol>,
    
    #[account(
        mut,
        seeds = [b"market", market.pump_token_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
    
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    
    #[account(
        mut,
        seeds = [b"vault", market.pump_token_mint.as_ref()],
        bump = market.vault_bump,
    )]
    pub usdc_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = user_usdc.owner == user.key(),
        constraint = user_usdc.mint == usdc_vault.mint,
    )]
    pub user_usdc: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = authority,
    )]
    pub protocol: Account<'info, Protocol>,
    
    #[account(
        mut,
        seeds = [b"market", market.pump_token_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = authority,
    )]
    pub protocol: Account<'info, Protocol>,
    
    #[account(
        mut,
        seeds = [b"market", market.pump_token_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump,
    )]
    pub protocol: Account<'info, Protocol>,
    
    #[account(
        seeds = [b"market", market.pump_token_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
    
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump = position.bump,
        has_one = user,
    )]
    pub position: Account<'info, Position>,
    
    #[account(
        mut,
        seeds = [b"vault", market.pump_token_mint.as_ref()],
        bump = market.vault_bump,
    )]
    pub usdc_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = user_usdc.owner == user.key(),
    )]
    pub user_usdc: Account<'info, TokenAccount>,
    
    /// CHECK: Treasury account for protocol fees
    #[account(
        mut,
        constraint = treasury.key() == protocol.treasury,
    )]
    pub treasury: AccountInfo<'info>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdminAction<'info> {
    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = authority,
    )]
    pub protocol: Account<'info, Protocol>,
    
    #[account(
        mut,
        seeds = [b"market", market.pump_token_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump,
    )]
    pub protocol: Account<'info, Protocol>,
    
    #[account(
        seeds = [b"market", market.pump_token_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
    
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump = position.bump,
        has_one = user,
    )]
    pub position: Account<'info, Position>,
    
    #[account(
        mut,
        seeds = [b"vault", market.pump_token_mint.as_ref()],
        bump = market.vault_bump,
    )]
    pub usdc_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = user_usdc.owner == user.key(),
    )]
    pub user_usdc: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

// ============================================================================
// STATE
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct Protocol {
    /// Admin authority
    pub authority: Pubkey,
    /// Treasury for fees
    pub treasury: Pubkey,
    /// Protocol fee in BPS
    pub fee_bps: u64,
    /// Total markets created
    pub total_markets: u64,
    /// Total volume in USDC
    pub total_volume: u64,
    /// PDA bump
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    /// The pump.fun token this market is tracking
    pub pump_token_mint: Pubkey,
    /// Market creator/authority
    pub authority: Pubkey,
    /// USDC vault for this market
    pub usdc_vault: Pubkey,
    /// Total USDC in YES pool
    pub yes_pool: u64,
    /// Total USDC in NO pool
    pub no_pool: u64,
    /// Total YES shares issued
    pub total_yes_shares: u64,
    /// Total NO shares issued
    pub total_no_shares: u64,
    /// Current price/progress in BPS (1-99%)
    pub progress_bps: u64,
    /// Market start timestamp
    pub start_time: i64,
    /// Market end timestamp (30 min from start)
    pub end_time: i64,
    /// Market status
    pub status: MarketStatus,
    /// Final outcome (Some(true) = graduated, Some(false) = didn't graduate)
    pub outcome: Option<bool>,
    /// PDA bump
    pub bump: u8,
    /// Vault PDA bump
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    /// Owner of this position
    pub user: Pubkey,
    /// Market this position is in
    pub market: Pubkey,
    /// Side (YES or NO)
    pub side: Side,
    /// Number of shares owned
    pub shares: u64,
    /// Total cost basis in USDC
    pub cost_basis: u64,
    /// Whether winnings have been claimed
    pub claimed: bool,
    /// PDA bump
    pub bump: u8,
}

// ============================================================================
// ENUMS
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Side {
    Yes,
    No,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default)]
pub enum MarketStatus {
    #[default]
    Active,
    Paused,
    Settled,
    Cancelled,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum QuantishError {
    #[msg("Price must be between 1% and 99%")]
    InvalidPrice,
    #[msg("Market is not active")]
    MarketNotActive,
    #[msg("Market has not expired yet")]
    MarketNotExpired,
    #[msg("Market has expired")]
    MarketExpired,
    #[msg("Market is not settled")]
    MarketNotSettled,
    #[msg("Market is not paused")]
    MarketNotPaused,
    #[msg("Market is not cancelled")]
    MarketNotCancelled,
    #[msg("Cannot cancel this market")]
    CannotCancel,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("No outcome set")]
    NoOutcome,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Minimum bet is $1 USDC")]
    BetTooSmall,
    #[msg("Shares calculation resulted in zero")]
    SharesTooSmall,
    #[msg("Cannot switch sides on existing position")]
    CannotSwitchSides,
    #[msg("Fee too high (max 10%)")]
    FeeTooHigh,
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct ProtocolInitialized {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u64,
}

#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub pump_token_mint: Pubkey,
    pub start_time: i64,
    pub end_time: i64,
    pub initial_price_bps: u64,
}

#[event]
pub struct BetPlaced {
    pub market: Pubkey,
    pub user: Pubkey,
    pub side: Side,
    pub amount: u64,
    pub shares: u64,
    pub price_bps: u64,
}

#[event]
pub struct PriceUpdated {
    pub market: Pubkey,
    pub old_price_bps: u64,
    pub new_price_bps: u64,
}

#[event]
pub struct MarketSettled {
    pub market: Pubkey,
    pub outcome: bool,
    pub yes_pool: u64,
    pub no_pool: u64,
}

#[event]
pub struct WinningsClaimed {
    pub market: Pubkey,
    pub user: Pubkey,
    pub payout: u64,
    pub is_winner: bool,
}

#[event]
pub struct MarketPaused {
    pub market: Pubkey,
}

#[event]
pub struct MarketResumed {
    pub market: Pubkey,
}

#[event]
pub struct MarketCancelled {
    pub market: Pubkey,
}

#[event]
pub struct RefundClaimed {
    pub market: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
}

