import { Module } from '@nestjs/common';
import { TerminusModule, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  providers: [TypeOrmHealthIndicator],
  controllers: [HealthController],
})
export class HealthModule {}
