const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());
  
  // USDC addresses
  const USDC_ADDRESSES = {
    base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    baseSepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  };
  
  // Wormhole Core Bridge addresses
  const WORMHOLE_ADDRESSES = {
    base: "0xbebdb6C8ddC678FfA9f8748f85C815C556Dd8ac6",
    baseSepolia: "0x79A1027a6A159502049F10906D333EC57E95F083",
  };
  
  const networkName = hre.network.name;
  const usdcAddress = USDC_ADDRESSES[networkName] || USDC_ADDRESSES.baseSepolia;
  const wormholeAddress = WORMHOLE_ADDRESSES[networkName] || WORMHOLE_ADDRESSES.baseSepolia;
  
  console.log("\nNetwork:", networkName);
  console.log("USDC:", usdcAddress);
  
  // Fee recipient = deployer wallet (receives 1% on ALL trades)
  const feeRecipient = deployer.address;
  console.log("Fee Recipient:", feeRecipient);
  console.log("Fee Rate: 1% (100 bps) on ALL buys AND sells");

  // Deploy QuantishMarkets (new version with buy/sell)
  console.log("\nDeploying QuantishMarkets v2 (with buy + sell)...");
  const QuantishMarkets = await hre.ethers.getContractFactory("QuantishMarkets");
  const quantishMarkets = await QuantishMarkets.deploy(
    usdcAddress,
    feeRecipient,
    deployer.address // Oracle (will update)
  );
  await quantishMarkets.waitForDeployment();
  const marketsAddress = await quantishMarkets.getAddress();
  console.log("QuantishMarkets deployed to:", marketsAddress);
  
  // Deploy SolanaOracle
  const solanaEmitter = "0x0000000000000000000000000000000000000000000000000000000000000001";
  
  console.log("\nDeploying SolanaOracle...");
  const SolanaOracle = await hre.ethers.getContractFactory("SolanaOracle");
  const solanaOracle = await SolanaOracle.deploy(
    wormholeAddress,
    marketsAddress,
    solanaEmitter
  );
  await solanaOracle.waitForDeployment();
  const oracleAddress = await solanaOracle.getAddress();
  console.log("SolanaOracle deployed to:", oracleAddress);
  
  // Update QuantishMarkets with oracle address
  console.log("\nUpdating oracle address...");
  await quantishMarkets.setOracle(oracleAddress);
  console.log("Oracle set!");
  
  console.log("\n════════════════════════════════════════════════════════");
  console.log("        QUANTISH MARKETS V2 - DEPLOYMENT COMPLETE        ");
  console.log("════════════════════════════════════════════════════════");
  console.log("QuantishMarkets:", marketsAddress);
  console.log("SolanaOracle:   ", oracleAddress);
  console.log("USDC:           ", usdcAddress);
  console.log("Fee Recipient:  ", feeRecipient);
  console.log("════════════════════════════════════════════════════════");
  console.log("\nFEATURES:");
  console.log("  ✓ Buy shares at current price");
  console.log("  ✓ Sell shares at current price");
  console.log("  ✓ 1% fee on ALL trades (buy AND sell)");
  console.log("  ✓ Real-time position values");
  console.log("  ✓ Claim winnings after settlement");
  console.log("════════════════════════════════════════════════════════");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

