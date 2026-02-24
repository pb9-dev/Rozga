import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiInterviewModule } from './interview/ai-interview.module';

@Module({
  imports: [AiInterviewModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
