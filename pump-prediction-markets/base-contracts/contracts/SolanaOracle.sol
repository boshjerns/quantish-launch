// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SolanaOracle
 * @notice Receives cross-chain messages from Solana via Wormhole
 * @dev Verifies Wormhole VAAs and updates QuantishMarkets
 * 
 * CROSS-CHAIN FLOW:
 * 1. Our backend reads pump.fun bonding curve on Solana
 * 2. Backend sends message through Wormhole
 * 3. Wormhole guardians sign the message (VAA)
 * 4. This contract verifies the VAA
 * 5. Updates QuantishMarkets with verified Solana state
 */

interface IWormhole {
    struct Signature {
        bytes32 r;
        bytes32 s;
        uint8 v;
        uint8 guardianIndex;
    }
    
    struct VM {
        uint8 version;
        uint32 timestamp;
        uint32 nonce;
        uint16 emitterChainId;
        bytes32 emitterAddress;
        uint64 sequence;
        uint8 consistencyLevel;
        bytes payload;
        uint32 guardianSetIndex;
        Signature[] signatures;
        bytes32 hash;
    }
    
    function parseAndVerifyVM(bytes calldata encodedVM) external view returns (VM memory vm, bool valid, string memory reason);
}

interface IQuantishMarkets {
    function updatePriceFromOracle(bytes32 marketId, uint256 solanaLamports) external;
    function settleMarket(bytes32 marketId, bool graduated, bytes32 proof) external;
}

contract SolanaOracle is Ownable {
    
    // Wormhole Core Bridge on Base
    IWormhole public immutable wormhole;
    
    // QuantishMarkets contract
    IQuantishMarkets public quantishMarkets;
    
    // Solana chain ID in Wormhole
    uint16 public constant SOLANA_CHAIN_ID = 1;
    
    // Our authorized emitter on Solana (our program address)
    bytes32 public solanaEmitter;
    
    // Processed VAAs to prevent replay
    mapping(bytes32 => bool) public processedVAAs;
    
    // Message types
    uint8 public constant MSG_PRICE_UPDATE = 1;
    uint8 public constant MSG_SETTLEMENT = 2;
    
    event PriceUpdateReceived(bytes32 indexed marketId, uint256 solanaLamports, bytes32 vaaHash);
    event SettlementReceived(bytes32 indexed marketId, bool graduated, bytes32 vaaHash);
    
    constructor(
        address _wormhole,
        address _quantishMarkets,
        bytes32 _solanaEmitter
    ) Ownable(msg.sender) {
        wormhole = IWormhole(_wormhole);
        quantishMarkets = IQuantishMarkets(_quantishMarkets);
        solanaEmitter = _solanaEmitter;
    }
    
    /**
     * @notice Process a Wormhole VAA containing Solana state
     * @param encodedVAA The signed VAA from Wormhole guardians
     */
    function processVAA(bytes calldata encodedVAA) external {
        // Verify the VAA
        (IWormhole.VM memory vm, bool valid, string memory reason) = wormhole.parseAndVerifyVM(encodedVAA);
        
        require(valid, reason);
        require(vm.emitterChainId == SOLANA_CHAIN_ID, "Not from Solana");
        require(vm.emitterAddress == solanaEmitter, "Unknown emitter");
        require(!processedVAAs[vm.hash], "Already processed");
        
        processedVAAs[vm.hash] = true;
        
        // Decode the payload
        (uint8 msgType, bytes memory data) = abi.decode(vm.payload, (uint8, bytes));
        
        if (msgType == MSG_PRICE_UPDATE) {
            _handlePriceUpdate(data, vm.hash);
        } else if (msgType == MSG_SETTLEMENT) {
            _handleSettlement(data, vm.hash);
        } else {
            revert("Unknown message type");
        }
    }
    
    function _handlePriceUpdate(bytes memory data, bytes32 vaaHash) internal {
        (bytes32 marketId, uint256 solanaLamports) = abi.decode(data, (bytes32, uint256));
        
        quantishMarkets.updatePriceFromOracle(marketId, solanaLamports);
        
        emit PriceUpdateReceived(marketId, solanaLamports, vaaHash);
    }
    
    function _handleSettlement(bytes memory data, bytes32 vaaHash) internal {
        (bytes32 marketId, bool graduated) = abi.decode(data, (bytes32, bool));
        
        quantishMarkets.settleMarket(marketId, graduated, vaaHash);
        
        emit SettlementReceived(marketId, graduated, vaaHash);
    }
    
    // ============================================================================
    // ADMIN FUNCTIONS (for testing / fallback)
    // ============================================================================
    
    /**
     * @notice Manual price update (only for testing, remove in production)
     */
    function manualPriceUpdate(bytes32 marketId, uint256 solanaLamports) external onlyOwner {
        quantishMarkets.updatePriceFromOracle(marketId, solanaLamports);
    }
    
    /**
     * @notice Manual settlement (emergency only, requires multi-sig in production)
     */
    function manualSettlement(bytes32 marketId, bool graduated) external onlyOwner {
        quantishMarkets.settleMarket(marketId, graduated, keccak256(abi.encodePacked("manual", block.timestamp)));
    }
    
    function setQuantishMarkets(address _quantishMarkets) external onlyOwner {
        quantishMarkets = IQuantishMarkets(_quantishMarkets);
    }
    
    function setSolanaEmitter(bytes32 _emitter) external onlyOwner {
        solanaEmitter = _emitter;
    }
}

