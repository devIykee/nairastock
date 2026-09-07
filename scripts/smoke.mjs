#!/usr/bin/env node
/**
 * End-to-end smoke test against a running API: create wallet → fund with naira →
 * quote → buy → verify the tokens are at the user's own address → sell → withdraw.
 *
 *   node scripts/smoke.mjs [baseUrl]
 *
 * Exists because the buy/sell flow is the one thing that has to work for the
 * demo; this is the cheapest way to prove it after any change.
 */
const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? 'http://localhost:4010/api').replace(/\/$/, '');

let token = null;
const pass = [];
const fail = [];

function log(step, detail = '') {
  console.log(`\x1b[36m▸\x1b[0m ${step}${detail ? `, ${detail}` : ''}`);
}
function ok(what, detail = '') {
  pass.push(what);
  console.log(`  \x1b[32m✓\x1b[0m ${what}${detail ? `, ${detail}` : ''}`);
}
function bad(what, detail = '') {
  fail.push(what);
  console.log(`  \x1b[31m✗\x1b[0m ${what}${detail ? `, ${detail}` : ''}`);
}

async function call(method, path, body, { expectStatus } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (expectStatus !== undefined) {
    if (res.status !== expectStatus) {
      throw new Error(`${method} ${path} → ${res.status} (expected ${expectStatus}): ${text.slice(0, 300)}`);
    }
    return json;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

const num = (s) => Number(s ?? 0);

async function main() {
  log('health');
  const health = await call('GET', '/health');
  if (health.status !== 'ok') {
    bad('all dependencies healthy', JSON.stringify(health.checks));
    process.exit(1);
  }
  ok('all dependencies healthy', `chain ${health.chainId} @ block ${health.checks.chain.blockNumber}`);

  log('create wallet');
  const created = await call('POST', '/wallet/create', {}, { expectStatus: 201 });
  token = created.session.accessToken;
  const address = created.address;
  const wordCount = created.mnemonic.trim().split(/\s+/).length;
  if (wordCount !== 12) bad('mnemonic is 12 words', `got ${wordCount}`);
  else ok('mnemonic returned once', `${wordCount} words`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) bad('address is well-formed', address);
  else ok('wallet created', address);
  if (created.derivationPath !== "m/44'/60'/0'/0/0") bad('BIP44 path', created.derivationPath);
  else ok('BIP44 derivation path', created.derivationPath);

  log('session');
  const me = await call('GET', '/auth/me');
  if (me.walletAddress !== address) bad('session matches wallet', me.walletAddress);
  else ok('JWT authenticates', `custody=${me.custodyMode}`);

  log('nonce + signature login (self-custody path)');
  const nonce = await call('GET', `/auth/nonce/${address}`);
  if (!nonce.message.includes(nonce.nonce)) bad('nonce message embeds the nonce');
  else ok('login challenge issued', `expires ${nonce.expiresAt}`);

  log('deposit ₦2,000,000 (mocked naira rail)');
  const deposit = await call('POST', '/onramp/deposit', { ngnAmount: '2000000' }, { expectStatus: 201 });
  if (deposit.status !== 'CONFIRMED') bad('deposit confirmed', deposit.status);
  else ok('deposit confirmed', `${deposit.cngnAmount.display} cNGN, tx ${deposit.txHash?.slice(0, 12)}…`);

  const balancesAfterDeposit = await call('GET', `/wallet/${address}/balances`);
  const cngn = balancesAfterDeposit.find((b) => b.token.symbol === 'cNGN');
  if (num(cngn?.amount.display) !== 2_000_000) bad('cNGN credited on-chain', cngn?.amount.display);
  else ok('cNGN balance read from chain', `${cngn.amount.display} cNGN`);

  log('quote ₦1,000,000 → AAPLc');
  const quote = await call('POST', '/swap/quote', { tokenIn: 'cNGN', tokenOut: 'AAPLc', amountIn: '1000000' });
  if (num(quote.amountOut.display) <= 0) bad('quote returns output', JSON.stringify(quote.amountOut));
  else ok('quote', `${quote.amountOut.display} AAPLc, impact ${quote.priceImpactPct}%, min ${quote.minAmountOut.display}`);
  if (num(quote.minAmountOut.display) >= num(quote.amountOut.display)) bad('minAmountOut < amountOut');
  else ok('slippage floor below quote', `${quote.slippageBps} bps`);
  if (quote.side !== 'BUY') bad('side inferred as BUY', quote.side);
  else ok('side inferred', quote.side);

  log('buy');
  const buy = await call('POST', '/swap/execute', { tokenIn: 'cNGN', tokenOut: 'AAPLc', amountIn: '1000000' }, { expectStatus: 201 });
  if (buy.status !== 'CONFIRMED') bad('buy confirmed', buy.status);
  else ok('buy confirmed', `${buy.amountOut.display} AAPLc in block ${buy.blockNumber}, gas ${buy.gasUsed}`);

  log('verify self-custody');
  const afterBuy = await call('GET', `/wallet/${address}/balances`);
  const aaplc = afterBuy.find((b) => b.token.symbol === 'AAPLc');
  if (num(aaplc?.amount.display) <= 0) bad('AAPLc held at user address', aaplc?.amount.display);
  else ok('AAPLc sits in the user’s own wallet', `${aaplc.amount.display} AAPLc at ${address}`);
  if (Math.abs(num(aaplc.amount.display) - num(buy.amountOut.display)) > 1e-9) {
    bad('on-chain balance matches swap output', `${aaplc.amount.display} vs ${buy.amountOut.display}`);
  } else {
    ok('on-chain balance matches swap output');
  }

  log('portfolio');
  const portfolio = await call('GET', '/portfolio');
  if (num(portfolio.totalValueNgn) <= 0) bad('portfolio valued', portfolio.totalValueNgn);
  else ok('portfolio valued', `₦${Number(portfolio.totalValueNgn).toLocaleString('en-NG')} / $${portfolio.totalValueUsd}`);
  if (portfolio.transactions.length < 2) bad('history has deposit + buy', String(portfolio.transactions.length));
  else ok('transaction history', `${portfolio.transactions.length} entries`);
  if (num(portfolio.gasBalance.display) <= 0) bad('wallet has gas', portfolio.gasBalance.display);
  else ok('wallet funded with gas', `${portfolio.gasBalance.display} ETH`);

  log('price history (chart data)');
  const history = await call('GET', '/stocks/AAPLc/history');
  if (!Array.isArray(history) || history.length === 0) bad('chart has points', String(history?.length));
  else ok('chart data', `${history.length} snapshots`);

  log('error handling');
  const tooBig = await fetch(`${BASE}/swap/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ tokenIn: 'cNGN', tokenOut: 'AAPLc', amountIn: '999999999' }),
  });
  const tooBigBody = await tooBig.json();
  if (tooBigBody.code !== 'INSUFFICIENT_BALANCE') bad('overspend rejected with a code', JSON.stringify(tooBigBody).slice(0, 160));
  else ok('overspend rejected', `${tooBig.status} ${tooBigBody.code}`);

  const badRoute = await fetch(`${BASE}/swap/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tokenIn: 'AAPLc', tokenOut: 'NVDAc', amountIn: '1' }),
  });
  const badRouteBody = await badRoute.json();
  if (badRouteBody.code !== 'INSUFFICIENT_LIQUIDITY') bad('stock→stock route rejected', JSON.stringify(badRouteBody).slice(0, 160));
  else ok('unroutable pair rejected', `${badRoute.status} ${badRouteBody.code}`);

  const unauthorized = await fetch(`${BASE}/portfolio`);
  if (unauthorized.status !== 401) bad('portfolio requires auth', String(unauthorized.status));
  else ok('portfolio requires auth', '401 without a token');

  log('sell all AAPLc back to cNGN');
  const sell = await call(
    'POST',
    '/swap/execute',
    { tokenIn: 'AAPLc', tokenOut: 'cNGN', amountIn: aaplc.amount.display },
    { expectStatus: 201 },
  );
  if (sell.status !== 'CONFIRMED') bad('sell confirmed', sell.status);
  else ok('sell confirmed', `${sell.amountOut.display} cNGN back, tx ${sell.txHash.slice(0, 12)}…`);

  const roundTrip = num(sell.amountOut.display);
  if (roundTrip > 1_000_000 || roundTrip < 985_000) {
    bad('round-trip cost is fees + impact only', `₦${roundTrip}`);
  } else {
    ok('round-trip cost', `₦1,000,000 → ₦${roundTrip.toFixed(2)} (${((1 - roundTrip / 1e6) * 100).toFixed(2)}% total)`);
  }

  const afterSell = await call('GET', `/wallet/${address}/balances`);
  const aaplcAfter = afterSell.find((b) => b.token.symbol === 'AAPLc');
  if (num(aaplcAfter.amount.display) > 1e-9) bad('AAPLc position closed', aaplcAfter.amount.display);
  else ok('position fully closed', '0 AAPLc');

  log('withdraw ₦500,000 (mocked payout)');
  const withdraw = await call('POST', '/onramp/withdraw', { ngnAmount: '500000' }, { expectStatus: 201 });
  if (withdraw.status !== 'CONFIRMED') bad('withdrawal confirmed', withdraw.status);
  else ok('withdrawal confirmed', `₦${withdraw.ngnAmount}, tx ${withdraw.txHash.slice(0, 12)}…`);

  console.log(`\n\x1b[1m${pass.length} passed, ${fail.length} failed\x1b[0m`);
  if (fail.length > 0) {
    console.log('\nfailures:');
    for (const f of fail) console.log(`  • ${f}`);
    process.exit(1);
  }
  console.log('\n\x1b[32mfull buy/sell flow works end to end\x1b[0m');
}

main().catch((error) => {
  console.error(`\n\x1b[31m✗ smoke test aborted:\x1b[0m ${error.message}`);
  process.exit(1);
});
