import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

const defaultApiUrl = "http://localhost:3001/api";

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
};

// Tokens are stored only in secure httpOnly cookies by the backend.
// Do not store JWTs, passwords, or medical data in localStorage/sessionStorage.
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;
    const status = error.response?.status;
    const requestUrl = originalRequest?.url ?? "";

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
        return apiClient.request(originalRequest);
      } catch {
        return Promise.reject(error);
      }
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
        return apiClient.request(originalRequest);
      } catch {
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);
