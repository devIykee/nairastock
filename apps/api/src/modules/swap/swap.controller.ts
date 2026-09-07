import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import type { SwapQuote, SwapResult } from '@nairastock/shared';
import { ExecuteSwapDto, QuoteDto } from '../../common/dto';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SwapService } from './swap.service';

@ApiTags('swap')
@Controller('swap')
export class SwapController {
  constructor(private readonly swap: SwapService) {}

  @Post('quote')
  @ApiOperation({
    summary: 'Quote a cNGN ⇄ stock token swap',
    description:
      'Reads live pool reserves and returns expected output, price impact, and the minimum received at the ' +
      'given slippage tolerance (default 1%). Public, quoting reveals nothing private, and the trade screen ' +
      'calls it on every keystroke (debounced).',
  })
  @ApiResponse({ status: 409, description: 'INSUFFICIENT_LIQUIDITY, pool too thin for this size' })
  async quote(@Body() dto: QuoteDto): Promise<SwapQuote> {
    return this.swap.quote({
      tokenInSymbol: dto.tokenIn,
      tokenOutSymbol: dto.tokenOut,
      amountIn: dto.amountIn,
      slippageBps: dto.slippageBps,
    });
  }

  @Post('execute')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Execute the swap from the user’s own wallet',
    description:
      'Re-quotes at execution time, approves the router for the exact amount, simulates, then submits. ' +
      'The output token lands at the user’s own address, verify with the returned explorer link. ' +
      'For this demo the server signs with the AES-256-GCM-encrypted mnemonic; a production build has the ' +
      'client sign and only submits the raw transaction.',
  })
  @ApiResponse({ status: 400, description: 'INSUFFICIENT_BALANCE / INSUFFICIENT_GAS' })
  @ApiResponse({ status: 409, description: 'SLIPPAGE_EXCEEDED / INSUFFICIENT_LIQUIDITY / TX_REVERTED' })
  async execute(@CurrentUser() user: User, @Body() dto: ExecuteSwapDto): Promise<SwapResult> {
    return this.swap.execute({
      user,
      tokenInSymbol: dto.tokenIn,
      tokenOutSymbol: dto.tokenOut,
      amountIn: dto.amountIn,
      slippageBps: dto.slippageBps,
    });
  }
}
