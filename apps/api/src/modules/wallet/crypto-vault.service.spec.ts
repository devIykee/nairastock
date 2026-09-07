import { CryptoVaultService } from './crypto-vault.service';

/**
 * The vault is the thing standing between a database dump and a stolen wallet in
 * the demo-custodial path, so its guarantees are worth asserting: ciphertext
 * never equals plaintext, two encryptions of the same phrase differ, tampering
 * is detected, and a wrong key fails loudly rather than returning garbage.
 */
describe('CryptoVaultService', () => {
  const KEY = 'a'.repeat(64);
  const OTHER_KEY = 'b'.repeat(64);
  const MNEMONIC = 'test test test test test test test test test test test junk';

  const vaultWith = (key: string) => new CryptoVaultService({ walletEncryptionKey: key } as never);
  const vault = vaultWith(KEY);

  it('round-trips a mnemonic', () => {
    expect(vault.decrypt(vault.encrypt(MNEMONIC))).toBe(MNEMONIC);
  });

  it('never stores the plaintext', () => {
    const envelope = vault.encrypt(MNEMONIC);
    expect(envelope).not.toContain('junk');
    expect(envelope).not.toContain(MNEMONIC);
    for (const word of MNEMONIC.split(' ')) {
      expect(envelope).not.toContain(`"${word}"`);
    }
  });

  it('produces a different envelope every time (fresh salt + IV)', () => {
    const first = JSON.parse(vault.encrypt(MNEMONIC));
    const second = JSON.parse(vault.encrypt(MNEMONIC));
    expect(first.ct).not.toBe(second.ct);
    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
  });

  it('records the KDF parameters so an envelope stays readable after a cost bump', () => {
    const envelope = JSON.parse(vault.encrypt(MNEMONIC));
    expect(envelope).toMatchObject({ v: 1, kdf: 'scrypt', n: 32_768, r: 8, p: 1 });
    expect(envelope.iv).toHaveLength(24); // 12 bytes hex, GCM nonce
    expect(envelope.salt).toHaveLength(64); // 32 bytes hex
    expect(envelope.tag).toHaveLength(32); // 16 bytes hex, GCM auth tag
  });

  it('fails with a clear message under the wrong key', () => {
    const envelope = vault.encrypt(MNEMONIC);
    expect(() => vaultWith(OTHER_KEY).decrypt(envelope)).toThrow(/WALLET_ENCRYPTION_KEY likely changed/);
  });

  it('detects a tampered ciphertext', () => {
    const envelope = JSON.parse(vault.encrypt(MNEMONIC));
    // Flip one hex nibble in the ciphertext.
    const flipped = envelope.ct.slice(0, -1) + (envelope.ct.slice(-1) === '0' ? '1' : '0');
    expect(() => vault.decrypt(JSON.stringify({ ...envelope, ct: flipped }))).toThrow(/Could not decrypt/);
  });

  it('detects a tampered auth tag', () => {
    const envelope = JSON.parse(vault.encrypt(MNEMONIC));
    const flipped = envelope.tag.slice(0, -1) + (envelope.tag.slice(-1) === '0' ? '1' : '0');
    expect(() => vault.decrypt(JSON.stringify({ ...envelope, tag: flipped }))).toThrow(/Could not decrypt/);
  });

  it('rejects a malformed envelope', () => {
    expect(() => vault.decrypt('not json')).toThrow(/not a valid envelope/);
  });

  it('rejects an unsupported envelope version', () => {
    const envelope = JSON.parse(vault.encrypt(MNEMONIC));
    expect(() => vault.decrypt(JSON.stringify({ ...envelope, v: 99 }))).toThrow(/Unsupported vault envelope/);
  });

  it('refuses to encrypt nothing', () => {
    expect(() => vault.encrypt('')).toThrow(/nothing to encrypt/);
  });

  describe('safeEqual', () => {
    it('compares equal strings as equal', () => {
      expect(vault.safeEqual('abc123', 'abc123')).toBe(true);
    });

    it('rejects different strings and different lengths', () => {
      expect(vault.safeEqual('abc123', 'abc124')).toBe(false);
      expect(vault.safeEqual('abc', 'abc123')).toBe(false);
      expect(vault.safeEqual('', 'a')).toBe(false);
    });
  });
});
