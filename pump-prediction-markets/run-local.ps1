# Run locally with Railway PostgreSQL

$env:DATABASE_PUBLIC_URL = "postgresql://postgres:ZBuNdoHzvWCHhZpDjkFfJPDgbgEfmGzY@mainline.proxy.rlwy.net:28824/railway"
$env:SOLANA_RPC_URL = "https://mainnet.helius-rpc.com/?api-key=9e722182-5f97-466a-a3e8-c0d8c4622daf"
$env:PORT = "3001"

Write-Host "Starting Pump Prediction Markets API..." -ForegroundColor Green
Write-Host "Database: Railway PostgreSQL" -ForegroundColor Cyan
Write-Host "Port: 3001" -ForegroundColor Cyan

npx tsx src/server-prod.ts


$env:DATABASE_PUBLIC_URL = "postgresql://postgres:ZBuNdoHzvWCHhZpDjkFfJPDgbgEfmGzY@mainline.proxy.rlwy.net:28824/railway"
$env:SOLANA_RPC_URL = "https://mainnet.helius-rpc.com/?api-key=9e722182-5f97-466a-a3e8-c0d8c4622daf"
$env:PORT = "3001"

Write-Host "Starting Pump Prediction Markets API..." -ForegroundColor Green
Write-Host "Database: Railway PostgreSQL" -ForegroundColor Cyan
Write-Host "Port: 3001" -ForegroundColor Cyan

npx tsx src/server-prod.ts

