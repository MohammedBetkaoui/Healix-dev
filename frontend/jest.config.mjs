// next/jest wires the Next.js compiler (SWC) as transform and loads
// next.config / .env; see node_modules/next/dist/docs/01-app/02-guides/testing/jest.md.
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  // Unit tests of plain modules only (no component rendering yet).
  testEnvironment: "node",
  // scripts/ holds node:test files (node --test), not Jest suites.
  roots: ["<rootDir>/src"],
  // Mirrors the "@/*" path alias of tsconfig.json.
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

// Exported this way so next/jest can load the (async) Next.js config.
export default createJestConfig(config);
