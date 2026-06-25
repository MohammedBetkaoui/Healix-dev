import axios from "axios";

const defaultApiUrl = "http://localhost:3001/api";

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? defaultApiUrl,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  timeout: 10_000,
  withCredentials: true,
});

// Tokens are stored only in secure httpOnly cookies by the backend.
// Do not store JWTs, passwords, or medical data in localStorage/sessionStorage.
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(error),
);
