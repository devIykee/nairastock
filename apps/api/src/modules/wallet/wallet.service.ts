import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CustodyMode, type User } from '@prisma/client';
import * as bip39 from 'bip39';
import { ethers } from 'ethers';
import { addressUrl, type CreatedWallet } from '@nairastock/shared';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/app-exception';
import { ChainService } from '../chain/chain.service';
import { CryptoVaultService } from './crypto-vault.service';

/**
 * BIP39 → BIP32/BIP44 HD derivation, using the same pattern as the MCW wallet
 * package: one seed, `m/44'/60'/0'/0/i` for account i, EIP-55 checksummed output.
 * Base is an EVM chain so coin type 60 is correct, a Base address is an Ethereum
 * address, and the same seed works on both.
 */
export const EVM_COIN_TYPE = 60;

export function derivationPathFor(accountIndex = 0): string {
  return `m/44'/${EVM_COIN_TYPE}'/0'/0/${accountIndex}`;
}

/** Gas top-up for a fresh wallet, so a first swap can't fail for want of ETH. */
const GAS_TOPUP_WEI = ethers.parseEther('0.05');
const GAS_TOPUP_THRESHOLD_WEI = ethers.parseEther('0.01');

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly chain: ChainService,
    private readonly vault: CryptoVaultService,
  ) {}

  // ── Derivation (pure, unit-tested) ─────────────────────────────────────────

  generateMnemonic(strength: 128 | 256 = 128): string {
    return bip39.generateMnemonic(strength);
  }

  validateMnemonic(mnemonic: string): boolean {
    return bip39.validateMnemonic(mnemonic.trim());
  }

  /**
   * Deterministic: the same phrase and index always yield the same address.
   * Returns the wallet rather than just the address so callers can sign without
   * re-deriving.
   */
  deriveWallet(mnemonic: string, accountIndex = 0): ethers.HDNodeWallet {
    const normalized = mnemonic.trim().replace(/\s+/g, ' ');
    if (!this.validateMnemonic(normalized)) {
      throw new BadRequestException('Not a valid BIP39 mnemonic, check the word list and spelling.');
    }
    // The absolute path must be passed to fromPhrase. `fromPhrase(mnemonic)`
    // already returns the node at m/44'/60'/0'/0/0, so calling `.derivePath()`
    // on the result derives *relative* to that node and yields non-standard
    // addresses, a phrase restored in MetaMask would show different accounts.
    return ethers.HDNodeWallet.fromPhrase(normalized, undefined, derivationPathFor(accountIndex));
  }

  deriveAddress(mnemonic: string, accountIndex = 0): string {
    return ethers.getAddress(this.deriveWallet(mnemonic, accountIndex).address);
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  /**
   * Creates a user with a fresh HD wallet. The mnemonic is returned exactly once
   * in this response and never logged; the stored copy is AES-256-GCM encrypted
   * (demo custody, see CryptoVaultService for why).
   */
  async createWallet(options: { fundGas?: boolean } = {}): Promise<CreatedWallet> {
    const mnemonic = this.generateMnemonic(128);
    const wallet = this.deriveWallet(mnemonic, 0);
    const address = ethers.getAddress(wallet.address);
    const path = derivationPathFor(0);

    await this.prisma.user.create({
      data: {
        walletAddress: address,
        custodyMode: CustodyMode.DEMO_CUSTODIAL,
        encryptedMnemonic: this.vault.encrypt(mnemonic),
        derivationPath: path,
        wallets: { create: { address, chainId: this.config.chainId, accountIndex: 0 } },
      },
    });

    this.logger.log(`created wallet ${address}`); // address only, never the phrase

    if (options.fundGas !== false) {
      await this.ensureGas(address);
    }

    return {
      address,
      mnemonic,
      derivationPath: path,
      chainId: this.config.chainId,
      explorerUrl: addressUrl(this.config.chainId, address, this.config.explorerBaseUrl) ?? '',
    };
  }

  /**
   * Imports an existing phrase. Same custody caveat as createWallet; the
   * alternative (SELF_SIGNED) is registered through the auth module by proving
   * ownership with a signature instead of handing over the phrase.
   */
  async importWallet(mnemonic: string, options: { fundGas?: boolean } = {}): Promise<Omit<CreatedWallet, 'mnemonic'>> {
    const wallet = this.deriveWallet(mnemonic, 0);
    const address = ethers.getAddress(wallet.address);
    const path = derivationPathFor(0);

    const existing = await this.prisma.user.findUnique({ where: { walletAddress: address } });
    if (existing) {
      // Re-importing is idempotent: refresh the stored envelope (the user may be
      // moving between deployments) and hand back the same address.
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { encryptedMnemonic: this.vault.encrypt(mnemonic.trim()), custodyMode: CustodyMode.DEMO_CUSTODIAL },
      });
    } else {
      await this.prisma.user.create({
        data: {
          walletAddress: address,
          custodyMode: CustodyMode.DEMO_CUSTODIAL,
          encryptedMnemonic: this.vault.encrypt(mnemonic.trim()),
          derivationPath: path,
          mnemonicBackedUp: true, // they already have it
          wallets: { create: { address, chainId: this.config.chainId, accountIndex: 0 } },
        },
      });
    }

    this.logger.log(`imported wallet ${address}`);

    if (options.fundGas !== false) {
      await this.ensureGas(address);
    }

    return {
      address,
      derivationPath: path,
      chainId: this.config.chainId,
      explorerUrl: addressUrl(this.config.chainId, address, this.config.explorerBaseUrl) ?? '',
    };
  }

  /** Registers an address whose key never touches the server. */
  async registerSelfSignedWallet(address: string): Promise<User> {
    const checksummed = ethers.getAddress(address);
    return this.prisma.user.upsert({
      where: { walletAddress: checksummed },
      update: {},
      create: {
        walletAddress: checksummed,
        custodyMode: CustodyMode.SELF_SIGNED,
        encryptedMnemonic: null,
        mnemonicBackedUp: true,
        wallets: { create: { address: checksummed, chainId: this.config.chainId, accountIndex: 0 } },
      },
    });
  }

  async markBackedUp(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { mnemonicBackedUp: true } });
  }

  async findByAddress(address: string): Promise<User | null> {
    let checksummed: string;
    try {
      checksummed = ethers.getAddress(address);
    } catch {
      throw new BadRequestException(`"${address}" is not a valid EVM address.`);
    }
    return this.prisma.user.findUnique({ where: { walletAddress: checksummed } });
  }

  async requireByAddress(address: string): Promise<User> {
    const user = await this.findByAddress(address);
    if (!user) throw new NotFoundException(`No wallet registered for ${address}.`);
    return user;
  }

  // ── Signing (demo custody) ─────────────────────────────────────────────────

  /**
   * Reconstructs a signer for a DEMO_CUSTODIAL user. Throws for SELF_SIGNED
   * users, where by construction there is nothing to reconstruct.
   */
  async getSigner(user: Pick<User, 'id' | 'walletAddress' | 'custodyMode' | 'encryptedMnemonic' | 'derivationPath'>): Promise<ethers.Wallet> {
    if (user.custodyMode !== CustodyMode.DEMO_CUSTODIAL || !user.encryptedMnemonic) {
      throw AppException.signingUnavailable();
    }

    const mnemonic = this.vault.decrypt(user.encryptedMnemonic);
    const accountIndex = parseAccountIndex(user.derivationPath);
    const hd = this.deriveWallet(mnemonic, accountIndex);

    if (ethers.getAddress(hd.address) !== ethers.getAddress(user.walletAddress)) {
      // Only reachable if the stored path and address disagree, worth failing
      // loudly rather than signing from an unexpected account.
      throw new Error(
        `Derived address ${hd.address} does not match stored ${user.walletAddress}. Refusing to sign.`,
      );
    }

    return new ethers.Wallet(hd.privateKey, this.chain.getProvider());
  }

  /**
   * Tops a wallet up with gas from the faucet if it's below the threshold.
   * Without this, a freshly created wallet's first swap fails with a bare
   * "insufficient funds for intrinsic transaction cost", a bad first demo beat.
   */
  async ensureGas(address: string): Promise<void> {
    try {
      const balance = await this.chain.getNativeBalance(address);
      if (balance >= GAS_TOPUP_THRESHOLD_WEI) return;

      await this.chain.withFaucet(async (faucet) => {
        // Re-check inside the queue: a concurrent caller may have just topped
        // this wallet up while we waited our turn.
        const current = await this.chain.getNativeBalance(address);
        if (current >= GAS_TOPUP_THRESHOLD_WEI) return;

        const faucetBalance = await this.chain.getNativeBalance(faucet.address);
        if (faucetBalance < GAS_TOPUP_WEI * 2n) {
          this.logger.warn(
            `faucet ${faucet.address} is low (${ethers.formatEther(faucetBalance)} ETH), skipping gas top-up for ${address}`,
          );
          return;
        }

        const tx = await faucet.sendTransaction({ to: address, value: GAS_TOPUP_WEI });
        await tx.wait();
        this.logger.log(`sent ${ethers.formatEther(GAS_TOPUP_WEI)} ETH gas to ${address}`);
      });
    } catch (error) {
      // Non-fatal: wallet creation shouldn't fail because the faucet is empty.
      this.logger.warn(`gas top-up for ${address} failed: ${(error as Error).message}`);
    }
  }
}

function parseAccountIndex(path: string): number {
  const match = /\/(\d+)$/.exec(path.trim());
  return match ? Number(match[1]) : 0;
}
