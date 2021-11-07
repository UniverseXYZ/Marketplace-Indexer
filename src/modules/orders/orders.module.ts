import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketplaceIndexer } from './order.entity';
import { AppConfigModule } from '../configuration/configuration.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  providers: [OrdersService],
  exports: [OrdersService],
  imports: [
    AppConfigModule,
    HttpModule,
    TypeOrmModule.forFeature([MarketplaceIndexer]),
  ],
})
export class OrdersModule {}
