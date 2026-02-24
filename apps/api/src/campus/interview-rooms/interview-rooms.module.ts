import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { InterviewRoomsController, PublicInterviewRoomsController } from './interview-rooms.controller';
import { InterviewRoomsService } from './interview-rooms.service';
import { InterviewRoomsGateway } from './interview-rooms.gateway';

@Module({
  imports: [JwtModule.register({})],
  controllers: [InterviewRoomsController, PublicInterviewRoomsController],
  providers: [InterviewRoomsService, InterviewRoomsGateway],
  exports: [InterviewRoomsService],
})
export class InterviewRoomsModule {}
