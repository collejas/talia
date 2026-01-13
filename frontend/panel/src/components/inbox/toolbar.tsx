"use client";

import { IconPlus, IconSearch } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { InboxSummary } from "@/lib/inbox/data";

const CHANNEL_FILTER_OPTIONS = [
  { id: null, label: "Todos" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "messenger", label: "Messenger" },
  { id: "webchat", label: "Webchat" },
];

function getChannelFilterButtonClass(active: boolean): string {
  return [
    "text-[10px] uppercase tracking-wide rounded-full border px-3 py-1 transition",
    active
      ? "bg-primary text-primary-foreground border-primary"
      : "bg-muted/10 text-muted-foreground border-muted-foreground/40",
  ].join(" ");
}

type InboxToolbarProps = {
  summary: InboxSummary;
  channelFilter?: string | null;
  onChannelFilterChange?: (value: string | null) => void;
};

export function InboxToolbar({ summary, channelFilter, onChannelFilterChange }: InboxToolbarProps) {
  const total = summary.total ?? 0;
  const unread = summary.unread ?? 0;
  const awaiting = summary.awaiting ?? 0;
  const closed = summary.folders.find((folder) => folder.id === "closed")?.count ?? 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Bandeja de entrada</h2>
          <p className="text-xs text-muted-foreground">
            {total} conversaciones · {unread} sin leer · {awaiting} en seguimiento
          </p>
        </div>
        <Button size="sm">
          <IconPlus className="mr-2 size-4" />
          Nuevo mensaje
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="h-9 w-40 rounded-md border border-muted-foreground/40 bg-background px-3 text-xs uppercase tracking-wider text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50"
          value={channelFilter ?? ""}
          onChange={(event) =>
            onChannelFilterChange?.(event.target.value ? event.target.value : null)
          }
        >
          {CHANNEL_FILTER_OPTIONS.map((option) => (
            <option key={option.label} value={option.id ?? ""}>
              {option.label}
            </option>
          ))}
        </select>
        <Tabs defaultValue="all" className="w-full lg:w-auto">
          <TabsList className="grid h-auto grid-cols-2 gap-1 bg-muted/60 p-1 sm:grid-cols-4">
            <TabsTrigger value="all" className="flex items-center gap-2">
              Todos
              <Badge variant="secondary">{total}</Badge>
            </TabsTrigger>
            <TabsTrigger value="unread" className="flex items-center gap-2">
              Sin leer
              <Badge variant="secondary">{unread}</Badge>
            </TabsTrigger>
            <TabsTrigger value="awaiting" className="flex items-center gap-2">
              Seguimiento
              <Badge variant="secondary">{awaiting}</Badge>
            </TabsTrigger>
            <TabsTrigger value="archived" className="flex items-center gap-2">
              Archivados
              <Badge variant="secondary">{closed}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-1 items-center gap-2 lg:flex-none">
          <IconSearch className="size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por contacto, asunto o etiqueta"
            className="h-9 w-full"
          />
        </div>
      </div>
    </div>
  );
}
