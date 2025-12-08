"use client";

import { ReactNode, useEffect, useRef } from "react";
import { toast } from "sonner";

const SESSION_EXPIRED_DETAIL = "jwt_expired";

type SessionExpirationProviderProps = {
  children: ReactNode;
};

export function SessionExpirationProvider({ children }: SessionExpirationProviderProps) {
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.fetch) return;

    const originalFetch = window.fetch.bind(window);

    const handleResponse = async (response: Response) => {
      if (notifiedRef.current) return;
      if (response.status !== 401 && response.status !== 403) return;
      try {
        const payload = await response.clone().json();
        if (
          payload &&
          typeof payload === "object" &&
          payload !== null &&
          (payload as Record<string, unknown>).detail === SESSION_EXPIRED_DETAIL
        ) {
          notifiedRef.current = true;
          toast.error(
            "Tu sesión expiró. Cierra la app y vuelve a iniciar sesión para acceder de nuevo."
          );
        }
      } catch {
        // Ignore parsing errors.
      }
    };

    const wrappedFetch: typeof window.fetch = (...args) => {
      const responsePromise = originalFetch(...args);
      void responsePromise.then(handleResponse).catch(() => {});
      return responsePromise;
    };

    window.fetch = wrappedFetch;
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return <>{children}</>;
}
