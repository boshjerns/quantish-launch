require('dotenv').config();
const { ethers } = require('ethers');

async function createMarkets() {
  const provider = new ethers.JsonRpcProvider('https://base-mainnet.g.alchemy.com/v2/RAGQigMKiV7byokgnvmbr');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const contract = new ethers.Contract(
    '0xE86f88F2a7023Dd5761De2236797B8777449a087',
    ['function createMarket(bytes32,uint256) returns (bytes32)', 'function getMarketCount() view returns (uint256)'],
    wallet
  );
  
  console.log('Creating new markets...\n');
  
  const markets = [
    { name: 'MOON_CAT', price: 2500 },
    { name: 'FROG_KING', price: 7500 },
    { name: 'DEGEN_APE', price: 4000 },
    { name: 'PUMP_IT', price: 5500 },
    { name: 'TO_THE_MOON', price: 8000 },
    { name: 'WAGMI_TOKEN', price: 3500 },
  ];
  
  for (const m of markets) {
    const mint = ethers.keccak256(ethers.toUtf8Bytes(m.name + '_' + Date.now()));
    console.log(`Creating: ${m.name} at ${m.price/100}%`);
    try {
      const tx = await contract.createMarket(mint, m.price);
      await tx.wait();
      console.log('✓ Created\n');
    } catch(e) {
      console.log('✗ Error:', e.reason || e.message, '\n');
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  
  const count = await contract.getMarketCount();
  console.log(`\nTotal markets now: ${count}`);
}

createMarkets().catch(console.error);

