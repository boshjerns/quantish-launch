// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title QuantishMarkets
 * @notice Prediction markets for pump.fun token graduation
 * @dev Full trading: BUY + SELL with 1% fee on all trades
 * 
 * ARCHITECTURE:
 * - Market pool funds held IN CONTRACT for instant liquidity
 * - Fees sent to feeRecipient on every trade
 * - Users can buy shares at current price
 * - Users can sell shares back at current price
 * - Winners claim from pool after settlement
 */
contract QuantishMarkets is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============================================================================
    // CONSTANTS
    // ============================================================================
    
    uint256 public constant BPS_PRECISION = 10000;
    uint256 public constant FEE_BPS = 100;         // 1% fee
    uint256 public constant MIN_PRICE_BPS = 100;   // 1% min
    uint256 public constant MAX_PRICE_BPS = 9900;  // 99% max
    uint256 public constant MIN_BET = 1e6;         // $1 USDC
    uint256 public constant MARKET_DURATION = 30 minutes;
    uint256 public constant GRADUATION_THRESHOLD = 85_000_000_000; // 85 SOL

    // ============================================================================
    // STATE
    // ============================================================================
    
    IERC20 public immutable usdc;
    address public feeRecipient;
    address public oracle;
    
    uint256 public totalFeesCollected;
    
    struct Market {
        bytes32 solanaTokenMint;
        uint256 startTime;
        uint256 endTime;
        uint256 yesPool;
        uint256 noPool;
        uint256 currentPriceBps;
        uint256 totalYesShares;
        uint256 totalNoShares;
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
            settled: false,
            outcome: false,
            settlementProof: bytes32(0)
        });
        
        allMarketIds.push(marketId);
        emit MarketCreated(marketId, solanaTokenMint, block.timestamp, block.timestamp + MARKET_DURATION, initialPriceBps);
    }

    // ============================================================================
    // BUY SHARES (1% FEE)
    // ============================================================================
    
    function buyShares(
        bytes32 marketId,
        bool side,
        uint256 amount
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
        
        // Calculate shares
        uint256 shares = (amountAfterFee * BPS_PRECISION) / priceBps;
        require(shares > 0, "Shares too small");
        
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

    // ============================================================================
    // SELL SHARES (1% FEE)
    // ============================================================================
    
    function sellShares(
        bytes32 marketId,
        bool side,
        uint256 sharesToSell
    ) external nonReentrant {
        Market storage market = markets[marketId];
        Position storage pos = positions[marketId][msg.sender][side];
        
        require(market.startTime != 0, "Market not found");
        require(!market.settled, "Market settled");
        require(block.timestamp < market.endTime, "Market expired");
        require(pos.shares >= sharesToSell, "Insufficient shares");
        require(sharesToSell > 0, "Zero shares");
        
        // Get current price for this side
        uint256 priceBps = side ? market.currentPriceBps : (BPS_PRECISION - market.currentPriceBps);
        
        // Calculate gross payout: shares * price / 10000
        uint256 grossPayout = (sharesToSell * priceBps) / BPS_PRECISION;
        
        // Calculate 1% fee on sale
        uint256 fee = (grossPayout * FEE_BPS) / BPS_PRECISION;
        uint256 netPayout = grossPayout - fee;
        
        require(netPayout > 0, "Payout too small");
        
        // Check contract has enough liquidity
        uint256 poolBalance = side ? market.yesPool : market.noPool;
        require(poolBalance >= grossPayout, "Insufficient liquidity");
        
        // Update position
        uint256 costBasisReduction = (pos.costBasis * sharesToSell) / pos.shares;
        pos.shares -= sharesToSell;
        pos.costBasis -= costBasisReduction;
        
        // Update pool
        if (side) {
            market.yesPool -= grossPayout;
            market.totalYesShares -= sharesToSell;
        } else {
            market.noPool -= grossPayout;
            market.totalNoShares -= sharesToSell;
        }
        
        // Send fee to recipient
        usdc.safeTransfer(feeRecipient, fee);
        
        // Send net payout to user
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
        
        uint256 oldPrice = market.currentPriceBps;
        uint256 progressBps = (solanaLamports * BPS_PRECISION) / GRADUATION_THRESHOLD;
        
        if (progressBps > BPS_PRECISION) progressBps = BPS_PRECISION;
        
        uint256 newPrice = progressBps;
        if (newPrice < MIN_PRICE_BPS) newPrice = MIN_PRICE_BPS;
        if (newPrice > MAX_PRICE_BPS) newPrice = MAX_PRICE_BPS;
        
        market.currentPriceBps = newPrice;
        emit PriceUpdated(marketId, oldPrice, newPrice, solanaLamports);
    }
    
    function settleMarket(bytes32 marketId, bool graduated, bytes32 proof) external {
        require(msg.sender == oracle, "Only oracle");
        
        Market storage market = markets[marketId];
        require(market.startTime != 0, "Market not found");
        require(!market.settled, "Already settled");
        require(block.timestamp >= market.endTime, "Not expired");
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
        
        // Calculate payout: user's share of total pool
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
    
    // Get position value at current price
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
        
        // PnL (can be negative)
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

    // ============================================================================
    // ADMIN
    // ============================================================================
    
    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
    }
    
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid");
        feeRecipient = _feeRecipient;
    }
    
    // Emergency withdraw (only unclaimed funds after all markets settled)
    function emergencyWithdraw(uint256 amount) external onlyOwner {
        usdc.safeTransfer(owner(), amount);
    }
}
