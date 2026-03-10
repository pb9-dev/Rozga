import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { DatabaseModule } from '../../database/database.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
