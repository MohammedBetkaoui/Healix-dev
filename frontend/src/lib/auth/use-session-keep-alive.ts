"use client";

import { isAxiosError } from "axios";
import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api/http-client";

// The access token lasts about 15 minutes. A page that is open for longer
// without calling the API itself (the image viewer, in its iframe, reads the
// API through its own requests, which know nothing of a refresh) must renew
// the session: once at the start, since the token may be nearly spent, then
// every 10 minutes. The refresh is the one the HTTP client does after a 401
// (POST /auth/refresh); the new cookies serve the iframe too, on the same
// origin.
export const SESSION_KEEP_ALIVE_MS = 10 * 60 * 1000;

type KeepAliveOptions = {
  intervalMs?: number;
  /** The session is over (the refresh was refused): nothing more is tried. */
  onEnded: () => void;
  refresh?: () => Promise<unknown>;
};

const defaultRefresh = () => apiClient.post("/auth/refresh");

// Starts the renewals; returns what stops them. A refused refresh (401, 403) is
// the end of the session; a network error or a 5xx says nothing of it, the next
// tick tries again.
export function keepSessionAlive({
  intervalMs = SESSION_KEEP_ALIVE_MS,
  onEnded,
  refresh = defaultRefresh,
}: KeepAliveOptions): () => void {
  let stopped = false;

  const renew = async () => {
    try {
      await refresh();
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (!stopped && (status === 401 || status === 403)) {
        stopped = true;
        clearInterval(timer);
        onEnded();
      }
    }
  };

  const timer = setInterval(() => {
    if (!stopped) void renew();
  }, intervalMs);
  void renew();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export function useSessionKeepAlive(): { ended: boolean } {
  const [ended, setEnded] = useState(false);

  useEffect(() => keepSessionAlive({ onEnded: () => setEnded(true) }), []);

  return { ended };
}
