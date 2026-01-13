"use client";

import * as React from "react";

import type { InboxSummary, InboxThread } from "@/lib/inbox/data";
import { InboxSplitView } from "@/components/inbox/split-view";
import { InboxToolbar } from "@/components/inbox/toolbar";

type InboxWorkspaceProps = {
  summary: InboxSummary;
  threads: InboxThread[];
};

export function InboxWorkspace({ summary, threads }: InboxWorkspaceProps) {
  const [channelFilter, setChannelFilter] = React.useState<string | null>(null);
  return (
    <div className="space-y-4">
      <InboxToolbar
        summary={summary}
        channelFilter={channelFilter}
        onChannelFilterChange={setChannelFilter}
      />
      <InboxSplitView threads={threads} channelFilter={channelFilter} />
    </div>
  );
}
