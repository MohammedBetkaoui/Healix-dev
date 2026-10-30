import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Interface tests (jsdom). The Tauri APIs are replaced by mocks in each test:
// no native command runs here.
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify("0.0.0-test"),
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
  },
});
