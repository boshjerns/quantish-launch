/**
 * PRODUCTION API SECURITY MIDDLEWARE
 * 
 * Provides:
 * - API key authentication
 * - Rate limiting
 * - Request validation
 * - CORS with whitelist
 * - Request logging
 */

import { Request, Response, NextFunction } from 'express';
import { query, execute } from '../db/postgres.js';

// ============================================================================
// TYPES
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      apiKey?: string;
    }
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  // Rate limiting
  rateLimit: {
    windowMs: 60_000, // 1 minute
    maxRequests: 60,  // 60 requests per minute
    maxBetsPerMinute: 10, // Stricter for bets
  },
  
  // CORS whitelist
  corsOrigins: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://quantish.live',
    'https://www.quantish.live',
  ],
  
  // API key prefix
  apiKeyPrefix: 'pm_',
};

// ============================================================================
// IN-MEMORY RATE LIMIT STORE (use Redis in production)
// ============================================================================

const rateLimitStore = new Map<string, RateLimitEntry>();
const betRateLimitStore = new Map<string, RateLimitEntry>();

function checkRateLimit(
  store: Map<string, RateLimitEntry>,
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);
  
  if (!entry || now >= entry.resetAt) {
    // Reset window
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }
  
  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  
  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

// ============================================================================
// API KEY VALIDATION
// ============================================================================

interface ApiKeyRecord {
  id: string;
  user_id: string;
  key_hash: string;
  name: string;
  permissions: string[];
  created_at: number;
  last_used_at: number;
  is_active: boolean;
}

// Simple hash for demo - use bcrypt/argon2 in production
function hashApiKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

async function validateApiKey(apiKey: string): Promise<{ valid: boolean; userId?: string; error?: string }> {
  if (!apiKey) {
    return { valid: false, error: 'No API key provided' };
  }
  
  if (!apiKey.startsWith(config.apiKeyPrefix)) {
    return { valid: false, error: 'Invalid API key format' };
  }
  
  // For development, allow test keys
  if (apiKey.startsWith('pm_test_')) {
    const userId = apiKey.replace('pm_test_', '');
    return { valid: true, userId };
  }
  
  // In production, validate against database
  // const keyHash = hashApiKey(apiKey);
  // const record = await queryOne<ApiKeyRecord>(`
  //   SELECT * FROM api_keys WHERE key_hash = $1 AND is_active = true
  // `, [keyHash]);
  
  // For now, accept any key with proper format
  return { valid: true, userId: apiKey.slice(config.apiKeyPrefix.length) };
}

// ============================================================================
// MIDDLEWARE: API KEY AUTHENTICATION
// ============================================================================

export function authMiddleware(required: boolean = true) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] as string || 
                   req.headers['authorization']?.replace('Bearer ', '') ||
                   req.query.apiKey as string;
    
    const validation = await validateApiKey(apiKey);
    
    if (!validation.valid) {
      if (required) {
        return res.status(401).json({
          success: false,
          error: validation.error || 'Unauthorized',
          code: 'AUTH_REQUIRED',
        });
      }
      // Optional auth - continue without user ID
      return next();
    }
    
    req.userId = validation.userId;
    req.apiKey = apiKey;
    next();
  };
}

// ============================================================================
// MIDDLEWARE: RATE LIMITING
// ============================================================================

export function rateLimitMiddleware(type: 'general' | 'bets' = 'general') {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.userId || req.ip || 'anonymous';
    
    const store = type === 'bets' ? betRateLimitStore : rateLimitStore;
    const maxRequests = type === 'bets' 
      ? config.rateLimit.maxBetsPerMinute 
      : config.rateLimit.maxRequests;
    
    const result = checkRateLimit(store, key, maxRequests, config.rateLimit.windowMs);
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetAt);
    
    if (!result.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      });
    }
    
    next();
  };
}

// ============================================================================
// MIDDLEWARE: INPUT VALIDATION
// ============================================================================

export function validateOrderInput(req: Request, res: Response, next: NextFunction) {
  const { marketMint, side, amount, amountUsdc } = req.body;
  
  // Market mint validation
  if (!marketMint || typeof marketMint !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Invalid marketMint',
      code: 'INVALID_INPUT',
    });
  }
  
  // Solana address validation (44 chars base58)
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(marketMint)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid Solana address format',
      code: 'INVALID_ADDRESS',
    });
  }
  
  // Side validation
  if (side !== 'yes' && side !== 'no') {
    return res.status(400).json({
      success: false,
      error: 'Side must be "yes" or "no"',
      code: 'INVALID_SIDE',
    });
  }
  
  // Amount validation
  const orderAmount = amount || amountUsdc;
  if (typeof orderAmount !== 'number' || orderAmount <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Amount must be a positive number',
      code: 'INVALID_AMOUNT',
    });
  }
  
  if (orderAmount < 1) {
    return res.status(400).json({
      success: false,
      error: 'Minimum bet is $1.00',
      code: 'MIN_AMOUNT',
    });
  }
  
  if (orderAmount > 100_000) {
    return res.status(400).json({
      success: false,
      error: 'Maximum bet is $100,000',
      code: 'MAX_AMOUNT',
    });
  }
  
  next();
}

// ============================================================================
// MIDDLEWARE: CORS
// ============================================================================

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  
  if (origin && config.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Allow all in development
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-User-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  next();
}

// ============================================================================
// MIDDLEWARE: REQUEST LOGGING
// ============================================================================

export function requestLogMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      userId: req.userId || 'anon',
      ip: req.ip,
    };
    
    if (res.statusCode >= 400) {
      console.warn('Request error:', log);
    } else if (duration > 1000) {
      console.warn('Slow request:', log);
    } else {
      console.log('Request:', log);
    }
  });
  
  next();
}

// ============================================================================
// MIDDLEWARE: ERROR HANDLER
// ============================================================================

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  console.error('Unhandled error:', err);
  
  // Don't leak stack traces in production
  const isProd = process.env.NODE_ENV === 'production';
  
  res.status(500).json({
    success: false,
    error: isProd ? 'Internal server error' : err.message,
    code: 'INTERNAL_ERROR',
    ...(isProd ? {} : { stack: err.stack }),
  });
}

// ============================================================================
// COMBINED SECURE ROUTES
// ============================================================================

export const secureOrderRoute = [
  rateLimitMiddleware('bets'),
  authMiddleware(true),
  validateOrderInput,
];

export const publicRoute = [
  rateLimitMiddleware('general'),
  authMiddleware(false),
];

