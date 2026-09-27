"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ApiRequestError, createApiClient } from "@handy/contracts";
import { API_URL } from "./config";

/**
 * The one place the admin dashboard talks to the backend. Every route and type
 * comes from @handy/contracts. See docs/api.md for the full list.
 */

const TOKEN_KEY = "admin_token";

function savedToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export const api = createApiClient({
  baseUrl: API_URL,
  token: savedToken(),
  onTokenChange: (token) => {
    if (typeof window === "undefined") return;
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  },
  onUnauthorized: () => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(TOKEN_KEY);
    if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
  },
});

/** Sends people to the login screen if they aren't logged in yet. */
export function useRequireLogin() {
  const router = useRouter();
  useEffect(() => {
    if (!api.getToken()) router.replace("/login");
  }, [router]);
}

/** A message that's safe to show on screen for any error. */
export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  return err instanceof ApiRequestError ? err.message : fallback;
}
