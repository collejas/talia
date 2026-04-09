"use client";

import * as React from "react";
import type { ColumnDef, VisibilityState } from "@tanstack/react-table";
import { z } from "zod";

import { DataTable, schema } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/use-permissions";
import type { ContactTableRow } from "@/lib/contactos/data";

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

type ContactDraft = {
  nombre_nombres: string;
  apellido_paterno: string;
  apellido_materno: string;
  nombre_completo: string;
  persona_fisica_moral: string;
  correo: string;
  telefono_e164: string;
  puesto: string;
  area: string;
  rol_decision: string;
  origen: string;
  company_name: string;
  notes: string;
  necesidad_proposito: string;
  rfc: string;
  razon_social: string;
  uso_cfdi: string;
  metodo_pago: string;
  forma_pago: string;
  email_facturacion: string;
  tipo_industria: string;
  tamano: string;
  tipo_vialidad: string;
  nombre_vialidad: string;
  numero_exterior: string;
  numero_interior: string;
  codigo_postal: string;
  entidad: string;
  municipio: string;
  pais: string;
  website: string;
  tipo_establecimiento: string;
};

type AccountDraft = {
  nombre: string;
  razon_social: string;
  rfc: string;
  uso_cfdi: string;
  metodo_pago: string;
  forma_pago: string;
  email_facturacion: string;
  tipo_industria: string;
  tamano: string;
  notas: string;
  necesidad_proposito: string;
  telefono: string;
  email: string;
  website: string;
  tipo_vialidad: string;
  nombre_vialidad: string;
  numero_exterior: string;
  numero_interior: string;
  codigo_postal: string;
  entidad: string;
  municipio: string;
  pais: string;
  tipo_establecimiento: string;
};

const EMPTY_CONTACT: ContactDraft = {
  nombre_nombres: "",
  apellido_paterno: "",
  apellido_materno: "",
  nombre_completo: "",
  persona_fisica_moral: "",
  correo: "",
  telefono_e164: "",
  puesto: "",
  area: "",
  rol_decision: "",
  origen: "manual_panel_contactos",
  company_name: "",
  notes: "",
  necesidad_proposito: "",
  rfc: "",
  razon_social: "",
  uso_cfdi: "",
  metodo_pago: "",
  forma_pago: "",
  email_facturacion: "",
  tipo_industria: "",
  tamano: "",
  tipo_vialidad: "",
  nombre_vialidad: "",
  numero_exterior: "",
  numero_interior: "",
  codigo_postal: "",
  entidad: "",
  municipio: "",
  pais: "",
  website: "",
  tipo_establecimiento: "",
};

const EMPTY_ACCOUNT: AccountDraft = {
  nombre: "",
  razon_social: "",
  rfc: "",
  uso_cfdi: "",
  metodo_pago: "",
  forma_pago: "",
  email_facturacion: "",
  tipo_industria: "",
  tamano: "",
  notas: "",
  necesidad_proposito: "",
  telefono: "",
  email: "",
  website: "",
  tipo_vialidad: "",
  nombre_vialidad: "",
  numero_exterior: "",
  numero_interior: "",
  codigo_postal: "",
  entidad: "",
  municipio: "",
  pais: "",
  tipo_establecimiento: "",
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

function buildContactPayload(input: ContactDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const entries = Object.entries(input);
  for (const [key, value] of entries) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    payload[key] = trimmed;
  }

  const fullName =
    (typeof payload.nombre_completo === "string" && payload.nombre_completo.trim()) ||
    [input.nombre_nombres.trim(), input.apellido_paterno.trim(), input.apellido_materno.trim()]
      .filter(Boolean)
      .join(" ")
      .trim();

  if (fullName) payload.nombre_completo = fullName;
  return payload;
}

function buildAccountPayload(input: AccountDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    payload[key] = trimmed;
  }
  if (!payload.nombre && payload.razon_social) payload.nombre = payload.razon_social;
  return payload;
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

function ContactForm({
  value,
  onChange,
}: {
  value: ContactDraft;
  onChange: React.Dispatch<React.SetStateAction<ContactDraft>>;
}) {
  const set = (field: keyof ContactDraft, next: string) => onChange((prev) => ({ ...prev, [field]: next }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Select value={value.persona_fisica_moral || undefined} onValueChange={(v) => set("persona_fisica_moral", v)}>
          <SelectTrigger><SelectValue placeholder="Persona física / moral" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="fisica">Física</SelectItem>
            <SelectItem value="moral">Moral</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Nombres" value={value.nombre_nombres} onChange={(e) => set("nombre_nombres", e.target.value)} />
        <Input placeholder="Apellido paterno" value={value.apellido_paterno} onChange={(e) => set("apellido_paterno", e.target.value)} />
        <Input placeholder="Apellido materno" value={value.apellido_materno} onChange={(e) => set("apellido_materno", e.target.value)} />
        <Input placeholder="Nombre completo" value={value.nombre_completo} onChange={(e) => set("nombre_completo", e.target.value)} />
        <Input placeholder="Correo" value={value.correo} onChange={(e) => set("correo", e.target.value)} />
        <Input placeholder="Teléfono (E.164)" value={value.telefono_e164} onChange={(e) => set("telefono_e164", e.target.value)} />
        <Input placeholder="Puesto" value={value.puesto} onChange={(e) => set("puesto", e.target.value)} />
        <Input placeholder="Área" value={value.area} onChange={(e) => set("area", e.target.value)} />
        <Input placeholder="Rol decisión" value={value.rol_decision} onChange={(e) => set("rol_decision", e.target.value)} />
        <Input placeholder="Origen" value={value.origen} onChange={(e) => set("origen", e.target.value)} />
        <Input placeholder="Empresa" value={value.company_name} onChange={(e) => set("company_name", e.target.value)} />
        <Input placeholder="RFC" value={value.rfc} onChange={(e) => set("rfc", e.target.value)} />
        <Input placeholder="Razón social" value={value.razon_social} onChange={(e) => set("razon_social", e.target.value)} />
        <Input placeholder="Uso CFDI" value={value.uso_cfdi} onChange={(e) => set("uso_cfdi", e.target.value)} />
        <Input placeholder="Método pago" value={value.metodo_pago} onChange={(e) => set("metodo_pago", e.target.value)} />
        <Input placeholder="Forma pago" value={value.forma_pago} onChange={(e) => set("forma_pago", e.target.value)} />
        <Input placeholder="Email facturación" value={value.email_facturacion} onChange={(e) => set("email_facturacion", e.target.value)} />
        <Input placeholder="Industria" value={value.tipo_industria} onChange={(e) => set("tipo_industria", e.target.value)} />
        <Input placeholder="Tamaño" value={value.tamano} onChange={(e) => set("tamano", e.target.value)} />
        <Input placeholder="Tipo vialidad" value={value.tipo_vialidad} onChange={(e) => set("tipo_vialidad", e.target.value)} />
        <Input placeholder="Nombre vialidad" value={value.nombre_vialidad} onChange={(e) => set("nombre_vialidad", e.target.value)} />
        <Input placeholder="Número exterior" value={value.numero_exterior} onChange={(e) => set("numero_exterior", e.target.value)} />
        <Input placeholder="Número interior" value={value.numero_interior} onChange={(e) => set("numero_interior", e.target.value)} />
        <Input placeholder="Código postal" value={value.codigo_postal} onChange={(e) => set("codigo_postal", e.target.value)} />
        <Input placeholder="Entidad" value={value.entidad} onChange={(e) => set("entidad", e.target.value)} />
        <Input placeholder="Municipio" value={value.municipio} onChange={(e) => set("municipio", e.target.value)} />
        <Input placeholder="País" value={value.pais} onChange={(e) => set("pais", e.target.value)} />
        <Input placeholder="Website" value={value.website} onChange={(e) => set("website", e.target.value)} />
        <Input placeholder="Tipo establecimiento" value={value.tipo_establecimiento} onChange={(e) => set("tipo_establecimiento", e.target.value)} />
      </div>
      <Textarea placeholder="Notas" value={value.notes} onChange={(e) => set("notes", e.target.value)} />
      <Textarea
        placeholder="Necesidad / propósito"
        value={value.necesidad_proposito}
        onChange={(e) => set("necesidad_proposito", e.target.value)}
      />
    </div>
  );
}

function AccountForm({
  value,
  onChange,
}: {
  value: AccountDraft;
  onChange: React.Dispatch<React.SetStateAction<AccountDraft>>;
}) {
  const set = (field: keyof AccountDraft, next: string) => onChange((prev) => ({ ...prev, [field]: next }));

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input placeholder="Nombre empresa" value={value.nombre} onChange={(e) => set("nombre", e.target.value)} />
        <Input placeholder="Razón social" value={value.razon_social} onChange={(e) => set("razon_social", e.target.value)} />
        <Input placeholder="RFC" value={value.rfc} onChange={(e) => set("rfc", e.target.value)} />
        <Input placeholder="Uso CFDI" value={value.uso_cfdi} onChange={(e) => set("uso_cfdi", e.target.value)} />
        <Input placeholder="Método pago" value={value.metodo_pago} onChange={(e) => set("metodo_pago", e.target.value)} />
        <Input placeholder="Forma pago" value={value.forma_pago} onChange={(e) => set("forma_pago", e.target.value)} />
        <Input placeholder="Email facturación" value={value.email_facturacion} onChange={(e) => set("email_facturacion", e.target.value)} />
        <Input placeholder="Industria" value={value.tipo_industria} onChange={(e) => set("tipo_industria", e.target.value)} />
        <Input placeholder="Tamaño" value={value.tamano} onChange={(e) => set("tamano", e.target.value)} />
        <Input placeholder="Teléfono" value={value.telefono} onChange={(e) => set("telefono", e.target.value)} />
        <Input placeholder="Email" value={value.email} onChange={(e) => set("email", e.target.value)} />
        <Input placeholder="Website" value={value.website} onChange={(e) => set("website", e.target.value)} />
        <Input placeholder="Tipo vialidad" value={value.tipo_vialidad} onChange={(e) => set("tipo_vialidad", e.target.value)} />
        <Input placeholder="Nombre vialidad" value={value.nombre_vialidad} onChange={(e) => set("nombre_vialidad", e.target.value)} />
        <Input placeholder="Número exterior" value={value.numero_exterior} onChange={(e) => set("numero_exterior", e.target.value)} />
        <Input placeholder="Número interior" value={value.numero_interior} onChange={(e) => set("numero_interior", e.target.value)} />
        <Input placeholder="Código postal" value={value.codigo_postal} onChange={(e) => set("codigo_postal", e.target.value)} />
        <Input placeholder="Entidad" value={value.entidad} onChange={(e) => set("entidad", e.target.value)} />
        <Input placeholder="Municipio" value={value.municipio} onChange={(e) => set("municipio", e.target.value)} />
        <Input placeholder="País" value={value.pais} onChange={(e) => set("pais", e.target.value)} />
        <Input placeholder="Tipo establecimiento" value={value.tipo_establecimiento} onChange={(e) => set("tipo_establecimiento", e.target.value)} />
      </div>
      <Textarea placeholder="Notas" value={value.notas} onChange={(e) => set("notas", e.target.value)} />
      <Textarea
        placeholder="Necesidad / propósito"
        value={value.necesidad_proposito}
        onChange={(e) => set("necesidad_proposito", e.target.value)}
      />
    </div>
  );
}

export function ContactsDataTable({ data }: { data: ContactTableRow[] }) {
  const { context: permissionContext, loading: permissionsLoading } = usePermissions();
  const normalizedPerms = React.useMemo(
    () => (permissionContext.permisos ?? []).map((perm) => perm.toLowerCase()),
    [permissionContext.permisos],
  );

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
  const [contactForm, setContactForm] = React.useState<ContactDraft>({ ...EMPTY_CONTACT });
  const [accountForm, setAccountForm] = React.useState<AccountDraft>({ ...EMPTY_ACCOUNT });
  const [createWithAccount, setCreateWithAccount] = React.useState(false);

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

  const activeRaw = (activeRow?.raw ?? {}) as Record<string, unknown>;
  const activeContactoId = extractString(activeRaw, ["contacto_id"]);
  const activePropietarioId = extractString(activeRaw, ["propietario_id"]);

  const openEdit = (row: TableRow) => {
    const raw = (row.raw ?? {}) as Record<string, unknown>;
    setActiveRow(row);
    setContactForm({
      ...EMPTY_CONTACT,
      nombre_completo: row.header || "",
      correo: extractString(raw, ["correo"]) ?? "",
      telefono_e164: extractString(raw, ["telefono"]) ?? "",
      origen: extractString(raw, ["origen"]) ?? EMPTY_CONTACT.origen,
      company_name: extractString(raw, ["company_name"]) ?? "",
      notes: extractString(raw, ["notes"]) ?? "",
      necesidad_proposito: extractString(raw, ["necesidad_proposito"]) ?? "",
      rfc: extractString(raw, ["rfc"]) ?? "",
      razon_social: extractString(raw, ["razon_social"]) ?? "",
      puesto: extractString(raw, ["puesto"]) ?? "",
      area: extractString(raw, ["area"]) ?? "",
      rol_decision: extractString(raw, ["rol_decision"]) ?? "",
      codigo_postal: extractString(raw, ["codigo_postal"]) ?? "",
      entidad: extractString(raw, ["entidad"]) ?? "",
      municipio: extractString(raw, ["municipio"]) ?? "",
      pais: extractString(raw, ["pais"]) ?? "",
      website: extractString(raw, ["website"]) ?? "",
      tipo_establecimiento: extractString(raw, ["tipo_establecimiento"]) ?? "",
    });
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
              <Button variant="ghost" size="sm" onClick={() => openEdit(row.original)}>
                Editar
              </Button>
            ) : null}
            {canReassign ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveRow(row.original);
                  const ownerId = extractString(row.original.raw as Record<string, unknown> | undefined, ["propietario_id"]);
                  setSelectedVendorId(ownerId ?? "");
                  setError(null);
                  setSuccess(null);
                  setReassignOpen(true);
                }}
              >
                Reasignar
              </Button>
            ) : null}
            {canWrite ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveRow(row.original);
                  setError(null);
                  setSuccess(null);
                  setDeleteOpen(true);
                }}
              >
                Eliminar
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

  const handleCreate = async () => {
    await runAndReload(async () => {
      const contacto = buildContactPayload(contactForm);
      const payload: Record<string, unknown> = {
        crear_cuenta: createWithAccount,
        contacto,
      };
      if (createWithAccount) payload.cuenta = buildAccountPayload(accountForm);

      const response = await fetch("/api/contactos/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
    });
  };

  const handleEdit = async () => {
    if (!activeContactoId) {
      setError("No se encontró el contacto a editar.");
      return;
    }
    await runAndReload(async () => {
      const payload = buildContactPayload(contactForm);
      const response = await fetch(`/api/contactos/${activeContactoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
    });
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

  const toolbarActions = canWrite ? (
    <Button
      type="button"
      size="sm"
      onClick={() => {
        setContactForm({ ...EMPTY_CONTACT });
        setAccountForm({ ...EMPTY_ACCOUNT });
        setCreateWithAccount(false);
        setError(null);
        setSuccess(null);
        setCreateOpen(true);
      }}
    >
      Nuevo contacto
    </Button>
  ) : null;

  return (
    <>
      <DataTable
        data={data}
        extraColumns={extraColumns}
        initialVisibility={contactColumnVisibility}
        storageKey="contacts-table-column-order"
        toolbarActions={toolbarActions}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Crear contacto</DialogTitle>
            <DialogDescription>Alta de contacto por columnas. Sin campos JSON.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <ContactForm value={contactForm} onChange={setContactForm} />
            <div className="flex items-center space-x-2">
              <Checkbox id="create-account" checked={createWithAccount} onCheckedChange={(v) => setCreateWithAccount(Boolean(v))} />
              <label htmlFor="create-account" className="text-sm text-muted-foreground">
                Crear empresa y vincularla
              </label>
            </div>
            {createWithAccount ? <AccountForm value={accountForm} onChange={setAccountForm} /> : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {success ? <p className="text-xs text-emerald-600">{success}</p> : null}
            <div className="flex gap-2">
              <Button type="button" disabled={pending} onClick={handleCreate}>{pending ? "Guardando..." : "Crear"}</Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setCreateOpen(false)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Editar contacto</DialogTitle>
            <DialogDescription>Actualiza los datos del contacto por columnas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <ContactForm value={contactForm} onChange={setContactForm} />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {success ? <p className="text-xs text-emerald-600">{success}</p> : null}
            <div className="flex gap-2">
              <Button type="button" disabled={pending} onClick={handleEdit}>{pending ? "Guardando..." : "Guardar cambios"}</Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setEditOpen(false)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
        <DialogContent>
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
