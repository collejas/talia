"use client";

import * as React from "react";
import type { ColumnDef, VisibilityState } from "@tanstack/react-table";
import { z } from "zod";

import { DataTable, schema } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/hooks/use-permissions";
import type { ContactTableRow } from "@/lib/contactos/data";

type TableRow = z.infer<typeof schema>;

type ContactField =
  | "correo"
  | "telefono"
  | "origen"
  | "estado"
  | "captura_estado"
  | "company_name"
  | "ultimo_contacto_en"
  | "conversaciones"
  | "notes";

type SalesRepOption = {
  id: string;
  nombre_completo: string | null;
  correo: string | null;
  telefono_e164: string | null;
  label: string;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

function getRawValue(row: TableRow, key: ContactField): unknown {
  const raw = row.raw as Record<string, unknown> | undefined;
  if (!raw) return null;
  return raw[key] ?? null;
}

function formatDate(value: unknown): string {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FORMATTER.format(date);
}

function formatNumber(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("es-MX");
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("es-MX") : "—";
}

function renderField(row: TableRow, key: ContactField): React.ReactNode {
  const value = getRawValue(row, key);
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>;

  switch (key) {
    case "correo":
      return (
        <a
          href={`mailto:${value}`}
          className="text-primary underline-offset-2 hover:underline"
        >
          {String(value)}
        </a>
      );
    case "telefono":
      return (
        <a
          href={`tel:${value}`}
          className="text-primary underline-offset-2 hover:underline"
        >
          {String(value)}
        </a>
      );
    case "ultimo_contacto_en":
      return (
        <span className="whitespace-nowrap" suppressHydrationWarning>
          {formatDate(value)}
        </span>
      );
    case "conversaciones":
      return <span className="tabular-nums">{formatNumber(value)}</span>;
    default:
      return <span className="break-words">{String(value)}</span>;
  }
}

function extractUnknown(raw: Record<string, unknown> | undefined, path: string[]): unknown {
  if (!raw) return undefined;
  let current: unknown = raw;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function extractString(raw: Record<string, unknown> | undefined, path: string[]): string | null {
  const value = extractUnknown(raw, path);
  if (typeof value === "string" && value.trim().length) return value.trim();
  return null;
}

const CONTACT_COLUMNS: Array<{
  id: string;
  label: string;
  accessor: (row: TableRow) => React.ReactNode;
  defaultVisible?: boolean;
}> = [
  {
    id: "contact_correo",
    label: "Correo",
    accessor: (row) => renderField(row, "correo"),
    defaultVisible: true,
  },
  {
    id: "contact_telefono",
    label: "Teléfono",
    accessor: (row) => renderField(row, "telefono"),
    defaultVisible: true,
  },
  {
    id: "contact_origen",
    label: "Origen",
    accessor: (row) => renderField(row, "origen"),
    defaultVisible: true,
  },
  {
    id: "contact_estado",
    label: "Estado",
    accessor: (row) => renderField(row, "estado"),
  },
  {
    id: "contact_captura",
    label: "Captura",
    accessor: (row) => renderField(row, "captura_estado"),
  },
  {
    id: "contact_company",
    label: "Empresa",
    accessor: (row) => renderField(row, "company_name"),
  },
  {
    id: "contact_ultimo",
    label: "Último contacto",
    accessor: (row) => renderField(row, "ultimo_contacto_en"),
    defaultVisible: true,
  },
  {
    id: "contact_conversaciones",
    label: "Conversaciones",
    accessor: (row) => renderField(row, "conversaciones"),
  },
  {
    id: "contact_notes",
    label: "Notas",
    accessor: (row) => renderField(row, "notes"),
  },
];

const contactExtraColumns: ColumnDef<TableRow>[] = CONTACT_COLUMNS.map((column) => ({
  id: column.id,
  header: column.label,
  accessorFn: () => null,
  cell: ({ row }) => column.accessor(row.original),
  enableHiding: true,
  enableSorting: false,
  meta: { label: column.label },
}));

const contactColumnVisibility: VisibilityState = CONTACT_COLUMNS.reduce<VisibilityState>(
  (visibility, column) => {
    visibility[column.id] = column.defaultVisible ?? false;
    return visibility;
  },
  {},
);

export function ContactsDataTable({ data }: { data: ContactTableRow[] }) {
  const { context: permissionContext, loading: permissionsLoading } = usePermissions();
  const normalizedPerms = React.useMemo(
    () => (permissionContext.permisos ?? []).map((perm) => perm.toLowerCase()),
    [permissionContext.permisos],
  );
  const canReassignAny =
    permissionContext.es_admin ||
    permissionContext.es_owner ||
    normalizedPerms.includes("contacts.reassign.any");
  const canReassignTeam =
    permissionContext.es_admin ||
    permissionContext.es_owner ||
    normalizedPerms.includes("contacts.reassign.team");
  const canReassign = canReassignAny || canReassignTeam;

  const [reassignOpen, setReassignOpen] = React.useState(false);
  const [activeRow, setActiveRow] = React.useState<TableRow | null>(null);
  const [selectedVendorId, setSelectedVendorId] = React.useState("");
  const [vendorOptions, setVendorOptions] = React.useState<SalesRepOption[]>([]);
  const [vendorLoading, setVendorLoading] = React.useState(false);
  const [vendorError, setVendorError] = React.useState<string | null>(null);
  const [reassignPending, setReassignPending] = React.useState(false);
  const [reassignError, setReassignError] = React.useState<string | null>(null);
  const [reassignSuccess, setReassignSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!reassignOpen || permissionsLoading || !canReassign) {
      return;
    }
    const controller = new AbortController();
    const fetchVendors = async () => {
      setVendorLoading(true);
      setVendorError(null);
      try {
        const scope = canReassignAny ? "all" : "team";
        const response = await fetch(`/api/embudo/vendedores?limit=200&scope=${scope}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setVendorError(body.error || `Error ${response.status}`);
          setVendorOptions([]);
          return;
        }
        const body = (await response.json()) as { vendedores?: Array<Record<string, unknown>> };
        const vendors = Array.isArray(body?.vendedores) ? body.vendedores : [];
        const options: SalesRepOption[] = vendors
          .map((vendor) => {
            if (!vendor || typeof vendor !== "object") return null;
            const id = String((vendor as Record<string, unknown>).id || "").trim();
            if (!id) return null;
            const nombre = (vendor as Record<string, unknown>).nombre_completo as string | null;
            const correo = (vendor as Record<string, unknown>).correo as string | null;
            const telefono = (vendor as Record<string, unknown>).telefono_e164 as string | null;
            const label = nombre?.trim() || correo?.trim() || telefono?.trim() || "Sin nombre";
            return { id, nombre_completo: nombre ?? null, correo: correo ?? null, telefono_e164: telefono ?? null, label };
          })
          .filter((entry): entry is SalesRepOption => entry !== null);
        setVendorOptions(options);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setVendorError("No se pudo cargar la lista de vendedores.");
        setVendorOptions([]);
      } finally {
        setVendorLoading(false);
      }
    };
    fetchVendors();
    return () => controller.abort();
  }, [reassignOpen, permissionsLoading, canReassign, canReassignAny]);

  const extraColumns = React.useMemo(() => {
    if (!canReassign) return contactExtraColumns;
    return [
      ...contactExtraColumns,
      {
        id: "acciones",
        header: "Acciones",
        cell: ({ row }: { row: { original: TableRow } }) => (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActiveRow(row.original);
                const ownerId = extractString(row.original.raw as Record<string, unknown> | undefined, [
                  "propietario_id",
                ]);
                setSelectedVendorId(ownerId ?? "");
                setReassignError(null);
                setReassignSuccess(null);
                setReassignOpen(true);
              }}
            >
              Reasignar
            </Button>
          </div>
        ),
        enableSorting: false,
        meta: { label: "Acciones", reorderable: false },
      } as ColumnDef<TableRow>,
    ];
  }, [canReassign]);

  const activeRaw = (activeRow?.raw ?? {}) as Record<string, unknown>;
  const activeContactoId = extractString(activeRaw, ["contacto_id"]);
  const activePropietarioId = extractString(activeRaw, ["propietario_id"]);

  const handleReassign = async () => {
    if (!activeContactoId || !selectedVendorId) return;
    setReassignPending(true);
    setReassignError(null);
    setReassignSuccess(null);
    try {
      const response = await fetch(`/api/contactos/${activeContactoId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propietario_usuario_id: selectedVendorId,
          alinear_oportunidad: true,
          alinear_conversacion: true,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setReassignError(body?.error || `Error ${response.status}`);
        return;
      }
      setReassignSuccess("Vendedor reasignado.");
    } catch {
      setReassignError("No se pudo reasignar el vendedor.");
    } finally {
      setReassignPending(false);
    }
  };

  return (
    <>
      <DataTable
        data={data}
        extraColumns={extraColumns}
        initialVisibility={contactColumnVisibility}
        storageKey="contacts-table-column-order"
      />
      <Dialog
        open={reassignOpen}
        onOpenChange={(open) => {
          setReassignOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar vendedor</DialogTitle>
            <DialogDescription>Selecciona el vendedor destino para este contacto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {activeRow?.header ?? "Contacto"}
            </div>
            <Select
              value={selectedVendorId || undefined}
              onValueChange={setSelectedVendorId}
              disabled={vendorLoading || reassignPending}
            >
              <SelectTrigger>
                <SelectValue placeholder={vendorLoading ? "Cargando..." : "Selecciona vendedor"} />
              </SelectTrigger>
              <SelectContent>
                {vendorOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {vendorError ? <p className="text-xs text-destructive">{vendorError}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={handleReassign}
                disabled={
                  reassignPending ||
                  vendorLoading ||
                  !selectedVendorId ||
                  (Boolean(activePropietarioId) && selectedVendorId === activePropietarioId)
                }
              >
                {reassignPending ? "Reasignando..." : "Reasignar"}
              </Button>
              {reassignSuccess ? (
                <span className="text-xs text-emerald-600">{reassignSuccess}</span>
              ) : null}
              {reassignError ? (
                <span className="text-xs text-destructive">{reassignError}</span>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
