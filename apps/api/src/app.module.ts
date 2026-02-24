import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { RbacModule } from './rbac/rbac.module';
import { CampusModule } from './campus/campus.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/api/.env', '.env'],
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  translateTime: 'SYS:standard',
                },
              },
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    AuditModule,
    RbacModule,
    AuthModule,
    CampusModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
