import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import type { AuthNonce, AuthSession } from '@nairastock/shared';
import { AddressParamDto, VerifySignatureDto } from '../../common/dto';
import { AuthService } from './auth.service';
import { CurrentUser, JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('nonce/:address')
  @ApiOperation({
    summary: 'Get a login challenge to sign',
    description:
      'Returns a single-use nonce and the exact human-readable message to pass to personal_sign. ' +
      'Expires after AUTH_NONCE_TTL_SECONDS.',
  })
  async nonce(@Param() params: AddressParamDto): Promise<AuthNonce> {
    return this.auth.createNonce(params.address);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a signature for a JWT',
    description:
      'Recovers the signer with ethers.verifyMessage and issues a token if it matches the claimed address. ' +
      'First-time addresses are registered as SELF_SIGNED, the server holds no key for them.',
  })
  async verify(@Body() dto: VerifySignatureDto): Promise<AuthSession> {
    return this.auth.verify({ address: dto.address, signature: dto.signature, nonce: dto.nonce });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current session' })
  me(@CurrentUser() user: User): {
    id: string;
    walletAddress: string;
    custodyMode: string;
    mnemonicBackedUp: boolean;
    createdAt: string;
  } {
    return {
      id: user.id,
      walletAddress: user.walletAddress,
      custodyMode: user.custodyMode,
      mnemonicBackedUp: user.mnemonicBackedUp,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
