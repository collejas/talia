"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type SessionRecoveryProps = {
  errors: string[];
};

function hasExpiredToken(errors: string[]): boolean {
  return errors.some((message) =>
    /jwt\s+expired/i.test(message) || /invalid\s+jwt/i.test(message),
  );
}

export function SessionRecovery({ errors }: SessionRecoveryProps) {
  const router = useRouter();
  const [attempted, setAttempted] = React.useState(false);

  React.useEffect(() => {
    if (attempted) return;
    if (!hasExpiredToken(errors)) return;

    let isMounted = true;
    setAttempted(true);

    const controller = new AbortController();

    fetch("/api/session", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) => {
        if (!isMounted) return;
        if (response.ok) {
          router.refresh();
        }
      })
      .catch(() => {
        // Silently ignore; the page already surfaces the error message.
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [attempted, errors, router]);

  return null;
}
