import { ethers } from 'ethers';
import { buildSignInMessage } from './auth.service';

/**
 * Signature verification is the whole of the auth story, so it gets asserted
 * against real ethers signing rather than a mock: a wallet signs the exact
 * message the server generated, and `verifyMessage` must recover that address
 * and no other.
 */
describe('wallet-signature auth', () => {
  const CHAIN_ID = 84532;
  const expiresAt = new Date('2026-01-01T00:00:00.000Z');
  const wallet = ethers.Wallet.createRandom();
  const other = ethers.Wallet.createRandom();

  describe('buildSignInMessage', () => {
    it('embeds the address, chain, nonce, and expiry', () => {
      const message = buildSignInMessage(wallet.address, 'deadbeef', CHAIN_ID, expiresAt);
      expect(message).toContain(wallet.address);
      expect(message).toContain(`Chain: ${CHAIN_ID}`);
      expect(message).toContain('Nonce: deadbeef');
      expect(message).toContain(expiresAt.toISOString());
    });

    it('states plainly that signing authorises no transaction', () => {
      // A wallet popup showing opaque bytes trains users to sign anything.
      const message = buildSignInMessage(wallet.address, 'n', CHAIN_ID, expiresAt);
      expect(message).toMatch(/costs no gas and authorises no transaction/);
    });

    it('differs per nonce, so one signature cannot serve two logins', () => {
      const a = buildSignInMessage(wallet.address, 'nonce-a', CHAIN_ID, expiresAt);
      const b = buildSignInMessage(wallet.address, 'nonce-b', CHAIN_ID, expiresAt);
      expect(a).not.toBe(b);
    });

    it('differs per chain, so a signature is not portable across deployments', () => {
      const sepolia = buildSignInMessage(wallet.address, 'n', 84532, expiresAt);
      const mainnet = buildSignInMessage(wallet.address, 'n', 8453, expiresAt);
      expect(sepolia).not.toBe(mainnet);
    });
  });

  describe('signature recovery', () => {
    it('recovers the signer of a well-formed message', async () => {
      const message = buildSignInMessage(wallet.address, 'abc', CHAIN_ID, expiresAt);
      const signature = await wallet.signMessage(message);
      expect(ethers.verifyMessage(message, signature)).toBe(wallet.address);
    });

    it('does not recover a different wallet', async () => {
      const message = buildSignInMessage(wallet.address, 'abc', CHAIN_ID, expiresAt);
      const signature = await other.signMessage(message);
      expect(ethers.verifyMessage(message, signature)).not.toBe(wallet.address);
    });

    it('recovers a different address if the message is altered', async () => {
      const message = buildSignInMessage(wallet.address, 'abc', CHAIN_ID, expiresAt);
      const signature = await wallet.signMessage(message);
      // Replaying a signature against a different nonce must not authenticate.
      const tampered = buildSignInMessage(wallet.address, 'xyz', CHAIN_ID, expiresAt);
      expect(ethers.verifyMessage(tampered, signature)).not.toBe(wallet.address);
    });

    it('throws on a malformed signature rather than returning a wrong address', () => {
      const message = buildSignInMessage(wallet.address, 'abc', CHAIN_ID, expiresAt);
      expect(() => ethers.verifyMessage(message, '0xdeadbeef')).toThrow();
    });
  });
});
