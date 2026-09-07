import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import type { OnrampResult } from '@nairastock/shared';
import { DepositDto, WithdrawDto } from '../../common/dto';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OnrampService } from './onramp.service';

@ApiTags('onramp')
@Controller('onramp')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OnrampController {
  constructor(private readonly onramp: OnrampService) {}

  @Post('deposit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Fund the wallet with naira (mocked bank rail)',
    description:
      'Simulates what a licensed cNGN on-ramp partner (Busha / Quidax) does in production: collect naira by ' +
      'bank transfer, then release cNGN to the user’s address. Here the collection leg is skipped and cNGN is ' +
      'minted from the faucet at ₦1 = 1 cNGN. The destination is real, the tokens land in the user’s own ' +
      'wallet and the transfer is on-chain.',
  })
  async deposit(@CurrentUser() user: User, @Body() dto: DepositDto): Promise<OnrampResult> {
    return this.onramp.deposit(user, dto.ngnAmount);
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Cash out to naira (mocked payout)',
    description:
      'Returns cNGN to the issuer float, mirroring a partner burning on payout, and records the naira ' +
      'payout. No real bank transfer occurs in the demo.',
  })
  async withdraw(@CurrentUser() user: User, @Body() dto: WithdrawDto): Promise<OnrampResult> {
    return this.onramp.withdraw(user, dto.ngnAmount);
  }
}
