import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './modules/health/health.module';
import { TypeOrmDefaultConfigService } from './modules/database/database.providers';
import configuration from './modules/configuration';
import { DatabaseModule } from './modules/database/database.module';
import { OrdersModule } from './modules/orders/orders.module';

@Module({
  imports: [
    TerminusModule,
    ConfigModule.forRoot({
      ignoreEnvFile: false,
      ignoreEnvVars: false,
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      imports: [DatabaseModule],
      useExisting: TypeOrmDefaultConfigService,
    }),
    HealthModule,
    OrdersModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
