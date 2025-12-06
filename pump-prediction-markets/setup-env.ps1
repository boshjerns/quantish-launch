# Pump.fun Prediction Markets - Environment Setup

$env:SOLANA_RPC_URL = "https://mainnet.helius-rpc.com/?api-key=9e722182-5f97-466a-a3e8-c0d8c4622daf"
$env:PORT = "3001"
$env:WS_PORT = "3002"
$env:DATABASE_PATH = "./data/markets.db"
$env:TOKEN_REFRESH_INTERVAL = "30000"
$env:PRICE_REFRESH_INTERVAL = "10000"
$env:MIN_MARKET_CAP_SOL = "1"
$env:MAX_MARKETS = "200"

Write-Host "Environment configured for Pump.fun Prediction Markets" -ForegroundColor Green
Write-Host "RPC: Helius (mainnet)" -ForegroundColor Cyan
Write-Host "API Port: $env:PORT" -ForegroundColor Cyan
Write-Host "WebSocket Port: $env:WS_PORT" -ForegroundColor Cyan


$env:SOLANA_RPC_URL = "https://mainnet.helius-rpc.com/?api-key=9e722182-5f97-466a-a3e8-c0d8c4622daf"
$env:PORT = "3001"
$env:WS_PORT = "3002"
$env:DATABASE_PATH = "./data/markets.db"
$env:TOKEN_REFRESH_INTERVAL = "30000"
$env:PRICE_REFRESH_INTERVAL = "10000"
$env:MIN_MARKET_CAP_SOL = "1"
$env:MAX_MARKETS = "200"

Write-Host "Environment configured for Pump.fun Prediction Markets" -ForegroundColor Green
Write-Host "RPC: Helius (mainnet)" -ForegroundColor Cyan
Write-Host "API Port: $env:PORT" -ForegroundColor Cyan
Write-Host "WebSocket Port: $env:WS_PORT" -ForegroundColor Cyan

