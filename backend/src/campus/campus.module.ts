import { Module } from '@nestjs/common';
import { FlowModule } from './flow/flow.module';
import { BatchesModule } from './batches/batches.module';
import { CandidatesModule } from './candidates/candidates.module';
import { GdModule } from './gd/gd.module';
import { InterviewsModule } from './interviews/interviews.module';
import { LookupsModule } from './lookups/lookups.module';
import { InterviewersModule } from './interviewers/interviewers.module';
import { AiModule } from './ai/ai.module';
import { CollegesModule } from './colleges/colleges.module';
import { InterviewRoomsModule } from './interview-rooms/interview-rooms.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [FlowModule, BatchesModule, CandidatesModule, GdModule, InterviewsModule, LookupsModule, InterviewersModule, AiModule, CollegesModule, InterviewRoomsModule, JobsModule],
})
export class CampusModule {}
