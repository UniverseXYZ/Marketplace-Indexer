import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppConfig } from './modules/configuration/configuration.service';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { VersioningType, ValidationPipe } from '@nestjs/common';
import session from 'express-session';
import R from 'ramda';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(AppConfig);
  const port = config.values.app.port || 8080;
  const sessionSecret = R.path(['app', 'sessionSecret'], config.values);

  // Middlewares
  app.use(helmet());

  // Swagger Documentation
  const options = new DocumentBuilder()
    .setTitle('Universe Marcketplace API')
    .setDescription('Universe Marcketplace API Documentation')
    .addTag('health')
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('doc', app, document);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );

  app.setGlobalPrefix('v1');

  app.enableVersioning({
    type: VersioningType.URI,
  });

  if (R.isNil(sessionSecret)) {
    throw new Error('No session secret');
  }

  const sessionOptions = {
    secret: <string>sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  };

  if (config.values.app.env === 'production') {
    sessionOptions.cookie.secure = true;
  }

  app.use(session(sessionOptions));

  await app.listen(port);
}
bootstrap();
