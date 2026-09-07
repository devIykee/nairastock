import { Module } from '@nestjs/common';
import { OnrampService } from './onramp.service';
import { OnrampController } from './onramp.controller';

@Module({
  providers: [OnrampService],
  controllers: [OnrampController],
  exports: [OnrampService],
})
export class OnrampModule {}
