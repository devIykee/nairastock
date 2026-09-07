import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { ethers } from 'ethers';
import { CustodyMode } from '@prisma/client';
import type { AuthNonce, AuthSession } from '@nairastock/shared';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/app-exception';
import { WalletService } from '../wallet/wallet.service';

export interface JwtPayload {
  sub: string;
  address: string;
  custodyMode: CustodyMode;
}

/**
 * Wallet-signature login.
 *
 * Chosen over email/password because it fits the product: the wallet *is* the
 * account, so proving control of the key is the only credential that means
 * anything. The flow is the standard nonce challenge,  *
 *   GET  /auth/nonce/:address  → a single-use nonce and the exact message to sign
 *   POST /auth/verify          → signature; server recovers the signer and issues a JWT
 *
 * The nonce is stored with an expiry and marked consumed on use, so a captured
 * signature can't be replayed.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly wallet: WalletService,
  ) {}

  async createNonce(address: string): Promise<AuthNonce> {
    let checksummed: string;
    try {
      checksummed = ethers.getAddress(address);
    } catch {
      throw AppException.unknownToken(`address "${address}"`);
    }

    const nonce = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + this.config.authNonceTtlSeconds * 1000);
    const message = buildSignInMessage(checksummed, nonce, this.config.chainId, expiresAt);

    await this.prisma.authNonce.create({
      data: { address: checksummed, nonce, message, expiresAt },
    });

    // Housekeeping so the table doesn't grow unbounded during a long demo.
    await this.prisma.authNonce
      .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } } })
      .catch(() => undefined);

    return { address: checksummed, nonce, message, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Verifies the signature and issues a JWT. Registers the address on first
   * login as SELF_SIGNED, a user who can sign has no need for server custody.
   */
  async verify(params: { address: string; signature: string; nonce: string }): Promise<AuthSession> {
    let checksummed: string;
    try {
      checksummed = ethers.getAddress(params.address);
    } catch {
      throw AppException.unknownToken(`address "${params.address}"`);
    }

    const record = await this.prisma.authNonce.findUnique({ where: { nonce: params.nonce } });
    if (!record || record.consumedAt || record.expiresAt < new Date()) {
      throw AppException.nonceExpired();
    }
    if (ethers.getAddress(record.address) !== checksummed) {
      throw AppException.invalidSignature();
    }

    let recovered: string;
    try {
      recovered = ethers.verifyMessage(record.message, params.signature);
    } catch {
      throw AppException.invalidSignature();
    }
    if (ethers.getAddress(recovered) !== checksummed) {
      this.logger.warn(`signature for ${checksummed} recovered as ${recovered}`);
      throw AppException.invalidSignature();
    }

    // Single-use: consume before issuing the token.
    await this.prisma.authNonce.update({ where: { id: record.id }, data: { consumedAt: new Date() } });

    const existing = await this.prisma.user.findUnique({ where: { walletAddress: checksummed } });
    const user = existing ?? (await this.wallet.registerSelfSignedWallet(checksummed));

    return this.issueSession(user);
  }

  /**
   * Session for a wallet the server just created. The client has been shown the
   * mnemonic and has not signed anything yet, so requiring a signature here
   * would mean asking them to paste the phrase back, worse for both UX and
   * safety. The nonce flow still governs every subsequent login.
   */
  async issueSessionForAddress(address: string): Promise<AuthSession> {
    const user = await this.wallet.requireByAddress(address);
    return this.issueSession(user);
  }

  private async issueSession(user: {
    id: string;
    walletAddress: string;
    custodyMode: CustodyMode;
    createdAt: Date;
  }): Promise<AuthSession> {
    const payload: JwtPayload = {
      sub: user.id,
      address: user.walletAddress,
      custodyMode: user.custodyMode,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresIn: this.config.jwtExpiresIn,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        custodyMode: user.custodyMode === CustodyMode.DEMO_CUSTODIAL ? 'DEMO_CUSTODIAL' : 'SELF_SIGNED',
        createdAt: user.createdAt.toISOString(),
      },
    };
  }
}

/**
 * The exact string the client signs. Human-readable on purpose: a wallet popup
 * showing opaque bytes trains users to sign anything. Includes the chain id and
 * an expiry so a signature captured from one deployment is useless on another.
 */
export function buildSignInMessage(address: string, nonce: string, chainId: number, expiresAt: Date): string {
  return [
    'NairaStock, sign in',
    '',
    `Wallet: ${address}`,
    `Chain: ${chainId}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt.toISOString()}`,
    '',
    'Signing this message proves you control this wallet. It costs no gas and authorises no transaction.',
  ].join('\n');
}
