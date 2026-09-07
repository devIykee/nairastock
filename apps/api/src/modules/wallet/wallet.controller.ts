import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import type { AuthSession, CreatedWallet, TokenBalance } from '@nairastock/shared';
import { AddressParamDto, CreateWalletDto, ImportWalletDto } from '../../common/dto';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly auth: AuthService,
    private readonly portfolio: PortfolioService,
  ) {}

  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate a fresh self-custody HD wallet',
    description:
      'BIP39 mnemonic → BIP44 m/44\'/60\'/0\'/0/0 → Base address. The mnemonic is returned exactly once, ' +
      'here, and is never logged. A copy is stored AES-256-GCM encrypted so the demo can sign without a ' +
      'browser extension, a hackathon shortcut, documented in the README. Also returns a session token and ' +
      'tops the wallet up with gas.',
  })
  async create(@Body() dto: CreateWalletDto): Promise<CreatedWallet & { session: AuthSession }> {
    const created = await this.wallet.createWallet({ fundGas: dto.fundGas !== 'false' });
    const session = await this.auth.issueSessionForAddress(created.address);
    return { ...created, session };
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Import an existing BIP39 mnemonic',
    description: 'Same derivation path. Idempotent: re-importing a known phrase returns the same address.',
  })
  async import(@Body() dto: ImportWalletDto): Promise<Omit<CreatedWallet, 'mnemonic'> & { session: AuthSession }> {
    const imported = await this.wallet.importWallet(dto.mnemonic);
    const session = await this.auth.issueSessionForAddress(imported.address);
    return { ...imported, session };
  }

  @Get(':address/balances')
  @ApiOperation({
    summary: 'On-chain balances for an address',
    description:
      'Reads cNGN + every whitelisted stock token in a single Multicall3 batch. Public by design, any ' +
      'address\'s balances are already public on-chain, and each entry carries an explorer link so the ' +
      'holding can be verified independently.',
  })
  async balances(@Param() params: AddressParamDto): Promise<TokenBalance[]> {
    return this.portfolio.getBalances(params.address);
  }

  @Post('backed-up')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Record that the user saved their recovery phrase' })
  async markBackedUp(@CurrentUser() user: User): Promise<void> {
    await this.wallet.markBackedUp(user.id);
  }

  @Post('gas')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Top the wallet up with testnet gas',
    description: 'Sends ETH from the faucet if the wallet is below the threshold. No-op on mainnet deployments.',
  })
  async topUpGas(@CurrentUser() user: User): Promise<void> {
    await this.wallet.ensureGas(user.walletAddress);
  }
}
