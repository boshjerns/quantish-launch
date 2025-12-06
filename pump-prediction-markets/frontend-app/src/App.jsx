import React, { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import './App.css'

// Contract on Base - QuantishMarketsV3 (ONE-SIDED PROTECTION) with 1% fee
const CONTRACT = '0x223d2E7195C703EF6b26ce8Ce5Fb4C0618078361'
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const RPC = 'https://base-mainnet.g.alchemy.com/v2/RAGQigMKiV7byokgnvmbr'
const CHAIN_ID = 8453

// Pump.fun proxy
const PUMP_API = 'http://localhost:3001/api/pump'

// Ethers v5 helpers
const { providers, utils, constants, Contract } = ethers
const { JsonRpcProvider, Web3Provider } = providers
const { formatUnits, parseUnits, keccak256, toUtf8Bytes } = utils
const { MaxUint256 } = constants

const ABI = [
  'function getMarketCount() view returns (uint256)',
  'function allMarketIds(uint256) view returns (bytes32)',
  'function getMarket(bytes32) view returns (bytes32 solanaTokenMint, uint256 startTime, uint256 endTime, uint256 yesPool, uint256 noPool, uint256 currentPriceBps, bool settled, bool outcome)',
  'function getPosition(bytes32, address, bool) view returns (uint256 shares, uint256 costBasis, bool claimed)',
  'function buyShares(bytes32 marketId, bool side, uint256 amount, uint256 minSharesOut, uint256 maxPriceBps)',
  'function buySharesSimple(bytes32 marketId, bool side, uint256 amount)',
  'function sellShares(bytes32 marketId, bool side, uint256 sharesToSell, uint256 minPayoutOut)',
  'function claimWinnings(bytes32 marketId, bool side)',
  'function getQuote(bytes32, bool, uint256) view returns (uint256 shares, uint256 priceBps, uint256 fee, uint256 amountAfterFee)',
  'function MIN_BET() view returns (uint256)',
  'function FEE_BPS() view returns (uint256)',
  'event BetPlaced(bytes32 indexed marketId, address indexed user, bool side, uint256 amount, uint256 shares, uint256 priceBps, uint256 fee)',
]

// Slippage tolerance (5% default)
const SLIPPAGE_BPS = 500

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address, uint256) returns (bool)',
  'function allowance(address, address) view returns (uint256)',
  'function decimals() view returns (uint8)',
]

function App() {
  const [signer, setSigner] = useState(null)
  const [contract, setContract] = useState(null)
  const [usdc, setUsdc] = useState(null)
  const [user, setUser] = useState(null)
  const [balance, setBalance] = useState('--')
  
  // REAL pump.fun tokens (from Solana on-chain via WebSocket)
  const [pumpTokens, setPumpTokens] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [wsConnected, setWsConnected] = useState(false)
  
  // Active markets (on-chain) - keyed by mint hash
  const [activeMarkets, setActiveMarkets] = useState({})
  // Also keep a list of all market data for displaying in the grid
  const [allMarkets, setAllMarkets] = useState([])
  const [userPositions, setUserPositions] = useState({})
  
  // Modal state
  const [modal, setModal] = useState({ open: false, market: null, side: null })
  const [amount, setAmount] = useState('1')
  const [txStatus, setTxStatus] = useState(null)
  const [txMessage, setTxMessage] = useState('')
  
  // Activity feed
  const [feed, setFeed] = useState([])
  
  // Timer tick for live countdown
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  // Next cycle time (markets created at :00 and :30)
  const getNextCycleTime = () => {
    const now = new Date()
    const mins = now.getMinutes()
    const nextCycleMins = mins < 30 ? 30 : 60
    const secsToNext = (nextCycleMins - mins) * 60 - now.getSeconds()
    return secsToNext
  }

  // Initialize provider (read-only)
  useEffect(() => {
    console.log('Initializing with contract:', CONTRACT)
    const p = new JsonRpcProvider(RPC)
    const c = new Contract(CONTRACT, ABI, p)
    const u = new Contract(USDC, ERC20_ABI, p)
    setContract(c)
    setUsdc(u)
    console.log('Contract initialized')
  }, [])

  // Fetch initial pump.fun tokens via REST
  const fetchPumpTokens = useCallback(async () => {
    try {
      const res = await fetch(`${PUMP_API}/coins?_t=${Date.now()}`)
      
      if (!res.ok) throw new Error(`API returned ${res.status}`)
      
      const data = await res.json()
      if (!Array.isArray(data)) throw new Error('Invalid response')
      
      const tokens = data.map(t => ({
        mint: t.mint,
        mintHash: keccak256(toUtf8Bytes(t.mint)),
        name: t.name || 'Unknown',
        symbol: t.symbol || '???',
        image: t.image_uri,
        description: t.description,
        bondingProgress: t.bonding_curve_progress || 0,
        complete: t.complete,
        created: t.created_timestamp,
        marketCap: t.market_cap || 0,
        solInCurve: t.sol_in_curve || 0,
      }))
      
      setPumpTokens(tokens)
      setLastUpdate(new Date())
      setError(null)
      setLoading(false)
    } catch (e) {
      console.error('Error fetching pump.fun:', e)
      setError(e.message)
      setLoading(false)
    }
  }, [])

  // Connect to WebSocket for real-time updates
  useEffect(() => {
    let ws = null
    let reconnectTimeout = null
    
    const connect = () => {
      console.log('[WS] Connecting to real-time server...')
      ws = new window.WebSocket('ws://localhost:3001/ws')
      
      ws.onopen = () => {
        console.log('[WS] Connected - receiving real-time Solana on-chain data')
        setWsConnected(true)
        setError(null)
      }
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          if (data.type === 'prices' && data.tokens) {
            const tokens = data.tokens.map(t => ({
              mint: t.mint,
              mintHash: keccak256(toUtf8Bytes(t.mint)),
              name: t.name || 'Unknown',
              symbol: t.symbol || '???',
              image: t.image,
              bondingProgress: t.progress || 0,
              complete: t.complete,
              marketCap: t.marketCap || 0,
              solInCurve: t.solInCurve || 0,
            }))
            
            setPumpTokens(tokens)
            setLastUpdate(new Date())
            setLoading(false)
          }
        } catch (e) {
          console.error('[WS] Parse error:', e)
        }
      }
      
      ws.onclose = () => {
        console.log('[WS] Disconnected, reconnecting in 3s...')
        setWsConnected(false)
        reconnectTimeout = setTimeout(connect, 3000)
      }
      
      ws.onerror = (err) => {
        console.error('[WS] Error:', err)
        setWsConnected(false)
      }
    }
    
    // Initial REST fetch
    fetchPumpTokens()
    
    // Then connect WebSocket
    connect()
    
    return () => {
      if (ws) ws.close()
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
    }
  }, [fetchPumpTokens])

  // Fetch on-chain markets - only get recent/active ones
  const fetchMarkets = useCallback(async () => {
    if (!contract) {
      console.log('No contract yet')
      return
    }
    
    try {
      console.log('Fetching market count...')
      const count = await contract.getMarketCount()
      const total = Number(count)
      console.log('Total markets on-chain:', total)
      
      if (total === 0) {
        setAllMarkets([])
        return
      }
      
      const now = Math.floor(Date.now() / 1000)
      
      // Get last 15 markets max (to avoid too many RPC calls)
      const startIdx = Math.max(0, total - 15)
      const marketIds = []
      
      // First, get all market IDs
      for (let i = startIdx; i < total; i++) {
        try {
          const marketId = await contract.allMarketIds(i)
          marketIds.push({ idx: i, marketId })
        } catch (e) {
          console.error('Error getting market ID', i)
        }
      }
      
      console.log('Got', marketIds.length, 'market IDs')
      
      // Then fetch market details
      const marketsList = []
      for (const { idx, marketId } of marketIds) {
        try {
          const market = await contract.getMarket(marketId)
          const endTime = Number(market[2])
          const settled = market[6]
          
          // Include unsettled markets (active or expired awaiting settlement)
          if (!settled) {
            const isExpired = endTime <= now
            marketsList.push({
              marketId,
              mintHash: market[0],
              startTime: Number(market[1]),
              endTime,
              yesPool: market[3].toString(),
              noPool: market[4].toString(),
              priceBps: Number(market[5]),
              settled,
              outcome: market[7],
              isActive: !isExpired,
              isExpired,
            })
          }
        } catch (e) {
          console.error('Error fetching market', idx, ':', e.message)
        }
      }
      
      console.log('Active markets found:', marketsList.length)
      setAllMarkets(marketsList.sort((a, b) => b.endTime - a.endTime))
    } catch (e) {
      console.error('Error fetching markets:', e.message)
    }
  }, [contract])

  // Fetch on-chain markets every 5 seconds for live updates
  useEffect(() => {
    fetchMarkets()
    const interval = setInterval(fetchMarkets, 5000)
    return () => clearInterval(interval)
  }, [fetchMarkets])

  // Fetch user positions
  const fetchPositions = useCallback(async () => {
    if (!contract || !user || allMarkets.length === 0) return
    
    try {
      const positions = {}
      
      for (const market of allMarkets) {
        if (market.settled) continue
        
        try {
          const yesPos = await contract.getPosition(market.marketId, user, true)
          const noPos = await contract.getPosition(market.marketId, user, false)
          
          if (yesPos[0].gt(0) || noPos[0].gt(0)) {
            positions[market.marketId] = {
              yesShares: yesPos[0].toString(),
              yesCostBasis: yesPos[1].toString(),
              noShares: noPos[0].toString(),
              noCostBasis: noPos[1].toString(),
            }
          }
        } catch (e) {
          // Skip position fetch errors
        }
      }
      
      setUserPositions(positions)
    } catch (e) {
      console.error('Error fetching positions:', e)
    }
  }, [contract, user, allMarkets])

  useEffect(() => {
    fetchPositions()
  }, [fetchPositions])

  // Connect wallet
  const connect = async () => {
    if (!window.ethereum) return alert('Install MetaMask')
    
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const chainId = await window.ethereum.request({ method: 'eth_chainId' })
      
      if (parseInt(chainId) !== CHAIN_ID) {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x' + CHAIN_ID.toString(16) }],
        })
      }
      
      const web3Provider = new Web3Provider(window.ethereum)
      const s = web3Provider.getSigner()
      
      setSigner(s)
      setContract(new Contract(CONTRACT, ABI, s))
      setUsdc(new Contract(USDC, ERC20_ABI, s))
      setUser(accounts[0])
      
      // Check balance
      const usdcContract = new Contract(USDC, ERC20_ABI, web3Provider)
      const bal = await usdcContract.balanceOf(accounts[0])
      setBalance(parseFloat(formatUnits(bal, 6)).toFixed(2))
      
    } catch (e) {
      alert('Connection failed: ' + e.message)
    }
  }

  // Format time remaining - uses tick state for live updates
  const formatTimeRemaining = (endTime) => {
    // Use current tick to force recalculation every second
    const now = Math.floor(Date.now() / 1000)
    const remaining = endTime - now
    
    if (remaining <= 0) return 'SETTLING...'
    if (remaining < 0) return 'EXPIRED'
    
    const mins = Math.floor(remaining / 60)
    const secs = remaining % 60
    
    // Format with leading zeros for consistency
    const secsStr = secs.toString().padStart(2, '0')
    
    if (mins > 0) return `${mins}m ${secsStr}s`
    return `${secs}s`
  }
  
  // Get exact seconds remaining (for sorting/comparison)
  const getSecondsRemaining = (endTime) => {
    return Math.max(0, endTime - Math.floor(Date.now() / 1000))
  }

  // Format next cycle
  const formatNextCycle = () => {
    const secs = getNextCycleTime()
    const mins = Math.floor(secs / 60)
    const s = secs % 60
    return `${mins}m ${s}s`
  }

  // Place a bet on existing market
  const placeBet = async (marketId, side, amountUsdc) => {
    if (!signer || !contract || !usdc) return
    
    setTxStatus('pending')
    setTxMessage('Checking allowance...')
    
    try {
      const amountWei = parseUnits(amountUsdc.toString(), 6)
      
      // Check allowance
      const allowance = await usdc.allowance(user, CONTRACT)
      
      if (allowance.lt(amountWei)) {
        setTxMessage('Approving USDC...')
        const approveTx = await usdc.approve(CONTRACT, MaxUint256)
        await approveTx.wait()
      }
      
      setTxMessage('Getting quote...')
      
      // Get current quote for slippage calculation
      let currentPriceBps, expectedShares
      try {
        const quote = await contract.getQuote(marketId, side, amountWei)
        expectedShares = quote.shares
        currentPriceBps = quote.priceBps
      } catch (e) {
        // Fallback: calculate locally if V1 contract
        const market = await contract.getMarket(marketId)
        currentPriceBps = side ? market.currentPriceBps : (10000n - market.currentPriceBps)
        const fee = amountWei * 100n / 10000n
        expectedShares = (amountWei - fee) * 10000n / currentPriceBps
      }
      
      // Apply 5% slippage tolerance
      const minSharesOut = expectedShares * 95n / 100n
      const maxPriceBps = currentPriceBps * 105n / 100n
      
      setTxMessage(`Placing bet (slippage protected)...`)
      
      // Try V2 with slippage protection first, fall back to V1/simple
      let tx
      try {
        tx = await contract.buyShares(marketId, side, amountWei, minSharesOut, maxPriceBps)
      } catch (e) {
        // Fall back to simple version (V1 or buySharesSimple)
        try {
          tx = await contract.buySharesSimple(marketId, side, amountWei)
        } catch (e2) {
          // Last resort: try without slippage params (V1)
          const v1Contract = new Contract(CONTRACT, [
            'function buyShares(bytes32, bool, uint256)'
          ], signer)
          tx = await v1Contract.buyShares(marketId, side, amountWei)
        }
      }
      
      setTxMessage('Waiting for confirmation...')
      const receipt = await tx.wait()
      
      // Find BetPlaced event
      const event = receipt.logs.find(log => {
        try {
          const parsed = contract.interface.parseLog(log)
          return parsed?.name === 'BetPlaced'
        } catch { return false }
      })
      
      if (event) {
        const parsed = contract.interface.parseLog(event)
        const shares = formatUnits(parsed.args.shares, 6)
        const fee = formatUnits(parsed.args.fee, 6)
        
        setTxStatus('success')
        setTxMessage(`Bought ${parseFloat(shares).toFixed(2)} ${side ? 'YES' : 'NO'} shares! Fee: $${parseFloat(fee).toFixed(4)}`)
        
        addToFeed(`🔥 ${side ? 'YES' : 'NO'} $${amountUsdc} → ${parseFloat(shares).toFixed(2)} shares`)
      } else {
        setTxStatus('success')
        setTxMessage('Bet placed successfully!')
      }
      
      // Refresh data
      await fetchMarkets()
      await fetchPositions()
      
      // Update balance
      const bal = await usdc.balanceOf(user)
      setBalance(parseFloat(formatUnits(bal, 6)).toFixed(2))
      
    } catch (e) {
      console.error('Place bet error:', e)
      setTxStatus('error')
      setTxMessage(e.reason || e.message || 'Transaction failed')
    }
  }

  // Execute trade
  const executeTrade = async () => {
    if (!modal.market || !user) return
    
    const amountUsdc = parseFloat(amount)
    if (isNaN(amountUsdc) || amountUsdc < 1) {
      setTxStatus('error')
      setTxMessage('Minimum bet is 1 USDC')
      return
    }
    
    await placeBet(modal.market.marketId, modal.side, amountUsdc)
  }

  // Add to activity feed
  const addToFeed = (msg) => {
    setFeed(f => [{ msg, time: new Date() }, ...f.slice(0, 19)])
  }

  // Get price from ON-CHAIN data ONLY (100% accurate)
  const getPrice = (market, isYes) => {
    // Use ONLY on-chain priceBps - this is the source of truth
    if (market && market.priceBps > 0) {
      const yesPrice = market.priceBps / 10000
      return isYes ? yesPrice : (1 - yesPrice)
    }
    // Default 50/50 if no price data
    return isYes ? 0.50 : 0.50
  }
  
  // Get bonding progress for display (from token data, for info only)
  const getBondingProgress = (market) => {
    if (market.token && typeof market.token.bondingProgress === 'number') {
      return market.token.bondingProgress
    }
    // Fallback: estimate from on-chain price
    if (market.priceBps > 0) {
      return market.priceBps / 100
    }
    return 0
  }

  // Get preview with accurate win calculation (handles BigInt safely)
  const getPreview = () => {
    if (!modal.market) return {}
    const price = getPrice(modal.market, modal.side)
    const amt = parseFloat(amount) || 0
    const fee = amt * 0.01
    const afterFee = amt - fee
    const shares = price > 0 ? afterFee / price : 0
    
    // Calculate actual potential win based on pool sizes
    // Convert from string to avoid BigInt issues
    const yesPoolRaw = modal.market.yesPool || '0'
    const noPoolRaw = modal.market.noPool || '0'
    const yesPool = Number(yesPoolRaw) / 1e6
    const noPool = Number(noPoolRaw) / 1e6
    const opposingPool = modal.side ? noPool : yesPool
    
    // Your payout is capped by: min(your shares, total opposing pool + your bet)
    let maxPayout
    if (opposingPool <= 0) {
      // No opposing bets - you'd just get your money back (minus fee) if you win
      maxPayout = afterFee
    } else {
      // There's money to win - your shares are worth $1 each if you win
      maxPayout = Math.min(shares, opposingPool + afterFee)
    }
    
    const potentialWin = maxPayout - amt
    const hasOpposingBets = opposingPool > 0
    
    return { price, fee, afterFee, shares, potentialWin, opposingPool, hasOpposingBets, maxPayout }
  }

  // Match tokens to markets
  const getTokenForMarket = (mintHash) => {
    return pumpTokens.find(t => t.mintHash === mintHash)
  }

  // Show all active markets - only show matched tokens, otherwise show "Unknown"
  const marketsWithTokens = allMarkets.map((market, index) => {
    const matchedToken = getTokenForMarket(market.mintHash)
    return {
      ...market,
      token: matchedToken, // Will be null if no match
      hasMatchedToken: !!matchedToken,
    }
  })

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="logo">⚡ QUANTISH</div>
        <div className="header-subtitle">PUMP.FUN PREDICTION MARKETS</div>
        <div className="wallet-section">
          <div className="network">BASE</div>
          <div className="balance">${balance}</div>
          <button className={`btn ${user ? 'connected' : ''}`} onClick={connect}>
            {user ? `${user.slice(0,6)}...${user.slice(-4)}` : 'CONNECT'}
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="stats-bar">
        <div className="stat">
          <span className="label">ACTIVE MARKETS</span>
          <span className="value">{marketsWithTokens.filter(m => m.isActive).length}</span>
        </div>
        <div className="stat">
          <span className="label">NEXT CYCLE</span>
          <span className="value timer-value">{formatNextCycle()}</span>
        </div>
        <div className="stat">
          <span className="label">PUMP.FUN TOKENS</span>
          <span className="value">{pumpTokens.length}</span>
        </div>
        <div className="stat">
          <span className="label">SOLANA DATA</span>
          <span className={`value ${wsConnected ? 'live-indicator' : 'disconnected'}`}>
            {wsConnected ? `🟢 LIVE ${lastUpdate?.toLocaleTimeString() || ''}` : '🔴 CONNECTING...'}
          </span>
        </div>
      </div>

      {/* Activity Feed */}
      {feed.length > 0 && (
        <div className="feed">
          {feed.slice(0, 5).map((item, i) => (
            <div key={i} className="feed-item">{item.msg}</div>
          ))}
        </div>
      )}

      {/* Main */}
      <main className="main-full">
        <section className="tokens-section">
          <h2>🔥 ACTIVE PREDICTION MARKETS</h2>
          <p className="subtitle">
            Bet YES if you think the token will graduate from the bonding curve before time runs out.
            <br />
            <span className="auto-note">Markets created automatically every 30 minutes.</span>
          </p>
          
          {loading && <div className="loading">LOADING...</div>}
          
          {error && (
            <div className="error">
              ERROR: {error}
              <br /><br />
              Make sure proxy server is running: <code>node proxy-server.cjs</code>
            </div>
          )}
          
          {!loading && marketsWithTokens.length === 0 && (
            <div className="no-markets">
              <h3>🕐 WAITING FOR NEXT CYCLE</h3>
              <p>New markets will be created in <strong>{formatNextCycle()}</strong></p>
              <p>Markets are automatically created every 30 minutes at :00 and :30</p>
            </div>
          )}
          
          {!loading && marketsWithTokens.length > 0 && (
            <div className="tokens-grid">
              {marketsWithTokens.map((market) => {
                const token = market.token
                const yesPrice = getPrice(market, true)
                const noPrice = getPrice(market, false)
                const position = userPositions[market.marketId]
                
                return (
                  <div key={market.marketId} className={`token-card ${market.isExpired ? 'expired' : 'active-market'}`}>
                    {/* Timer */}
                    <div className="card-timer">
                      <span className={`timer ${market.endTime - Math.floor(Date.now()/1000) < 300 ? 'urgent' : ''}`}>
                        ⏱️ {formatTimeRemaining(market.endTime)}
                      </span>
                    </div>
                    
                    <div className="card-header">
                      {token?.image ? (
                        <img src={token.image} alt={token?.symbol || '?'} className="token-icon" onError={(e) => e.target.style.display = 'none'} />
                      ) : (
                        <div className="token-icon-placeholder">?</div>
                      )}
                      <div className="token-info">
                        <h3>{token?.name?.slice(0, 20) || `Market #${market.marketId.slice(2,6).toUpperCase()}`}</h3>
                        <span className="symbol">{token ? `$${token.symbol}` : 'Unknown Token'}</span>
                      </div>
                      <span className={`status ${market.priceBps >= 9500 ? 'graduated' : 'active'}`}>
                        {(market.priceBps / 100).toFixed(1)}%
                      </span>
                    </div>

                    {token?.description && (
                      <p className="description">{token.description.slice(0, 80)}...</p>
                    )}

                    <div className="prices">
                      <div className="price-box yes">
                        <div className="label">YES</div>
                        <div className="value">${yesPrice.toFixed(2)}</div>
                      </div>
                      <div className="price-box no">
                        <div className="label">NO</div>
                        <div className="value">${noPrice.toFixed(2)}</div>
                      </div>
                    </div>

                    <div className="progress">
                      {/* Show ON-CHAIN price as the source of truth */}
                      <div className="progress-label">
                        <span>ON-CHAIN ODDS</span>
                        <span>{(market.priceBps / 100).toFixed(1)}% YES</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${Math.min(100, market.priceBps / 100)}%` }} />
                      </div>
                      {/* Only show live bonding if we have matched token data */}
                      {market.hasMatchedToken && token && token.bondingProgress > 0 && (
                        <div className="bonding-info live-data">
                          🔴 Live: {token.bondingProgress.toFixed(1)}% | MC: ${(token.marketCap/1000).toFixed(1)}k
                        </div>
                      )}
                      {!market.hasMatchedToken && (
                        <div className="bonding-info unmatched">
                          ⚠️ Token data unavailable (legacy market)
                        </div>
                      )}
                    </div>

                    <div className="pool-info">
                      <span>YES: ${(Number(market.yesPool) / 1e6).toFixed(2)}</span>
                      <span>NO: ${(Number(market.noPool) / 1e6).toFixed(2)}</span>
                      <span className="total-pool">
                        Total: ${((Number(market.yesPool) + Number(market.noPool)) / 1e6).toFixed(2)}
                      </span>
                    </div>

                    {position && (
                      <div className="position-info">
                        <span className="position-label">📊 YOUR POSITION:</span>
                        {parseInt(position.yesShares) > 0 && (
                          <div className="position-detail yes">
                            <span>{(parseInt(position.yesShares) / 1e6).toFixed(2)} YES</span>
                            <span className="cost">paid ${(parseInt(position.yesCostBasis) / 1e6).toFixed(2)}</span>
                            <span className="value">
                              worth ${((parseInt(position.yesShares) / 1e6) * yesPrice).toFixed(2)}
                            </span>
                          </div>
                        )}
                        {parseInt(position.noShares) > 0 && (
                          <div className="position-detail no">
                            <span>{(parseInt(position.noShares) / 1e6).toFixed(2)} NO</span>
                            <span className="cost">paid ${(parseInt(position.noCostBasis) / 1e6).toFixed(2)}</span>
                            <span className="value">
                              worth ${((parseInt(position.noShares) / 1e6) * noPrice).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="actions">
                      <button 
                        className="btn-yes" 
                        onClick={() => setModal({ open: true, market, side: true })}
                        disabled={market.isExpired || token?.complete}
                      >
                        BUY YES
                      </button>
                      <button 
                        className="btn-no" 
                        onClick={() => setModal({ open: true, market, side: false })}
                        disabled={market.isExpired || token?.complete}
                      >
                        BUY NO
                      </button>
                    </div>

                    <div className="card-footer">
                      <span className="fee-note">1% FEE</span>
                      <span className="mint">ID: {market.marketId.slice(0, 10)}...</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>

      {/* Trade Modal */}
      {modal.open && modal.market && (
        <div className="modal-overlay" onClick={() => { setModal({ open: false }); setTxStatus(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className={modal.side ? 'yes' : 'no'}>
              BUY {modal.side ? 'YES' : 'NO'}
            </h2>
            
            <div className="modal-token-info">
              {modal.market.token?.image && <img src={modal.market.token.image} alt="" />}
              <div>
                <strong>{modal.market.token?.name || 'Unknown Token'}</strong>
                <br />
                <small>${modal.market.token?.symbol || '???'}</small>
              </div>
            </div>
            
            {!txStatus && (
              <>
                <div className="input-group">
                  <label>AMOUNT (USDC)</label>
                  <input 
                    type="number" 
                    value={amount} 
                    onChange={e => setAmount(e.target.value)}
                    min="1"
                    step="1"
                    placeholder="Min: 1 USDC"
                  />
                  <div className="quick-amounts">
                    {[1, 5, 10, 25, 50, 100].map(v => (
                      <button key={v} onClick={() => setAmount(v.toString())}>${v}</button>
                    ))}
                  </div>
                </div>

                <div className="preview">
                  <div className="row">
                    <span>PREDICTION</span>
                    <span className={modal.side ? 'yes' : 'no'}>
                      {modal.side ? 'WILL GRADUATE' : 'WILL NOT GRADUATE'}
                    </span>
                  </div>
                  <div className="row">
                    <span>CURRENT PRICE</span>
                    <span>${getPreview().price?.toFixed(2)}</span>
                  </div>
                  <div className="row">
                    <span>TIME LEFT</span>
                    <span>{formatTimeRemaining(modal.market.endTime)}</span>
                  </div>
                  <div className="row">
                    <span>OPPOSING POOL</span>
                    <span className={getPreview().hasOpposingBets ? 'yes' : 'muted'}>
                      ${getPreview().opposingPool?.toFixed(2) || '0.00'}
                      {!getPreview().hasOpposingBets && ' (empty)'}
                    </span>
                  </div>
                  <div className="row fee">
                    <span>FEE (1%)</span>
                    <span>-${getPreview().fee?.toFixed(4)}</span>
                  </div>
                  <div className="row highlight">
                    <span>YOUR SHARES</span>
                    <span>{getPreview().shares?.toFixed(2)}</span>
                  </div>
                  <div className="row highlight">
                    <span>IF YOU WIN</span>
                    <span className="yes">${getPreview().maxPayout?.toFixed(2)}</span>
                  </div>
                  <div className="row highlight">
                    <span>PROFIT</span>
                    <span className={getPreview().potentialWin > 0 ? 'yes' : 'muted'}>
                      {getPreview().potentialWin > 0 ? '+' : ''}${getPreview().potentialWin?.toFixed(2)}
                    </span>
                  </div>
                  {!getPreview().hasOpposingBets && (
                    <div className="warning">
                      ⚠️ No opposing bets yet. You'll only profit if others bet against you.
                    </div>
                  )}
                </div>

                <div className="modal-actions">
                  <button className="cancel" onClick={() => setModal({ open: false })}>
                    CANCEL
                  </button>
                  <button 
                    className={`confirm ${modal.side ? 'yes' : 'no'}`} 
                    onClick={executeTrade}
                    disabled={!user}
                  >
                    {user ? 'CONFIRM BET' : 'CONNECT WALLET'}
                  </button>
                </div>
              </>
            )}

            {txStatus && (
              <div className={`tx-status ${txStatus}`}>
                {txStatus === 'pending' && <div className="spinner" />}
                <p>{txMessage}</p>
                {txStatus !== 'pending' && (
                  <button onClick={() => { setTxStatus(null); if (txStatus === 'success') setModal({ open: false }); }}>
                    {txStatus === 'success' ? 'CLOSE' : 'TRY AGAIN'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
