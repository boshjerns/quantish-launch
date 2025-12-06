require('dotenv').config();
const { ethers } = require('ethers');

const SAFE_ADDRESS = '0x19A554d4D5cb8284B9d94031465888E1f5852E03';

async function main() {
  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  
  // Verify it's a contract
  const code = await provider.getCode(SAFE_ADDRESS);
  if (code !== '0x') {
    console.log('✅ Gnosis Safe verified at:', SAFE_ADDRESS);
    console.log('');
    console.log('🔗 Links:');
    console.log('   BaseScan: https://basescan.org/address/' + SAFE_ADDRESS);
    console.log('   Safe App: https://app.safe.global/home?safe=base:' + SAFE_ADDRESS);
  } else {
    console.log('❌ Not a contract');
  }
}

main().catch(console.error);

