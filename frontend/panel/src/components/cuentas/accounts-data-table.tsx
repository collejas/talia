"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconDotsVertical, IconPencil, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientDataTable } from "@/components/client-data-table";
import type { DataTableRow } from "@/components/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  rows: DataTableRow[];
};

function getText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "—";
}

function getAccountId(row: DataTableRow): string | null {
  const raw = row.raw as Record<string, unknown> | undefined;
  const id = raw?.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function AccountRowActions({ row }: { row: DataTableRow }) {
  const router = useRouter();
  const accountId = getAccountId(row);

  if (!accountId) return null;

  const handleDelete = async () => {
    const confirmed = window.confirm("¿Eliminar esta empresa?");
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/cuentas/${encodeURIComponent(accountId)}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "No se pudo eliminar la empresa.");
      }
      toast.success("Empresa eliminada.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar la empresa.");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="data-[state=open]:bg-muted text-muted-foreground flex size-8" size="icon">
          <IconDotsVertical />
          <span className="sr-only">Abrir menú</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link href={`/cuentas/${encodeURIComponent(accountId)}?edit=1`}>
            <IconPencil className="mr-2 size-4" />
            Editar
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => void handleDelete()}>
          <IconTrash className="mr-2 size-4" />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountRowDetails(row: DataTableRow) {
  const raw = row.raw as Record<string, unknown> | undefined;
  const accountId = getAccountId(row);
  if (!raw) return null;

  return (
    <div className="grid gap-4">
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ficha de empresa</CardTitle>
          <CardDescription>
            Abre la vista dedicada para ver y fusionar empresas con más contexto.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="grid gap-1">
            <span className="text-muted-foreground">Nombre</span>
            <span>{getText(raw.nombre)}</span>
          </div>
          <div className="grid gap-1">
            <span className="text-muted-foreground">Alias</span>
            <span>{getText(raw.alias)}</span>
          </div>
          <div className="grid gap-1">
            <span className="text-muted-foreground">RFC</span>
            <span>{getText(raw.rfc)}</span>
          </div>
          <div className="grid gap-1">
            <span className="text-muted-foreground">Correo</span>
            <span>{getText(raw.correo ?? raw.email)}</span>
          </div>
          <div className="grid gap-1">
            <span className="text-muted-foreground">Teléfono</span>
            <span>{getText(raw.telefono)}</span>
          </div>
          {accountId ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild size="sm">
                <Link href={`/cuentas/${encodeURIComponent(accountId)}`}>
                  <IconArrowRight className="mr-2 size-4" />
                  Abrir ficha
                </Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export function AccountsDataTable({ rows }: Props) {
  const extraColumns = React.useMemo<ColumnDef<DataTableRow>[]>(() => [
    {
      id: "actions",
      cell: ({ row }) => <AccountRowActions row={row.original} />,
      meta: { label: "Acciones", reorderable: false },
    },
  ], []);

  return (
    <ClientDataTable
      rows={rows}
      extraColumns={extraColumns}
      hideDefaultActions
      columnLabels={{
        header: "Empresa",
        type: "Tipo",
        status: "Industria",
        target: "Sitio / Contacto",
        reviewer: "Alias",
      }}
      detailDescription="Detalle de la empresa"
      renderRowDetails={AccountRowDetails}
    />
  );
}
