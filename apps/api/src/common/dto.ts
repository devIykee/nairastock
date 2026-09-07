import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

/** Decimal amount as a string. Rejects floats-as-numbers so nothing loses precision in JSON. */
const DECIMAL_STRING = /^\d+(\.\d+)?$/;

export class CreateWalletDto {
  @ApiPropertyOptional({
    description: 'Send gas to the new wallet from the faucet so the first swap cannot fail for want of ETH.',
    default: true,
  })
  @IsOptional()
  @IsBooleanString()
  fundGas?: string;
}

export class ImportWalletDto {
  @ApiProperty({
    description: '12 or 24-word BIP39 mnemonic. Never logged; stored AES-256-GCM encrypted (demo custody).',
    example: 'test test test test test test test test test test test junk',
  })
  @IsString()
  @Matches(/^(\s*[a-z]+\s*){12,24}$/i, { message: 'mnemonic must be 12–24 words' })
  mnemonic: string;
}

export class AddressParamDto {
  @ApiProperty({ example: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' })
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, { message: 'must be a 0x-prefixed 20-byte address' })
  address: string;
}

export class VerifySignatureDto {
  @ApiProperty({ example: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' })
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, { message: 'must be a 0x-prefixed 20-byte address' })
  address: string;

  @ApiProperty({ description: 'Nonce from GET /auth/nonce/:address' })
  @IsString()
  nonce: string;

  @ApiProperty({ description: 'personal_sign output over the nonce message' })
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{130}$/, { message: 'must be a 65-byte hex signature' })
  signature: string;
}

export class SessionForAddressDto {
  @ApiProperty({ example: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' })
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, { message: 'must be a 0x-prefixed 20-byte address' })
  address: string;
}

export class QuoteDto {
  @ApiProperty({ example: 'cNGN', description: 'Symbol being spent' })
  @IsString()
  tokenIn: string;

  @ApiProperty({ example: 'AAPLc', description: 'Symbol being received' })
  @IsString()
  tokenOut: string;

  @ApiProperty({ example: '1000000', description: 'Human decimal amount of tokenIn' })
  @IsString()
  @Matches(DECIMAL_STRING, { message: 'amountIn must be a decimal string like "1000.50"' })
  amountIn: string;

  @ApiPropertyOptional({ example: 100, description: 'Slippage tolerance in bps. Default 100 (1%).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  slippageBps?: number;
}

export class ExecuteSwapDto extends QuoteDto {}

export class DepositDto {
  @ApiProperty({ example: '2000000', description: 'Naira amount to deposit (mocked bank rail)' })
  @IsString()
  @Matches(DECIMAL_STRING, { message: 'ngnAmount must be a decimal string like "50000"' })
  ngnAmount: string;
}

export class WithdrawDto {
  @ApiProperty({ example: '500000', description: 'Naira amount to withdraw (mocked payout)' })
  @IsString()
  @Matches(DECIMAL_STRING, { message: 'ngnAmount must be a decimal string like "50000"' })
  ngnAmount: string;
}

export class HistoryQueryDto {
  @ApiPropertyOptional({ example: 24, description: 'Lookback window in hours. Default 24.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  hours?: number;
}
