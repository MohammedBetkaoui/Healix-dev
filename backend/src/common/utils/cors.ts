import { type CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

type Env = Record<string, string | undefined>;

// Behind the reverse proxy, pages and API share one origin: the browser never
// makes a cross-origin call, so CORS stays off (CORS_ENABLED=false) and other
// sites get no Access-Control-Allow-* header at all. It is only needed when
// the frontend and the API run on two origins, as with next dev on :3000 and
// nest on :3001; then exactly one origin, FRONTEND_URL, is allowed. It may
// read Retry-After, which tells how long a 429 lasts.
export function readCorsOptions(env: Env): CorsOptions | null {
  if (env.CORS_ENABLED?.trim().toLowerCase() === 'false') {
    return null;
  }

  return {
    credentials: true,
    exposedHeaders: ['Retry-After'],
    origin: env.FRONTEND_URL?.trim() || 'http://localhost:3000',
  };
}
