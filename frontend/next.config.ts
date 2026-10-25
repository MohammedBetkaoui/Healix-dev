import type { NextConfig } from "next";
import path from "node:path";

// Local development without Caddy (DEPLOIEMENT.md, "Développement local, sans
// Docker"). In production Caddy sends /viewer/* to the viewer and /api/* to the
// backend, so the viewer shares the origin, and the session cookie, of the
// pages. Under `next dev` nothing sits in front of Next.js: it forwards
// /viewer/* to viewer/serve-local.mjs and the viewer's image requests
// (/api/dicomweb/*) to the backend. Never in a production build, where these
// paths never reach Next.js (LOCAL_VIEWER=1 turns it on for `next start`).
const localViewer =
  process.env.NODE_ENV === "development" || process.env.LOCAL_VIEWER === "1";
const viewerOrigin = process.env.VIEWER_ORIGIN ?? "http://127.0.0.1:8090";
const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:3001";

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
  images: {
    qualities: [75, 90],
  },
  async rewrites() {
    return localViewer
      ? [
          { source: "/viewer", destination: `${viewerOrigin}/viewer` },
          { source: "/viewer/:path*", destination: `${viewerOrigin}/viewer/:path*` },
          { source: "/api/dicomweb/:path*", destination: `${backendOrigin}/api/dicomweb/:path*` },
        ]
      : [];
  },
};

export default nextConfig;
