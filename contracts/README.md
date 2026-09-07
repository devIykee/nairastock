# contracts — testnet demo venue

Solidity standing in for infrastructure that exists on Base mainnet but not on a
testnet. Everything here is disposable demo scaffolding; the API talks to it
through the same ABIs it would use against the real thing.

| Contract | Stands in for | Mainnet swap-in |
| --- | --- | --- |
| `MockERC20` | cNGN (Africa Stablecoin Consortium) and the Coinbase B20 tokenized stocks (AAPLc/NVDAc/METAc/GOOGLc) | Point `CNGN_ADDRESS` / `*_ADDRESS` at the real tokens. Decimals already match (18). |
| `MockAggregatorV3` | Chainlink equity price feeds | Point `*_FEED_ADDRESS` at the real aggregator. Same `latestRoundData()` ABI. |
| `MiniFactory` / `MiniPair` / `MiniRouter` | Aerodrome volatile pools + router | Point `DEX_ROUTER_ADDRESS` at Aerodrome's router. Same `swapExactTokensForTokens` signature, same 30 bps input fee, same revert strings. |
| `Multicall3` | canonical Multicall3 at `0xcA11bde05977b3631167028862bE2a173976CA11` | Set `MULTICALL3_ADDRESS` to the canonical address — it is already deployed on Base and Base Sepolia. |

## Why a mock AMM rather than a real testnet pool

The Coinbase B20 tokenized-stock series is mainnet-only, so no cNGN/AAPLc pool
exists on Base Sepolia to trade against. `MiniPair` is a trimmed `UniswapV2Pair`:
same constant-product curve, same 30 bps fee charged on the input leg, same
`x * y >= k` check enforced at swap time. Dropped: price oracles, protocol fee,
flash-swap callback, permit — none of which the buy/sell flow touches.

That last point is what makes the demo honest. `amountOutMin` is enforced
**on-chain** by the pair's invariant, so the "minimum received" figure the UI
shows is a real guarantee and not a server-side promise.

## Pool sizing

Each pool is seeded with 5,000 shares at the stock's seed price, paired with the
naira equivalent at `NGN_USD_RATE`. The pool mid-price therefore equals the
Chainlink price at genesis, so the demo's first quote agrees with the displayed
price, and 5,000 shares of depth keeps price impact on a ₦2m trade under 1%.

## Commands

```bash
forge build                       # compile
forge test -vv                    # 29 tests: quote math, slippage guard, k invariant, round-trip
pnpm deploy:local                 # deploy to RPC_URL, write addresses into ../.env
pnpm deploy:sepolia               # same, with a Sepolia .env
```

`scripts/deploy.ts` runs `forge script`, reads `deployments/<chainid>.json`, and
rewrites only the address lines it owns in the repo-root `.env` — every other
line is preserved.

## Test coverage

`test/MiniRouter.t.sol` covers the swap path the demo depends on:

- `getAmountOut` matches the UniswapV2 formula exactly, and `getAmountIn` inverts it
- pool mid-price equals the seed price at genesis
- a buy delivers tokens **to the trader's own address** (the self-custody claim)
- the slippage guard reverts when `amountOutMin` exceeds the curve, and leaves funds untouched
- a front-run between quote and execution trips the 1% tolerance, and a re-quote fills
- expired deadlines, missing approvals, insufficient balance, and unknown pairs all revert with distinguishable errors
- a cNGN → AAPLc → cNGN round-trip costs only the two fees plus impact
- fuzz: price impact grows monotonically with trade size; no swap can drain a pool

`test/MockContracts.t.sol` covers the aggregator's Chainlink-shaped rounds and
the ERC20's mint/burn/allowance semantics.
