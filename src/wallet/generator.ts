import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { encrypt, decrypt, hash } from './encryption.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

export interface WalletInfo {
  publicKey: string;
  encryptedPrivateKey: string;
  index: number;
  createdAt: string;
  label?: string;
}

export interface WalletStore {
  version: number;
  createdAt: string;
  updatedAt: string;
  passwordHash: string;
  wallets: WalletInfo[];
}

const WALLETS_DIR = './wallets';
const WALLET_STORE_FILE = 'wallet-store.json';

/**
 * Ensures the wallets directory exists
 */
function ensureWalletsDir(): void {
  if (!existsSync(WALLETS_DIR)) {
    mkdirSync(WALLETS_DIR, { recursive: true });
  }
}

/**
 * Gets the wallet store file path
 */
function getStoreFilePath(): string {
  return join(WALLETS_DIR, WALLET_STORE_FILE);
}

/**
 * Generates a new Solana keypair
 */
export function generateKeypair(): Keypair {
  return Keypair.generate();
}

/**
 * Converts a keypair to base58 private key string
 */
export function keypairToBase58(keypair: Keypair): string {
  return bs58.encode(keypair.secretKey);
}

/**
 * Converts a base58 private key string to keypair
 */
export function base58ToKeypair(privateKey: string): Keypair {
  const secretKey = bs58.decode(privateKey);
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Generates multiple wallets and stores them encrypted
 */
export function generateWallets(
  count: number,
  password: string,
  labels?: string[]
): WalletInfo[] {
  ensureWalletsDir();
  
  const wallets: WalletInfo[] = [];
  const now = new Date().toISOString();
  
  // Load existing store or create new
  let store = loadWalletStore(password);
  const startIndex = store ? store.wallets.length : 0;
  
  for (let i = 0; i < count; i++) {
    const keypair = generateKeypair();
    const privateKeyBase58 = keypairToBase58(keypair);
    const encryptedPrivateKey = encrypt(privateKeyBase58, password);
    
    const walletInfo: WalletInfo = {
      publicKey: keypair.publicKey.toBase58(),
      encryptedPrivateKey,
      index: startIndex + i,
      createdAt: now,
      label: labels?.[i] || `Wallet ${startIndex + i + 1}`,
    };
    
    wallets.push(walletInfo);
  }
  
  // Update or create store
  if (store) {
    store.wallets.push(...wallets);
    store.updatedAt = now;
  } else {
    store = {
      version: 1,
      createdAt: now,
      updatedAt: now,
      passwordHash: hash(password),
      wallets,
    };
  }
  
  // Save store
  saveWalletStore(store);
  
  return wallets;
}

/**
 * Loads the wallet store from disk
 */
export function loadWalletStore(password?: string): WalletStore | null {
  const filePath = getStoreFilePath();
  
  if (!existsSync(filePath)) {
    return null;
  }
  
  try {
    const data = readFileSync(filePath, 'utf8');
    const store: WalletStore = JSON.parse(data);
    
    // Verify password if provided
    if (password && store.passwordHash !== hash(password)) {
      throw new Error('Invalid password');
    }
    
    return store;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Corrupted wallet store file');
    }
    throw error;
  }
}

/**
 * Saves the wallet store to disk
 */
function saveWalletStore(store: WalletStore): void {
  ensureWalletsDir();
  const filePath = getStoreFilePath();
  writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * Gets a decrypted keypair from the store by index
 */
export function getKeypairByIndex(index: number, password: string): Keypair {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  const wallet = store.wallets.find(w => w.index === index);
  
  if (!wallet) {
    throw new Error(`Wallet at index ${index} not found`);
  }
  
  const privateKeyBase58 = decrypt(wallet.encryptedPrivateKey, password);
  return base58ToKeypair(privateKeyBase58);
}

/**
 * Gets all decrypted keypairs from the store
 */
export function getAllKeypairs(password: string): Keypair[] {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  return store.wallets.map(wallet => {
    const privateKeyBase58 = decrypt(wallet.encryptedPrivateKey, password);
    return base58ToKeypair(privateKeyBase58);
  });
}

/**
 * Gets all public keys from the store (no password needed)
 */
export function getAllPublicKeys(): string[] {
  const store = loadWalletStore();
  
  if (!store) {
    return [];
  }
  
  return store.wallets.map(w => w.publicKey);
}

/**
 * Verifies the password against the store
 */
export function verifyPassword(password: string): boolean {
  const store = loadWalletStore();
  
  if (!store) {
    return false;
  }
  
  return store.passwordHash === hash(password);
}

/**
 * Exports a single wallet's private key (use with extreme caution!)
 */
export function exportPrivateKey(index: number, password: string): string {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  const wallet = store.wallets.find(w => w.index === index);
  
  if (!wallet) {
    throw new Error(`Wallet at index ${index} not found`);
  }
  
  return decrypt(wallet.encryptedPrivateKey, password);
}


import bs58 from 'bs58';
import { encrypt, decrypt, hash } from './encryption.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

export interface WalletInfo {
  publicKey: string;
  encryptedPrivateKey: string;
  index: number;
  createdAt: string;
  label?: string;
}

export interface WalletStore {
  version: number;
  createdAt: string;
  updatedAt: string;
  passwordHash: string;
  wallets: WalletInfo[];
}

const WALLETS_DIR = './wallets';
const WALLET_STORE_FILE = 'wallet-store.json';

/**
 * Ensures the wallets directory exists
 */
function ensureWalletsDir(): void {
  if (!existsSync(WALLETS_DIR)) {
    mkdirSync(WALLETS_DIR, { recursive: true });
  }
}

/**
 * Gets the wallet store file path
 */
function getStoreFilePath(): string {
  return join(WALLETS_DIR, WALLET_STORE_FILE);
}

/**
 * Generates a new Solana keypair
 */
export function generateKeypair(): Keypair {
  return Keypair.generate();
}

/**
 * Converts a keypair to base58 private key string
 */
export function keypairToBase58(keypair: Keypair): string {
  return bs58.encode(keypair.secretKey);
}

/**
 * Converts a base58 private key string to keypair
 */
export function base58ToKeypair(privateKey: string): Keypair {
  const secretKey = bs58.decode(privateKey);
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Generates multiple wallets and stores them encrypted
 */
export function generateWallets(
  count: number,
  password: string,
  labels?: string[]
): WalletInfo[] {
  ensureWalletsDir();
  
  const wallets: WalletInfo[] = [];
  const now = new Date().toISOString();
  
  // Load existing store or create new
  let store = loadWalletStore(password);
  const startIndex = store ? store.wallets.length : 0;
  
  for (let i = 0; i < count; i++) {
    const keypair = generateKeypair();
    const privateKeyBase58 = keypairToBase58(keypair);
    const encryptedPrivateKey = encrypt(privateKeyBase58, password);
    
    const walletInfo: WalletInfo = {
      publicKey: keypair.publicKey.toBase58(),
      encryptedPrivateKey,
      index: startIndex + i,
      createdAt: now,
      label: labels?.[i] || `Wallet ${startIndex + i + 1}`,
    };
    
    wallets.push(walletInfo);
  }
  
  // Update or create store
  if (store) {
    store.wallets.push(...wallets);
    store.updatedAt = now;
  } else {
    store = {
      version: 1,
      createdAt: now,
      updatedAt: now,
      passwordHash: hash(password),
      wallets,
    };
  }
  
  // Save store
  saveWalletStore(store);
  
  return wallets;
}

/**
 * Loads the wallet store from disk
 */
export function loadWalletStore(password?: string): WalletStore | null {
  const filePath = getStoreFilePath();
  
  if (!existsSync(filePath)) {
    return null;
  }
  
  try {
    const data = readFileSync(filePath, 'utf8');
    const store: WalletStore = JSON.parse(data);
    
    // Verify password if provided
    if (password && store.passwordHash !== hash(password)) {
      throw new Error('Invalid password');
    }
    
    return store;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Corrupted wallet store file');
    }
    throw error;
  }
}

/**
 * Saves the wallet store to disk
 */
function saveWalletStore(store: WalletStore): void {
  ensureWalletsDir();
  const filePath = getStoreFilePath();
  writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * Gets a decrypted keypair from the store by index
 */
export function getKeypairByIndex(index: number, password: string): Keypair {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  const wallet = store.wallets.find(w => w.index === index);
  
  if (!wallet) {
    throw new Error(`Wallet at index ${index} not found`);
  }
  
  const privateKeyBase58 = decrypt(wallet.encryptedPrivateKey, password);
  return base58ToKeypair(privateKeyBase58);
}

/**
 * Gets all decrypted keypairs from the store
 */
export function getAllKeypairs(password: string): Keypair[] {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  return store.wallets.map(wallet => {
    const privateKeyBase58 = decrypt(wallet.encryptedPrivateKey, password);
    return base58ToKeypair(privateKeyBase58);
  });
}

/**
 * Gets all public keys from the store (no password needed)
 */
export function getAllPublicKeys(): string[] {
  const store = loadWalletStore();
  
  if (!store) {
    return [];
  }
  
  return store.wallets.map(w => w.publicKey);
}

/**
 * Verifies the password against the store
 */
export function verifyPassword(password: string): boolean {
  const store = loadWalletStore();
  
  if (!store) {
    return false;
  }
  
  return store.passwordHash === hash(password);
}

/**
 * Exports a single wallet's private key (use with extreme caution!)
 */
export function exportPrivateKey(index: number, password: string): string {
  const store = loadWalletStore(password);
  
  if (!store) {
    throw new Error('No wallet store found');
  }
  
  const wallet = store.wallets.find(w => w.index === index);
  
  if (!wallet) {
    throw new Error(`Wallet at index ${index} not found`);
  }
  
  return decrypt(wallet.encryptedPrivateKey, password);
}


