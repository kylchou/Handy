"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ApiRequestError, createApiClient, type AccessibilityPreferences } from "@handy/contracts";
import { API_URL } from "./config";
import { applyDisplay, displayFrom } from "./display";

/**
 * The one place the app talks to the backend. Pages import `api` and call
 * things like `api.conversations.sendMessage(...)` or `api.jobs.get(...)`.
 * Every route and type comes from @handy/contracts, so if the backend
 * changes, TypeScript tells us here. See docs/api.md for the full list.
 */

const TOKEN_KEY = "auth_token";
/** "CUSTOMER" or "CAREGIVER", saved at login so each page knows which view to show. */
export const ROLE_KEY = "user_role";

const isCaregiver = () => typeof window !== "undefined" && window.localStorage.getItem(ROLE_KEY) === "CAREGIVER";

/** Display settings are loaded from the profile once per login, so ones saved on another device apply here too. */
let displaySynced = false;

function savedToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export const api = createApiClient({
  baseUrl: API_URL,
  token: savedToken(),
  onTokenChange: (token) => {
    displaySynced = false;
    if (typeof window === "undefined") return;
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(ROLE_KEY);
    }
  },
  // Logged out or the session ran out: back to the login screen.
  onUnauthorized: () => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(TOKEN_KEY);
    if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
  },
});

/** Sends people to the login screen if they aren't logged in yet, and family members to their own view. */
export function useRequireLogin() {
  const router = useRouter();
  useEffect(() => {
    if (!api.getToken()) {
      router.replace("/login");
      return;
    }
    if (isCaregiver()) {
      router.replace("/family");
      return;
    }
    if (displaySynced) return;
    displaySynced = true;
    api.customers
      .getProfile()
      .then((p) => applyDisplay(displayFrom(p.accessibilityPreferences)))
      .catch(() => {
        displaySynced = false;
      });
  }, [router]);
}

/** For the family view: logged in as a caregiver, or sent where they belong. */
export function useRequireCaregiver() {
  const router = useRouter();
  useEffect(() => {
    if (!api.getToken()) router.replace("/login");
    else if (!isCaregiver()) router.replace("/chat");
  }, [router]);
}

let saveQueue: Promise<unknown> = Promise.resolve();

/**
 * Saves some accessibility preferences without touching the others. The
 * backend replaces the whole object on save, so this merges with what's
 * stored. Saves run one at a time so quick taps can't overwrite each other.
 */
export function saveAccessibility(patch: AccessibilityPreferences) {
  const run = saveQueue.then(async () => {
    const current = (await api.customers.getProfile()).accessibilityPreferences;
    return api.customers.updateProfile({ accessibilityPreferences: { ...current, ...patch } });
  });
  saveQueue = run.catch(() => undefined);
  return run;
}

/** A message that's safe to show on screen for any error. */
export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  return err instanceof ApiRequestError ? err.message : fallback;
}
