import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';

interface EncryptedEnvelope {
  v: 1;
  kdf: 'scrypt';
  n: number;
  r: number;
  p: number;
  salt: string;
  iv: string;
  tag: string;
  ct: string;
}

/**
 * AES-256-GCM envelope encryption for demo mnemonics.
 *
 * ── Why this exists, and what it is not ──────────────────────────────────────
 * The hackathon demo needs the server to sign a swap so a judge can watch the
 * whole flow without installing a browser wallet. That means the server must be
 * able to reconstruct a key. This class makes that as un-terrible as it can be:
 * a per-record random salt, scrypt key stretching (so WALLET_ENCRYPTION_KEY
 * alone is not directly a key), a random 96-bit IV per record, and GCM's auth
 * tag so a tampered ciphertext fails loudly rather than decrypting to garbage.
 *
 * It is still custodial. A production build stores nothing here: the mnemonic
 * stays in the browser, and the API's role shrinks to quoting and reading chain
 * state. The custody mode is recorded per user (`CustodyMode.SELF_SIGNED`) so
 * that path is already representable in the data model.
 *
 * Mirrors the scrypt + AES-256-GCM construction from the MCW wallet package,
 * with the same parameter set.
 */
@Injectable()
export class CryptoVaultService {
  private readonly logger = new Logger(CryptoVaultService.name);

  // scrypt cost: N=2^15 is ~50ms per derive on a laptop, high enough to matter
  // against an offline attacker, low enough not to stall a demo login.
  private static readonly N = 32_768;
  private static readonly R = 8;
  private static readonly P = 1;
  private static readonly KEY_LENGTH = 32;
  private static readonly SALT_LENGTH = 32;
  private static readonly IV_LENGTH = 12;
  private static readonly MAX_MEM = 64 * 1024 * 1024;

  constructor(private readonly config: AppConfigService) {}

  encrypt(plaintext: string): string {
    if (!plaintext) throw new Error('nothing to encrypt');

    const salt = randomBytes(CryptoVaultService.SALT_LENGTH);
    const key = this.deriveKey(salt);
    const iv = randomBytes(CryptoVaultService.IV_LENGTH);

    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);

    const envelope: EncryptedEnvelope = {
      v: 1,
      kdf: 'scrypt',
      n: CryptoVaultService.N,
      r: CryptoVaultService.R,
      p: CryptoVaultService.P,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
      ct: ct.toString('hex'),
    };
    return JSON.stringify(envelope);
  }

  decrypt(serialized: string): string {
    let envelope: EncryptedEnvelope;
    try {
      envelope = JSON.parse(serialized) as EncryptedEnvelope;
    } catch {
      throw new Error('Encrypted mnemonic is not a valid envelope. Was WALLET_ENCRYPTION_KEY rotated?');
    }

    if (envelope.v !== 1 || envelope.kdf !== 'scrypt') {
      throw new Error(`Unsupported vault envelope (v=${envelope.v}, kdf=${envelope.kdf}).`);
    }

    const salt = Buffer.from(envelope.salt, 'hex');
    const key = this.deriveKey(salt, { n: envelope.n, r: envelope.r, p: envelope.p });

    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(envelope.ct, 'hex')), decipher.final()]).toString('utf8');
    } catch {
      // Deliberately does not echo the ciphertext or the key.
      this.logger.error('vault decryption failed, wrong WALLET_ENCRYPTION_KEY or tampered record');
      throw new Error(
        'Could not decrypt the stored wallet. WALLET_ENCRYPTION_KEY likely changed since this user was created.',
      );
    }
  }

  /** Constant-time compare, for nonce/token equality checks. */
  safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  private deriveKey(salt: Buffer, params?: { n: number; r: number; p: number }): Buffer {
    return scryptSync(this.config.walletEncryptionKey, salt, CryptoVaultService.KEY_LENGTH, {
      N: params?.n ?? CryptoVaultService.N,
      r: params?.r ?? CryptoVaultService.R,
      p: params?.p ?? CryptoVaultService.P,
      maxmem: CryptoVaultService.MAX_MEM,
    });
  }
}
