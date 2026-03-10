import { Module } from '@nestjs/common';
import { AiInterviewController } from './ai-interview.controller';
import { OpenRouterClient } from './openrouter.client';
import { InterviewerAgent } from './agents/interviewer.agent';
import { DepthProbeAgent } from './agents/depth-probe.agent';
import { EvaluatorAgent } from './agents/evaluator.agent';
import { ClassifierAgent } from './agents/classifier.agent';
import { CoordinatorAgent } from './agents/coordinator.agent';
import { InterviewToolsService } from './tools/interview-tools.service';
import { EmailService } from '../../../common/email/email.service';
import { InterviewRoomsModule } from '../../interview-rooms/interview-rooms.module';
import { PublicAiInterviewController } from './public-ai-interview.controller';
import { AiInterviewSchedulingController } from './scheduling.controller';

@Module({
  imports: [InterviewRoomsModule],
  controllers: [AiInterviewController, PublicAiInterviewController, AiInterviewSchedulingController],
  providers: [OpenRouterClient, InterviewerAgent, DepthProbeAgent, EvaluatorAgent, ClassifierAgent, InterviewToolsService, CoordinatorAgent, EmailService],
})
export class AiInterviewModule {}
