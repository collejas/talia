"use client";

import * as React from "react";
import { IconLink, IconPlus, IconSearch } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InboxSummary } from "@/lib/inbox/data";
import type { ReengageFilterOption } from "@/lib/inbox/reengage-filter";

export type DateFilterOption = "all" | "today" | "yesterday" | "last_week" | "last_month";

const DATE_FILTER_OPTIONS: { value: DateFilterOption; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "today", label: "Hoy" },
  { value: "yesterday", label: "Ayer" },
  { value: "last_week", label: "Última semana" },
  { value: "last_month", label: "Último mes" },
];

const CHANNEL_FILTER_OPTIONS = [
  { id: "all", label: "Todos" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "messenger", label: "Messenger" },
  { id: "webchat", label: "Webchat" },
];

const SOURCE_FILTER_OPTIONS = [
  { id: "all", label: "Todos" },
  { id: "prospeccion", label: "Prospección" },
  { id: "operativo", label: "Operativo" },
];

const STATE_FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "unread", label: "Sin leer" },
  { value: "awaiting", label: "Seguimiento" },
  { value: "archived", label: "Archivados" },
];

type InboxToolbarProps = {
  summary: InboxSummary;
  stateFilterValue: string;
  onStateFilterValueChange?: (value: string) => void;
  channelFilterValue: string;
  onChannelFilterValueChange?: (value: string) => void;
  sourceFilterValue: string;
  onSourceFilterValueChange?: (value: string) => void;
  batchFilterValue: string;
  onBatchFilterValueChange?: (value: string) => void;
  batchOptions: Array<{ value: string; label: string }>;
  campanaFilterValue: string;
  onCampanaFilterValueChange?: (value: string) => void;
  campanaOptions: Array<{ value: string; label: string }>;
  onCopyLink?: () => void;
  copyLinkLabel?: string;
  dateFilterValue: string;
  onDateFilterValueChange?: (value: string) => void;
  reengageFilter: string;
  reengageOptions: ReengageFilterOption[];
  onReengageFilterChange?: (value: string) => void;
};

export function InboxToolbar({
  summary,
  stateFilterValue,
  onStateFilterValueChange,
  channelFilterValue,
  onChannelFilterValueChange,
  sourceFilterValue,
  onSourceFilterValueChange,
  batchFilterValue,
  onBatchFilterValueChange,
  batchOptions,
  campanaFilterValue,
  onCampanaFilterValueChange,
  campanaOptions,
  onCopyLink,
  copyLinkLabel,
  dateFilterValue,
  onDateFilterValueChange,
  reengageFilter,
  reengageOptions,
  onReengageFilterChange,
}: InboxToolbarProps) {
  const total = summary.total ?? 0;
  const unread = summary.unread ?? 0;
  const awaiting = summary.awaiting ?? 0;
  const closed = summary.folders.find((folder) => folder.id === "closed")?.count ?? 0;

  const renderStateLabel = (value: string): string => {
    switch (value) {
      case "all":
        return `Todos (${total})`;
      case "unread":
        return `Sin leer (${unread})`;
      case "awaiting":
        return `Seguimiento (${awaiting})`;
      case "archived":
        return `Archivados (${closed})`;
      default:
        return "Estados";
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Bandeja de entrada</h2>
          <p className="text-xs text-muted-foreground">
            {total} conversaciones · {unread} sin leer · {awaiting} en seguimiento
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center">
            <select
              className="h-8 w-[4.8rem] rounded-md border border-muted-foreground/40 bg-background px-3 text-[10px] uppercase tracking-wider text-muted-foreground leading-none focus-visible:border-ring focus-visible:ring-ring/50"
              value={sourceFilterValue}
              onChange={(event) => onSourceFilterValueChange?.(event.target.value)}
            >
              <option value="">Origen</option>
              {SOURCE_FILTER_OPTIONS.map((option) => (
                <option key={option.label} value={option.id ?? ""}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center">
            <select
              className="h-8 w-[4.8rem] rounded-md border border-muted-foreground/40 bg-background px-3 text-[10px] uppercase tracking-wider text-muted-foreground leading-none focus-visible:border-ring focus-visible:ring-ring/50"
              value={channelFilterValue}
              onChange={(event) => onChannelFilterValueChange?.(event.target.value)}
            >
              <option value="">Canal</option>
              {CHANNEL_FILTER_OPTIONS.map((option) => (
                <option key={option.label} value={option.id ?? ""}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center">
            <select
              className="h-8 w-[4.8rem] rounded-md border border-muted-foreground/40 bg-background px-3 text-[10px] uppercase tracking-wider text-muted-foreground leading-none focus-visible:border-ring focus-visible:ring-ring/50"
              value={dateFilterValue}
              onChange={(event) => onDateFilterValueChange?.(event.target.value)}
            >
              <option value="">Fecha</option>
              {DATE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center">
            <select
              className="h-8 w-[7rem] rounded-md border border-muted-foreground/40 bg-background px-3 text-[10px] uppercase tracking-wider text-muted-foreground leading-none focus-visible:border-ring focus-visible:ring-ring/50"
              value={batchFilterValue}
              onChange={(event) => onBatchFilterValueChange?.(event.target.value)}
            >
              <option value="">Batch</option>
              {batchOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center">
            <select
              className="h-8 w-[7rem] rounded-md border border-muted-foreground/40 bg-background px-3 text-[10px] uppercase tracking-wider text-muted-foreground leading-none focus-visible:border-ring focus-visible:ring-ring/50"
              value={campanaFilterValue}
              onChange={(event) => onCampanaFilterValueChange?.(event.target.value)}
            >
              <option value="">Campaña</option>
              {campanaOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center">
            <select
              className="h-8 w-[5.6rem] rounded-md border border-muted-foreground/40 bg-background px-3 text-[10px] uppercase tracking-wider text-muted-foreground leading-none focus-visible:border-ring focus-visible:ring-ring/50"
              value={reengageFilter}
              onChange={(event) => onReengageFilterChange?.(event.target.value)}
            >
              <option value="">Reinicio</option>
              {reengageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center">
            <select
              className="h-8 w-[5rem] rounded-md border border-muted-foreground/40 bg-background px-3 text-[10px] uppercase tracking-wider text-muted-foreground leading-none focus-visible:border-ring focus-visible:ring-ring/50"
              value={stateFilterValue}
              onChange={(event) => onStateFilterValueChange?.(event.target.value)}
            >
              <option value="">Estados</option>
              {STATE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {renderStateLabel(option.value)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 lg:flex-none">
            <IconSearch className="size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por contacto, asunto o etiqueta"
              className="h-8 w-32 leading-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onCopyLink ? (
            <Button size="sm" variant="outline" onClick={onCopyLink}>
              <IconLink className="mr-2 size-4" />
              {copyLinkLabel ?? "Copiar enlace"}
            </Button>
          ) : null}
          <Button size="sm">
            <IconPlus className="mr-2 size-4" />
            Nuevo mensaje
          </Button>
        </div>
      </div>
    </div>
  );
}
