"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconDotsVertical, IconPencil, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClientDataTable } from "@/components/client-data-table";
import type { DataTableRow } from "@/components/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AccountCreateDialog } from "@/components/cuentas/account-create-dialog";

type Props = {
  rows: DataTableRow[];
};

type DeleteTarget = {
  id: string;
  name: string;
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

function getAccountCode(row: DataTableRow): string {
  const raw = row.raw as Record<string, unknown> | undefined;
  const code = raw?.codigo_cuenta;
  if (typeof code === "string" && code.trim()) return code.trim();
  if (typeof code === "number" && Number.isFinite(code)) return String(code);
  return getAccountId(row) || "—";
}

function getAccountField(row: DataTableRow, key: string): string {
  const raw = row.raw as Record<string, unknown> | undefined;
  const value = raw?.[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "—";
}

function canViewAccountSensitiveRow(row: DataTableRow): boolean {
  const raw = row.raw as Record<string, unknown> | undefined;
  return raw?.can_view_sensitive_fields === true;
}

function isSalesLevelRole(roles: string[] | undefined): boolean {
  return (roles ?? []).some((role) => {
    const value = (role ?? "").toString().trim().toLowerCase();
    return (
      value === "agente" ||
      value === "vendedor" ||
      value === "sales" ||
      value === "ejecutivo de ventas" ||
      value.includes("agente") ||
      value.includes("vendedor") ||
      value.includes("ejecutivo de ventas")
    );
  });
}

function formatDeleteBlockedMessage(error: string | undefined): string | null {
  if (!error) return null;
  const normalized = error.trim();
  const contactMatch = normalized.match(/^cuenta_tiene_contactos(?::(\d+))?$/);
  if (contactMatch) {
    const count = Number(contactMatch[1] || "0");
    if (count === 1) {
      return "No se puede eliminar: la empresa tiene 1 contacto vinculado.";
    }
    return `No se puede eliminar: la empresa tiene ${count} contactos vinculados.`;
  }
  const opportunityMatch = normalized.match(/^cuenta_tiene_oportunidades(?::(\d+))?$/);
  if (opportunityMatch) {
    const count = Number(opportunityMatch[1] || "0");
    if (count === 1) {
      return "No se puede eliminar: la empresa tiene 1 oportunidad vinculada.";
    }
    return `No se puede eliminar: la empresa tiene ${count} oportunidades vinculadas.`;
  }
  return null;
}

const ACCOUNT_COLUMNS: Array<{
  id: string;
  label: string;
  accessor: (row: DataTableRow) => React.ReactNode;
}> = [
  {
    id: "account_id",
    label: "Id Empresa",
    accessor: (row) => <span className="font-mono text-xs">{getAccountCode(row)}</span>,
  },
  {
    id: "account_name",
    label: "Nombre Empresa",
    accessor: (row) => <span className="font-medium">{getText((row.raw as Record<string, unknown> | undefined)?.nombre)}</span>,
  },
  {
    id: "account_contact_code",
    label: "Id Contacto",
    accessor: (row) => <span className="font-mono text-xs">{getAccountField(row, "contacto_principal_codigo_contacto")}</span>,
  },
  {
    id: "account_contact",
    label: "Nombre Contacto",
    accessor: (row) => <span>{getAccountField(row, "contacto_principal_nombre")}</span>,
  },
  {
    id: "account_phone",
    label: "Telefono",
    accessor: (row) => {
      if (!canViewAccountSensitiveRow(row)) return <span>—</span>;
      const value = getAccountField(row, "contacto_principal_telefono");
      return value !== "—" ? (
        <a href={`tel:${value}`} className="text-primary underline-offset-2 hover:underline">{value}</a>
      ) : (
        <span>{value}</span>
      );
    },
  },
  {
    id: "account_email",
    label: "Email",
    accessor: (row) => {
      if (!canViewAccountSensitiveRow(row)) return <span>—</span>;
      const value = getAccountField(row, "contacto_principal_correo");
      return value !== "—" ? (
        <a href={`mailto:${value}`} className="text-primary underline-offset-2 hover:underline">{value}</a>
      ) : (
        <span>{value}</span>
      );
    },
  },
  {
    id: "account_rfc",
    label: "RFC",
    accessor: (row) => <span>{getText((row.raw as Record<string, unknown> | undefined)?.rfc)}</span>,
  },
  {
    id: "account_owner",
    label: "Propietario",
    accessor: (row) => <span>{getAccountField(row, "propietario_nombre")}</span>,
  },
];

function AccountRowActions({
  row,
  onDeleteRequest,
  canEdit,
  canDelete,
}: {
  row: DataTableRow;
  onDeleteRequest: (target: DeleteTarget) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const accountId = getAccountId(row);

  if (!accountId) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="data-[state=open]:bg-muted text-muted-foreground flex size-8" size="icon">
          <IconDotsVertical />
          <span className="sr-only">Abrir menú</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {canEdit ? (
          <DropdownMenuItem asChild>
            <Link href={`/empresas/${encodeURIComponent(accountId)}?edit=1`}>
              <IconPencil className="mr-2 size-4" />
              Editar
            </Link>
          </DropdownMenuItem>
        ) : null}
        {canDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                onDeleteRequest({
                  id: accountId,
                  name: getText((row.raw as Record<string, unknown> | undefined)?.nombre),
                })
              }
            >
              <IconTrash className="mr-2 size-4" />
              Eliminar
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountRowDetails(row: DataTableRow) {
  const raw = row.raw as Record<string, unknown> | undefined;
  const accountId = getAccountId(row);
  if (!raw) return null;
  const canViewSensitiveFields = raw.can_view_sensitive_fields === true;

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
          {canViewSensitiveFields ? (
            <>
              <div className="grid gap-1">
                <span className="text-muted-foreground">Correo</span>
                <span>{getText(raw.correo ?? raw.email)}</span>
              </div>
              <div className="grid gap-1">
                <span className="text-muted-foreground">Teléfono</span>
                <span>{getText(raw.telefono)}</span>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              Los datos sensibles de la empresa están ocultos por permisos.
            </div>
          )}
          {accountId ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild size="sm">
                <Link href={`/empresas/${encodeURIComponent(accountId)}`}>
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
  const router = useRouter();
  const { context: permissionContext } = usePermissions();
  const normalizedPerms = React.useMemo(
    () => (permissionContext.permisos ?? []).map((perm) => perm.toLowerCase()),
    [permissionContext.permisos],
  );
  const currentUserId = permissionContext.usuario_id?.trim() || null;
  const hasSalesRole = isSalesLevelRole(permissionContext.roles);
  const canEditAny =
    permissionContext.es_admin ||
    permissionContext.es_owner ||
    normalizedPerms.includes("contacts.write") ||
    hasSalesRole;
  const canDeleteAny =
    permissionContext.es_admin || permissionContext.es_owner || normalizedPerms.includes("contacts.delete");
  const canEditAccountRow = React.useCallback(
    (row: DataTableRow) => {
      if (permissionContext.es_admin || permissionContext.es_owner) return true;
      if (!canEditAny || !currentUserId) return false;
      const ownerId = getText((row.raw as Record<string, unknown> | undefined)?.propietario_usuario_id);
      return Boolean(ownerId) && ownerId === currentUserId;
    },
    [canEditAny, currentUserId, permissionContext.es_admin, permissionContext.es_owner],
  );
  const canDeleteAccountRow = React.useCallback(
    (row: DataTableRow) => {
      void row;
      return canDeleteAny;
    },
    [canDeleteAny],
  );
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = React.useState(false);

  const extraColumns = React.useMemo<ColumnDef<DataTableRow>[]>(() => [
    {
      id: "actions",
      cell: ({ row }) => (
        <AccountRowActions
          row={row.original}
          canEdit={canEditAccountRow(row.original)}
          canDelete={canDeleteAccountRow(row.original)}
          onDeleteRequest={(target) => setDeleteTarget(target)}
        />
      ),
      meta: { label: "Acciones", reorderable: false },
    },
    ...ACCOUNT_COLUMNS.map((column) => ({
      id: column.id,
      header: column.label,
      accessorFn: () => null,
      cell: ({ row }: { row: { original: DataTableRow } }) => column.accessor(row.original),
      enableHiding: true,
      enableSorting: false,
      meta: { label: column.label },
    } as ColumnDef<DataTableRow>)),
  ], [canEditAccountRow, canDeleteAccountRow]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      const response = await fetch(`/api/cuentas/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        const blockedMessage = formatDeleteBlockedMessage(body.error);
        if (blockedMessage) throw new Error(blockedMessage);
        throw new Error(body.error || "No se pudo eliminar la empresa.");
      }
      toast.success("Empresa eliminada.");
      setDeleteTarget(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar la empresa.");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const accountColumnOrder = React.useMemo(
    () => ["account_id", "account_name", "account_contact_code", "account_contact", "account_phone", "account_email", "account_rfc", "account_owner", "actions"],
    [],
  );

  const accountVisibility = React.useMemo(
    () => ({
      session: false,
      type: false,
      chat: false,
      visits: false,
      reviewer: false,
      account_id: true,
      account_name: true,
      account_contact_code: true,
      account_contact: true,
      account_phone: true,
      account_email: true,
      account_rfc: true,
      account_owner: true,
      actions: true,
    }),
    [],
  );

  return (
    <>
      <ClientDataTable
        rows={rows}
        extraColumns={extraColumns}
        hideDefaultActions
        forcedColumnOrder={accountColumnOrder}
        initialVisibility={accountVisibility}
        toolbarActions={<AccountCreateDialog onCreated={() => router.refresh()} />}
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

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>Vas a eliminar <strong>{deleteTarget?.name || "esta empresa"}</strong>.</p>
            <p className="text-muted-foreground">
              Si tiene contactos u oportunidades vinculadas, el sistema bloqueará la eliminación.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteSubmitting}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDeleteConfirm()} disabled={deleteSubmitting}>
              {deleteSubmitting ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
