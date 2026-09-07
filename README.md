# NairaStock

**Self-custody tokenized stock trading for Nigerians, on Base.**

Fund a wallet in cNGN (naira stablecoin), trade Coinbase Tokenized Stocks (AAPLc, NVDAc, METAc, GOOGLc) through an on-chain AMM, and hold the tokens in your own non-custodial wallet — not a database IOU.

---

## The Problem

Nigerians buying US stocks through custodial platforms (Bamboo, Trove, Risevest) face:

- **FX spreads and CBN forex bureaucracy**: every deposit and withdrawal moves through correspondent banks and Central Bank of Nigeria forex rails, with opaque spreads and settlement delays
- **Database IOUs, not real ownership**: the "share" you own is a row in a brokerage ledger you don't control; you can't move it, lend against it, or verify it on-chain
- **Market hours only**: trades settle only during NYSE hours (2:30pm–9:00pm WAT), even though the desire to buy or sell doesn't respect that schedule

The asset you think you own is a number in someone else's database, not a balance you can prove on a block explorer.

## The Solution

NairaStock is a self-custody neobroker:

1. **Fund in cNGN**: deposit naira (mocked for this demo) and receive cNGN, a naira-pegged stablecoin where ₦1 = 1 token, no dollar account required
2. **Trade tokenized stocks on-chain**: swap cNGN for Coinbase Tokenized Stocks (AAPLc, NVDAc, METAc, GOOGLc) through a DEX pool on Base — fractional by default, priced off Chainlink feeds, open 24/7
3. **Hold it yourself**: tokens settle into your own non-custodial wallet as ERC-20 balances verifiable on BaseScan, not a ledger entry in a brokerage database

The "View on BaseScan" link next to every balance is the proof point: a judge can click through and see the token sitting at the user's own address.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser (React + Vite)                                                 │
│  • Onboarding: wallet creation (BIP39 mnemonic generation)             │
│  • Dashboard: portfolio, balances, transactions                         │
│  • Trade: cNGN ↔ stock token swap UI                                   │
│  • Stock detail: price chart, buy/sell CTA                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓ HTTP
┌─────────────────────────────────────────────────────────────────────────┐
│  NestJS API (TypeScript)                                                │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌─────────────┐         │
│  │   wallet   │ │    auth    │ │   stocks   │ │    swap     │         │
│  │  (HD key   │ │  (JWT +    │ │ (B20 token │ │ (AMM quote  │         │
│  │ generation)│ │  sig auth) │ │  metadata) │ │  + execute) │         │
│  └────────────┘ └────────────┘ └────────────┘ └─────────────┘         │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                         │
│  │  pricing   │ │  portfolio │ │   onramp   │                         │
│  │ (Chainlink │ │(aggregate  │ │  (mocked   │                         │
│  │feed poller)│ │ balances)  │ │naira rail) │                         │
│  └────────────┘ └────────────┘ └────────────┘                         │
│                                                                         │
│  Prisma ORM → PostgreSQL  |  BullMQ → Redis  |  ethers.js → Base     │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓ JSON-RPC
┌─────────────────────────────────────────────────────────────────────────┐
│  Base (anvil local / Sepolia testnet / mainnet)                        │
│                                                                         │
│  Contracts:                                                             │
│  • MockERC20: cNGN + mock B20 tokens (AAPLc, NVDAc, METAc, GOOGLc)    │
│  • MiniFactory / MiniPair / MiniRouter: UniswapV2-style AMM            │
│  • MockAggregatorV3: Chainlink-shaped price feeds (mean-reverting RW) │
│  • Multicall3: batch balance queries                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose
- Foundry (for contract tests)

### Quick Start

```bash
# 1. Clone and install
git clone https://github.com/deviykee/nairastock.git
cd nairastock
pnpm install

# 2. Copy environment config
cp .env.example .env
# Edit .env if needed — defaults work for local dev

# 3. Start infrastructure (Postgres + Redis)
pnpm infra:up

# 4. Start local anvil chain (in a separate terminal)
pnpm chain:up
# Leave this running

# 5. Deploy contracts to anvil (back in original terminal)
pnpm chain:deploy

# 6. Run database migrations and seed demo data
pnpm db:migrate
pnpm db:seed

# 7. Start API + frontend
pnpm dev
```

**Services will be running at:**

- **API**: http://localhost:4010
- **API Docs (Swagger)**: http://localhost:4010/api/docs
- **Health Check**: http://localhost:4010/api/health
- **Frontend**: http://localhost:5173
- **Anvil RPC**: http://localhost:8545
- **PostgreSQL**: localhost:5433
- **Redis**: localhost:6380

---

## What's Real vs. Mocked (Hackathon Demo)

This is a functional MVP built for a hackathon submission. The following are **mocked/simulated** for demo purposes:

| Component | Demo Implementation | Production Swap-In |
|-----------|---------------------|-------------------|
| **Naira on/off-ramp** | Simulated deposit via cNGN-minting faucet | Licensed cNGN on/off-ramp partner (Busha, Quidax API) |
| **FX rate (NGN/USD)** | Fixed at ₦1,600/$1 | Real-time CBN rate or forex oracle |
| **Stock tokens** | Mock ERC-20s (`AAPLc`, `NVDAc`, etc.) | Real Coinbase B20 series (mainnet-only currently) |
| **Price feeds** | MockAggregatorV3 with mean-reverting random walk | Real Chainlink equity price feeds (same ABI) |
| **DEX liquidity** | UniswapV2-style pools (MiniPair/MiniRouter) | Aerodrome pools on Base mainnet |
| **Wallet custody** | Server-side signing from AES-256-GCM encrypted mnemonic | Non-custodial: WalletConnect or client-side signing only |
| **Chain** | Local anvil (chainId 31337) | Base Sepolia (testnet) or Base mainnet |

### Demo Custody Caveat

⚠️ **For demo convenience only**, the API holds encrypted user mnemonics and signs transactions on the user's behalf. This is a **hackathon shortcut** to avoid wallet extension friction during a recorded demo.

**A production build would NOT do this.** Instead:
- Users connect their own wallet via WalletConnect
- All transactions are signed client-side
- The API never sees private keys

The encrypted-mnemonic approach is clearly marked as demo-only throughout the codebase.

---

## Why This Wins (vs. Bamboo/Trove/Risevest)

| Feature | NairaStock | Traditional Custodial Platforms |
|---------|-----------|--------------------------------|
| **Ownership model** | Self-custody ERC-20 tokens in your wallet | Database IOU in platform's ledger |
| **Verification** | Every balance visible on BaseScan | Trust the platform's internal ledger |
| **Settlement** | 24/7, instant on-chain finality | NYSE market hours only (2:30pm–9pm WAT) |
| **FX friction** | No correspondent bank, no CBN forex queue | Every deposit/withdrawal through CBN rails + spreads |
| **Composability** | Lend against your stock (Aave, etc.) | Can't move the asset, it's not really yours |
| **Fractional ownership** | Native (ERC-20 decimals) | Platform-dependent |

The technical unlock: **Coinbase Tokenized Stocks (B20 series) on Base**, priced via **Chainlink equity feeds**, traded through **Aerodrome liquidity pools**, with a **licensed cNGN on/off-ramp** removing the dollar conversion step entirely.

---

## Testing

```bash
# Backend unit tests (81 tests)
pnpm --filter @nairastock/api test

# Contract tests (29 tests)
cd contracts && forge test

# End-to-end smoke tests (25 checks)
node scripts/smoke.mjs http://localhost:4010/api

# Frontend build verification
pnpm --filter @nairastock/web build
```

---

## Testnet Demo (Make the Proof Visible)

On local anvil, BaseScan links are hidden by design (anvil has no block explorer). For a recorded demo or judge review, target **Base Sepolia**:

1. Set up a funded deployer key on Base Sepolia (you'll need Sepolia ETH for gas)
2. Update `.env`:
   ```bash
   CHAIN_ID=84532
   RPC_URL=https://sepolia.base.org
   EXPLORER_BASE_URL=https://sepolia.basescan.org
   FAUCET_PRIVATE_KEY=0x<your_funded_sepolia_deployer_key>
   VITE_NETWORK_LABEL=Base Sepolia
   ```
3. Deploy contracts to Sepolia:
   ```bash
   pnpm chain:deploy:sepolia
   ```
4. Re-seed the database with Sepolia contract addresses:
   ```bash
   pnpm db:seed
   ```
5. Restart the API and frontend — BaseScan links will now work

**If you don't have a funded Sepolia key**, the local anvil demo still shows the full buy/sell flow; you just can't click through to a public block explorer.

---

## Production Roadmap

To take this from hackathon MVP to a licensed product:

1. **Regulatory compliance**: CBN and SEC(Nigeria) licensing for securities brokerage, KYC/AML integration
2. **Licensed cNGN on/off-ramp**: integrate Busha or Quidax API for real naira deposits/withdrawals
3. **Non-custodial wallet**: remove server-side signing entirely, use WalletConnect for all transactions
4. **Real B20 tokens**: once Coinbase Tokenized Stocks launch on Base mainnet (currently mainnet-only), switch from mock ERC-20s
5. **Aerodrome pools**: switch from mock AMM to real Aerodrome liquidity on Base mainnet
6. **Real Chainlink feeds**: swap MockAggregatorV3 for production equity feeds (same ABI, just different addresses)
7. **Fiat off-ramp**: allow users to sell cNGN back to naira via the licensed partner
8. **Stretch: borrow against stock**: integrate Aave to let users borrow stablecoins against AAPLc collateral

---

## Tech Stack

- **Backend**: NestJS (TypeScript), Prisma ORM, PostgreSQL, Redis, BullMQ
- **Frontend**: React, TypeScript, Vite, TailwindCSS, Recharts
- **Chain**: ethers.js v6, Base (Sepolia testnet / mainnet)
- **Contracts**: Solidity 0.8.28, Foundry
- **Auth**: JWT + wallet-signature verification
- **Fonts**: Acorn (self-hosted)
- **Design**: Coinbase-style design system (see `DESIGN.md`)

---

## License

MIT

---

## Demo Video

See `DEMO_SCRIPT.md` for the 90-second walkthrough script.

---

## Submission

Built for **Base Builder Quest: Tokenized Stocks** hackathon.

**GitHub**: https://github.com/deviykee/nairastock  
**Builder**: @deviykee
