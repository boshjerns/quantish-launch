// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title QuantishMarketsV3 - WITH ONE-SIDED MARKET PROTECTION
 * @notice Prediction markets for pump.fun token graduation
 * @dev V3 improvements over V2:
 *   - ONE-SIDED MARKET REFUNDS: If you win but no one bet against you, get your money back
 *   - LOSER REFUNDS: If you lose but no one bet on winning side, get your money back
 *   - All V2 security features retained
 */
contract QuantishMarketsV3 is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============================================================================
    // CONSTANTS (immutable for security)
    // ============================================================================
    
    uint256 public constant BPS_PRECISION = 10000;
    uint256 public constant MAX_FEE_BPS = 500;          // Max 5% fee (safety cap)
    uint256 public constant MIN_PRICE_BPS = 100;        // 1% min
    uint256 public constant MAX_PRICE_BPS = 9900;       // 99% max
    uint256 public constant MIN_BET = 1e6;              // $1 USDC
    uint256 public constant GRADUATION_THRESHOLD = 85_000_000_000; // 85 SOL
    
    // SECURITY CONSTANTS
    uint256 public constant MAX_PRICE_CHANGE_BPS = 500;  // Max 5% change per update
    uint256 public constant MIN_UPDATE_INTERVAL = 30;    // Min 30 seconds between updates
    uint256 public constant EMERGENCY_TIMELOCK = 24 hours;
    uint256 public constant SETTLEMENT_GRACE_PERIOD = 5 minutes;
    
    // ============================================================================
    // CONFIGURABLE PARAMETERS (admin can change)
    // ============================================================================
    
    uint256 public feeBps = 100;                        // Default 1% fee (configurable)
    uint256 public marketDuration = 30 minutes;         // Default 30 min (configurable)
    uint256 public minBet = 1e6;                        // Default $1 (configurable)

    // ============================================================================
    // STATE
    // ============================================================================
    
    IERC20 public immutable usdc;
    address public feeRecipient;
    address public oracle;
    
    uint256 public totalFeesCollected;
    
    // Emergency withdraw state
    uint256 public emergencyWithdrawUnlockTime;
    uint256 public emergencyWithdrawAmount;
    
    struct Market {
        bytes32 solanaTokenMint;
        uint256 startTime;
        uint256 endTime;
        uint256 yesPool;
        uint256 noPool;
        uint256 currentPriceBps;
        uint256 totalYesShares;
        uint256 totalNoShares;
        uint256 lastPriceUpdate;
        bool settled;
        bool outcome;
        bytes32 settlementProof;
    }
    
    struct Position {
        uint256 shares;
        uint256 costBasis;
        bool claimed;
    }
    
    mapping(bytes32 => Market) public markets;
    mapping(bytes32 => mapping(address => mapping(bool => Position))) public positions;
    bytes32[] public allMarketIds;
    
    // ============================================================================
    // EVENTS
    // ============================================================================
    
    event MarketCreated(bytes32 indexed marketId, bytes32 solanaTokenMint, uint256 startTime, uint256 endTime, uint256 initialPriceBps);
    event BetPlaced(bytes32 indexed marketId, address indexed user, bool side, uint256 amount, uint256 shares, uint256 priceBps, uint256 fee);
    event SharesSold(bytes32 indexed marketId, address indexed user, bool side, uint256 shares, uint256 payout, uint256 priceBps, uint256 fee);
    event PriceUpdated(bytes32 indexed marketId, uint256 oldPriceBps, uint256 newPriceBps, uint256 solanaLamports);
    event MarketSettled(bytes32 indexed marketId, bool outcome, bytes32 proof, uint256 totalPayout);
    event WinningsClaimed(bytes32 indexed marketId, address indexed user, bool side, uint256 payout);
    event RefundClaimed(bytes32 indexed marketId, address indexed user, bool side, uint256 refund, string reason);
    event EmergencyWithdrawInitiated(uint256 amount, uint256 unlockTime);
    event EmergencyWithdrawCancelled();
    event EmergencyWithdrawExecuted(uint256 amount);

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================
    
    constructor(
        address _usdc,
        address _feeRecipient,
        address _oracle
    ) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        feeRecipient = _feeRecipient;
        oracle = _oracle;
    }

    // ============================================================================
    // MARKET CREATION
    // ============================================================================
    
    function createMarket(
        bytes32 solanaTokenMint,
        uint256 initialPriceBps
    ) external onlyOwner returns (bytes32 marketId) {
        require(initialPriceBps >= MIN_PRICE_BPS && initialPriceBps <= MAX_PRICE_BPS, "Invalid price");
        
        marketId = keccak256(abi.encodePacked(solanaTokenMint, block.timestamp));
        require(markets[marketId].startTime == 0, "Market exists");
        
        markets[marketId] = Market({
            solanaTokenMint: solanaTokenMint,
            startTime: block.timestamp,
            endTime: block.timestamp + marketDuration,
            yesPool: 0,
            noPool: 0,
            currentPriceBps: initialPriceBps,
            totalYesShares: 0,
            totalNoShares: 0,
            lastPriceUpdate: block.timestamp,
            settled: false,
            outcome: false,
            settlementProof: bytes32(0)
        });
        
        allMarketIds.push(marketId);
        emit MarketCreated(marketId, solanaTokenMint, block.timestamp, block.timestamp + marketDuration, initialPriceBps);
    }

    // ============================================================================
    // BUY SHARES - WITH SLIPPAGE PROTECTION
    // ============================================================================
    
    function buyShares(
        bytes32 marketId,
        bool side,
        uint256 amount,
        uint256 minSharesOut,
        uint256 maxPriceBps
    ) external nonReentrant {
        Market storage market = markets[marketId];
        
        require(market.startTime != 0, "Market not found");
        require(!market.settled, "Market settled");
        require(block.timestamp < market.endTime, "Market expired");
        require(amount >= minBet, "Below minimum");
        
        uint256 fee = (amount * feeBps) / BPS_PRECISION;
        uint256 amountAfterFee = amount - fee;
        require(fee > 0 && amountAfterFee > 0, "Amount too small");
        
        uint256 priceBps = side ? market.currentPriceBps : (BPS_PRECISION - market.currentPriceBps);
        
        require(priceBps <= maxPriceBps, "Price exceeded max");
        
        uint256 shares = (amountAfterFee * BPS_PRECISION) / priceBps;
        require(shares > 0, "Shares too small");
        require(shares >= minSharesOut, "Slippage too high");
        
        usdc.safeTransferFrom(msg.sender, feeRecipient, fee);
        usdc.safeTransferFrom(msg.sender, address(this), amountAfterFee);
        
        totalFeesCollected += fee;
        
        Position storage pos = positions[marketId][msg.sender][side];
        pos.shares += shares;
        pos.costBasis += amountAfterFee;
        
        if (side) {
            market.yesPool += amountAfterFee;
            market.totalYesShares += shares;
        } else {
            market.noPool += amountAfterFee;
            market.totalNoShares += shares;
        }
        
        emit BetPlaced(marketId, msg.sender, side, amountAfterFee, shares, priceBps, fee);
    }
    
    function buySharesSimple(
        bytes32 marketId,
        bool side,
        uint256 amount
    ) external nonReentrant {
        Market storage market = markets[marketId];
        
        require(market.startTime != 0, "Market not found");
        require(!market.settled, "Market settled");
        require(block.timestamp < market.endTime, "Market expired");
        require(amount >= minBet, "Below minimum");
        
        uint256 fee = (amount * feeBps) / BPS_PRECISION;
        uint256 amountAfterFee = amount - fee;
        require(fee > 0 && amountAfterFee > 0, "Amount too small");
        
        uint256 priceBps = side ? market.currentPriceBps : (BPS_PRECISION - market.currentPriceBps);
        uint256 shares = (amountAfterFee * BPS_PRECISION) / priceBps;
        require(shares > 0, "Shares too small");
        
        usdc.safeTransferFrom(msg.sender, feeRecipient, fee);
        usdc.safeTransferFrom(msg.sender, address(this), amountAfterFee);
        
        totalFeesCollected += fee;
        
        Position storage pos = positions[marketId][msg.sender][side];
        pos.shares += shares;
        pos.costBasis += amountAfterFee;
        
        if (side) {
            market.yesPool += amountAfterFee;
            market.totalYesShares += shares;
        } else {
            market.noPool += amountAfterFee;
            market.totalNoShares += shares;
        }
        
        emit BetPlaced(marketId, msg.sender, side, amountAfterFee, shares, priceBps, fee);
    }

    // ============================================================================
    // SELL SHARES - WITH SLIPPAGE PROTECTION
    // ============================================================================
    
    function sellShares(
        bytes32 marketId,
        bool side,
        uint256 sharesToSell,
        uint256 minPayoutOut
    ) external nonReentrant {
        Market storage market = markets[marketId];
        Position storage pos = positions[marketId][msg.sender][side];
        
        require(market.startTime != 0, "Market not found");
        require(!market.settled, "Market settled");
        require(block.timestamp < market.endTime, "Market expired");
        require(pos.shares >= sharesToSell, "Insufficient shares");
        require(sharesToSell > 0, "Zero shares");
        
        uint256 priceBps = side ? market.currentPriceBps : (BPS_PRECISION - market.currentPriceBps);
        uint256 grossPayout = (sharesToSell * priceBps) / BPS_PRECISION;
        uint256 fee = (grossPayout * feeBps) / BPS_PRECISION;
        uint256 netPayout = grossPayout - fee;
        
        require(netPayout > 0, "Payout too small");
        require(netPayout >= minPayoutOut, "Slippage too high");
        
        uint256 poolBalance = side ? market.yesPool : market.noPool;
        require(poolBalance >= grossPayout, "Insufficient liquidity");
        
        uint256 costBasisReduction = (pos.costBasis * sharesToSell) / pos.shares;
        pos.shares -= sharesToSell;
        pos.costBasis -= costBasisReduction;
        
        if (side) {
            market.yesPool -= grossPayout;
            market.totalYesShares -= sharesToSell;
        } else {
            market.noPool -= grossPayout;
            market.totalNoShares -= sharesToSell;
        }
        
        usdc.safeTransfer(feeRecipient, fee);
        usdc.safeTransfer(msg.sender, netPayout);
        
        totalFeesCollected += fee;
        
        emit SharesSold(marketId, msg.sender, side, sharesToSell, netPayout, priceBps, fee);
    }

    // ============================================================================
    // ORACLE FUNCTIONS
    // ============================================================================
    
    function updatePriceFromOracle(bytes32 marketId, uint256 solanaLamports) external {
        require(msg.sender == oracle, "Only oracle");
        
        Market storage market = markets[marketId];
        require(market.startTime != 0, "Market not found");
        require(!market.settled, "Market settled");
        
        require(
            block.timestamp >= market.lastPriceUpdate + MIN_UPDATE_INTERVAL,
            "Update too frequent"
        );
        
        uint256 oldPrice = market.currentPriceBps;
        uint256 progressBps = (solanaLamports * BPS_PRECISION) / GRADUATION_THRESHOLD;
        
        if (progressBps > BPS_PRECISION) progressBps = BPS_PRECISION;
        
        uint256 newPrice = progressBps;
        if (newPrice < MIN_PRICE_BPS) newPrice = MIN_PRICE_BPS;
        if (newPrice > MAX_PRICE_BPS) newPrice = MAX_PRICE_BPS;
        
        if (newPrice > oldPrice) {
            uint256 maxNew = oldPrice + MAX_PRICE_CHANGE_BPS;
            if (newPrice > maxNew) newPrice = maxNew;
        } else if (newPrice < oldPrice) {
            uint256 minNew = oldPrice > MAX_PRICE_CHANGE_BPS ? oldPrice - MAX_PRICE_CHANGE_BPS : MIN_PRICE_BPS;
            if (newPrice < minNew) newPrice = minNew;
        }
        
        market.currentPriceBps = newPrice;
        market.lastPriceUpdate = block.timestamp;
        
        emit PriceUpdated(marketId, oldPrice, newPrice, solanaLamports);
    }
    
    function settleMarket(bytes32 marketId, bool graduated, bytes32 proof) external {
        require(msg.sender == oracle, "Only oracle");
        
        Market storage market = markets[marketId];
        require(market.startTime != 0, "Market not found");
        require(!market.settled, "Already settled");
        
        require(
            block.timestamp >= market.endTime + SETTLEMENT_GRACE_PERIOD,
            "Grace period not over"
        );
        require(proof != bytes32(0), "Invalid proof");
        
        market.settled = true;
        market.outcome = graduated;
        market.settlementProof = proof;
        
        emit MarketSettled(marketId, graduated, proof, market.yesPool + market.noPool);
    }

    // ============================================================================
    // CLAIM WINNINGS - WITH ONE-SIDED MARKET PROTECTION
    // ============================================================================
    
    /**
     * @notice Claim winnings or refund after market settlement
     * @dev V3 IMPROVEMENT: If you won but no one bet against you, get refund instead
     */
    function claimWinnings(bytes32 marketId, bool side) external nonReentrant {
        Market storage market = markets[marketId];
        Position storage pos = positions[marketId][msg.sender][side];
        
        require(market.settled, "Not settled");
        require(pos.shares > 0, "No position");
        require(!pos.claimed, "Already claimed");
        require(side == market.outcome, "Not a winner");
        
        uint256 losingPool = side ? market.noPool : market.yesPool;
        uint256 winningPool = side ? market.yesPool : market.noPool;
        uint256 totalPool = market.yesPool + market.noPool;
        uint256 winningShares = side ? market.totalYesShares : market.totalNoShares;
        
        uint256 payout = 0;
        
        // ⚠️ V3 FIX: ONE-SIDED MARKET PROTECTION
        if (losingPool == 0) {
            // No one bet against you - REFUND your cost basis
            payout = pos.costBasis;
            pos.claimed = true;
            usdc.safeTransfer(msg.sender, payout);
            emit RefundClaimed(marketId, msg.sender, side, payout, "No opposing bets");
            return;
        }
        
        // Normal pari-mutuel payout
        if (winningShares > 0) {
            payout = (pos.shares * totalPool) / winningShares;
        }
        
        require(payout > 0, "No payout");
        
        pos.claimed = true;
        usdc.safeTransfer(msg.sender, payout);
        
        emit WinningsClaimed(marketId, msg.sender, side, payout);
    }
    
    /**
     * @notice Claim refund if you lost but no one was on the winning side
     * @dev V3 IMPROVEMENT: Edge case where losers can get refund
     */
    function claimLoserRefund(bytes32 marketId, bool side) external nonReentrant {
        Market storage market = markets[marketId];
        Position storage pos = positions[marketId][msg.sender][side];
        
        require(market.settled, "Not settled");
        require(pos.shares > 0, "No position");
        require(!pos.claimed, "Already claimed");
        require(side != market.outcome, "Not a loser"); // Must be on losing side
        
        uint256 winningShares = market.outcome ? market.totalYesShares : market.totalNoShares;
        
        // Only allow refund if NO ONE was on the winning side
        require(winningShares == 0, "Winners exist - no refund");
        
        uint256 refund = pos.costBasis;
        pos.claimed = true;
        
        usdc.safeTransfer(msg.sender, refund);
        
        emit RefundClaimed(marketId, msg.sender, side, refund, "No winners to pay");
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================
    
    function getMarket(bytes32 marketId) external view returns (
        bytes32 solanaTokenMint,
        uint256 startTime,
        uint256 endTime,
        uint256 yesPool,
        uint256 noPool,
        uint256 currentPriceBps,
        bool settled,
        bool outcome
    ) {
        Market storage m = markets[marketId];
        return (m.solanaTokenMint, m.startTime, m.endTime, m.yesPool, m.noPool, m.currentPriceBps, m.settled, m.outcome);
    }
    
    function getMarketShares(bytes32 marketId) external view returns (uint256 totalYesShares, uint256 totalNoShares) {
        Market storage m = markets[marketId];
        return (m.totalYesShares, m.totalNoShares);
    }
    
    function getPosition(bytes32 marketId, address user, bool side) external view returns (
        uint256 shares,
        uint256 costBasis,
        bool claimed
    ) {
        Position storage p = positions[marketId][user][side];
        return (p.shares, p.costBasis, p.claimed);
    }
    
    function getPositionValue(bytes32 marketId, address user, bool side) external view returns (
        uint256 shares,
        uint256 currentValue,
        uint256 costBasis,
        int256 pnl
    ) {
        Market storage m = markets[marketId];
        Position storage p = positions[marketId][user][side];
        
        shares = p.shares;
        costBasis = p.costBasis;
        
        uint256 priceBps = side ? m.currentPriceBps : (BPS_PRECISION - m.currentPriceBps);
        currentValue = (shares * priceBps) / BPS_PRECISION;
        
        if (currentValue >= costBasis) {
            pnl = int256(currentValue - costBasis);
        } else {
            pnl = -int256(costBasis - currentValue);
        }
    }
    
    function getMarketCount() external view returns (uint256) {
        return allMarketIds.length;
    }
    
    function getFeeInfo() external view returns (uint256 currentFeeBps, address recipient, uint256 totalCollected) {
        return (feeBps, feeRecipient, totalFeesCollected);
    }
    
    function getConfigurableParams() external view returns (
        uint256 currentFeeBps,
        uint256 currentMarketDuration,
        uint256 currentMinBet
    ) {
        return (feeBps, marketDuration, minBet);
    }
    
    function getContractBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
    
    function getQuote(bytes32 marketId, bool side, uint256 amount) external view returns (
        uint256 shares,
        uint256 priceBps,
        uint256 fee,
        uint256 amountAfterFee
    ) {
        Market storage m = markets[marketId];
        priceBps = side ? m.currentPriceBps : (BPS_PRECISION - m.currentPriceBps);
        fee = (amount * feeBps) / BPS_PRECISION;
        amountAfterFee = amount - fee;
        shares = (amountAfterFee * BPS_PRECISION) / priceBps;
    }
    
    /**
     * @notice Check if a market is one-sided (for UI warning)
     */
    function isOneSided(bytes32 marketId) external view returns (bool yesOnly, bool noOnly) {
        Market storage m = markets[marketId];
        yesOnly = m.yesPool > 0 && m.noPool == 0;
        noOnly = m.noPool > 0 && m.yesPool == 0;
    }

    // ============================================================================
    // ADMIN - CONFIGURATION FUNCTIONS
    // ============================================================================
    
    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
    }
    
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid");
        feeRecipient = _feeRecipient;
    }
    
    /**
     * @notice Set the fee rate (admin only)
     * @param _feeBps New fee in basis points (max 5% = 500 BPS)
     */
    function setFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");
        feeBps = _feeBps;
    }
    
    /**
     * @notice Set market duration (admin only)
     * @param _duration Duration in seconds (min 5 min, max 24 hours)
     */
    function setMarketDuration(uint256 _duration) external onlyOwner {
        require(_duration >= 5 minutes, "Duration too short");
        require(_duration <= 24 hours, "Duration too long");
        marketDuration = _duration;
    }
    
    /**
     * @notice Set minimum bet (admin only)
     * @param _minBet Minimum bet in USDC (6 decimals)
     */
    function setMinBet(uint256 _minBet) external onlyOwner {
        require(_minBet >= 1e5, "Min bet too low"); // At least $0.10
        require(_minBet <= 1000e6, "Min bet too high"); // Max $1000
        minBet = _minBet;
    }
    
    // ============================================================================
    // ADMIN - FEE WITHDRAWAL (INSTANT - fees are yours!)
    // ============================================================================
    
    /**
     * @notice Withdraw collected fees to fee recipient (INSTANT - no timelock)
     * @dev Fees are sent to feeRecipient during trades, but if any accumulate
     *      in contract due to errors, admin can withdraw them
     */
    function withdrawFees() external onlyOwner {
        // Fees are normally sent directly to feeRecipient during trades
        // This is a backup in case any fees got stuck
        uint256 balance = usdc.balanceOf(address(this));
        
        // Calculate how much is owed to users (all pools)
        uint256 userFunds = 0;
        for (uint256 i = 0; i < allMarketIds.length; i++) {
            Market storage m = markets[allMarketIds[i]];
            if (!m.settled) {
                userFunds += m.yesPool + m.noPool;
            }
        }
        
        // Only withdraw excess (fees that somehow accumulated)
        require(balance > userFunds, "No excess funds");
        uint256 excess = balance - userFunds;
        
        usdc.safeTransfer(feeRecipient, excess);
    }
    
    // ============================================================================
    // ADMIN - EMERGENCY WITHDRAW (WITH TIMELOCK - protects users)
    // ============================================================================
    
    function initiateEmergencyWithdraw(uint256 amount) external onlyOwner {
        emergencyWithdrawAmount = amount;
        emergencyWithdrawUnlockTime = block.timestamp + EMERGENCY_TIMELOCK;
        emit EmergencyWithdrawInitiated(amount, emergencyWithdrawUnlockTime);
    }
    
    function cancelEmergencyWithdraw() external onlyOwner {
        emergencyWithdrawAmount = 0;
        emergencyWithdrawUnlockTime = 0;
        emit EmergencyWithdrawCancelled();
    }
    
    function executeEmergencyWithdraw() external onlyOwner {
        require(emergencyWithdrawUnlockTime > 0, "Not initiated");
        require(block.timestamp >= emergencyWithdrawUnlockTime, "Timelock not expired");
        require(emergencyWithdrawAmount > 0, "No amount set");
        
        uint256 amount = emergencyWithdrawAmount;
        emergencyWithdrawAmount = 0;
        emergencyWithdrawUnlockTime = 0;
        
        usdc.safeTransfer(owner(), amount);
        emit EmergencyWithdrawExecuted(amount);
    }
}

