import { Global, Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { CryptoVaultService } from './crypto-vault.service';

/**
 * Global rather than importing AuthModule (which needs WalletService), that
 * would make the module graph circular. Wallet, auth, and portfolio are all
 * global and import none of each other; only their providers reference one
 * another, and that graph is acyclic:
 *   AuthService → WalletService
 *   WalletController → AuthService, WalletService, PortfolioService
 */
@Global()
@Module({
  providers: [WalletService, CryptoVaultService],
  controllers: [WalletController],
  exports: [WalletService, CryptoVaultService],
})
export class WalletModule {}
