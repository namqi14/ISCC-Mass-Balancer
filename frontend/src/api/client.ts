import axios, { AxiosError } from "axios";
import type { ApiErrorBody } from "./types";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export const api = axios.create({ baseURL });

const TOKEN_KEY = "imbc_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      clearToken();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

/** Uploaded files (e.g. a company logo) are served from the API server's
 * root, not under `/api` -- see backend/src/index.ts's `app.use("/uploads", ...)`.
 * The backend hands back a root-relative path like "/uploads/logos/1-x.png";
 * this resolves it against the server origin so <img src> works regardless
 * of VITE_API_URL. Already-absolute URLs pass through unchanged. */
export function resolveAssetUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const origin = baseURL.replace(/\/api\/?$/, "");
  return `${origin}${pathOrUrl}`;
}

/** Every business-rule rejection from the API arrives as { error, code }.
 * This pulls the plain-English message out regardless of where the call
 * happened, so every form can show it with `catch (e) { setError(apiErrorMessage(e)) }`. */
export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined;
    if (body?.error) return body.error;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Unexpected error.";
}

export type { AxiosError };
