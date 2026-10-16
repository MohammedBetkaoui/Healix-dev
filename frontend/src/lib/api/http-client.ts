import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
  isAxiosError,
} from "axios";

import {
  notifyRateLimited,
  readRetryAfterSeconds,
} from "./rate-limit-notice";

const defaultApiUrl = "http://localhost:3001/api";

// A request rejected with 429 is sent again once, after Retry-After, unless
// the wait is longer than this or the user sends it themselves (a form, a
// logout: they see the error instead of waiting).
export const MAX_AUTOMATIC_RETRY_SECONDS = 60;

const manualRetryPaths = [
  "/auth/login",
  "/auth/logout",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
];

function isManualRetryUrl(requestUrl: string): boolean {
  return manualRetryPaths.some((path) => requestUrl.includes(path));
}

// Only the refresh's own 401 or 403 means the session is over; its 429, 5xx
// or network error says nothing about it.
function isSessionEndedError(error: unknown): boolean {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  return status === 401 || status === 403;
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

function isUserAuthRefreshExcludedUrl(requestUrl: string): boolean {
  return (
    requestUrl.includes("/auth/login") ||
    requestUrl.includes("/auth/refresh") ||
    requestUrl.includes("/auth/logout") ||
    requestUrl.includes("/admin/")
  );
}

function isAdminRoute(requestUrl: string): boolean {
  return requestUrl.includes("/admin/");
}

function isAdminRefreshExcludedUrl(requestUrl: string): boolean {
  return (
    requestUrl.includes("/admin/auth/login") ||
    requestUrl.includes("/admin/auth/refresh") ||
    requestUrl.includes("/admin/auth/logout")
  );
}

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? defaultApiUrl,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  timeout: 10_000,
  withCredentials: true,
});

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _rateLimitRetry?: boolean;
};

// Tokens are stored only in secure httpOnly cookies by the backend.
// Do not store JWTs, passwords, or medical data in localStorage/sessionStorage.
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;
    const status = error.response?.status;
    const requestUrl = originalRequest?.url ?? "";

    // Too many requests: never a refresh nor a sign-out.
    if (status === 429) {
      const seconds = readRetryAfterSeconds(
        error.response?.headers["retry-after"],
      );
      notifyRateLimited(seconds);

      if (
        originalRequest &&
        !originalRequest._rateLimitRetry &&
        !isManualRetryUrl(requestUrl) &&
        seconds <= MAX_AUTOMATIC_RETRY_SECONDS
      ) {
        originalRequest._rateLimitRetry = true;
        await wait(seconds * 1_000);
        return apiClient.request(originalRequest);
      }

      return Promise.reject(error);
    }

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      isAdminRoute(requestUrl) &&
      !isAdminRefreshExcludedUrl(requestUrl)
    ) {
      originalRequest._retry = true;

      try {
        await apiClient.post("/admin/auth/refresh");
      } catch (refreshError) {
        return Promise.reject(
          isSessionEndedError(refreshError) ? error : refreshError,
        );
      }

      return apiClient.request(originalRequest);
    }

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isUserAuthRefreshExcludedUrl(requestUrl)
    ) {
      originalRequest._retry = true;

      try {
        await apiClient.post("/auth/refresh");
      } catch (refreshError) {
        return Promise.reject(
          isSessionEndedError(refreshError) ? error : refreshError,
        );
      }

      return apiClient.request(originalRequest);
    }

    return Promise.reject(error);
  },
);
