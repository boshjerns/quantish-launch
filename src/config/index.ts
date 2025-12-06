import 'dotenv/config';

export interface Config {
  // Network
  network: 'mainnet-beta' | 'devnet' | 'testnet';
  rpcUrl: string;
  wsUrl?: string;
  
  // Master wallet
  masterWalletPrivateKey?: string;
  
  // Encryption
  walletEncryptionPassword: string;
  
  // Trading
  defaultSlippageBps: number;
  priorityFeeMicroLamports: number;
  maxTxRetries: number;
  txTimeoutMs: number;
  
  // Sniper
  autoBuyEnabled: boolean;
  minBuyAmountSol: number;
  maxBuyAmountSol: number;
  
  // APIs
  heliusApiKey?: string;
  jupiterApiUrl: string;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function loadConfig(): Config {
  const network = getEnvOrDefault('SOLANA_NETWORK', 'devnet') as Config['network'];
  
  // Set default RPC URLs based on network
  const defaultRpcUrls: Record<string, string> = {
    'mainnet-beta': 'https://api.mainnet-beta.solana.com',
    'devnet': 'https://api.devnet.solana.com',
    'testnet': 'https://api.testnet.solana.com',
  };
  
  return {
    network,
    rpcUrl: getEnvOrDefault('SOLANA_RPC_URL', defaultRpcUrls[network]),
    wsUrl: process.env.SOLANA_WS_URL,
    
    masterWalletPrivateKey: process.env.MASTER_WALLET_PRIVATE_KEY,
    
    walletEncryptionPassword: getEnvOrDefault('WALLET_ENCRYPTION_PASSWORD', ''),
    
    defaultSlippageBps: parseInt(getEnvOrDefault('DEFAULT_SLIPPAGE_BPS', '500')),
    priorityFeeMicroLamports: parseInt(getEnvOrDefault('PRIORITY_FEE_MICROLAMPORTS', '100000')),
    maxTxRetries: parseInt(getEnvOrDefault('MAX_TX_RETRIES', '3')),
    txTimeoutMs: parseInt(getEnvOrDefault('TX_TIMEOUT_MS', '60000')),
    
    autoBuyEnabled: getEnvOrDefault('AUTO_BUY_ENABLED', 'false') === 'true',
    minBuyAmountSol: parseFloat(getEnvOrDefault('MIN_BUY_AMOUNT_SOL', '0.01')),
    maxBuyAmountSol: parseFloat(getEnvOrDefault('MAX_BUY_AMOUNT_SOL', '0.1')),
    
    heliusApiKey: process.env.HELIUS_API_KEY,
    jupiterApiUrl: getEnvOrDefault('JUPITER_API_URL', 'https://quote-api.jup.ag/v6'),
  };
}

export const config = loadConfig();



export interface Config {
  // Network
  network: 'mainnet-beta' | 'devnet' | 'testnet';
  rpcUrl: string;
  wsUrl?: string;
  
  // Master wallet
  masterWalletPrivateKey?: string;
  
  // Encryption
  walletEncryptionPassword: string;
  
  // Trading
  defaultSlippageBps: number;
  priorityFeeMicroLamports: number;
  maxTxRetries: number;
  txTimeoutMs: number;
  
  // Sniper
  autoBuyEnabled: boolean;
  minBuyAmountSol: number;
  maxBuyAmountSol: number;
  
  // APIs
  heliusApiKey?: string;
  jupiterApiUrl: string;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function loadConfig(): Config {
  const network = getEnvOrDefault('SOLANA_NETWORK', 'devnet') as Config['network'];
  
  // Set default RPC URLs based on network
  const defaultRpcUrls: Record<string, string> = {
    'mainnet-beta': 'https://api.mainnet-beta.solana.com',
    'devnet': 'https://api.devnet.solana.com',
    'testnet': 'https://api.testnet.solana.com',
  };
  
  return {
    network,
    rpcUrl: getEnvOrDefault('SOLANA_RPC_URL', defaultRpcUrls[network]),
    wsUrl: process.env.SOLANA_WS_URL,
    
    masterWalletPrivateKey: process.env.MASTER_WALLET_PRIVATE_KEY,
    
    walletEncryptionPassword: getEnvOrDefault('WALLET_ENCRYPTION_PASSWORD', ''),
    
    defaultSlippageBps: parseInt(getEnvOrDefault('DEFAULT_SLIPPAGE_BPS', '500')),
    priorityFeeMicroLamports: parseInt(getEnvOrDefault('PRIORITY_FEE_MICROLAMPORTS', '100000')),
    maxTxRetries: parseInt(getEnvOrDefault('MAX_TX_RETRIES', '3')),
    txTimeoutMs: parseInt(getEnvOrDefault('TX_TIMEOUT_MS', '60000')),
    
    autoBuyEnabled: getEnvOrDefault('AUTO_BUY_ENABLED', 'false') === 'true',
    minBuyAmountSol: parseFloat(getEnvOrDefault('MIN_BUY_AMOUNT_SOL', '0.01')),
    maxBuyAmountSol: parseFloat(getEnvOrDefault('MAX_BUY_AMOUNT_SOL', '0.1')),
    
    heliusApiKey: process.env.HELIUS_API_KEY,
    jupiterApiUrl: getEnvOrDefault('JUPITER_API_URL', 'https://quote-api.jup.ag/v6'),
  };
}

export const config = loadConfig();


