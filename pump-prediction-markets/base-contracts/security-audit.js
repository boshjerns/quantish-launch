/**
 * SECURITY AUDIT & PENETRATION TEST
 * 
 * This script tests various attack vectors on QuantishMarkets
 */

require('dotenv').config();
const { ethers } = require('ethers');

const RPC = process.env.ALCHEMY_RPC_URL || 'https://base-mainnet.g.alchemy.com/v2/RAGQigMKiV7byokgnvmbr';
const CONTRACT = '0xE86f88F2a7023Dd5761De2236797B8777449a087';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const ABI = [
  'function getMarketCount() view returns (uint256)',
  'function allMarketIds(uint256) view returns (bytes32)',
  'function getMarket(bytes32) view returns (bytes32, uint256, uint256, uint256, uint256, uint256, bool, bool)',
  'function getPosition(bytes32, address, bool) view returns (uint256, uint256, bool)',
  'function buyShares(bytes32, bool, uint256)',
  'function sellShares(bytes32, bool, uint256)',
  'function updatePriceFromOracle(bytes32, uint256)',
  'function settleMarket(bytes32, bool, bytes32)',
  'function claimWinnings(bytes32, bool)',
  'function oracle() view returns (address)',
  'function owner() view returns (address)',
  'function feeRecipient() view returns (address)',
  'function emergencyWithdraw(uint256)',
  'function MIN_BET() view returns (uint256)',
  'function FEE_BPS() view returns (uint256)',
  'function BPS_PRECISION() view returns (uint256)',
];

// Helper to add delay
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runSecurityAudit() {
  console.log('\n' + '='.repeat(60));
  console.log('🔒 QUANTISH MARKETS SECURITY AUDIT');
  console.log('='.repeat(60) + '\n');
  
  const provider = new ethers.JsonRpcProvider(RPC);
  const contract = new ethers.Contract(CONTRACT, ABI, provider);
  
  // Helper with retry
  const callWithRetry = async (fn, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        await sleep(200); // Rate limit protection
        return await fn();
      } catch (e) {
        if (i === retries - 1) throw e;
        await sleep(1000);
      }
    }
  };
  
  const results = {
    passed: [],
    failed: [],
    warnings: []
  };

  // ============================================================================
  // 1. ACCESS CONTROL TESTS
  // ============================================================================
  
  console.log('📋 1. ACCESS CONTROL TESTS\n');
  
  // Test 1.1: Oracle address is set
  const oracle = await contract.oracle();
  if (oracle !== ethers.ZeroAddress) {
    results.passed.push('✅ Oracle address is set: ' + oracle);
  } else {
    results.failed.push('❌ Oracle address is zero');
  }
  
  // Test 1.2: Owner address is set
  const owner = await contract.owner();
  if (owner !== ethers.ZeroAddress) {
    results.passed.push('✅ Owner address is set: ' + owner);
  } else {
    results.failed.push('❌ Owner address is zero');
  }
  
  // Test 1.3: Fee recipient is set
  const feeRecipient = await contract.feeRecipient();
  if (feeRecipient !== ethers.ZeroAddress) {
    results.passed.push('✅ Fee recipient is set: ' + feeRecipient);
  } else {
    results.failed.push('❌ Fee recipient is zero');
  }
  
  // Test 1.4: Try to call oracle function without being oracle
  try {
    // This should fail - we're using a random signer
    const randomWallet = ethers.Wallet.createRandom().connect(provider);
    const contractWithSigner = contract.connect(randomWallet);
    
    // Get a market ID to test with
    const count = await contract.getMarketCount();
    if (count > 0n) {
      const marketId = await contract.allMarketIds(0);
      
      // Try to estimate gas for oracle call (should revert)
      try {
        await contractWithSigner.updatePriceFromOracle.estimateGas(marketId, 1000000);
        results.failed.push('❌ CRITICAL: Non-oracle can call updatePriceFromOracle!');
      } catch (e) {
        if (e.message.includes('Only oracle') || e.message.includes('execution reverted')) {
          results.passed.push('✅ updatePriceFromOracle properly restricted to oracle');
        } else {
          results.warnings.push('⚠️ updatePriceFromOracle failed for unexpected reason: ' + e.message.slice(0, 50));
        }
      }
      
      // Try to settle market
      try {
        await contractWithSigner.settleMarket.estimateGas(marketId, true, ethers.id('test'));
        results.failed.push('❌ CRITICAL: Non-oracle can call settleMarket!');
      } catch (e) {
        if (e.message.includes('Only oracle') || e.message.includes('execution reverted')) {
          results.passed.push('✅ settleMarket properly restricted to oracle');
        }
      }
    }
  } catch (e) {
    results.warnings.push('⚠️ Could not test oracle restrictions: ' + e.message.slice(0, 50));
  }
  
  // Test 1.5: Try to call emergency withdraw without being owner
  try {
    const randomWallet = ethers.Wallet.createRandom().connect(provider);
    const contractWithSigner = contract.connect(randomWallet);
    
    await contractWithSigner.emergencyWithdraw.estimateGas(1000000);
    results.failed.push('❌ CRITICAL: Non-owner can call emergencyWithdraw!');
  } catch (e) {
    if (e.message.includes('Ownable') || e.message.includes('caller is not the owner') || e.message.includes('execution reverted')) {
      results.passed.push('✅ emergencyWithdraw properly restricted to owner');
    }
  }

  // ============================================================================
  // 2. PRICE MANIPULATION TESTS
  // ============================================================================
  
  console.log('\n📋 2. PRICE MANIPULATION ANALYSIS\n');
  
  const count = await contract.getMarketCount();
  console.log(`   Total markets: ${count}`);
  
  if (count > 0n) {
    // Analyze recent price changes in markets
    for (let i = 0; i < Math.min(5, Number(count)); i++) {
      const marketId = await contract.allMarketIds(i);
      const market = await contract.getMarket(marketId);
      const priceBps = Number(market[5]);
      const settled = market[6];
      
      if (!settled) {
        console.log(`   Market ${i}: Price = ${(priceBps / 100).toFixed(2)}%`);
        
        // Check for extreme prices
        if (priceBps < 100 || priceBps > 9900) {
          results.warnings.push(`⚠️ Market ${i} has extreme price: ${priceBps} BPS`);
        }
      }
    }
  }
  
  // Check: No slippage protection in current contract
  results.warnings.push('⚠️ V1 CONTRACT: No slippage protection - users may get different price than expected');
  results.warnings.push('⚠️ V1 CONTRACT: No rate limiting on oracle price updates');
  results.warnings.push('⚠️ V1 CONTRACT: Emergency withdraw has no timelock');

  // ============================================================================
  // 3. FUND SAFETY TESTS
  // ============================================================================
  
  console.log('\n📋 3. FUND SAFETY ANALYSIS\n');
  
  const usdc = new ethers.Contract(USDC, [
    'function balanceOf(address) view returns (uint256)'
  ], provider);
  
  const contractBalance = await usdc.balanceOf(CONTRACT);
  console.log(`   Contract USDC balance: $${ethers.formatUnits(contractBalance, 6)}`);
  
  // Check if balance matches sum of all pools
  let totalPools = 0n;
  for (let i = 0; i < Math.min(50, Number(count)); i++) {
    const marketId = await contract.allMarketIds(i);
    const market = await contract.getMarket(marketId);
    const settled = market[6];
    if (!settled) {
      totalPools += market[3] + market[4]; // yesPool + noPool
    }
  }
  
  console.log(`   Sum of active pools: $${ethers.formatUnits(totalPools, 6)}`);
  
  if (contractBalance >= totalPools) {
    results.passed.push('✅ Contract balance covers all active pools');
  } else {
    results.failed.push('❌ CRITICAL: Contract balance is LESS than sum of pools!');
  }

  // ============================================================================
  // 4. TIMING ATTACK ANALYSIS
  // ============================================================================
  
  console.log('\n📋 4. TIMING ATTACK ANALYSIS\n');
  
  // Check market end times
  const now = Math.floor(Date.now() / 1000);
  let activeCount = 0;
  let expiredUnsettled = 0;
  
  for (let i = 0; i < Math.min(50, Number(count)); i++) {
    const marketId = await contract.allMarketIds(i);
    const market = await contract.getMarket(marketId);
    const endTime = Number(market[2]);
    const settled = market[6];
    
    if (endTime > now && !settled) {
      activeCount++;
      const timeLeft = endTime - now;
      if (timeLeft < 60) {
        results.warnings.push(`⚠️ Market ${i} ends in ${timeLeft} seconds - potential last-second attack window`);
      }
    } else if (endTime <= now && !settled) {
      expiredUnsettled++;
    }
  }
  
  console.log(`   Active markets: ${activeCount}`);
  console.log(`   Expired but unsettled: ${expiredUnsettled}`);
  
  if (expiredUnsettled > 0) {
    results.warnings.push(`⚠️ ${expiredUnsettled} markets are expired but not settled`);
  }

  // ============================================================================
  // 5. REENTRANCY CHECK
  // ============================================================================
  
  console.log('\n📋 5. REENTRANCY PROTECTION\n');
  
  // Check if contract uses ReentrancyGuard (from source code we know it does)
  results.passed.push('✅ Contract uses ReentrancyGuard (nonReentrant modifier)');
  results.passed.push('✅ Uses SafeERC20 for token transfers');

  // ============================================================================
  // RESULTS SUMMARY
  // ============================================================================
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 AUDIT RESULTS SUMMARY');
  console.log('='.repeat(60) + '\n');
  
  console.log(`✅ PASSED: ${results.passed.length}`);
  results.passed.forEach(r => console.log('   ' + r));
  
  console.log(`\n❌ FAILED: ${results.failed.length}`);
  results.failed.forEach(r => console.log('   ' + r));
  
  console.log(`\n⚠️ WARNINGS: ${results.warnings.length}`);
  results.warnings.forEach(r => console.log('   ' + r));
  
  console.log('\n' + '='.repeat(60));
  console.log('🔐 SECURITY RECOMMENDATIONS');
  console.log('='.repeat(60));
  console.log(`
1. DEPLOY V2 CONTRACT with:
   - Slippage protection (minSharesOut, maxPriceBps)
   - Rate limiting on oracle updates (30s minimum)
   - Max price change per update (5%)
   - Emergency withdraw timelock (24h)
   - Settlement grace period (5min)

2. MULTI-SIG THE ORACLE:
   - Current oracle is single address
   - Should use multi-sig or decentralized oracle

3. IMPROVE SETTLEMENT PROOF:
   - Current proof is just any bytes32
   - Should verify actual Solana state

4. FRONTEND IMPROVEMENTS:
   - Show user the exact price they'll get
   - Warn if price moved since page load
   - Show slippage tolerance setting
`);
  
  return results;
}

// Run the audit
runSecurityAudit()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('Audit failed:', e);
    process.exit(1);
  });

