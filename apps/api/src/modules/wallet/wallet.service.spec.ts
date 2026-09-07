import { BadRequestException } from '@nestjs/common';
import * as bip39 from 'bip39';
import { ethers } from 'ethers';
import { WalletService, derivationPathFor } from './wallet.service';

/**
 * Derivation tests. These are the part of the wallet module worth pinning down:
 * if derivation is wrong, funds land at an address nobody controls, and no
 * amount of integration testing downstream will surface it clearly.
 *
 * The service's chain/DB collaborators are stubbed, derivation is pure.
 */
describe('WalletService, HD derivation', () => {
  const service = new WalletService(
    {} as never, // prisma, unused by derivation
    { chainId: 31337, explorerBaseUrl: '' } as never,
    {} as never, // chain
    {} as never, // vault
  );

  // The standard Hardhat/anvil test phrase. Public by design, and its derived
  // addresses are documented, which makes it a real fixture rather than a
  // self-referential one.
  const TEST_MNEMONIC = 'test test test test test test test test test test test junk';
  const KNOWN_ADDRESSES = [
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  ];

  describe('generateMnemonic', () => {
    it('produces a valid BIP39 phrase', () => {
      const mnemonic = service.generateMnemonic();
      expect(bip39.validateMnemonic(mnemonic)).toBe(true);
    });

    it('produces 12 words at 128-bit strength and 24 at 256-bit', () => {
      expect(service.generateMnemonic(128).split(' ')).toHaveLength(12);
      expect(service.generateMnemonic(256).split(' ')).toHaveLength(24);
    });

    it('does not repeat across calls', () => {
      const phrases = new Set(Array.from({ length: 20 }, () => service.generateMnemonic()));
      expect(phrases.size).toBe(20);
    });

    it('uses only words from the BIP39 English wordlist', () => {
      const wordlist = new Set(bip39.wordlists.english);
      for (const word of service.generateMnemonic(256).split(' ')) {
        expect(wordlist.has(word)).toBe(true);
      }
    });
  });

  describe('validateMnemonic', () => {
    it('accepts a valid phrase', () => {
      expect(service.validateMnemonic(TEST_MNEMONIC)).toBe(true);
    });

    it('rejects a phrase with a bad checksum', () => {
      // Valid words, wrong checksum, the case a typo actually produces.
      expect(service.validateMnemonic('test test test test test test test test test test test test')).toBe(false);
    });

    it('rejects an out-of-wordlist word', () => {
      expect(service.validateMnemonic(TEST_MNEMONIC.replace('junk', 'nairastock'))).toBe(false);
    });

    it('tolerates surrounding whitespace', () => {
      expect(service.validateMnemonic(`  ${TEST_MNEMONIC}  `)).toBe(true);
    });
  });

  describe('deriveWallet', () => {
    it('matches the known addresses for the standard test phrase', () => {
      KNOWN_ADDRESSES.forEach((expected, index) => {
        expect(service.deriveAddress(TEST_MNEMONIC, index)).toBe(expected);
      });
    });

    it('is deterministic across repeated calls', () => {
      const first = service.deriveAddress(TEST_MNEMONIC, 0);
      const second = service.deriveAddress(TEST_MNEMONIC, 0);
      expect(first).toBe(second);
    });

    it('returns an EIP-55 checksummed address', () => {
      const address = service.deriveAddress(TEST_MNEMONIC, 0);
      // getAddress is a no-op on an already-checksummed string and throws on a
      // bad checksum, so equality here is the assertion.
      expect(ethers.getAddress(address)).toBe(address);
      expect(address).not.toBe(address.toLowerCase());
    });

    it('gives a different address per account index', () => {
      const addresses = new Set([0, 1, 2, 3, 4].map((i) => service.deriveAddress(TEST_MNEMONIC, i)));
      expect(addresses.size).toBe(5);
    });

    it('derives at the BIP44 Ethereum path', () => {
      const wallet = service.deriveWallet(TEST_MNEMONIC, 3);
      expect(wallet.path).toBe("m/44'/60'/0'/0/3");
    });

    it('normalises internal whitespace before deriving', () => {
      const messy = TEST_MNEMONIC.replace(/ /g, '   ');
      expect(service.deriveAddress(messy, 0)).toBe(KNOWN_ADDRESSES[0]);
    });

    it('rejects an invalid phrase rather than deriving from garbage', () => {
      expect(() => service.deriveWallet('not a real mnemonic at all', 0)).toThrow(BadRequestException);
    });

    it('produces a private key that signs for the derived address', async () => {
      const hd = service.deriveWallet(TEST_MNEMONIC, 1);
      const signer = new ethers.Wallet(hd.privateKey);
      const signature = await signer.signMessage('NairaStock');
      expect(ethers.verifyMessage('NairaStock', signature)).toBe(KNOWN_ADDRESSES[1]);
    });

    it('derives a distinct tree for a different phrase', () => {
      const other = service.generateMnemonic();
      expect(service.deriveAddress(other, 0)).not.toBe(KNOWN_ADDRESSES[0]);
    });
  });

  describe('derivationPathFor', () => {
    it('uses coin type 60, Base is an EVM chain, so the ETH path applies', () => {
      expect(derivationPathFor(0)).toBe("m/44'/60'/0'/0/0");
      expect(derivationPathFor(7)).toBe("m/44'/60'/0'/0/7");
    });
  });
});
