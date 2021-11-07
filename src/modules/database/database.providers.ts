import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../configuration/configuration.service';
import { MarketplaceIndexer } from '../orders/order.entity';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

// TODO: Add all db entities
const entities = [MarketplaceIndexer];

@Injectable()
export class TypeOrmDefaultConfigService implements TypeOrmOptionsFactory {
  constructor(protected readonly config: AppConfig) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      type: 'postgres',
      autoLoadEntities: false,
      logging: false,
      namingStrategy: new SnakeNamingStrategy(),
      entities,
      ...this.config.values.database,
    };
  }
}
