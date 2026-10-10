import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // A self-contained server in .next/standalone, run by the Docker image
  // (frontend/Dockerfile) with "node server.js". next dev is unaffected;
  // next start still serves the build, with a warning.
  output: "standalone",
  logging: {
    // The address of the reset page carries the reset token: it must not end
    // up in the request log of the development server (production does not
    // log requests).
    incomingRequests: {
      ignore: [/^\/reset-password(?:[/?]|$)/],
    },
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
