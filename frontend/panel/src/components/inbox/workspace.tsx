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
  campanaOptions?: Array<{ value: string; label: string }>;
  initialFilters?: {
    estado?: string | null;
    source?: string | null;
    channel?: string | null;
    date?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    campanaId?: string | null;
    search?: string | null;
  };
};

export function InboxWorkspace({
  summary,
  threads,
  totalThreads,
  reengageTagOptions,
  campanaOptions: initialCampanaOptions,
  initialFilters,
}: InboxWorkspaceProps) {
  const pathname = usePathname();
  const [sourceFilterValue, setSourceFilterValue] = React.useState(initialFilters?.source ?? "");
  const [channelFilterValue, setChannelFilterValue] = React.useState(initialFilters?.channel ?? "");
  const [campanaFilterValue, setCampanaFilterValue] = React.useState(initialFilters?.campanaId ?? "");
  const [estadoFilterValue, setEstadoFilterValue] = React.useState(initialFilters?.estado ?? "");
  const [dateFilterValue, setDateFilterValue] = React.useState(initialFilters?.date ?? "");
  const [dateFromValue, setDateFromValue] = React.useState(initialFilters?.dateFrom ?? "");
  const [dateToValue, setDateToValue] = React.useState(initialFilters?.dateTo ?? "");
  const [searchValue, setSearchValue] = React.useState(initialFilters?.search ?? "");
  const [reengageFilter, setReengageFilter] = React.useState("");
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
    params.delete("batchId");
    params.delete("batch_id");
    upsert("campanaId", campanaFilterValue);
    const customRangeReady = dateFilterValue === "custom" && dateFromValue && dateToValue;
    upsert("date", dateFilterValue === "custom" && !customRangeReady ? "" : dateFilterValue, { skipAll: true });
    upsert("date_from", customRangeReady ? dateFromValue : "");
    upsert("date_to", customRangeReady ? dateToValue : "");
    upsert("reengage", reengageFilter, { skipAll: true });

    upsert("estado", estadoFilterValue, { skipAll: true });
    upsert("search", searchValue);

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
    campanaFilterValue,
    dateFilterValue,
    dateFromValue,
    dateToValue,
    reengageFilter,
    searchValue,
  ]);

  const activeSourceFilter =
    sourceFilterValue && sourceFilterValue !== "all" ? sourceFilterValue : null;
  const activeChannelFilter =
    channelFilterValue && channelFilterValue !== "all" ? channelFilterValue : null;
  const activeEstadoFilter =
    estadoFilterValue?.trim() && estadoFilterValue !== "all" ? estadoFilterValue.trim() : null;
  const activeCampanaFilter = campanaFilterValue?.trim() || null;
  const activeDateFilter: DateFilterOption = (dateFilterValue || "all") as DateFilterOption;

  return (
    <div className="space-y-2">
      <InboxToolbar
        summary={{ ...summary, unread: unreadMessages }}
        visibleTotal={visibleThreadsCount}
        searchValue={searchValue}
        onSearchValueChange={setSearchValue}
        stateFilterValue={estadoFilterValue}
        onStateFilterValueChange={setEstadoFilterValue}
        sourceFilterValue={sourceFilterValue}
        onSourceFilterValueChange={setSourceFilterValue}
        channelFilterValue={channelFilterValue}
        onChannelFilterValueChange={setChannelFilterValue}
        campanaFilterValue={campanaFilterValue}
        onCampanaFilterValueChange={setCampanaFilterValue}
        campanaOptions={campanaOptions}
        dateFilterValue={dateFilterValue}
        onDateFilterValueChange={setDateFilterValue}
        dateFromValue={dateFromValue}
        dateToValue={dateToValue}
        onDateFromValueChange={setDateFromValue}
        onDateToValueChange={setDateToValue}
        reengageFilter={reengageFilter}
        onReengageFilterChange={setReengageFilter}
        reengageOptions={combinedReengageOptions}
      />
      <InboxSplitView
        threads={threads}
        initialTotalThreads={totalThreads}
        campanaOptions={campanaOptions}
        sourceFilter={activeSourceFilter}
        channelFilter={activeChannelFilter}
        estadoFilter={activeEstadoFilter}
        campanaFilter={activeCampanaFilter}
        dateFrom={dateFilterValue === "custom" ? dateFromValue : null}
        dateTo={dateFilterValue === "custom" ? dateToValue : null}
        dateFilter={activeDateFilter}
        search={searchValue}
        reengageFilter={reengageFilter}
        onVisibleThreadsCountChange={setVisibleThreadsCount}
        onThreadRead={(count) => setUnreadMessages((current) => Math.max(0, current - count))}
      />
    </div>
  );
}
