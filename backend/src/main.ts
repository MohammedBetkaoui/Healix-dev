import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const port = process.env.PORT ?? 3001;
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const trustProxy = process.env.TRUST_PROXY ?? 'loopback';

  // onModuleDestroy on SIGINT / SIGTERM too: the report renderer closes its
  // Chromium there.
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.set('trust proxy', trustProxy);
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(port);
}
bootstrap().catch((error) => {
  // Avoid leaking sensitive configuration values in startup logs.
  console.error(
    'Failed to start HealixDZ backend.',
    error instanceof Error ? error.message : 'Unknown error',
  );
  process.exit(1);
});
