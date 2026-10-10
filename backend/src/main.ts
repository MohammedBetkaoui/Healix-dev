import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { readCorsOptions } from './common/utils/cors';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const port = process.env.PORT ?? 3001;
  const cors = readCorsOptions(process.env);
  // Behind Caddy: its address, so that req.ip (rate limits) is the client
  // of X-Forwarded-For, which only Caddy can set.
  const trustProxy = process.env.TRUST_PROXY ?? 'loopback';

  // onModuleDestroy on SIGINT / SIGTERM too: the report renderer closes its
  // Chromium there.
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.set('trust proxy', trustProxy);
  if (cors) {
    app.enableCors(cors);
  }
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
