/**
 * Contract ABIs, hand-written as ethers human-readable fragments.
 *
 * These are the full set of calls the API makes. Kept as a typed table rather
 * than importing Foundry's JSON artifacts, because the API must work against
 * real mainnet contracts (Aerodrome's router, Chainlink's aggregators, canonical
 * Multicall3) where no local artifact exists.
 */

export const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function transfer(address to, uint256 value) returns (bool)',
  'function transferFrom(address from, address to, uint256 value) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
] as const;

/** MockERC20 extras, used only by the mocked naira on/off-ramp on testnet. */
export const MINTABLE_ERC20_ABI = [
  ...ERC20_ABI,
  'function mint(address to, uint256 amount)',
  'function burn(uint256 amount)',
  'function minter() view returns (address)',
] as const;

/**
 * UniswapV2Router02-compatible surface. Aerodrome's router on Base mainnet
 * exposes the same signatures, so pointing DEX_ROUTER_ADDRESS at it needs no
 * code change. `getReserves(address,address)` is our MiniRouter convenience
 * helper; the swap module falls back to reading the pair directly when a real
 * router doesn't expose it.
 */
export const ROUTER_ABI = [
  'function factory() view returns (address)',
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])',
  'function getAmountsIn(uint256 amountOut, address[] path) view returns (uint256[])',
  'function getReserves(address tokenA, address tokenB) view returns (uint256 reserveA, uint256 reserveB)',
  'function pairFor(address tokenA, address tokenB) view returns (address)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])',
  'function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline) returns (uint256[])',
] as const;

export const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) view returns (address)',
  'function allPairsLength() view returns (uint256)',
] as const;

export const PAIR_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1)',
] as const;

/** Chainlink AggregatorV3Interface. MockAggregatorV3 matches it exactly. */
export const AGGREGATOR_V3_ABI = [
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
] as const;

/** Mock-only: lets the pricing job walk the simulated price. */
export const MOCK_AGGREGATOR_ABI = [
  ...AGGREGATOR_V3_ABI,
  'function pushAnswer(int256 answer) returns (uint80)',
  'function updater() view returns (address)',
] as const;

export const MULTICALL3_ABI = [
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])',
  'function getBlockNumber() view returns (uint256)',
] as const;
