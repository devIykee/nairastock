import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type { ApiErrorBody } from '@nairastock/shared';

/**
 * Terminal error handler. Guarantees every non-2xx response has the same shape
 * (ApiErrorBody), so the web client renders one thing, and that nothing leaks a
 * stack trace or an ethers internals dump to the browser.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toBody(exception);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${body.statusCode} ${body.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} → ${body.statusCode} ${body.message}`);
    }

    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const status = exception.getStatus();

      if (typeof payload === 'string') {
        return { statusCode: status, message: payload };
      }
      const record = payload as Record<string, unknown>;
      return {
        statusCode: status,
        // Nest's ValidationPipe puts an array here; join so the client shows one line.
        message: Array.isArray(record.message) ? record.message.join('; ') : String(record.message ?? exception.message),
        error: typeof record.error === 'string' ? record.error : undefined,
        code: typeof record.code === 'string' ? record.code : undefined,
        details: (record.details as Record<string, unknown>) ?? undefined,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        const target = (exception.meta?.target as string[] | undefined)?.join(', ') ?? 'value';
        return {
          statusCode: HttpStatus.CONFLICT,
          message: `A record with that ${target} already exists.`,
          code: 'DUPLICATE',
        };
      }
      if (exception.code === 'P2025') {
        return { statusCode: HttpStatus.NOT_FOUND, message: 'Record not found.', code: 'NOT_FOUND' };
      }
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Database rejected the request (${exception.code}).`,
        code: 'DB_ERROR',
      };
    }

    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database is unavailable. Is Postgres running (`pnpm infra:up`)?',
        code: 'DB_UNAVAILABLE',
      };
    }

    // Anything else: log the detail server-side, return something generic.
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: exception instanceof Error ? exception.message : 'Unexpected server error.',
      code: 'INTERNAL',
    };
  }
}
