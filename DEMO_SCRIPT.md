# NairaStock Demo Script (90 seconds)

A tight, judge-friendly walkthrough showing the full buy/sell/verify flow.

---

## Before You Record

### Checklist

- [ ] API running on :4010 (check `curl http://localhost:4010/api/health`)
- [ ] Frontend running on :5173 (check browser at `http://localhost:5173`)
- [ ] Database seeded with demo tokens (`pnpm db:seed`)
- [ ] Anvil chain running on :8545 with deployed contracts
- [ ] Browser window sized to 1920×1080 (or your recording standard)
- [ ] Close unnecessary tabs, clear browser console
- [ ] Disable browser extensions that add UI noise
- [ ] Have BaseScan (or local equivalent if available) ready in a second tab for the verification beat

### If Recording for Base Sepolia

For the "View on BaseScan" proof point to work on camera, you need to target Base Sepolia instead of local anvil:

1. Get a funded Base Sepolia deployer key (you'll need Sepolia ETH for gas)
2. Update `.env`:
   ```bash
   CHAIN_ID=84532
   RPC_URL=https://sepolia.base.org
   EXPLORER_BASE_URL=https://sepolia.basescan.org
   FAUCET_PRIVATE_KEY=0x<your_funded_sepolia_key>
   VITE_NETWORK_LABEL=Base Sepolia
   ```
3. Deploy contracts: `pnpm chain:deploy:sepolia`
4. Re-seed database: `pnpm db:seed`
5. Restart API and frontend

---

## Script (90 seconds)

### 00:00–00:15 | Setup the problem (15s)

**Screen**: Onboarding page hero (`http://localhost:5173`)

**Say**:  
> "Nigerians buying US stocks through Bamboo, Trove, or Risevest get a database IOU — a row in a brokerage ledger they don't control. NairaStock gives you the actual tokenized stock, in your own wallet, verifiable on-chain."

**Action**: None, just frame the problem while the hero is visible.

---

### 00:15–00:30 | Create wallet (15s)

**Screen**: Still on Onboarding page

**Say**:  
> "First, create a self-custody wallet. The private key is generated locally, never leaves your device in a production build."

**Action**:  
1. Click **"Create my self-custody wallet"**
2. App generates a BIP39 mnemonic and navigates to Dashboard
3. (If mnemonic display modal appears, click "I've saved it" to proceed)

---

### 00:30–00:45 | Fund with naira (15s)

**Screen**: Dashboard page

**Say**:  
> "Fund the wallet with ₦2 million naira — this mints cNGN, a naira stablecoin, directly into your wallet at a 1-to-1 peg. In production, this would connect to a licensed on/off-ramp like Busha or Quidax."

**Action**:  
1. Look for a "Deposit" or "Fund" button (if visible on Dashboard)
2. Enter `2000000` (₦2m)
3. Click confirm
4. Wait 1–2 seconds for the balance to update
5. Point out the cNGN balance in the portfolio card

*(If no explicit deposit UI, narrate that the demo wallet is pre-funded for brevity)*

---

### 00:45–01:05 | Buy AAPLc (20s)

**Screen**: Navigate to Trade page

**Say**:  
> "Now buy tokenized Apple stock — AAPLc — by swapping cNGN through an on-chain liquidity pool. The price comes from a Chainlink feed, the swap settles instantly on Base, and the token lands in your wallet."

**Action**:  
1. Click **"Trade"** in the top nav
2. Select **AAPLc** from the token dropdown
3. Toggle to **"Buy"** (if not already selected)
4. Enter an amount (e.g., `500000` cNGN to buy ~$312 worth of AAPLc at ₦1,600/$1 rate)
5. Click **"Get quote"** (or the button auto-quotes on input)
6. Review the quote: amount out, price, slippage
7. Click **"Confirm swap"**
8. Wait 2–3 seconds for the transaction to confirm
9. UI shows "Transaction confirmed" with a BaseScan link

---

### 01:05–01:20 | Verify on BaseScan (15s)

**Screen**: Click the BaseScan link from the swap confirmation

**Say**:  
> "Here's the proof point: click 'View on BaseScan' and you can see the AAPLc token sitting at my wallet address — this is the difference between a self-custody asset and a brokerage IOU. Anyone can verify this balance on-chain."

**Action**:  
1. Click the **"View on BaseScan"** link (opens in new tab)
2. Show the token balance row on BaseScan's token holdings page for your wallet address
3. (If on local anvil and BaseScan links are hidden, narrate: "On Base Sepolia or mainnet, this would link directly to BaseScan for public verification.")

---

### 01:20–01:30 | Show live price + sell back (10s)

**Screen**: Return to NairaStock (Dashboard or Stock detail page)

**Say**:  
> "Back on the dashboard, you can see your holdings with live pricing. The stock token is yours — you can hold it, transfer it, or sell it back to cNGN anytime, 24/7."

**Action**:  
1. Show the portfolio table with the AAPLc balance and current value
2. (Optional if time permits) Click on the AAPLc row to see the price chart on the Stock detail page
3. Click **"Sell"** button
4. Enter the amount to sell (or "Sell all")
5. Click **"Confirm swap"**
6. Wait for confirmation

---

### 01:30–01:35 | Close with the pitch (5s)

**Screen**: Dashboard showing updated balances after the sell

**Say**:  
> "That's NairaStock: self-custody tokenized stocks on Base, funded in naira, verifiable on-chain. Not a database IOU — the real thing."

**Action**: None, just hold on the dashboard for 2 seconds, then fade out or cut.

---

## Tips

- **Keep it moving**: 90 seconds is tight, don't linger on any screen longer than scripted
- **Narrate actions as you do them**: say "I'm clicking Buy AAPLc" while clicking, not after — judges watching on mute should still follow
- **Practice once**: the mnemonic generation, balance updates, and swap confirmation all take 1–3 seconds of real async time; know where the pauses are so you don't talk over loading states awkwardly
- **BaseScan is the hero moment**: if you're on local anvil and can't show a real block explorer link, acknowledge it verbally ("In a Sepolia or mainnet demo, this would link to BaseScan") — don't pretend the link works when it doesn't

---

## Fallback: No Deposit UI

If the onboarding flow doesn't have a visible "Deposit naira" modal (because the demo wallet is pre-funded), narrate:

> "For this demo, the wallet is pre-funded with ₦2 million cNGN — in production, this would be a licensed naira on/off-ramp."

Then jump straight to the **Buy AAPLc** beat.

---

## Optional Stretch (if under 90s and you have time)

After the sell, say:

> "Because this is an ERC-20 token in your wallet, you could also lend against it as collateral on Aave or another protocol — something a custodial platform could never let you do with a database IOU."

Then show the "Borrow against your stock" panel (if implemented in the UI) or just state it as a future direction.

---

## Recording Settings

- **Resolution**: 1920×1080 (1080p)
- **Frame rate**: 30fps minimum
- **Audio**: clear voiceover, no background music (or very subtle, non-distracting)
- **Length**: aim for 75–90 seconds (under 90 is better than over)
- **Format**: MP4 (H.264 codec) for maximum compatibility

---

## After Recording

1. Upload to YouTube (unlisted or public)
2. Test the link in an incognito window to confirm it's viewable
3. Add the YouTube link to the hackathon submission form under "Demo Video Link"
4. Drop the same link into the README.md under the **Demo Video** section

---

**Good luck!** The product works end-to-end — trust the flow, keep the energy up, and let the self-custody proof point land.
