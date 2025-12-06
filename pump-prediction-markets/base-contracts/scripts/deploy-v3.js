const hre = require("hardhat");

async function main() {
  console.log("\n🚀 DEPLOYING QUANTISH MARKETS V3 (ONE-SIDED PROTECTION)\n");
  console.log("=".repeat(50));
  
  // Base mainnet addresses
  const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const FEE_RECIPIENT = "0x66a7333CAde6b0dF0D2CC407e8E877cad7D120fF";
  const ORACLE = "0x224c7735d0cD863815b60eaa1B95A012b115e404";
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH\n");
  
  // Deploy QuantishMarketsV3
  console.log("Deploying QuantishMarketsV3...");
  const QuantishMarketsV3 = await hre.ethers.getContractFactory("QuantishMarketsV3");
  const markets = await QuantishMarketsV3.deploy(USDC, FEE_RECIPIENT, ORACLE);
  await markets.waitForDeployment();
  
  const marketsAddress = await markets.getAddress();
  console.log("✅ QuantishMarketsV3 deployed to:", marketsAddress);
  
  console.log("\n📋 DEPLOYMENT SUMMARY:");
  console.log("=".repeat(50));
  console.log("Contract:", marketsAddress);
  console.log("USDC:", USDC);
  console.log("Fee Recipient:", FEE_RECIPIENT);
  console.log("Oracle:", ORACLE);
  
  console.log("\n🔐 V3 NEW FEATURES:");
  console.log("  ✅ ONE-SIDED REFUNDS: Win but no opposition? Get your money back");
  console.log("  ✅ LOSER REFUNDS: Lose but no winners? Get your money back");
  console.log("  ✅ isOneSided() view function for UI warnings");
  console.log("  ✅ All V2 security features retained");
  
  console.log("\n📝 NEXT STEPS:");
  console.log("  1. Update frontend CONTRACT address to:", marketsAddress);
  console.log("  2. Update market manager to use new address");
  
  return { markets: marketsAddress };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

