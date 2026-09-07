import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { validateEnv } from './env.schema';
import { findRepoEnvFiles } from './find-env';

/**
 * Loads the repo-root .env, one file for api + web + contracts, so an address
 * written by the deploy script is visible to everything, validates it, and
 * exposes AppConfigService globally.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: findRepoEnvFiles(),
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
