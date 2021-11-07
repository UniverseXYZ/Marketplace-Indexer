import * as dotenv from 'dotenv';
import { configValues } from './src/modules/configuration';
const { SnakeNamingStrategy } = require('typeorm-naming-strategies');

dotenv.config();

export = [
  {
    type: 'postgres',
    host: configValues.database.host,
    port: configValues.database.port,
    username: configValues.database.username,
    password: configValues.database.password,
    database: configValues.database.database,
    entities: ['src/**/*.entity.ts'],
    namingStrategy: new SnakeNamingStrategy(),
    logging: 'all',
    migrationsTableName: '_migrations',
    migrations: ['migrations/*.ts'],
    cli: {
      migrationsDir: 'migrations',
    },
  },
];
