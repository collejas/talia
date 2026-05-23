"use client";

import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientDataTable } from "@/components/client-data-table";
import type { DataTableRow } from "@/components/data-table";

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
  return (
    <ClientDataTable
      rows={rows}
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
