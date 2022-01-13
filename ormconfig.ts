import * as dotenv from 'dotenv';
import { configValues } from './src/modules/configuration';
const { SnakeNamingStrategy } = require('typeorm-naming-strategies');

dotenv.config();

export = [
  {
    type: 'postgres',
    host: configValues.DB_HOST,
    port: configValues.DB_PORT,
    username: configValues.DB_USERNAME,
    password: configValues.DB_PASSWORD,
    database: configValues.DB_DATABASE_NAME,
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
