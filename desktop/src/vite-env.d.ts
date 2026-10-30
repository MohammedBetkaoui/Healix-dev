/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Explicit HealixDz API base URL (HTTPS in a release build). */
  readonly VITE_API_BASE_URL?: string;
  /** Short commit SHA injected by the release pipeline (support identification). */
  readonly VITE_BUILD_SHA?: string;
  /**
   * CI validation builds only: acknowledges a build without a production API
   * URL. A distributed release build never carries it.
   */
  readonly VITE_IGNORE_MISSING_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Set from package.json through vite.config.ts (see define). */
declare const __APP_VERSION__: string;
