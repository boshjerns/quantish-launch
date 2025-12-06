# Setup environment variables for Solana Sniper
# Using Helius RPC for reliable, non-rate-limited access

$env:SOLANA_NETWORK = "mainnet-beta"
$env:SOLANA_RPC_URL = "https://mainnet.helius-rpc.com/?api-key=9e722182-5f97-466a-a3e8-c0d8c4622daf"
$env:MASTER_WALLET_PRIVATE_KEY = "4xJCivHBN8JmWmVoyQdVedd48yRHgwXf2eRhSBJ8yBqK8cGZUhRAKskmm1R2w7RPe1gQenmUtYySJQSF3EcqBLn4"
$env:WALLET_ENCRYPTION_PASSWORD = "QuantishSniper2024!"
$env:DEFAULT_SLIPPAGE_BPS = "1000"
$env:PRIORITY_FEE_MICROLAMPORTS = "200000"
$env:MAX_TX_RETRIES = "3"
$env:TX_TIMEOUT_MS = "60000"
$env:MIN_BUY_AMOUNT_SOL = "0.001"
$env:MAX_BUY_AMOUNT_SOL = "1.0"
$env:HELIUS_API_KEY = "9e722182-5f97-466a-a3e8-c0d8c4622daf"
# Jupiter Ultra API key - get from https://portal.jup.ag (optional, for graduated tokens)
$env:JUPITER_API_KEY = "2d1c1d27-da19-4c81-9a9e-4f742e9bf68c"

Write-Host "Environment configured for Solana Sniper" -ForegroundColor Green
Write-Host "Network: $env:SOLANA_NETWORK" -ForegroundColor Cyan
Write-Host "RPC: Helius (high-performance, no rate limits)" -ForegroundColor Cyan
if (-not $env:JUPITER_API_KEY) {
    Write-Host "Jupiter: Not configured (get API key from portal.jup.ag)" -ForegroundColor Yellow
}


$env:SOLANA_NETWORK = "mainnet-beta"
$env:SOLANA_RPC_URL = "https://mainnet.helius-rpc.com/?api-key=9e722182-5f97-466a-a3e8-c0d8c4622daf"
$env:MASTER_WALLET_PRIVATE_KEY = "4xJCivHBN8JmWmVoyQdVedd48yRHgwXf2eRhSBJ8yBqK8cGZUhRAKskmm1R2w7RPe1gQenmUtYySJQSF3EcqBLn4"
$env:WALLET_ENCRYPTION_PASSWORD = "QuantishSniper2024!"
$env:DEFAULT_SLIPPAGE_BPS = "1000"
$env:PRIORITY_FEE_MICROLAMPORTS = "200000"
$env:MAX_TX_RETRIES = "3"
$env:TX_TIMEOUT_MS = "60000"
$env:MIN_BUY_AMOUNT_SOL = "0.001"
$env:MAX_BUY_AMOUNT_SOL = "1.0"
$env:HELIUS_API_KEY = "9e722182-5f97-466a-a3e8-c0d8c4622daf"
# Jupiter Ultra API key - get from https://portal.jup.ag (optional, for graduated tokens)
$env:JUPITER_API_KEY = "2d1c1d27-da19-4c81-9a9e-4f742e9bf68c"

Write-Host "Environment configured for Solana Sniper" -ForegroundColor Green
Write-Host "Network: $env:SOLANA_NETWORK" -ForegroundColor Cyan
Write-Host "RPC: Helius (high-performance, no rate limits)" -ForegroundColor Cyan
if (-not $env:JUPITER_API_KEY) {
    Write-Host "Jupiter: Not configured (get API key from portal.jup.ag)" -ForegroundColor Yellow
}
