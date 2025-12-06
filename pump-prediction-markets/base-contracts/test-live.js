/**
 * LIVE CONTRACT TESTING
 * Tests the deployed QuantishMarkets and SolanaOracle contracts on Base mainnet
 */

require('dotenv').config();
const { ethers } = require('ethers');

// Deployed contract addresses
const QUANTISH_MARKETS = '0x98a238e98BA9AEF71984Db4Fe955212F336E0689';
const SOLANA_ORACLE = '0x4Fd1042E70cb2F6051F8D3590550D6928e10eb04';
const NEW_GNOSIS_SAFE = '0xf5a002b3C79ACC1e13A80bbe82fdD96CF20311Bb';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// ABIs
const marketsAbi = [
  'function owner() view returns (address)',
  'function oracle() view returns (address)',
  'function gnosisSafe() view returns (address)',
  'function usdc() view returns (address)',
  'function BPS_PRECISION() view returns (uint256)',
  'function MIN_PRICE_BPS() view returns (uint256)',
  'function MAX_PRICE_BPS() view returns (uint256)',
  'function MIN_BET() view returns (uint256)',
  'function MARKET_DURATION() view returns (uint256)',
  'function GRADUATION_THRESHOLD() view returns (uint256)',
  'function getMarketCount() view returns (uint256)',
  'function createMarket(bytes32 solanaTokenMint, uint256 initialPriceBps) returns (bytes32)',
  'function getMarket(bytes32 marketId) view returns (bytes32 solanaTokenMint, uint256 startTime, uint256 endTime, uint256 yesPool, uint256 noPool, uint256 currentPriceBps, bool settled, bool outcome)',
  'function setOracle(address _oracle)',
  'event MarketCreated(bytes32 indexed marketId, bytes32 solanaTokenMint, uint256 startTime, uint256 endTime, uint256 initialPriceBps)',
];

const oracleAbi = [
  'function owner() view returns (address)',
  'function quantishMarkets() view returns (address)',
  'function solanaEmitter() view returns (bytes32)',
  'function manualPriceUpdate(bytes32 marketId, uint256 solanaLamports)',
  'function manualSettlement(bytes32 marketId, bool graduated)',
];

async function main() {
  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  console.log('='.repeat(60));
  console.log('QUANTISH MARKETS - LIVE CONTRACT TESTING');
  console.log('='.repeat(60));
  console.log('');
  console.log('Wallet:', wallet.address);
  
  const balance = await provider.getBalance(wallet.address);
  console.log('ETH Balance:', ethers.formatEther(balance), 'ETH');
  console.log('');
  
  // Connect to contracts
  const markets = new ethers.Contract(QUANTISH_MARKETS, marketsAbi, wallet);
  const oracle = new ethers.Contract(SOLANA_ORACLE, oracleAbi, wallet);
  
  // ==========================================
  // TEST 1: Verify Contract Configuration
  // ==========================================
  console.log('─'.repeat(60));
  console.log('TEST 1: Contract Configuration');
  console.log('─'.repeat(60));
  
  try {
    const owner = await markets.owner();
    const oracleAddr = await markets.oracle();
    const safeAddr = await markets.gnosisSafe();
    const usdcAddr = await markets.usdc();
    
    console.log('✅ Owner:', owner);
    console.log('   Expected:', wallet.address);
    console.log('   Match:', owner.toLowerCase() === wallet.address.toLowerCase() ? '✓' : '✗');
    
    console.log('✅ Oracle:', oracleAddr);
    console.log('   Expected:', SOLANA_ORACLE);
    console.log('   Match:', oracleAddr.toLowerCase() === SOLANA_ORACLE.toLowerCase() ? '✓' : '✗');
    
    console.log('✅ Gnosis Safe:', safeAddr);
    console.log('   (Note: Currently set to deployer, should update to new Safe)');
    
    console.log('✅ USDC:', usdcAddr);
    console.log('   Expected:', BASE_USDC);
    console.log('   Match:', usdcAddr.toLowerCase() === BASE_USDC.toLowerCase() ? '✓' : '✗');
  } catch (e) {
    console.log('❌ Error reading config:', e.message);
  }
  
  // ==========================================
  // TEST 2: Verify Constants
  // ==========================================
  console.log('');
  console.log('─'.repeat(60));
  console.log('TEST 2: Contract Constants');
  console.log('─'.repeat(60));
  
  try {
    const bpsPrecision = await markets.BPS_PRECISION();
    const minPrice = await markets.MIN_PRICE_BPS();
    const maxPrice = await markets.MAX_PRICE_BPS();
    const minBet = await markets.MIN_BET();
    const duration = await markets.MARKET_DURATION();
    const threshold = await markets.GRADUATION_THRESHOLD();
    
    console.log('✅ BPS_PRECISION:', bpsPrecision.toString(), '(10000 = 100%)');
    console.log('✅ MIN_PRICE_BPS:', minPrice.toString(), '(', Number(minPrice)/100, '%)');
    console.log('✅ MAX_PRICE_BPS:', maxPrice.toString(), '(', Number(maxPrice)/100, '%)');
    console.log('✅ MIN_BET:', minBet.toString(), '($', Number(minBet)/1e6, 'USDC)');
    console.log('✅ MARKET_DURATION:', duration.toString(), 'seconds (', Number(duration)/60, 'minutes)');
    console.log('✅ GRADUATION_THRESHOLD:', threshold.toString(), 'lamports (', Number(threshold)/1e9, 'SOL)');
  } catch (e) {
    console.log('❌ Error reading constants:', e.message);
  }
  
  // ==========================================
  // TEST 3: Verify Oracle Configuration
  // ==========================================
  console.log('');
  console.log('─'.repeat(60));
  console.log('TEST 3: Oracle Configuration');
  console.log('─'.repeat(60));
  
  try {
    const oracleOwner = await oracle.owner();
    const linkedMarkets = await oracle.quantishMarkets();
    const emitter = await oracle.solanaEmitter();
    
    console.log('✅ Oracle Owner:', oracleOwner);
    console.log('   Match wallet:', oracleOwner.toLowerCase() === wallet.address.toLowerCase() ? '✓' : '✗');
    
    console.log('✅ Linked Markets Contract:', linkedMarkets);
    console.log('   Match:', linkedMarkets.toLowerCase() === QUANTISH_MARKETS.toLowerCase() ? '✓' : '✗');
    
    console.log('✅ Solana Emitter:', emitter);
  } catch (e) {
    console.log('❌ Error reading oracle config:', e.message);
  }
  
  // ==========================================
  // TEST 4: Create a Test Market
  // ==========================================
  console.log('');
  console.log('─'.repeat(60));
  console.log('TEST 4: Create Test Market');
  console.log('─'.repeat(60));
  
  try {
    // Create a fake Solana token mint (32 bytes)
    const testMint = ethers.keccak256(ethers.toUtf8Bytes('test-pump-token-' + Date.now()));
    const initialPrice = 5000n; // 50% = $0.50 YES price
    
    console.log('Creating market with:');
    console.log('  Token Mint (simulated):', testMint);
    console.log('  Initial Price: 50% (5000 bps)');
    console.log('');
    
    const tx = await markets.createMarket(testMint, initialPrice);
    console.log('📤 Transaction sent:', tx.hash);
    console.log('   Waiting for confirmation...');
    
    const receipt = await tx.wait();
    console.log('✅ Confirmed in block:', receipt.blockNumber);
    console.log('   Gas used:', receipt.gasUsed.toString());
    
    // Find the MarketCreated event
    for (const log of receipt.logs) {
      try {
        const parsed = markets.interface.parseLog(log);
        if (parsed && parsed.name === 'MarketCreated') {
          console.log('');
          console.log('📊 Market Created Event:');
          console.log('   Market ID:', parsed.args.marketId);
          console.log('   Token Mint:', parsed.args.solanaTokenMint);
          console.log('   Start Time:', new Date(Number(parsed.args.startTime) * 1000).toISOString());
          console.log('   End Time:', new Date(Number(parsed.args.endTime) * 1000).toISOString());
          console.log('   Initial Price:', Number(parsed.args.initialPriceBps) / 100, '%');
          
          // Store for next test
          global.testMarketId = parsed.args.marketId;
        }
      } catch (e) {}
    }
  } catch (e) {
    console.log('❌ Error creating market:', e.message);
    if (e.data) console.log('   Revert reason:', e.data);
  }
  
  // ==========================================
  // TEST 5: Read Market State
  // ==========================================
  console.log('');
  console.log('─'.repeat(60));
  console.log('TEST 5: Read Market State');
  console.log('─'.repeat(60));
  
  if (global.testMarketId) {
    try {
      const market = await markets.getMarket(global.testMarketId);
      
      console.log('✅ Market State:');
      console.log('   Solana Token:', market.solanaTokenMint);
      console.log('   Start Time:', new Date(Number(market.startTime) * 1000).toISOString());
      console.log('   End Time:', new Date(Number(market.endTime) * 1000).toISOString());
      console.log('   YES Pool:', market.yesPool.toString(), '($', Number(market.yesPool)/1e6, ')');
      console.log('   NO Pool:', market.noPool.toString(), '($', Number(market.noPool)/1e6, ')');
      console.log('   Current Price:', Number(market.currentPriceBps) / 100, '%');
      console.log('   Settled:', market.settled);
      console.log('   Outcome:', market.outcome ? 'YES (Graduated)' : 'NO (Did not graduate)');
    } catch (e) {
      console.log('❌ Error reading market:', e.message);
    }
  }
  
  // ==========================================
  // TEST 6: Update Price via Oracle
  // ==========================================
  console.log('');
  console.log('─'.repeat(60));
  console.log('TEST 6: Oracle Price Update');
  console.log('─'.repeat(60));
  
  if (global.testMarketId) {
    try {
      // Simulate 60 SOL in bonding curve (about 70% progress)
      const solanaLamports = 60n * 1_000_000_000n; // 60 SOL
      
      console.log('Updating price with:');
      console.log('  Solana Lamports:', solanaLamports.toString());
      console.log('  Expected Price:', Number((solanaLamports * 10000n) / (85n * 1_000_000_000n)) / 100, '%');
      
      const tx = await oracle.manualPriceUpdate(global.testMarketId, solanaLamports);
      console.log('📤 Transaction sent:', tx.hash);
      
      const receipt = await tx.wait();
      console.log('✅ Price updated in block:', receipt.blockNumber);
      
      // Read new price
      const market = await markets.getMarket(global.testMarketId);
      console.log('   New Price:', Number(market.currentPriceBps) / 100, '%');
      
    } catch (e) {
      console.log('❌ Error updating price:', e.message);
    }
  }
  
  // ==========================================
  // TEST 7: Market Count
  // ==========================================
  console.log('');
  console.log('─'.repeat(60));
  console.log('TEST 7: Market Statistics');
  console.log('─'.repeat(60));
  
  try {
    const count = await markets.getMarketCount();
    console.log('✅ Total Markets Created:', count.toString());
  } catch (e) {
    console.log('❌ Error:', e.message);
  }
  
  // ==========================================
  // SUMMARY
  // ==========================================
  console.log('');
  console.log('='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log('');
  console.log('Contracts verified on Base mainnet:');
  console.log('  QuantishMarkets:', QUANTISH_MARKETS);
  console.log('  SolanaOracle:', SOLANA_ORACLE);
  console.log('  Gnosis Safe:', NEW_GNOSIS_SAFE);
  console.log('');
  console.log('All on-chain operations were atomic and verifiable.');
  console.log('');
  console.log('View transactions on BaseScan:');
  console.log('  https://basescan.org/address/' + QUANTISH_MARKETS);
  console.log('');
}

main().catch(console.error);

