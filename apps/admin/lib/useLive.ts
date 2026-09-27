"use client";

import { useEffect, useRef } from "react";
import { api } from "./api";

/**
 * Loads once, then reloads whenever anything happens on the platform
 * (admins get every live event). Bursts of events only trigger one reload.
 */
export function useLive(load: () => Promise<void> | void) {
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!api.getToken()) return; // not logged in, the login redirect handles it
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void loadRef.current(), 400);
    };
    void loadRef.current();
    const stop = api.realtime.subscribe(reload, { onResync: reload });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, []);
}
