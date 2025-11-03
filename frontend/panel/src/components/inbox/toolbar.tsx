"use client";

import { IconFilter, IconPlus, IconSearch } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { InboxSummary } from "@/lib/inbox/data";

type InboxToolbarProps = {
  summary: InboxSummary;
};

export function InboxToolbar({ summary }: InboxToolbarProps) {
  const total = summary.total ?? 0;
  const unread = summary.unread ?? 0;
  const awaiting = summary.awaiting ?? 0;
  const closed = summary.folders.find((folder) => folder.id === "closed")?.count ?? 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-xs">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Bandeja de entrada</h2>
          <p className="text-sm text-muted-foreground">
            {total} conversaciones · {unread} sin leer · {awaiting} en seguimiento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <IconFilter className="mr-2 size-4" />
            Filtros
          </Button>
          <Button size="sm">
            <IconPlus className="mr-2 size-4" />
            Nuevo mensaje
          </Button>
        </div>
      </div>
      <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
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
        <div className="flex w-full items-center gap-2 lg:ml-auto lg:w-72">
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
