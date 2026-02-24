"use client";

import * as React from "react";

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
  reengageTagOptions: string[];
  initialFilters?: {
    estado?: string | null;
    source?: string | null;
    channel?: string | null;
    batchId?: string | null;
    campanaId?: string | null;
  };
};

export function InboxWorkspace({
  summary,
  threads,
  reengageTagOptions,
  initialFilters,
}: InboxWorkspaceProps) {
  const [sourceFilterValue, setSourceFilterValue] = React.useState(initialFilters?.source ?? "");
  const [channelFilterValue, setChannelFilterValue] = React.useState(initialFilters?.channel ?? "");
  const [estadoFilterValue] = React.useState(initialFilters?.estado ?? "");
  const [batchFilterValue] = React.useState(initialFilters?.batchId ?? "");
  const [campanaFilterValue] = React.useState(initialFilters?.campanaId ?? "");
  const [dateFilterValue, setDateFilterValue] = React.useState("");
  const [reengageFilter, setReengageFilter] = React.useState("");

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

  React.useEffect(() => {
    if (
      reengageFilter &&
      !combinedReengageOptions.some((option) => option.value === reengageFilter)
    ) {
      setReengageFilter("");
    }
  }, [reengageFilter, combinedReengageOptions]);

  const activeSourceFilter =
    sourceFilterValue && sourceFilterValue !== "all" ? sourceFilterValue : null;
  const activeChannelFilter =
    channelFilterValue && channelFilterValue !== "all" ? channelFilterValue : null;
  const activeEstadoFilter = estadoFilterValue?.trim() || null;
  const activeBatchFilter = batchFilterValue?.trim() || null;
  const activeCampanaFilter = campanaFilterValue?.trim() || null;
  const activeDateFilter: DateFilterOption = (dateFilterValue || "all") as DateFilterOption;

  return (
    <div className="space-y-4">
      <InboxToolbar
        summary={summary}
        sourceFilterValue={sourceFilterValue}
        onSourceFilterValueChange={setSourceFilterValue}
        channelFilterValue={channelFilterValue}
        onChannelFilterValueChange={setChannelFilterValue}
        dateFilterValue={dateFilterValue}
        onDateFilterValueChange={setDateFilterValue}
        reengageFilter={reengageFilter}
        onReengageFilterChange={setReengageFilter}
        reengageOptions={combinedReengageOptions}
      />
      <InboxSplitView
        threads={threads}
        sourceFilter={activeSourceFilter}
        channelFilter={activeChannelFilter}
        estadoFilter={activeEstadoFilter}
        batchFilter={activeBatchFilter}
        campanaFilter={activeCampanaFilter}
        dateFilter={activeDateFilter}
        reengageFilter={reengageFilter}
      />
    </div>
  );
}
