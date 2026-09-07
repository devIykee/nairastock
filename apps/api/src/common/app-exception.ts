import { HttpException, HttpStatus } from '@nestjs/common';
import { API_ERROR_CODES, type ApiErrorCode } from '@nairastock/shared';

/**
 * One exception type carrying a machine-readable `code`, so the frontend can
 * branch on failure kind (top up gas vs. widen slippage vs. try a smaller size)
 * instead of pattern-matching English.
 *
 * Requirement from the brief: insufficient balance, slippage exceeded, and thin
 * liquidity must be surfaced, never swallowed. Each has a named constructor here
 * so no call site has to remember the right status code.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: Record<string, unknown>,
  ) {
    super({ statusCode: status, message, code, details }, status);
  }

  static insufficientBalance(details: { symbol: string; required: string; available: string }): AppException {
    return new AppException(
      API_ERROR_CODES.INSUFFICIENT_BALANCE,
      `Not enough ${details.symbol}. You need ${details.required} but hold ${details.available}.`,
      HttpStatus.BAD_REQUEST,
      details,
    );
  }

  static insufficientGas(details: { address: string; balance: string }): AppException {
    return new AppException(
      API_ERROR_CODES.INSUFFICIENT_GAS,
      `Wallet ${details.address} has no ETH for gas (balance ${details.balance} ETH). ` +
        'Fund it from the faucet before trading.',
      HttpStatus.BAD_REQUEST,
      details,
    );
  }

  static slippageExceeded(details: { minAmountOut: string; symbol: string }): AppException {
    return new AppException(
      API_ERROR_CODES.SLIPPAGE_EXCEEDED,
      `Price moved past your slippage tolerance, the swap would have delivered less than ` +
        `${details.minAmountOut} ${details.symbol}, so it was rejected on-chain. Re-quote and try again.`,
      HttpStatus.CONFLICT,
      details,
    );
  }

  static insufficientLiquidity(details: { pair: string; requested?: string }): AppException {
    return new AppException(
      API_ERROR_CODES.INSUFFICIENT_LIQUIDITY,
      `The ${details.pair} pool is too thin for this trade. Try a smaller amount.`,
      HttpStatus.CONFLICT,
      details,
    );
  }

  static unknownToken(symbol: string): AppException {
    return new AppException(
      API_ERROR_CODES.UNKNOWN_TOKEN,
      `"${symbol}" is not a tradeable token on this deployment.`,
      HttpStatus.NOT_FOUND,
      { symbol },
    );
  }

  static chainUnavailable(reason: string): AppException {
    return new AppException(
      API_ERROR_CODES.CHAIN_UNAVAILABLE,
      `Chain is unreachable: ${reason}`,
      HttpStatus.SERVICE_UNAVAILABLE,
      { reason },
    );
  }

  static notConfigured(what: string): AppException {
    return new AppException(
      API_ERROR_CODES.CHAIN_UNAVAILABLE,
      `${what} is not configured on this deployment. Run \`pnpm chain:deploy\` to populate .env.`,
      HttpStatus.SERVICE_UNAVAILABLE,
      { what },
    );
  }

  static priceUnavailable(symbol: string): AppException {
    return new AppException(
      API_ERROR_CODES.PRICE_UNAVAILABLE,
      `No price available for ${symbol} yet. The pricing job runs every 30s, retry shortly.`,
      HttpStatus.SERVICE_UNAVAILABLE,
      { symbol },
    );
  }

  static signingUnavailable(): AppException {
    return new AppException(
      API_ERROR_CODES.SIGNING_UNAVAILABLE,
      'This wallet is self-signed: the server holds no key for it. Sign and submit the swap from the client.',
      HttpStatus.BAD_REQUEST,
    );
  }

  static invalidSignature(): AppException {
    return new AppException(
      API_ERROR_CODES.INVALID_SIGNATURE,
      'Signature does not match the claimed address.',
      HttpStatus.UNAUTHORIZED,
    );
  }

  static nonceExpired(): AppException {
    return new AppException(
      API_ERROR_CODES.NONCE_EXPIRED,
      'Login challenge expired or already used. Request a new nonce.',
      HttpStatus.UNAUTHORIZED,
    );
  }

  static txReverted(details: { txHash: string; reason: string }): AppException {
    return new AppException(
      API_ERROR_CODES.TX_REVERTED,
      `Transaction reverted on-chain: ${details.reason}`,
      HttpStatus.CONFLICT,
      details,
    );
  }

  static quoteExpired(): AppException {
    return new AppException(
      API_ERROR_CODES.QUOTE_EXPIRED,
      'That quote has expired. Fetch a fresh one before executing.',
      HttpStatus.CONFLICT,
    );
  }
}
