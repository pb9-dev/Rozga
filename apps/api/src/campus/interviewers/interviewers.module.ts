import { Module } from '@nestjs/common';
import { InterviewersController } from './interviewers.controller';
import { InterviewersService } from './interviewers.service';

@Module({
  controllers: [InterviewersController],
  providers: [InterviewersService],
})
export class InterviewersModule {}
