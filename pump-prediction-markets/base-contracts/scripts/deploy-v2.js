const hre = require("hardhat");

async function main() {
  console.log("\n🚀 DEPLOYING QUANTISH MARKETS V2 (HARDENED)\n");
  console.log("=".repeat(50));
  
  // Base mainnet addresses
  const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const FEE_RECIPIENT = "0x66a7333CAde6b0dF0D2CC407e8E877cad7D120fF"; // Same as owner
  const ORACLE = "0x224c7735d0cD863815b60eaa1B95A012b115e404"; // Existing oracle
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH\n");
  
  // Deploy QuantishMarketsV2
  console.log("Deploying QuantishMarketsV2...");
  const QuantishMarketsV2 = await hre.ethers.getContractFactory("QuantishMarketsV2");
  const markets = await QuantishMarketsV2.deploy(USDC, FEE_RECIPIENT, ORACLE);
  await markets.waitForDeployment();
  
  const marketsAddress = await markets.getAddress();
  console.log("✅ QuantishMarketsV2 deployed to:", marketsAddress);
  
  // Verify deployment
  console.log("\n📋 DEPLOYMENT SUMMARY:");
  console.log("=".repeat(50));
  console.log("Contract:", marketsAddress);
  console.log("USDC:", USDC);
  console.log("Fee Recipient:", FEE_RECIPIENT);
  console.log("Oracle:", ORACLE);
  
  console.log("\n🔐 V2 SECURITY FEATURES:");
  console.log("  ✅ Slippage protection (minSharesOut, maxPriceBps)");
  console.log("  ✅ Max 5% price change per oracle update");
  console.log("  ✅ 30 second minimum between oracle updates");
  console.log("  ✅ 24 hour timelock on emergency withdraw");
  console.log("  ✅ 5 minute settlement grace period");
  
  console.log("\n📝 NEXT STEPS:");
  console.log("  1. Update frontend CONTRACT address to:", marketsAddress);
  console.log("  2. Update market manager to use new address");
  console.log("  3. V1 markets will continue to work until settled");
  
  // Return for programmatic use
  return { markets: marketsAddress };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

