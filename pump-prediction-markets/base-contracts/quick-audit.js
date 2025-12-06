const { ethers } = require('ethers');
const RPC = 'https://base-mainnet.g.alchemy.com/v2/RAGQigMKiV7byokgnvmbr';
const CONTRACT = '0xE86f88F2a7023Dd5761De2236797B8777449a087';

async function audit() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const contract = new ethers.Contract(CONTRACT, [
    'function oracle() view returns (address)',
    'function owner() view returns (address)',
    'function feeRecipient() view returns (address)',
    'function getMarketCount() view returns (uint256)',
  ], provider);
  
  console.log('\n[SECURITY AUDIT - KEY FINDINGS]\n');
  console.log('='.repeat(50));
  
  const [oracle, owner, feeRecipient, count] = await Promise.all([
    contract.oracle(),
    contract.owner(),
    contract.feeRecipient(),
    contract.getMarketCount()
  ]);
  
  console.log('\n[ACCESS CONTROL]:');
  console.log('  Owner:', owner);
  console.log('  Oracle:', oracle);
  console.log('  Fee Recipient:', feeRecipient);
  console.log('  Markets:', count.toString());
  
  console.log('\n[V1 CONTRACT VULNERABILITIES]:');
  console.log('  1. NO SLIPPAGE PROTECTION');
  console.log('     - User sees price X, may get price Y');
  console.log('     - Front-running possible');
  console.log('');
  console.log('  2. CENTRALIZED ORACLE');
  console.log('     - Single address controls prices');
  console.log('     - Can manipulate settlements');
  console.log('');
  console.log('  3. NO RATE LIMITING');
  console.log('     - Oracle can change price 1% to 99% instantly');
  console.log('     - No cooldown between updates');
  console.log('');
  console.log('  4. EMERGENCY WITHDRAW');
  console.log('     - Owner can drain funds instantly');
  console.log('     - No timelock protection');
  
  console.log('\n[SECURITY POSITIVES]:');
  console.log('  + ReentrancyGuard protects against reentrancy');
  console.log('  + SafeERC20 for token transfers');
  console.log('  + Price bounds (1% - 99%)');
  console.log('  + Minimum bet enforcement ($1)');
  
  console.log('\n[RECOMMENDATIONS]:');
  console.log('  1. Deploy QuantishMarketsV2.sol with:');
  console.log('     - Slippage protection params');
  console.log('     - 5% max price change per update');
  console.log('     - 30s minimum between oracle updates');
  console.log('     - 24h timelock on emergency withdraw');
  console.log('     - 5min settlement grace period');
  console.log('');
  console.log('  2. Make oracle a multi-sig or use Chainlink');
  console.log('  3. Add on-chain Solana state verification');
}

audit().catch(console.error);

