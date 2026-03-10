import { Module } from '@nestjs/common';
import { GdController } from './gd.controller';
import { GdService } from './gd.service';

@Module({
  controllers: [GdController],
  providers: [GdService],
})
export class GdModule {}
