import 'dotenv/config';

export const config = {
  // Solana
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  
  // Server
  port: parseInt(process.env.PORT || '3001'),
  wsPort: parseInt(process.env.WS_PORT || '3002'),
  
  // Database
  databasePath: process.env.DATABASE_PATH || './data/markets.db',
  databaseUrl: process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL || '',
  usePostgres: !!(process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL),
  
  // Refresh intervals
  tokenRefreshInterval: parseInt(process.env.TOKEN_REFRESH_INTERVAL || '30000'),
  priceRefreshInterval: parseInt(process.env.PRICE_REFRESH_INTERVAL || '10000'),
  
  // Market settings
  minMarketCapSol: parseFloat(process.env.MIN_MARKET_CAP_SOL || '1'),
  maxMarkets: parseInt(process.env.MAX_MARKETS || '200'),
  
  // Pump.fun constants
  pumpFun: {
    programId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
    globalConfig: '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf',
    // Bonding curve graduates at ~85 SOL (~$69k at typical SOL prices)
    graduationThresholdLamports: BigInt(85_000_000_000), // 85 SOL
    totalSupply: BigInt(1_000_000_000_000_000), // 1 billion tokens (6 decimals)
  },
};

export type Config = typeof config;
