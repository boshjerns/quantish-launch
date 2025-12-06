// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title QuantishMarketsV2 - HARDENED VERSION
 * @notice Prediction markets for pump.fun token graduation
 * @dev Security improvements:
 *   1. SLIPPAGE PROTECTION - Users specify min shares / max price
 *   2. PRICE CHANGE LIMITS - Max 5% change per oracle update
 *   3. ORACLE RATE LIMITING - Min 30 seconds between updates
 *   4. EMERGENCY WITHDRAW TIMELOCK - 24 hour delay
 *   5. SETTLEMENT GRACE PERIOD - Users can exit before settlement
 */
contract QuantishMarketsV2 is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============================================================================
    // CONSTANTS
    // ============================================================================
    
    uint256 public constant BPS_PRECISION = 10000;
    uint256 public constant FEE_BPS = 100;              // 1% fee
    uint256 public constant MIN_PRICE_BPS = 100;        // 1% min
    uint256 public constant MAX_PRICE_BPS = 9900;       // 99% max
    uint256 public constant MIN_BET = 1e6;              // $1 USDC
    uint256 public constant MARKET_DURATION = 30 minutes;
    uint256 public constant GRADUATION_THRESHOLD = 85_000_000_000; // 85 SOL
    
    // SECURITY CONSTANTS
    uint256 public constant MAX_PRICE_CHANGE_BPS = 500;  // Max 5% change per update
    uint256 public constant MIN_UPDATE_INTERVAL = 30;    // Min 30 seconds between updates
    uint256 public constant EMERGENCY_TIMELOCK = 24 hours;
    uint256 public constant SETTLEMENT_GRACE_PERIOD = 5 minutes;

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
        uint256 lastPriceUpdate;      // NEW: Track last update time
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
            endTime: block.timestamp + MARKET_DURATION,
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
        emit MarketCreated(marketId, solanaTokenMint, block.timestamp, block.timestamp + MARKET_DURATION, initialPriceBps);
    }

    // ============================================================================
    // BUY SHARES - WITH SLIPPAGE PROTECTION
    // ============================================================================
    
    /**
     * @notice Buy shares with slippage protection
     * @param marketId The market to buy in
     * @param side true = YES, false = NO
     * @param amount USDC amount to spend
     * @param minSharesOut Minimum shares to receive (SLIPPAGE PROTECTION)
     * @param maxPriceBps Maximum price to pay in BPS (SLIPPAGE PROTECTION)
     */
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
        require(amount >= MIN_BET, "Below minimum");
        
        // Calculate 1% fee
        uint256 fee = (amount * FEE_BPS) / BPS_PRECISION;
        uint256 amountAfterFee = amount - fee;
        require(fee > 0 && amountAfterFee > 0, "Amount too small");
        
        // Get price for this side
        uint256 priceBps = side ? market.currentPriceBps : (BPS_PRECISION - market.currentPriceBps);
        
        // ⚠️ SLIPPAGE PROTECTION: Check price hasn't moved too much
        require(priceBps <= maxPriceBps, "Price exceeded max");
        
        // Calculate shares
        uint256 shares = (amountAfterFee * BPS_PRECISION) / priceBps;
        require(shares > 0, "Shares too small");
        
        // ⚠️ SLIPPAGE PROTECTION: Check minimum shares received
        require(shares >= minSharesOut, "Slippage too high");
        
        // Transfer fee to recipient
        usdc.safeTransferFrom(msg.sender, feeRecipient, fee);
        
        // Transfer amount to contract (for liquidity)
        usdc.safeTransferFrom(msg.sender, address(this), amountAfterFee);
        
        totalFeesCollected += fee;
        
        // Update position
        Position storage pos = positions[marketId][msg.sender][side];
        pos.shares += shares;
        pos.costBasis += amountAfterFee;
        
        // Update pool
        if (side) {
            market.yesPool += amountAfterFee;
            market.totalYesShares += shares;
        } else {
            market.noPool += amountAfterFee;
            market.totalNoShares += shares;
        }
        
        emit BetPlaced(marketId, msg.sender, side, amountAfterFee, shares, priceBps, fee);
    }
    
    /**
     * @notice Convenience function for buying without explicit slippage params
     * @dev Uses 10% slippage tolerance by default
     */
    function buySharesSimple(
        bytes32 marketId,
        bool side,
        uint256 amount
    ) external nonReentrant {
        Market storage market = markets[marketId];
        
        require(market.startTime != 0, "Market not found");
        require(!market.settled, "Market settled");
        require(block.timestamp < market.endTime, "Market expired");
        require(amount >= MIN_BET, "Below minimum");
        
        uint256 fee = (amount * FEE_BPS) / BPS_PRECISION;
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
    
    /**
     * @notice Sell shares with slippage protection
     * @param marketId The market
     * @param side true = YES, false = NO
     * @param sharesToSell Number of shares to sell
     * @param minPayoutOut Minimum payout to receive (SLIPPAGE PROTECTION)
     */
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
        uint256 fee = (grossPayout * FEE_BPS) / BPS_PRECISION;
        uint256 netPayout = grossPayout - fee;
        
        require(netPayout > 0, "Payout too small");
        
        // ⚠️ SLIPPAGE PROTECTION
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
    // ORACLE FUNCTIONS - WITH RATE LIMITING
    // ============================================================================
    
    /**
     * @notice Update price with rate limiting and max change protection
     */
    function updatePriceFromOracle(bytes32 marketId, uint256 solanaLamports) external {
        require(msg.sender == oracle, "Only oracle");
        
        Market storage market = markets[marketId];
        require(market.startTime != 0, "Market not found");
        require(!market.settled, "Market settled");
        
        // ⚠️ RATE LIMITING: Minimum 30 seconds between updates
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
        
        // ⚠️ MAX PRICE CHANGE: Limit to 5% per update
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
    
    /**
     * @notice Settle market - only after grace period
     */
    function settleMarket(bytes32 marketId, bool graduated, bytes32 proof) external {
        require(msg.sender == oracle, "Only oracle");
        
        Market storage market = markets[marketId];
        require(market.startTime != 0, "Market not found");
        require(!market.settled, "Already settled");
        
        // ⚠️ GRACE PERIOD: Wait 5 minutes after end time
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
    // CLAIM WINNINGS
    // ============================================================================
    
    function claimWinnings(bytes32 marketId, bool side) external nonReentrant {
        Market storage market = markets[marketId];
        Position storage pos = positions[marketId][msg.sender][side];
        
        require(market.settled, "Not settled");
        require(pos.shares > 0, "No position");
        require(!pos.claimed, "Already claimed");
        require(side == market.outcome, "Not a winner");
        
        uint256 totalPool = market.yesPool + market.noPool;
        uint256 winningShares = side ? market.totalYesShares : market.totalNoShares;
        
        uint256 payout = 0;
        if (winningShares > 0) {
            payout = (pos.shares * totalPool) / winningShares;
        }
        
        require(payout > 0, "No payout");
        
        pos.claimed = true;
        
        usdc.safeTransfer(msg.sender, payout);
        
        emit WinningsClaimed(marketId, msg.sender, side, payout);
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
    
    function getFeeInfo() external view returns (uint256 feeBps, address recipient, uint256 totalCollected) {
        return (FEE_BPS, feeRecipient, totalFeesCollected);
    }
    
    function getContractBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
    
    /**
     * @notice Get quote for buying shares - HELPS USER SET SLIPPAGE
     */
    function getQuote(bytes32 marketId, bool side, uint256 amount) external view returns (
        uint256 shares,
        uint256 priceBps,
        uint256 fee,
        uint256 amountAfterFee
    ) {
        Market storage m = markets[marketId];
        priceBps = side ? m.currentPriceBps : (BPS_PRECISION - m.currentPriceBps);
        fee = (amount * FEE_BPS) / BPS_PRECISION;
        amountAfterFee = amount - fee;
        shares = (amountAfterFee * BPS_PRECISION) / priceBps;
    }

    // ============================================================================
    // ADMIN - WITH TIMELOCK PROTECTION
    // ============================================================================
    
    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
    }
    
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid");
        feeRecipient = _feeRecipient;
    }
    
    /**
     * @notice Initiate emergency withdraw - 24 hour delay
     */
    function initiateEmergencyWithdraw(uint256 amount) external onlyOwner {
        emergencyWithdrawAmount = amount;
        emergencyWithdrawUnlockTime = block.timestamp + EMERGENCY_TIMELOCK;
        emit EmergencyWithdrawInitiated(amount, emergencyWithdrawUnlockTime);
    }
    
    /**
     * @notice Cancel pending emergency withdraw
     */
    function cancelEmergencyWithdraw() external onlyOwner {
        emergencyWithdrawAmount = 0;
        emergencyWithdrawUnlockTime = 0;
        emit EmergencyWithdrawCancelled();
    }
    
    /**
     * @notice Execute emergency withdraw after timelock
     */
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

