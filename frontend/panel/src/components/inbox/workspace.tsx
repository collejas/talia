"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import type { InboxSummary, InboxThread } from "@/lib/inbox/data";
import { InboxSplitView } from "@/components/inbox/split-view";
import { InboxToolbar, type DateFilterOption } from "@/components/inbox/toolbar";
import {
  REENGAGE_TAG_PREFIX,
  buildDerivedReengageOptions,
  type ReengageFilterOption,
} from "@/lib/inbox/reengage-filter";

type InboxWorkspaceProps = {
  summary: InboxSummary;
  threads: InboxThread[];
  totalThreads: number;
  reengageTagOptions: string[];
  batchOptions?: Array<{ value: string; label: string }>;
  campanaOptions?: Array<{ value: string; label: string }>;
  initialFilters?: {
    estado?: string | null;
    source?: string | null;
    channel?: string | null;
    date?: string | null;
    batchId?: string | null;
    campanaId?: string | null;
  };
};

export function InboxWorkspace({
  summary,
  threads,
  totalThreads,
  reengageTagOptions,
  batchOptions: initialBatchOptions,
  campanaOptions: initialCampanaOptions,
  initialFilters,
}: InboxWorkspaceProps) {
  const pathname = usePathname();
  const [sourceFilterValue, setSourceFilterValue] = React.useState(initialFilters?.source ?? "");
  const [channelFilterValue, setChannelFilterValue] = React.useState(initialFilters?.channel ?? "");
  const [batchFilterValue, setBatchFilterValue] = React.useState(initialFilters?.batchId ?? "");
  const [campanaFilterValue, setCampanaFilterValue] = React.useState(initialFilters?.campanaId ?? "");
  const [estadoFilterValue, setEstadoFilterValue] = React.useState(initialFilters?.estado ?? "");
  const [dateFilterValue, setDateFilterValue] = React.useState(initialFilters?.date ?? "");
  const [reengageFilter, setReengageFilter] = React.useState("");
  const [copyLinkLabel, setCopyLinkLabel] = React.useState("Copiar enlace");
  const [visibleThreadsCount, setVisibleThreadsCount] = React.useState(threads.length);
  const [unreadMessages, setUnreadMessages] = React.useState(summary.unread ?? 0);

  const derivedReengageOptions = React.useMemo(
    () => buildDerivedReengageOptions(threads),
    [threads],
  );

  const normalizedTagOptions = React.useMemo<ReengageFilterOption[]>(() => {
    const seen = new Set<string>();
    const values: ReengageFilterOption[] = [];
    for (const rawTag of reengageTagOptions) {
      const tag = rawTag?.trim();
      if (!tag || seen.has(tag)) {
        continue;
      }
      seen.add(tag);
      values.push({
        value: `${REENGAGE_TAG_PREFIX}${tag}`,
        label: tag,
      });
    }
    return values;
  }, [reengageTagOptions]);

  const combinedReengageOptions = React.useMemo(
    () => [...derivedReengageOptions, ...normalizedTagOptions],
    [derivedReengageOptions, normalizedTagOptions],
  );
  const batchOptions = React.useMemo(() => {
    const base = Array.isArray(initialBatchOptions) ? initialBatchOptions : [];
    const seen = new Set<string>();
    const values: Array<{ value: string; label: string }> = [];
    for (const item of base) {
      const value = item.value?.trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      values.push({ value, label: item.label?.trim() || "Batch" });
    }
    for (const thread of threads) {
      const value = thread.batchId?.trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      values.push({ value, label: "Batch" });
    }
    values.sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
    return values;
  }, [threads, initialBatchOptions]);

  const campanaOptions = React.useMemo(() => {
    const base = Array.isArray(initialCampanaOptions) ? initialCampanaOptions : [];
    const seen = new Set<string>();
    const values: Array<{ value: string; label: string }> = [];
    for (const item of base) {
      const value = item.value?.trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      values.push({ value, label: item.label?.trim() || "Campaña" });
    }
    for (const thread of threads) {
      const value = thread.campanaId?.trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      values.push({ value, label: "Campaña" });
    }
    values.sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
    return values;
  }, [threads, initialCampanaOptions]);

  React.useEffect(() => {
    if (
      reengageFilter &&
      !combinedReengageOptions.some((option) => option.value === reengageFilter)
    ) {
      setReengageFilter("");
    }
  }, [reengageFilter, combinedReengageOptions]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const currentUrl = new URL(window.location.href);
    const params = new URLSearchParams(currentUrl.search);

    const upsert = (
      key: string,
      value: string | null | undefined,
      options?: { skipAll?: boolean },
    ) => {
      const skipAll = Boolean(options?.skipAll);
      const normalized = value?.trim() ?? "";
      if (!normalized || (skipAll && normalized === "all")) {
        params.delete(key);
      } else {
        params.set(key, normalized);
      }
    };

    upsert("source", sourceFilterValue, { skipAll: true });
    upsert("channel", channelFilterValue, { skipAll: true });
    upsert("batchId", batchFilterValue);
    upsert("campanaId", campanaFilterValue);
    upsert("date", dateFilterValue, { skipAll: true });
    upsert("reengage", reengageFilter, { skipAll: true });

    upsert("estado", estadoFilterValue, { skipAll: true });

    const nextQuery = params.toString();
    const nextUrl = `${pathname}${nextQuery ? `?${nextQuery}` : ""}`;
    const currentPathWithQuery = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentPathWithQuery) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [
    pathname,
    sourceFilterValue,
    channelFilterValue,
    estadoFilterValue,
    batchFilterValue,
    campanaFilterValue,
    dateFilterValue,
    reengageFilter,
  ]);

  React.useEffect(() => {
    if (copyLinkLabel === "Copiar enlace") return;
    const timeout = window.setTimeout(() => setCopyLinkLabel("Copiar enlace"), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyLinkLabel]);

  const handleCopyLink = React.useCallback(async () => {
    if (typeof window === "undefined") return;
    const href = window.location.href;
    try {
      await navigator.clipboard.writeText(href);
      setCopyLinkLabel("Enlace copiado");
    } catch {
      setCopyLinkLabel("No se pudo copiar");
    }
  }, []);

  const activeSourceFilter =
    sourceFilterValue && sourceFilterValue !== "all" ? sourceFilterValue : null;
  const activeChannelFilter =
    channelFilterValue && channelFilterValue !== "all" ? channelFilterValue : null;
  const activeEstadoFilter =
    estadoFilterValue?.trim() && estadoFilterValue !== "all" ? estadoFilterValue.trim() : null;
  const activeBatchFilter = batchFilterValue?.trim() || null;
  const activeCampanaFilter = campanaFilterValue?.trim() || null;
  const activeDateFilter: DateFilterOption = (dateFilterValue || "all") as DateFilterOption;

  return (
    <div className="space-y-4">
      <InboxToolbar
        summary={{ ...summary, unread: unreadMessages }}
        visibleTotal={visibleThreadsCount}
        stateFilterValue={estadoFilterValue}
        onStateFilterValueChange={setEstadoFilterValue}
        sourceFilterValue={sourceFilterValue}
        onSourceFilterValueChange={setSourceFilterValue}
        channelFilterValue={channelFilterValue}
        onChannelFilterValueChange={setChannelFilterValue}
        batchFilterValue={batchFilterValue}
        onBatchFilterValueChange={setBatchFilterValue}
        batchOptions={batchOptions}
        campanaFilterValue={campanaFilterValue}
        onCampanaFilterValueChange={setCampanaFilterValue}
        campanaOptions={campanaOptions}
        onCopyLink={handleCopyLink}
        copyLinkLabel={copyLinkLabel}
        dateFilterValue={dateFilterValue}
        onDateFilterValueChange={setDateFilterValue}
        reengageFilter={reengageFilter}
        onReengageFilterChange={setReengageFilter}
        reengageOptions={combinedReengageOptions}
      />
      <InboxSplitView
        threads={threads}
        initialTotalThreads={totalThreads}
        batchOptions={batchOptions}
        campanaOptions={campanaOptions}
        sourceFilter={activeSourceFilter}
        channelFilter={activeChannelFilter}
        estadoFilter={activeEstadoFilter}
        batchFilter={activeBatchFilter}
        campanaFilter={activeCampanaFilter}
        dateFilter={activeDateFilter}
        reengageFilter={reengageFilter}
        onVisibleThreadsCountChange={setVisibleThreadsCount}
        onThreadRead={(count) => setUnreadMessages((current) => Math.max(0, current - count))}
      />
    </div>
  );
}
