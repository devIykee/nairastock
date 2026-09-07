import { INestApplication, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? [{ emit: 'event', level: 'warn' }] : [],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('connected to postgres');
    } catch (error) {
      // Prisma's raw P1001 is opaque about the actual fix.
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not connect to Postgres. Is it running? Try \`pnpm infra:up\`.\n` +
          `DATABASE_URL points at: ${redactUrl(process.env.DATABASE_URL)}\n` +
          `Underlying error: ${message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Lets `SIGTERM` drain in-flight requests before the pool closes. */
  enableShutdownHooks(app: INestApplication): void {
    process.on('beforeExit', () => {
      void app.close();
    });
  }
}

function redactUrl(url: string | undefined): string {
  if (!url) return '(unset)';
  return url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}
