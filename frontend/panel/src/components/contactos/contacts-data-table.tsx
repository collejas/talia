"use client";

import * as React from "react";
import type { ColumnDef, VisibilityState } from "@tanstack/react-table";
import {
  IconArrowsLeftRight,
  IconBuilding,
  IconClock,
  IconDownload,
  IconMail,
  IconPencil,
  IconPhone,
  IconMessageCircle,
  IconUser,
  IconTrash,
} from "@tabler/icons-react";
import { z } from "zod";

import { DataTable, schema } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Separator } from "@/components/ui/separator";
import { usePermissions } from "@/hooks/use-permissions";
import type { ContactTableRow } from "@/lib/contactos/data";
import { ContactCreateFlow } from "@/components/contactos/contact-create-flow";
import { ContactEditFlow } from "@/components/contactos/contact-edit-flow";

type TableRow = z.infer<typeof schema>;

type ContactField =
  | "codigo_contacto"
  | "codigo_cuenta"
  | "correo"
  | "telefono"
  | "origen"
  | "estado"
  | "captura_estado"
  | "company_name"
  | "ultimo_contacto_en"
  | "conversaciones"
  | "notes"
  | "rfc"
  | "puesto"
  | "rol_decision"
  | "codigo_postal";

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
        <a href={`mailto:${value}`} className="text-primary underline-offset-2 hover:underline">
          {String(value)}
        </a>
      );
    case "telefono":
      return (
        <a href={`tel:${value}`} className="text-primary underline-offset-2 hover:underline">
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
  { id: "contact_codigo", label: "Código contacto", accessor: (row) => renderField(row, "codigo_contacto"), defaultVisible: true },
  { id: "account_codigo", label: "Código empresa", accessor: (row) => renderField(row, "codigo_cuenta"), defaultVisible: true },
  { id: "contact_correo", label: "Correo", accessor: (row) => renderField(row, "correo"), defaultVisible: true },
  { id: "contact_telefono", label: "Teléfono", accessor: (row) => renderField(row, "telefono"), defaultVisible: true },
  { id: "contact_rfc", label: "RFC", accessor: (row) => renderField(row, "rfc"), defaultVisible: true },
  { id: "contact_puesto", label: "Puesto", accessor: (row) => renderField(row, "puesto"), defaultVisible: true },
  { id: "contact_rol", label: "Rol decisión", accessor: (row) => renderField(row, "rol_decision"), defaultVisible: true },
  { id: "contact_cp", label: "C.P.", accessor: (row) => renderField(row, "codigo_postal"), defaultVisible: true },
  { id: "contact_origen", label: "Origen", accessor: (row) => renderField(row, "origen"), defaultVisible: true },
  { id: "contact_estado", label: "Estado", accessor: (row) => renderField(row, "estado") },
  { id: "contact_captura", label: "Captura", accessor: (row) => renderField(row, "captura_estado") },
  { id: "contact_company", label: "Empresa", accessor: (row) => renderField(row, "company_name") },
  { id: "contact_ultimo", label: "Último contacto", accessor: (row) => renderField(row, "ultimo_contacto_en"), defaultVisible: true },
  { id: "contact_conversaciones", label: "Conversaciones", accessor: (row) => renderField(row, "conversaciones") },
  { id: "contact_notes", label: "Notas", accessor: (row) => renderField(row, "notes") },
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

const contactColumnVisibility: VisibilityState = CONTACT_COLUMNS.reduce<VisibilityState>((visibility, column) => {
  visibility[column.id] = column.defaultVisible ?? false;
  return visibility;
}, {});

const contactColumnLabels = {
  header: "Contacto",
  type: "Estado",
  status: "Captura",
  target: "Conversaciones",
  reviewer: "Propietario",
} as const;

export function ContactsDataTable({ data }: { data: ContactTableRow[] }) {
  const { context: permissionContext, loading: permissionsLoading } = usePermissions();
  const normalizedPerms = React.useMemo(
    () => (permissionContext.permisos ?? []).map((perm) => perm.toLowerCase()),
    [permissionContext.permisos],
  );
  const [searchTerm, setSearchTerm] = React.useState("");

  const canWrite =
    permissionContext.es_admin || permissionContext.es_owner || normalizedPerms.includes("contacts.write");
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
  const [editOpen, setEditOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const [activeRow, setActiveRow] = React.useState<TableRow | null>(null);

  const [selectedVendorId, setSelectedVendorId] = React.useState("");
  const [vendorOptions, setVendorOptions] = React.useState<SalesRepOption[]>([]);
  const [vendorLoading, setVendorLoading] = React.useState(false);
  const [vendorError, setVendorError] = React.useState<string | null>(null);

  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!reassignOpen || permissionsLoading || !canReassign) return;
    const controller = new AbortController();

    const run = async () => {
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
          .filter((item): item is SalesRepOption => item !== null);

        setVendorOptions(options);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setVendorError("No se pudo cargar la lista de vendedores.");
        }
      } finally {
        setVendorLoading(false);
      }
    };

    run();
    return () => controller.abort();
  }, [reassignOpen, permissionsLoading, canReassign, canReassignAny]);

  const [editContactoId, setEditContactoId] = React.useState<string | null>(null);
  const activeRaw = React.useMemo(() => (activeRow?.raw ?? {}) as Record<string, unknown>, [activeRow?.raw]);
  const activeContactoId = extractString(activeRaw, ["contacto_id"]) ?? extractString(activeRaw, ["id"]);
  const activePropietarioId = extractString(activeRaw, ["propietario_id"]);

  const openEdit = (row: TableRow) => {
    const raw = (row.raw ?? {}) as Record<string, unknown>;
    const contactoId = extractString(raw, ["contacto_id"]) ?? extractString(raw, ["id"]);
    setActiveRow(row);
    setEditContactoId(contactoId);
    setError(null);
    setSuccess(null);
    setEditOpen(true);
  };

  const extraColumns = React.useMemo<ColumnDef<TableRow>[]>(() => {
    if (!canWrite && !canReassign) return contactExtraColumns;

    return [
      ...contactExtraColumns,
      {
        id: "acciones",
        header: "Acciones",
        cell: ({ row }: { row: { original: TableRow } }) => (
          <div className="flex justify-end gap-1">
            {canWrite ? (
              <Button variant="ghost" size="icon" className="size-8" onClick={() => void openEdit(row.original)}>
                <IconPencil className="size-4" />
                <span className="sr-only">Editar</span>
              </Button>
            ) : null}
            {canReassign ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => {
                  setActiveRow(row.original);
                  const ownerId = extractString(row.original.raw as Record<string, unknown> | undefined, ["propietario_id"]);
                  setSelectedVendorId(ownerId ?? "");
                  setError(null);
                  setSuccess(null);
                  setReassignOpen(true);
                }}
              >
                <IconArrowsLeftRight className="size-4" />
                <span className="sr-only">Reasignar</span>
              </Button>
            ) : null}
            {canWrite ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => {
                  setActiveRow(row.original);
                  setError(null);
                  setSuccess(null);
                  setDeleteOpen(true);
                }}
              >
                <IconTrash className="size-4" />
                <span className="sr-only">Eliminar</span>
              </Button>
            ) : null}
          </div>
        ),
        enableSorting: false,
        meta: { label: "Acciones", reorderable: false },
      },
    ];
  }, [canWrite, canReassign]);

  const runAndReload = async (fn: () => Promise<void>) => {
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      await fn();
      setSuccess("Operación realizada.");
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operación fallida.");
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async () => {
    if (!activeContactoId) {
      setError("No se encontró el contacto a eliminar.");
      return;
    }
    await runAndReload(async () => {
      const response = await fetch(`/api/contactos/${activeContactoId}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
    });
  };

  const handleReassign = async () => {
    if (!activeContactoId || !selectedVendorId) return;
    await runAndReload(async () => {
      const response = await fetch(`/api/contactos/${activeContactoId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propietario_usuario_id: selectedVendorId,
          alinear_oportunidad: true,
          alinear_conversacion: true,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
    });
  };

  const filteredData = React.useMemo(() => {
    const term = normalizeSearch(searchTerm);
    if (!term) return data;

    return data.filter((row) => matchesContactSearch(row, term));
  }, [data, searchTerm]);

  const resultsLabel =
    searchTerm.trim().length > 0
      ? `${filteredData.length} de ${data.length} contactos`
      : `${data.length} contactos`;

  const toolbarLeadingActions = (
    <div className="flex w-full flex-wrap items-center gap-2">
      <div className="relative w-full lg:w-[340px]">
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Buscar contacto por nombre, correo, teléfono, empresa o código"
          aria-label="Buscar contacto"
          className="pr-24"
        />
        {searchTerm ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1 h-8 px-3 text-xs text-muted-foreground"
            onClick={() => setSearchTerm("")}
          >
            Limpiar
          </Button>
        ) : null}
      </div>
      <div className="text-sm text-muted-foreground">{resultsLabel}</div>
    </div>
  );

  const toolbarActions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => exportContactsCsv(filteredData)}
      >
        <IconDownload className="size-4" />
        Exportar CSV
      </Button>
      {canWrite ? (
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setError(null);
            setSuccess(null);
            setCreateOpen(true);
          }}
        >
          Nuevo contacto
        </Button>
      ) : null}
    </div>
  );

  const contactColumnOrder = React.useMemo(
    () => ["drag-handle", "row-select", "session", "acciones"],
    [],
  );

  const renderRowDetails = (row: TableRow) => (
    <ContactDetailPanel
      row={row}
      onEdit={() => openEdit(row)}
      onReassign={() => {
        setActiveRow(row);
        const ownerId = extractString(row.raw as Record<string, unknown> | undefined, ["propietario_id"]);
        setSelectedVendorId(ownerId ?? "");
        setError(null);
        setSuccess(null);
        setReassignOpen(true);
      }}
      onDelete={() => {
        setActiveRow(row);
        setError(null);
        setSuccess(null);
        setDeleteOpen(true);
      }}
    />
  );

  return (
    <>
      <DataTable
        data={filteredData}
        columnLabels={contactColumnLabels}
        extraColumns={extraColumns}
        detailDescription="Detalle del contacto"
        toolbarLeadingActions={toolbarLeadingActions}
        renderRowDetails={renderRowDetails}
        forcedColumnOrder={contactColumnOrder}
        hideDefaultActions
        initialVisibility={contactColumnVisibility}
        storageKey="contacts-table-column-order"
        toolbarActions={toolbarActions}
      />

      <ContactCreateFlow
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => window.location.reload()}
      />

      <ContactEditFlow
        open={editOpen}
        onOpenChange={setEditOpen}
        contactoId={editContactoId}
        onSaved={() => window.location.reload()}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar contacto</DialogTitle>
            <DialogDescription>
              Esta acción elimina el contacto y no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{activeRow?.header ?? "Contacto"}</p>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="button" variant="destructive" disabled={pending} onClick={handleDelete}>
                {pending ? "Eliminando..." : "Eliminar"}
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setDeleteOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar vendedor</DialogTitle>
            <DialogDescription>Selecciona el vendedor destino para este contacto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">{activeRow?.header ?? "Contacto"}</div>
            <Select value={selectedVendorId || undefined} onValueChange={setSelectedVendorId} disabled={vendorLoading || pending}>
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
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {success ? <p className="text-xs text-emerald-600">{success}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={handleReassign}
                disabled={
                  pending ||
                  vendorLoading ||
                  !selectedVendorId ||
                  (Boolean(activePropietarioId) && selectedVendorId === activePropietarioId)
                }
              >
                {pending ? "Reasignando..." : "Reasignar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesContactSearch(row: TableRow, term: string): boolean {
  const raw = (row.raw ?? {}) as Record<string, unknown>;
  const values = [
    row.header,
    row.type,
    row.status,
    row.target,
    row.limit,
    row.reviewer,
    raw?.codigo_contacto,
    raw?.codigo_cuenta,
    raw?.correo,
    raw?.telefono,
    raw?.estado,
    raw?.captura_estado,
    raw?.origen,
    raw?.company_name,
    raw?.propietario_nombre,
    raw?.rfc,
    raw?.puesto,
    raw?.area,
    raw?.rol_decision,
    raw?.codigo_postal,
    raw?.entidad,
    raw?.municipio,
    raw?.pais,
    raw?.website,
    raw?.tipo_establecimiento,
    raw?.notes,
    raw?.codigo_contacto,
  ];

  return values
    .map((value) => {
      if (value === null || value === undefined) return "";
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
      return normalizeSearch(String(value));
    })
    .some((value) => value.includes(term));
}

function formatContactValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("es-MX");
  }
  return String(value);
}

function escapeCsvValue(value: unknown): string {
  const text = formatContactValue(value);
  if (!text.includes(",") && !text.includes('"') && !text.includes("\n") && !text.includes("\r")) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`
}

function buildContactsCsv(rows: TableRow[]): string {
  const headers = [
    "Contacto",
    "Código contacto",
    "Código empresa",
    "Correo",
    "Teléfono",
    "Empresa",
    "Propietario",
    "Estado",
    "Captura",
    "Origen",
    "Último contacto",
    "Conversaciones",
    "Puesto",
    "Área",
    "Rol decisión",
    "C.P.",
    "Municipio",
    "Estado / Entidad",
    "País",
    "Sitio web",
    "Tipo establecimiento",
    "Notas",
  ];

  const lines = rows.map((row) => {
    const raw = (row.raw ?? {}) as Record<string, unknown>;
    return [
      row.header,
      raw.codigo_contacto,
      raw.codigo_cuenta,
      raw.correo,
      raw.telefono,
      raw.company_name,
      raw.propietario_nombre,
      raw.estado,
      raw.captura_estado,
      raw.origen,
      row.limit || raw.ultimo_contacto_en,
      raw.conversaciones,
      raw.puesto,
      raw.area,
      raw.rol_decision,
      raw.codigo_postal,
      raw.municipio,
      raw.entidad,
      raw.pais,
      raw.website,
      raw.tipo_establecimiento,
      raw.notes,
    ]
      .map(escapeCsvValue)
      .join(",");
  });

  return ["\uFEFF" + headers.map(escapeCsvValue).join(","), ...lines].join("\r\n");
}

function exportContactsCsv(rows: TableRow[]): void {
  const csv = buildContactsCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `contactos_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ContactDetailPanel({
  row,
  onEdit,
  onReassign,
  onDelete,
}: {
  row: TableRow;
  onEdit: () => void;
  onReassign: () => void;
  onDelete: () => void;
}) {
  const raw = (row.raw ?? {}) as Record<string, unknown>;

  const contactName = row.header;
  const company = formatContactValue(raw.company_name);
  const code = formatContactValue(raw.codigo_contacto);
  const accountCode = formatContactValue(raw.codigo_cuenta);
  const email = formatContactValue(raw.correo);
  const phone = formatContactValue(raw.telefono);
  const origin = formatContactValue(raw.origen);
  const owner = formatContactValue(raw.propietario_nombre);
  const status = formatContactValue(raw.estado);
  const capture = formatContactValue(raw.captura_estado);
  const conversations = formatContactValue(raw.conversaciones);
  const lastContact = formatDate(raw.ultimo_contacto_en);
  const notes = formatContactValue(raw.notes);
  const role = formatContactValue(raw.rol_decision);
  const position = formatContactValue(raw.puesto);
  const area = formatContactValue(raw.area);
  const postalCode = formatContactValue(raw.codigo_postal);
  const city = formatContactValue(raw.municipio);
  const state = formatContactValue(raw.entidad);
  const country = formatContactValue(raw.pais);
  const website = formatContactValue(raw.website);
  const establishment = formatContactValue(raw.tipo_establecimiento);

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onEdit}>
          <IconPencil className="size-4" />
          Editar
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onReassign}>
          <IconArrowsLeftRight className="size-4" />
          Reasignar
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
          <IconTrash className="size-4" />
          Eliminar
        </Button>
      </div>

      <div className="grid gap-3 rounded-xl border bg-muted/20 p-4">
        <div className="flex flex-col gap-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Contacto</div>
          <div className="text-xl font-semibold">{contactName}</div>
          <div className="text-sm text-muted-foreground">
            {company !== "—" ? company : "Sin empresa asociada"}
          </div>
        </div>

        <Separator />

        <div className="grid gap-3 sm:grid-cols-2">
          <DetailItem icon={<IconMail className="size-4" />} label="Correo" value={email} href={email !== "—" ? `mailto:${email}` : undefined} />
          <DetailItem icon={<IconPhone className="size-4" />} label="Teléfono" value={phone} href={phone !== "—" ? `tel:${phone}` : undefined} />
          <DetailItem icon={<IconBuilding className="size-4" />} label="Empresa" value={company} />
          <DetailItem icon={<IconUser className="size-4" />} label="Propietario" value={owner} />
          <DetailItem icon={<IconClock className="size-4" />} label="Último contacto" value={lastContact} />
          <DetailItem icon={<IconMessageCircle className="size-4" />} label="Conversaciones" value={conversations} />
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border p-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Estado: {status}</Badge>
          <Badge variant="outline">Captura: {capture}</Badge>
          <Badge variant="outline">Origen: {origin}</Badge>
        </div>

        <Separator />

        <div className="grid gap-3 sm:grid-cols-2">
          <DetailItem label="Código contacto" value={code} />
          <DetailItem label="Código empresa" value={accountCode} />
          <DetailItem label="Puesto" value={position} />
          <DetailItem label="Rol decisión" value={role} />
          <DetailItem label="Área" value={area} />
          <DetailItem label="C.P." value={postalCode} />
          <DetailItem label="Municipio" value={city} />
          <DetailItem label="Estado" value={state} />
          <DetailItem label="País" value={country} />
          <DetailItem label="Sitio web" value={website} href={website !== "—" ? website : undefined} />
          <DetailItem label="Tipo establecimiento" value={establishment} />
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <div className="mb-2 text-sm font-medium">Notas</div>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {notes !== "—" ? notes : "Sin notas registradas."}
        </p>
      </div>
    </div>
  );
}

function DetailItem({
  label,
  value,
  icon,
  href,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  href?: string;
}) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      {href ? (
        <a href={href} className="break-words text-sm font-medium text-primary underline-offset-2 hover:underline">
          {value}
        </a>
      ) : (
        <div className="break-words text-sm font-medium">{value}</div>
      )}
    </div>
  );
}
