import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const logger = new Logger('bootstrap');

  const app = await NestFactory.create(AppModule, {
    // Nest's default logger; timestamps make a demo's console readable.
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(AppConfigService);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config.frontendOrigins.length > 0 ? config.frontendOrigins : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swagger = new DocumentBuilder()
    .setTitle('NairaStock API')
    .setDescription(
      'Self-custody neobroker for Coinbase Tokenized Stocks on Base, funded in cNGN.\n\n' +
        '**Testnet demo.** Mocked naira rail, mock B20 tokens, a UniswapV2-style AMM standing in for ' +
        'Aerodrome, and server-side signing for a demo-custodial wallet. See the repo README for what a ' +
        'production build swaps in.',
    )
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addTag('wallet', 'HD wallet creation, import, and on-chain balances')
    .addTag('auth', 'Wallet-signature login')
    .addTag('stocks', 'Tokenized stock catalogue and prices')
    .addTag('swap', 'cNGN ⇄ stock token swaps')
    .addTag('onramp', 'Mocked naira deposit and withdrawal')
    .addTag('portfolio', 'Dashboard aggregation')
    .addTag('health', 'Dependency health')
    .build();

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger), {
    swaggerOptions: { persistAuthorization: true },
  });

  app.get(PrismaService).enableShutdownHooks(app);
  app.enableShutdownHooks();

  await app.listen(config.apiPort, '0.0.0.0');

  logger.log(`api    http://localhost:${config.apiPort}/api`);
  logger.log(`docs   http://localhost:${config.apiPort}/api/docs`);
  logger.log(`health http://localhost:${config.apiPort}/api/health`);
}

bootstrap().catch((error: unknown) => {
  // The env validator and Prisma connector both throw actionable messages;
  // print the message alone (not a stack) so the fix is the first thing seen.
  const logger = new Logger('bootstrap');
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
