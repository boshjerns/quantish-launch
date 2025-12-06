/**
 * PRODUCTION MONITORING SYSTEM
 * 
 * Provides:
 * - Health checks
 * - Metrics collection
 * - Alert webhooks
 * - Performance tracking
 */

import { query, getPool } from '../db/postgres.js';
import { Connection } from '@solana/web3.js';
import { config } from '../config/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  components: {
    database: ComponentHealth;
    solanaRpc: ComponentHealth;
    priceUpdates: ComponentHealth;
    orderProcessing: ComponentHealth;
  };
  metrics: SystemMetrics;
}

export interface ComponentHealth {
  status: 'ok' | 'warning' | 'error';
  latency?: number;  // ms
  message?: string;
  lastCheck: number;
}

export interface SystemMetrics {
  activeMarkets: number;
  totalPositions: number;
  openOrders: number;
  totalVolumeUsdc: string;
  priceUpdatesPerMinute: number;
  ordersPerMinute: number;
  avgOrderLatency: number;
  wsConnections: number;
  errorRate: number;
}

// ============================================================================
// METRICS STORAGE
// ============================================================================

const metrics = {
  priceUpdates: [] as number[],  // timestamps
  orderAttempts: [] as number[],  // timestamps
  orderSuccesses: [] as number[],  // timestamps
  orderErrors: [] as number[],  // timestamps
  orderLatencies: [] as number[],  // ms
};

const METRICS_WINDOW_MS = 60_000; // 1 minute

function cleanOldMetrics() {
  const cutoff = Date.now() - METRICS_WINDOW_MS;
  metrics.priceUpdates = metrics.priceUpdates.filter(t => t > cutoff);
  metrics.orderAttempts = metrics.orderAttempts.filter(t => t > cutoff);
  metrics.orderSuccesses = metrics.orderSuccesses.filter(t => t > cutoff);
  metrics.orderErrors = metrics.orderErrors.filter(t => t > cutoff);
  // Keep only last 100 latencies
  if (metrics.orderLatencies.length > 100) {
    metrics.orderLatencies = metrics.orderLatencies.slice(-100);
  }
}

// ============================================================================
// METRIC RECORDING
// ============================================================================

export function recordPriceUpdate() {
  metrics.priceUpdates.push(Date.now());
}

export function recordOrderAttempt() {
  metrics.orderAttempts.push(Date.now());
}

export function recordOrderSuccess(latencyMs: number) {
  metrics.orderSuccesses.push(Date.now());
  metrics.orderLatencies.push(latencyMs);
}

export function recordOrderError() {
  metrics.orderErrors.push(Date.now());
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    await query('SELECT 1');
    return {
      status: 'ok',
      latency: Date.now() - start,
      lastCheck: Date.now(),
    };
  } catch (error: any) {
    return {
      status: 'error',
      message: error.message,
      lastCheck: Date.now(),
    };
  }
}

async function checkSolanaRpc(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const connection = new Connection(config.rpcUrl, 'confirmed');
    await connection.getSlot();
    const latency = Date.now() - start;
    return {
      status: latency < 1000 ? 'ok' : 'warning',
      latency,
      message: latency >= 1000 ? 'High latency' : undefined,
      lastCheck: Date.now(),
    };
  } catch (error: any) {
    return {
      status: 'error',
      message: error.message,
      lastCheck: Date.now(),
    };
  }
}

function checkPriceUpdates(): ComponentHealth {
  cleanOldMetrics();
  const updatesPerMinute = metrics.priceUpdates.length;
  
  // Expect at least 6 updates per minute (every 10 seconds)
  if (updatesPerMinute >= 6) {
    return { status: 'ok', lastCheck: Date.now() };
  } else if (updatesPerMinute >= 3) {
    return { status: 'warning', message: `Only ${updatesPerMinute} updates/min`, lastCheck: Date.now() };
  } else {
    return { status: 'error', message: `Only ${updatesPerMinute} updates/min`, lastCheck: Date.now() };
  }
}

function checkOrderProcessing(): ComponentHealth {
  cleanOldMetrics();
  
  const attempts = metrics.orderAttempts.length;
  const errors = metrics.orderErrors.length;
  
  if (attempts === 0) {
    return { status: 'ok', message: 'No orders in last minute', lastCheck: Date.now() };
  }
  
  const errorRate = errors / attempts;
  
  if (errorRate < 0.05) {
    return { status: 'ok', lastCheck: Date.now() };
  } else if (errorRate < 0.20) {
    return { status: 'warning', message: `${(errorRate * 100).toFixed(1)}% error rate`, lastCheck: Date.now() };
  } else {
    return { status: 'error', message: `${(errorRate * 100).toFixed(1)}% error rate`, lastCheck: Date.now() };
  }
}

// ============================================================================
// AGGREGATED HEALTH STATUS
// ============================================================================

let wsConnectionCount = 0;

export function setWsConnectionCount(count: number) {
  wsConnectionCount = count;
}

export async function getHealthStatus(): Promise<HealthStatus> {
  cleanOldMetrics();
  
  const [database, solanaRpc] = await Promise.all([
    checkDatabase(),
    checkSolanaRpc(),
  ]);
  
  const priceUpdates = checkPriceUpdates();
  const orderProcessing = checkOrderProcessing();
  
  // Get DB metrics
  const [marketsResult, positionsResult, volumeResult] = await Promise.all([
    query(`SELECT COUNT(*) as count FROM tokens WHERE status = 'active'`),
    query(`SELECT COUNT(*) as count FROM positions WHERE is_settled = 0`),
    query(`SELECT COALESCE(SUM(CAST(yes_pool AS BIGINT) + CAST(no_pool AS BIGINT)), 0) as total FROM tokens`),
  ]);
  
  const avgLatency = metrics.orderLatencies.length > 0
    ? metrics.orderLatencies.reduce((a, b) => a + b, 0) / metrics.orderLatencies.length
    : 0;
  
  const systemMetrics: SystemMetrics = {
    activeMarkets: parseInt(marketsResult[0]?.count) || 0,
    totalPositions: parseInt(positionsResult[0]?.count) || 0,
    openOrders: 0,  // Would need limit orders table
    totalVolumeUsdc: volumeResult[0]?.total?.toString() || '0',
    priceUpdatesPerMinute: metrics.priceUpdates.length,
    ordersPerMinute: metrics.orderAttempts.length,
    avgOrderLatency: Math.round(avgLatency),
    wsConnections: wsConnectionCount,
    errorRate: metrics.orderAttempts.length > 0
      ? metrics.orderErrors.length / metrics.orderAttempts.length
      : 0,
  };
  
  // Determine overall status
  const components = { database, solanaRpc, priceUpdates, orderProcessing };
  const statuses = Object.values(components).map(c => c.status);
  
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  if (statuses.every(s => s === 'ok')) {
    overallStatus = 'healthy';
  } else if (statuses.some(s => s === 'error')) {
    overallStatus = 'unhealthy';
  } else {
    overallStatus = 'degraded';
  }
  
  return {
    status: overallStatus,
    timestamp: Date.now(),
    components,
    metrics: systemMetrics,
  };
}

// ============================================================================
// ALERTING
// ============================================================================

interface Alert {
  level: 'warning' | 'critical';
  component: string;
  message: string;
  timestamp: number;
}

const recentAlerts = new Map<string, number>(); // key -> last alert time
const ALERT_COOLDOWN_MS = 300_000; // 5 minutes

export async function checkAndAlert(webhookUrl?: string): Promise<Alert[]> {
  const health = await getHealthStatus();
  const alerts: Alert[] = [];
  
  for (const [name, component] of Object.entries(health.components)) {
    const alertKey = `${name}-${component.status}`;
    const lastAlert = recentAlerts.get(alertKey) || 0;
    
    if (Date.now() - lastAlert < ALERT_COOLDOWN_MS) {
      continue; // Skip if recently alerted
    }
    
    if (component.status === 'error') {
      alerts.push({
        level: 'critical',
        component: name,
        message: component.message || `${name} is failing`,
        timestamp: Date.now(),
      });
      recentAlerts.set(alertKey, Date.now());
    } else if (component.status === 'warning') {
      alerts.push({
        level: 'warning',
        component: name,
        message: component.message || `${name} has issues`,
        timestamp: Date.now(),
      });
      recentAlerts.set(alertKey, Date.now());
    }
  }
  
  // Send webhook if configured
  if (webhookUrl && alerts.length > 0) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚨 Pump.fun Prediction Markets Alert\n${alerts.map(a => 
            `[${a.level.toUpperCase()}] ${a.component}: ${a.message}`
          ).join('\n')}`,
          alerts,
          health,
        }),
      });
    } catch (e) {
      console.error('Failed to send webhook alert:', e);
    }
  }
  
  return alerts;
}

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

export function logMetrics() {
  cleanOldMetrics();
  console.log(`
📊 System Metrics (last 60s):
   - Price updates: ${metrics.priceUpdates.length}
   - Order attempts: ${metrics.orderAttempts.length}
   - Order successes: ${metrics.orderSuccesses.length}
   - Order errors: ${metrics.orderErrors.length}
   - Avg latency: ${metrics.orderLatencies.length > 0 
     ? (metrics.orderLatencies.reduce((a, b) => a + b, 0) / metrics.orderLatencies.length).toFixed(0) 
     : 'N/A'}ms
   - WS connections: ${wsConnectionCount}
  `);
}

 * PRODUCTION MONITORING SYSTEM
 * 
 * Provides:
 * - Health checks
 * - Metrics collection
 * - Alert webhooks
 * - Performance tracking
 */

import { query, getPool } from '../db/postgres.js';
import { Connection } from '@solana/web3.js';
import { config } from '../config/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  components: {
    database: ComponentHealth;
    solanaRpc: ComponentHealth;
    priceUpdates: ComponentHealth;
    orderProcessing: ComponentHealth;
  };
  metrics: SystemMetrics;
}

export interface ComponentHealth {
  status: 'ok' | 'warning' | 'error';
  latency?: number;  // ms
  message?: string;
  lastCheck: number;
}

export interface SystemMetrics {
  activeMarkets: number;
  totalPositions: number;
  openOrders: number;
  totalVolumeUsdc: string;
  priceUpdatesPerMinute: number;
  ordersPerMinute: number;
  avgOrderLatency: number;
  wsConnections: number;
  errorRate: number;
}

// ============================================================================
// METRICS STORAGE
// ============================================================================

const metrics = {
  priceUpdates: [] as number[],  // timestamps
  orderAttempts: [] as number[],  // timestamps
  orderSuccesses: [] as number[],  // timestamps
  orderErrors: [] as number[],  // timestamps
  orderLatencies: [] as number[],  // ms
};

const METRICS_WINDOW_MS = 60_000; // 1 minute

function cleanOldMetrics() {
  const cutoff = Date.now() - METRICS_WINDOW_MS;
  metrics.priceUpdates = metrics.priceUpdates.filter(t => t > cutoff);
  metrics.orderAttempts = metrics.orderAttempts.filter(t => t > cutoff);
  metrics.orderSuccesses = metrics.orderSuccesses.filter(t => t > cutoff);
  metrics.orderErrors = metrics.orderErrors.filter(t => t > cutoff);
  // Keep only last 100 latencies
  if (metrics.orderLatencies.length > 100) {
    metrics.orderLatencies = metrics.orderLatencies.slice(-100);
  }
}

// ============================================================================
// METRIC RECORDING
// ============================================================================

export function recordPriceUpdate() {
  metrics.priceUpdates.push(Date.now());
}

export function recordOrderAttempt() {
  metrics.orderAttempts.push(Date.now());
}

export function recordOrderSuccess(latencyMs: number) {
  metrics.orderSuccesses.push(Date.now());
  metrics.orderLatencies.push(latencyMs);
}

export function recordOrderError() {
  metrics.orderErrors.push(Date.now());
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    await query('SELECT 1');
    return {
      status: 'ok',
      latency: Date.now() - start,
      lastCheck: Date.now(),
    };
  } catch (error: any) {
    return {
      status: 'error',
      message: error.message,
      lastCheck: Date.now(),
    };
  }
}

async function checkSolanaRpc(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const connection = new Connection(config.rpcUrl, 'confirmed');
    await connection.getSlot();
    const latency = Date.now() - start;
    return {
      status: latency < 1000 ? 'ok' : 'warning',
      latency,
      message: latency >= 1000 ? 'High latency' : undefined,
      lastCheck: Date.now(),
    };
  } catch (error: any) {
    return {
      status: 'error',
      message: error.message,
      lastCheck: Date.now(),
    };
  }
}

function checkPriceUpdates(): ComponentHealth {
  cleanOldMetrics();
  const updatesPerMinute = metrics.priceUpdates.length;
  
  // Expect at least 6 updates per minute (every 10 seconds)
  if (updatesPerMinute >= 6) {
    return { status: 'ok', lastCheck: Date.now() };
  } else if (updatesPerMinute >= 3) {
    return { status: 'warning', message: `Only ${updatesPerMinute} updates/min`, lastCheck: Date.now() };
  } else {
    return { status: 'error', message: `Only ${updatesPerMinute} updates/min`, lastCheck: Date.now() };
  }
}

function checkOrderProcessing(): ComponentHealth {
  cleanOldMetrics();
  
  const attempts = metrics.orderAttempts.length;
  const errors = metrics.orderErrors.length;
  
  if (attempts === 0) {
    return { status: 'ok', message: 'No orders in last minute', lastCheck: Date.now() };
  }
  
  const errorRate = errors / attempts;
  
  if (errorRate < 0.05) {
    return { status: 'ok', lastCheck: Date.now() };
  } else if (errorRate < 0.20) {
    return { status: 'warning', message: `${(errorRate * 100).toFixed(1)}% error rate`, lastCheck: Date.now() };
  } else {
    return { status: 'error', message: `${(errorRate * 100).toFixed(1)}% error rate`, lastCheck: Date.now() };
  }
}

// ============================================================================
// AGGREGATED HEALTH STATUS
// ============================================================================

let wsConnectionCount = 0;

export function setWsConnectionCount(count: number) {
  wsConnectionCount = count;
}

export async function getHealthStatus(): Promise<HealthStatus> {
  cleanOldMetrics();
  
  const [database, solanaRpc] = await Promise.all([
    checkDatabase(),
    checkSolanaRpc(),
  ]);
  
  const priceUpdates = checkPriceUpdates();
  const orderProcessing = checkOrderProcessing();
  
  // Get DB metrics
  const [marketsResult, positionsResult, volumeResult] = await Promise.all([
    query(`SELECT COUNT(*) as count FROM tokens WHERE status = 'active'`),
    query(`SELECT COUNT(*) as count FROM positions WHERE is_settled = 0`),
    query(`SELECT COALESCE(SUM(CAST(yes_pool AS BIGINT) + CAST(no_pool AS BIGINT)), 0) as total FROM tokens`),
  ]);
  
  const avgLatency = metrics.orderLatencies.length > 0
    ? metrics.orderLatencies.reduce((a, b) => a + b, 0) / metrics.orderLatencies.length
    : 0;
  
  const systemMetrics: SystemMetrics = {
    activeMarkets: parseInt(marketsResult[0]?.count) || 0,
    totalPositions: parseInt(positionsResult[0]?.count) || 0,
    openOrders: 0,  // Would need limit orders table
    totalVolumeUsdc: volumeResult[0]?.total?.toString() || '0',
    priceUpdatesPerMinute: metrics.priceUpdates.length,
    ordersPerMinute: metrics.orderAttempts.length,
    avgOrderLatency: Math.round(avgLatency),
    wsConnections: wsConnectionCount,
    errorRate: metrics.orderAttempts.length > 0
      ? metrics.orderErrors.length / metrics.orderAttempts.length
      : 0,
  };
  
  // Determine overall status
  const components = { database, solanaRpc, priceUpdates, orderProcessing };
  const statuses = Object.values(components).map(c => c.status);
  
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  if (statuses.every(s => s === 'ok')) {
    overallStatus = 'healthy';
  } else if (statuses.some(s => s === 'error')) {
    overallStatus = 'unhealthy';
  } else {
    overallStatus = 'degraded';
  }
  
  return {
    status: overallStatus,
    timestamp: Date.now(),
    components,
    metrics: systemMetrics,
  };
}

// ============================================================================
// ALERTING
// ============================================================================

interface Alert {
  level: 'warning' | 'critical';
  component: string;
  message: string;
  timestamp: number;
}

const recentAlerts = new Map<string, number>(); // key -> last alert time
const ALERT_COOLDOWN_MS = 300_000; // 5 minutes

export async function checkAndAlert(webhookUrl?: string): Promise<Alert[]> {
  const health = await getHealthStatus();
  const alerts: Alert[] = [];
  
  for (const [name, component] of Object.entries(health.components)) {
    const alertKey = `${name}-${component.status}`;
    const lastAlert = recentAlerts.get(alertKey) || 0;
    
    if (Date.now() - lastAlert < ALERT_COOLDOWN_MS) {
      continue; // Skip if recently alerted
    }
    
    if (component.status === 'error') {
      alerts.push({
        level: 'critical',
        component: name,
        message: component.message || `${name} is failing`,
        timestamp: Date.now(),
      });
      recentAlerts.set(alertKey, Date.now());
    } else if (component.status === 'warning') {
      alerts.push({
        level: 'warning',
        component: name,
        message: component.message || `${name} has issues`,
        timestamp: Date.now(),
      });
      recentAlerts.set(alertKey, Date.now());
    }
  }
  
  // Send webhook if configured
  if (webhookUrl && alerts.length > 0) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚨 Pump.fun Prediction Markets Alert\n${alerts.map(a => 
            `[${a.level.toUpperCase()}] ${a.component}: ${a.message}`
          ).join('\n')}`,
          alerts,
          health,
        }),
      });
    } catch (e) {
      console.error('Failed to send webhook alert:', e);
    }
  }
  
  return alerts;
}

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

export function logMetrics() {
  cleanOldMetrics();
  console.log(`
📊 System Metrics (last 60s):
   - Price updates: ${metrics.priceUpdates.length}
   - Order attempts: ${metrics.orderAttempts.length}
   - Order successes: ${metrics.orderSuccesses.length}
   - Order errors: ${metrics.orderErrors.length}
   - Avg latency: ${metrics.orderLatencies.length > 0 
     ? (metrics.orderLatencies.reduce((a, b) => a + b, 0) / metrics.orderLatencies.length).toFixed(0) 
     : 'N/A'}ms
   - WS connections: ${wsConnectionCount}
  `);
}

