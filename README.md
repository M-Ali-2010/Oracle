# Oracle-Pro — Full-Stack Integration

Solana Wallet + ICO Dashboard + Binance AI Trading

```
Frontend (Next.js :3000)  ←→  Backend (NestJS :4000)  ←→  Binance Testnet
```

---

## Project Structure

```
project-root/
├── frontend/                   ← Next.js 13 (React + TypeScript)
│   ├── src/
│   │   ├── components/
│   │   │   ├── TradingPanel.tsx   ← NEW: Binance trading widget
│   │   │   ├── AppBar.tsx         ← Updated: network badges
│   │   │   └── ...existing...
│   │   ├── lib/
│   │   │   └── tradingApi.ts      ← NEW: typed backend client
│   │   ├── views/home/
│   │   │   └── index.tsx          ← Updated: +Trading tab
│   │   ├── contexts/
│   │   │   └── ContextProvider.tsx ← Updated: env-driven network
│   │   └── pages/
│   │       └── _app.tsx           ← Updated: cleaner layout
│   ├── next.config.js             ← Updated: backend proxy rewrites
│   └── .env.local                 ← NEXT_PUBLIC_API_URL etc.
│
├── backend/                    ← NestJS (TypeScript)
│   ├── src/
│   │   ├── binance/
│   │   │   ├── binance.service.ts   ← Binance REST + HMAC signing
│   │   │   ├── binance.controller.ts ← /api/binance/ticker|candles|balance
│   │   │   └── binance.module.ts
│   │   ├── trading/
│   │   │   ├── trading.service.ts   ← RSI strategy + order execution
│   │   │   ├── trading.controller.ts ← /api/trading/signal|execute
│   │   │   └── trading.module.ts
│   │   ├── common/
│   │   │   └── indicators.ts        ← RSI, MACD, EMA (pure math)
│   │   ├── app.module.ts
│   │   └── main.ts                  ← Port 4000, CORS enabled
│   ├── .env                         ← BINANCE_API_KEY etc.
│   └── package.json
│
└── README.md
```

---

## Quick Start

### Step 1 — Get Binance Testnet Keys (free, 2 min)

1. Go to https://testnet.binance.vision/
2. Click **Log In with GitHub**
3. Click **Generate HMAC_SHA256 Key**
4. Copy **API Key** and **Secret Key**

### Step 2 — Configure Backend

```bash
cd backend
cp .env.example .env
# Edit .env:
#   BINANCE_API_KEY=your_key_here
#   BINANCE_SECRET_KEY=your_secret_here
#   BINANCE_TESTNET=true
#   PORT=4000
```

### Step 3 — Start Backend

```bash
cd backend
npm install
npm run start:dev
# → 🚀 Oracle-Pro Backend → http://localhost:4000
# → ✅ Binance connected — TESTNET
```

### Step 4 — Configure Frontend

```bash
cd frontend
# Edit .env.local (already configured):
#   NEXT_PUBLIC_API_URL=http://localhost:4000
#   NEXT_PUBLIC_SOLANA_NETWORK=devnet
#   NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
```

### Step 5 — Start Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

---

## API Endpoints (Backend)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/binance/ticker/:symbol | Live price + 24h stats |
| GET | /api/binance/candles/:symbol?interval=15m&limit=100 | OHLCV candles |
| GET | /api/binance/balance | Testnet account balances |
| GET | /api/trading/signal?symbol=BTCUSDT&timeframe=15m | RSI signal (no trade placed) |
| POST | /api/trading/execute | Analyse + place order |

### POST /api/trading/execute — Body

```json
{
  "symbol": "BTCUSDT",
  "timeframe": "15m",
  "maxPosPct": 2,
  "stopLossPct": 1.5,
  "takeProfitPct": 3
}
```

---

## Frontend Features

### Existing (untouched)
- ✅ Solana wallet connection (Phantom, Solflare)
- ✅ SOL balance display
- ✅ Send / Receive SOL
- ✅ Jupiter swap (SOL → any SPL)
- ✅ Devnet airdrop + ICO token airdrop
- ✅ ICO projects (5 active projects)
- ✅ SPL token purchase + minting
- ✅ Portfolio view with P&L
- ✅ Transaction history

### New (integrated)
- ✅ **Trading tab** — real Binance testnet data
- ✅ Symbol dropdown (BTC, ETH, SOL, BNB, XRP)
- ✅ Timeframe dropdown (1m, 5m, 15m, 1h, 4h)
- ✅ Live ticker price + 24h change
- ✅ BUY / SELL / HOLD signal with confidence bar
- ✅ RSI, MACD, EMA9, EMA50 indicator grid
- ✅ Reasoning text from strategy engine
- ✅ Execute trade button (testnet orders)
- ✅ Trade result: Order ID, side, qty, price, SL/TP
- ✅ Binance balance display
- ✅ **Auto-Trading toggle** — polls every 30s, auto-executes
- ✅ Activity log

---

## Trading Strategy (RSI-based)

```
BUY  — RSI < 30 (oversold) AND price > EMA50
SELL — RSI > 70 (overbought) OR MACD histogram strongly negative
HOLD — everything else
```

Confidence is normalized 50–100% based on signal strength.

---

## Environment Variables

### Backend (.env)
| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 4000 | Server port |
| BINANCE_API_KEY | — | Testnet API key |
| BINANCE_SECRET_KEY | — | Testnet secret |
| BINANCE_TESTNET | true | Use testnet endpoint |
| DEFAULT_SYMBOL | BTCUSDT | Default trading pair |
| DEFAULT_TIMEFRAME | 15m | Default chart interval |
| MAX_POSITION_PCT | 2 | % of USDT balance per trade |
| STOP_LOSS_PCT | 1.5 | Stop-loss percentage |
| TAKE_PROFIT_PCT | 3 | Take-profit percentage |

### Frontend (.env.local)
| Variable | Value | Description |
|----------|-------|-------------|
| NEXT_PUBLIC_API_URL | http://localhost:4000 | Backend URL |
| NEXT_PUBLIC_SOLANA_NETWORK | devnet | Solana network |
| NEXT_PUBLIC_SOLANA_RPC_URL | https://api.devnet.solana.com | RPC endpoint |
| NEXT_PUBLIC_TREASURY_WALLET | DVXt9...Y7FE | ICO treasury address |

---

## Proxy Architecture

```
Browser → Next.js (:3000)
           /api/binance/*  →  rewrites  →  NestJS (:4000)/api/binance/*
           /api/trading/*  →  rewrites  →  NestJS (:4000)/api/trading/*
           /api/price      →  Next.js API route (CoinGecko)
           /api/buy        →  Next.js API route (Solana SPL)
           /api/sell       →  Next.js API route (Solana SPL)
           /api/chart      →  Next.js API route (mock chart data)
           /api/portfolio  →  Next.js API route (Solana on-chain)
```

No CORS issues — browser only talks to Next.js. Next.js proxies to NestJS server-side.

---

## Troubleshooting

**Backend won't start**: Check `BINANCE_API_KEY` is set in `backend/.env`

**"Backend Offline" in Trading tab**: Start backend with `npm run start:dev` in `/backend`

**Wallet won't connect**: Make sure Phantom/Solflare is set to Devnet

**Trade execution fails**: Binance testnet needs USDT balance — get free testnet funds at https://testnet.binance.vision/

**SOL balance shows 0**: Connect wallet and click refresh, or request devnet airdrop

