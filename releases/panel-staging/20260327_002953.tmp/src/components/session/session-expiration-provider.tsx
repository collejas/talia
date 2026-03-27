"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

const SESSION_EXPIRED_DETAIL = "jwt_expired";
const AUTH_REQUIRED_DETAIL = "auth_required";
const AUTH_HINT_PATTERN = /(jwt\s*expired|invalid\s+jwt|token\s*expired|auth_required)/i;

type SessionExpirationProviderProps = {
  children: ReactNode;
};

export function SessionExpirationProvider({ children }: SessionExpirationProviderProps) {
  const notifiedRef = useRef(false);
  const refreshingRef = useRef<Promise<boolean> | null>(null);
  const [expiredModalOpen, setExpiredModalOpen] = useState(false);
  const [loginUrl, setLoginUrl] = useState("/auth/login");
  const [countdown, setCountdown] = useState(10);

  const buildLoginUrl = () => {
    const currentPath = `${window.location.pathname}${window.location.search || ""}`;
    const redirectParam = currentPath ? `?redirectTo=${encodeURIComponent(currentPath)}` : "";
    return `/auth/login${redirectParam}`;
  };

  useEffect(() => {
    if (typeof window === "undefined" || !window.fetch) return;

    const originalFetch = window.fetch.bind(window);

    const extractDetail = async (response: Response): Promise<string | null> => {
      try {
        const payload = await response.clone().json();
        if (payload && typeof payload === "object" && payload !== null) {
          const detail = (payload as Record<string, unknown>).detail;
          const error = (payload as Record<string, unknown>).error;
          if (typeof detail === "string" && detail.trim()) return detail.trim();
          if (typeof error === "string" && error.trim()) return error.trim();
        }
      } catch {
        try {
          const text = await response.clone().text();
          if (text.trim()) return text.trim();
        } catch {
          return null;
        }
      }
      return null;
    };

    const shouldHandleAsSessionExpiry = (status: number, detail: string | null) => {
      if (status === 401) return true;
      if (status !== 403) return false;
      return Boolean(detail && AUTH_HINT_PATTERN.test(detail));
    };

    const getPathname = (input: RequestInfo | URL): string => {
      try {
        const raw = input instanceof Request ? input.url : String(input);
        return new URL(raw, window.location.origin).pathname;
      } catch {
        return "";
      }
    };

    const refreshSession = async (): Promise<boolean> => {
      if (!refreshingRef.current) {
        refreshingRef.current = originalFetch("/api/session", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        })
          .then((response) => response.ok)
          .catch(() => false)
          .finally(() => {
            refreshingRef.current = null;
          });
      }
      return refreshingRef.current;
    };

    const notifyAndRedirect = () => {
      if (notifiedRef.current) return;
      notifiedRef.current = true;
      setLoginUrl(buildLoginUrl());
      setCountdown(10);
      setExpiredModalOpen(true);
    };

    const wrappedFetch: typeof window.fetch = async (...args) => {
      const [input] = args;
      const pathname = getPathname(input);
      const isSessionRequest = pathname === "/api/session";
      const isAuthRequest =
        pathname.startsWith("/api/auth/") || pathname.startsWith("/auth/");

      const response = await originalFetch(...args);
      if (isSessionRequest || isAuthRequest) {
        return response;
      }

      const detail = await extractDetail(response);
      if (!shouldHandleAsSessionExpiry(response.status, detail)) {
        return response;
      }

      const refreshed = await refreshSession();
      if (refreshed) {
        return originalFetch(...args);
      }

      if (
        detail === SESSION_EXPIRED_DETAIL ||
        detail === AUTH_REQUIRED_DETAIL ||
        (detail && AUTH_HINT_PATTERN.test(detail))
      ) {
        notifyAndRedirect();
      } else {
        notifyAndRedirect();
      }
      return response;
    };

    window.fetch = wrappedFetch;
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    if (!expiredModalOpen || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [expiredModalOpen]);

  useEffect(() => {
    if (!expiredModalOpen) return;
    if (countdown <= 0) {
      window.location.replace(loginUrl);
      return;
    }
    const timer = window.setTimeout(() => {
      setCountdown((value) => value - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, expiredModalOpen, loginUrl]);

  return (
    <>
      {children}
      {expiredModalOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-foreground">Sesion expirada</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Tu sesion ya no es valida. Para continuar, inicia sesion de nuevo.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Redireccionando automaticamente en {countdown}s...
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                onClick={() => {
                  window.location.replace(loginUrl);
                }}
              >
                Ir a iniciar sesion
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
