import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };

const isBuild = process.env.NODE_ENV === "production" || process.argv.some((arg) => arg === "build");
// A Desktop release carries its own API base URL (VITE_API_BASE_URL, HTTPS):
// a config that would silently target localhost fails the build. CI builds
// the front-end without a production URL; they set the explicit opt-out.
const releaseWantsApiBase = isBuild && process.env.VITE_IGNORE_MISSING_API_BASE !== "1";
if (releaseWantsApiBase && !process.env.VITE_API_BASE_URL) {
  throw new Error(
    "VITE_API_BASE_URL est requis pour un build Desktop de production (ou VITE_IGNORE_MISSING_API_BASE=1 pour un build de CI).",
  );
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // The dashboard theme and the brand logos are the Web app's own files:
    // the dev server may serve them from outside this package.
    fs: { allow: [".", "../frontend"] },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: { target: "es2022", minify: "esbuild", sourcemap: true },
  define: {
    // Build identity shown in the UI (version + commit of the bundle).
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
