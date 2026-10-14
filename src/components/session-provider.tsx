"use client";

// ============================================================================
// RMIS — Session provider (spec §3.2, §13): boot refresh (failure clears
// user), silent fetch on focus/visibilitychange + 60s interval (visible tabs
// only, in-flight guard; failure keeps the user). The applicant
// isProfileComplete flag drives the apply gate client-side.
// ============================================================================

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/router";
import { apiFetch } from "@/lib/client";

type SessionState = {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<SessionUser | null>;
  keepAlive: () => Promise<void>;
};

const SessionContext = createContext<SessionState>({
  user: null,
  loading: true,
  refresh: async () => null,
  keepAlive: async () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);

  const hardRefresh = useCallback(async (): Promise<SessionUser | null> => {
    inFlight.current = true;
    try {
      const data = await apiFetch<{ user: SessionUser | null }>("/api/session");
      setUser(data.user);
      setLoading(false);
      return data.user;
    } catch {
      setUser(null);
      setLoading(false);
      return null;
    } finally {
      inFlight.current = false;
    }
  }, []);

  const keepAlive = useCallback(async () => {
    if (inFlight.current || document.hidden) return;
    inFlight.current = true;
    try {
      const data = await apiFetch<{ user: SessionUser | null }>("/api/session");
      setUser((prev) => data.user ?? prev); // silent failure KEEPS the user
    } catch {
      // keep
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void hardRefresh();
    const onFocus = () => void keepAlive();
    const onVisible = () => void keepAlive();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(() => {
      if (!document.hidden) void keepAlive();
    }, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [hardRefresh, keepAlive]);

  return (
    <SessionContext.Provider value={{ user, loading, refresh: hardRefresh, keepAlive }}>
      {children}
    </SessionContext.Provider>
  );
}
