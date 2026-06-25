import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3001;
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

  app.setGlobalPrefix('api');
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
