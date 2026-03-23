"use client";

import { useEffect, useState } from "react";

type ScoringFeatureStatus = {
  profiling_enabled: boolean;
  profiling_enabled_global: boolean;
  profiling_enabled_by_channel: Record<string, boolean>;
};

export function useScoringFeatureStatus() {
  const [state, setState] = useState<{
    loading: boolean;
    profilingEnabled: boolean;
  }>({
    loading: true,
    profilingEnabled: true,
  });

  useEffect(() => {
    let mounted = true;
    void fetch("/api/settings/scoring/feature-status", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return { profiling_enabled: true } as ScoringFeatureStatus;
        }
        const payload = (await response.json()) as ScoringFeatureStatus;
        return payload;
      })
      .then((payload) => {
        if (!mounted) return;
        setState({
          loading: false,
          profilingEnabled: Boolean(payload.profiling_enabled),
        });
      })
      .catch(() => {
        if (!mounted) return;
        setState({ loading: false, profilingEnabled: true });
      });
    return () => {
      mounted = false;
    };
  }, []);

  return state;
}
