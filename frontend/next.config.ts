import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
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
