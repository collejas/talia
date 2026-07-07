"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import {
  IconArrowsLeftRight,
  IconAdjustmentsHorizontal,
  IconBuilding,
  IconClock,
  IconDownload,
  IconLink,
  IconMail,
  IconPencil,
  IconPhone,
  IconMessageCircle,
  IconUser,
  IconTrash,
} from "@tabler/icons-react";
import { z } from "zod";
import Link from "next/link";

import { DataTable, SortButton, schema } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import type { ContactAdvancedFilters, ContactFilters, ContactTableRow } from "@/lib/contactos/types";
import { ContactCreateFlow } from "@/components/contactos/contact-create-flow";
import { ContactEditFlow } from "@/components/contactos/contact-edit-flow";
import { ContactLinkFlow } from "@/components/contactos/contact-link-flow";
import { ContactCatalogSelect, mergeCatalogOptions } from "@/components/contactos/contact-catalog-select";
import { useTenantContactCatalogs } from "@/components/contactos/use-contact-catalogs";

type TableRow = z.infer<typeof schema>;

type SalesRepOption = {
  id: string;
  nombre_completo: string | null;
  correo: string | null;
  telefono_e164: string | null;
  label: string;
};

export type { ContactFilters } from "@/lib/contactos/types";

const DEFAULT_ADVANCED_FILTERS: ContactAdvancedFilters = {
  origen: "",
  puesto: "",
  rolDecision: "",
  estadoContacto: "",
  captura: "all",
  ligado: "all",
  tipoCuenta: "",
  tamano: "",
  clasificacion: "",
  fechaCreacionCuentaFrom: "",
  fechaCreacionCuentaTo: "",
  fechaIncorporacionFrom: "",
  fechaIncorporacionTo: "",
  fusionada: "all",
  pais: "",
  estadoDireccion: "",
  municipio: "",
};

function cloneDefaultAdvancedFilters(): ContactAdvancedFilters {
  return { ...DEFAULT_ADVANCED_FILTERS };
}

const DATE_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: unknown): string {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FORMATTER.format(date);
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

function extractFirstString(raw: Record<string, unknown> | undefined, keys: string[]): string | null {
  for (const key of keys) {
    const value = extractString(raw, [key]);
    if (value) return value;
  }
  return null;
}

function getContactDisplayName(raw: Record<string, unknown> | undefined): string | null {
  const firstName = extractString(raw, ["nombre_nombres"]) || extractString(raw, ["nombre"]);
  const lastName = extractString(raw, ["apellido_paterno"]);
  const secondLastName = extractString(raw, ["apellido_materno"]);
  const fromParts = [firstName, lastName, secondLastName].filter(Boolean).join(" ").trim();
  return (
    extractString(raw, ["nombre_completo"]) ||
    fromParts ||
    extractString(raw, ["company_name"]) ||
    extractString(raw, ["nombre"]) ||
    null
  );
}

function getContactEmailValue(raw: Record<string, unknown> | undefined): string | null {
  return extractFirstString(raw, ["correo_principal", "correo", "correo_secundario", "correo_institucional", "email"]);
}

function getContactOwnerId(raw: Record<string, unknown> | undefined): string | null {
  return extractString(raw, ["propietario_usuario_id"]) || extractString(raw, ["propietario_id"]);
}

function getContactIdValue(row: TableRow): string {
  if (!canViewContactSensitiveRow(row)) return "—";
  const raw = row.raw as Record<string, unknown> | undefined;
  return extractString(raw, ["codigo_contacto"]) || "—";
}

function normalizeLabel(value: unknown): string {
  if (typeof value !== "string") return "Desconocido";
  const trimmed = value.trim();
  return trimmed.length ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : "Desconocido";
}

function normalizeFilterValue(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function parseDateInput(value: string, boundary: "start" | "end"): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const parts = raw.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null;
  const [year, month, day] = parts;
  const date =
    boundary === "start"
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getRowDate(raw: Record<string, unknown> | undefined, keys: string[]): number | null {
  const value = extractFirstString(raw, keys);
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isSelectAll(value: string | undefined | null): boolean {
  return !value || value === "all";
}

function countAdvancedFilterSelections(filters: ContactAdvancedFilters): number {
  let count = 0;
  if (filters.origen) count += 1;
  if (filters.puesto) count += 1;
  if (filters.rolDecision) count += 1;
  if (filters.estadoContacto) count += 1;
  if (!isSelectAll(filters.captura)) count += 1;
  if (!isSelectAll(filters.ligado)) count += 1;
  if (filters.tipoCuenta) count += 1;
  if (filters.tamano) count += 1;
  if (filters.clasificacion) count += 1;
  if (filters.fechaCreacionCuentaFrom) count += 1;
  if (filters.fechaCreacionCuentaTo) count += 1;
  if (filters.fechaIncorporacionFrom) count += 1;
  if (filters.fechaIncorporacionTo) count += 1;
  if (!isSelectAll(filters.fusionada)) count += 1;
  if (filters.pais) count += 1;
  if (filters.estadoDireccion) count += 1;
  if (filters.municipio) count += 1;
  return count;
}

function buildListParams(filters: ContactFilters, limit: number): URLSearchParams {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.owner !== "all") params.set("propietario", filters.owner);
  if (filters.createdFrom.trim()) params.set("from", filters.createdFrom.trim());
  if (filters.createdTo.trim()) params.set("to", filters.createdTo.trim());
  if (filters.advanced.origen.trim()) params.set("origen", filters.advanced.origen.trim());
  if (filters.advanced.puesto.trim()) params.set("puesto", filters.advanced.puesto.trim());
  if (filters.advanced.rolDecision.trim()) params.set("rol_decision", filters.advanced.rolDecision.trim());
  if (filters.advanced.estadoContacto.trim()) params.set("estado_contacto", filters.advanced.estadoContacto.trim());
  if (!isSelectAll(filters.advanced.captura)) params.set("captura", filters.advanced.captura);
  if (!isSelectAll(filters.advanced.ligado)) params.set("ligado", filters.advanced.ligado);
  if (filters.advanced.tipoCuenta.trim()) params.set("tipo_cuenta", filters.advanced.tipoCuenta.trim());
  if (filters.advanced.tamano.trim()) params.set("tamano", filters.advanced.tamano.trim());
  if (filters.advanced.clasificacion.trim()) params.set("clasificacion", filters.advanced.clasificacion.trim());
  if (filters.advanced.fechaCreacionCuentaFrom.trim()) params.set("cuenta_from", filters.advanced.fechaCreacionCuentaFrom.trim());
  if (filters.advanced.fechaCreacionCuentaTo.trim()) params.set("cuenta_to", filters.advanced.fechaCreacionCuentaTo.trim());
  if (filters.advanced.fechaIncorporacionFrom.trim()) params.set("fecha_incorporacion_from", filters.advanced.fechaIncorporacionFrom.trim());
  if (filters.advanced.fechaIncorporacionTo.trim()) params.set("fecha_incorporacion_to", filters.advanced.fechaIncorporacionTo.trim());
  if (!isSelectAll(filters.advanced.fusionada)) params.set("fusionada", filters.advanced.fusionada);
  if (filters.advanced.pais.trim()) params.set("pais", filters.advanced.pais.trim());
  if (filters.advanced.estadoDireccion.trim()) params.set("estado_direccion", filters.advanced.estadoDireccion.trim());
  if (filters.advanced.municipio.trim()) params.set("municipio", filters.advanced.municipio.trim());
  return params;
}

function matchesAdvancedFilters(raw: Record<string, unknown> | undefined, filters: ContactAdvancedFilters): boolean {
  if (!raw) return false;
  const origin = normalizeFilterValue(extractString(raw, ["origen"]));
  if (filters.origen.trim() && origin !== normalizeFilterValue(filters.origen)) return false;
  if (filters.puesto.trim() && normalizeFilterValue(extractString(raw, ["puesto"])) !== normalizeFilterValue(filters.puesto)) return false;
  if (filters.rolDecision.trim() && normalizeFilterValue(extractString(raw, ["rol_decision"])) !== normalizeFilterValue(filters.rolDecision)) return false;
  if (filters.estadoContacto.trim() && normalizeFilterValue(extractString(raw, ["estado"])) !== normalizeFilterValue(filters.estadoContacto)) return false;
  if (filters.captura !== "all") {
    const captureDone = isCaptureComplete(raw);
    if ((filters.captura === "si" && !captureDone) || (filters.captura === "no" && captureDone)) return false;
  }
  if (filters.ligado !== "all") {
    const linked = Boolean(extractString(raw, ["cuenta_id"]) || extractString(raw, ["codigo_cuenta"]));
    if ((filters.ligado === "si" && !linked) || (filters.ligado === "no" && linked)) return false;
  }
  if (filters.tipoCuenta.trim() && normalizeFilterValue(extractString(raw, ["cuenta_tipo"])) !== normalizeFilterValue(filters.tipoCuenta)) return false;
  if (filters.tamano.trim() && normalizeFilterValue(extractString(raw, ["tamano"])) !== normalizeFilterValue(filters.tamano)) return false;
  if (filters.clasificacion.trim() && normalizeFilterValue(extractString(raw, ["tipo_industria"])) !== normalizeFilterValue(filters.clasificacion)) return false;
  const accountCreated = getRowDate(raw, ["cuenta_creado_en", "cuenta_creado", "account_creado_en"]);
  const accountCreatedFrom = parseDateInput(filters.fechaCreacionCuentaFrom, "start");
  const accountCreatedTo = parseDateInput(filters.fechaCreacionCuentaTo, "end");
  if (accountCreatedFrom !== null && (accountCreated === null || accountCreated < accountCreatedFrom)) return false;
  if (accountCreatedTo !== null && (accountCreated === null || accountCreated > accountCreatedTo)) return false;
  const incorporation = getRowDate(raw, ["fecha_incorporacion"]);
  const incorporationFrom = parseDateInput(filters.fechaIncorporacionFrom, "start");
  const incorporationTo = parseDateInput(filters.fechaIncorporacionTo, "end");
  if (incorporationFrom !== null && (incorporation === null || incorporation < incorporationFrom)) return false;
  if (incorporationTo !== null && (incorporation === null || incorporation > incorporationTo)) return false;
  if (filters.fusionada !== "all") {
    const fused = ["fusionado", "fusionada"].includes(normalizeFilterValue(extractString(raw, ["estado"])));
    if ((filters.fusionada === "si" && !fused) || (filters.fusionada === "no" && fused)) return false;
  }
  if (filters.pais.trim() && normalizeFilterValue(extractString(raw, ["pais"])) !== normalizeFilterValue(filters.pais)) return false;
  if (filters.estadoDireccion.trim() && normalizeFilterValue(extractString(raw, ["entidad"])) !== normalizeFilterValue(filters.estadoDireccion)) return false;
  if (filters.municipio.trim() && normalizeFilterValue(extractString(raw, ["municipio"])) !== normalizeFilterValue(filters.municipio)) return false;
  return true;
}

function mapContactDetailToTableRow(detail: Record<string, unknown>, previous?: TableRow | null): TableRow {
  const previousRaw = previous?.raw as Record<string, unknown> | undefined;
  const contactId =
    extractString(detail, ["persona_id"]) ||
    extractString(detail, ["contacto_id"]) ||
    extractString(detail, ["id"]) ||
    extractString(previousRaw, ["persona_id"]) ||
    extractString(previousRaw, ["contacto_id"]) ||
    "";
  const createdAtRaw = extractString(detail, ["creado_en"]) || extractString(detail, ["actualizado_en"]) || extractString(previousRaw, ["creado_en"]) || "";
  const createdAt = createdAtRaw && !Number.isNaN(Date.parse(createdAtRaw)) ? new Date(createdAtRaw).toISOString() : previous?.limit || "";
  const conversationsRaw = extractString(detail, ["conversaciones"]) || extractString(previousRaw, ["conversaciones"]) || "0";
  const conversations = Number.parseInt(conversationsRaw, 10);
  const canViewSensitiveFields =
    extractUnknown(detail, ["can_view_sensitive_fields"]) === true ||
    extractUnknown(previousRaw, ["can_view_sensitive_fields"]) === true;

  return {
    id: (previous?.id ?? Number.parseInt(contactId, 10)) || 0,
    header: getContactDisplayName(detail) || previous?.header || "Contacto sin nombre",
    type: normalizeLabel(extractString(detail, ["estado"]) || previous?.type),
    status: isCaptureComplete({
      ...((previous?.raw ?? {}) as Record<string, unknown>),
      ...detail,
    })
      ? "Done"
      : previous?.status || "In Process",
    target: Number.isFinite(conversations) ? String(conversations) : previous?.target || "0",
    limit: createdAt,
    reviewer: extractString(detail, ["propietario_nombre"]) || previous?.reviewer || "Sin asignar",
    raw: {
      ...(previous?.raw ?? {}),
      ...detail,
      persona_id: contactId || extractString(previousRaw, ["persona_id"]) || extractString(previousRaw, ["contacto_id"]) || "",
      contacto_id: contactId || extractString(previousRaw, ["contacto_id"]) || "",
      codigo_contacto: extractString(detail, ["codigo_contacto"]) || extractString(previousRaw, ["codigo_contacto"]) || "",
      nombre_nombres: extractString(detail, ["nombre_nombres"]) || extractString(previousRaw, ["nombre_nombres"]) || "",
      apellido_paterno: extractString(detail, ["apellido_paterno"]) || extractString(previousRaw, ["apellido_paterno"]) || "",
      apellido_materno: extractString(detail, ["apellido_materno"]) || extractString(previousRaw, ["apellido_materno"]) || "",
      nombre_completo: extractString(detail, ["nombre_completo"]) || extractString(previousRaw, ["nombre_completo"]) || "",
      propietario_id: extractString(detail, ["propietario_id"]) || extractString(previousRaw, ["propietario_id"]) || "",
      propietario_nombre: extractString(detail, ["propietario_nombre"]) || extractString(previousRaw, ["propietario_nombre"]) || "",
      company_name: extractString(detail, ["company_name"]) || extractString(previousRaw, ["company_name"]) || "",
      cuenta_id: extractString(detail, ["cuenta_id"]) || extractString(previousRaw, ["cuenta_id"]) || "",
      cuenta_tipo: extractString(detail, ["cuenta_tipo"]) || extractString(previousRaw, ["cuenta_tipo"]) || "",
      correo:
        getContactEmailValue(detail) ||
        getContactEmailValue(previousRaw) ||
        extractString(previousRaw, ["correo"]) ||
        "",
      correo_principal:
        extractString(detail, ["correo_principal"]) ||
        extractString(previousRaw, ["correo_principal"]) ||
        "",
      correo_secundario:
        extractString(detail, ["correo_secundario"]) ||
        extractString(previousRaw, ["correo_secundario"]) ||
        "",
      correo_institucional:
        extractString(detail, ["correo_institucional"]) ||
        extractString(previousRaw, ["correo_institucional"]) ||
        "",
      email:
        getContactEmailValue(detail) ||
        getContactEmailValue(previousRaw) ||
        extractString(previousRaw, ["email"]) ||
        "",
      estado: extractString(detail, ["estado"]) || extractString(previousRaw, ["estado"]) || "",
      captura_estado: extractString(detail, ["captura_estado"]) || extractString(previousRaw, ["captura_estado"]) || "",
      creado_en: extractString(detail, ["creado_en"]) || extractString(previousRaw, ["creado_en"]) || "",
      actualizado_en: extractString(detail, ["actualizado_en"]) || extractString(previousRaw, ["actualizado_en"]) || "",
      cuenta_creado_en: extractString(detail, ["cuenta_creado_en"]) || extractString(previousRaw, ["cuenta_creado_en"]) || "",
      tipo_industria: extractString(detail, ["tipo_industria"]) || extractString(previousRaw, ["tipo_industria"]) || "",
      tamano: extractString(detail, ["tamano"]) || extractString(previousRaw, ["tamano"]) || "",
      relacion_activa: extractUnknown(detail, ["relacion_activa"]) ?? extractUnknown(previousRaw, ["relacion_activa"]),
      conversaciones: Number.isFinite(conversations) ? conversations : 0,
      can_view_sensitive_fields: canViewSensitiveFields,
    },
  };
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

const CONTACT_COLUMNS: Array<{
  id: string;
  label: string;
  sortValue: (row: TableRow) => string | number;
  accessor: (row: TableRow) => React.ReactNode;
  defaultVisible?: boolean;
}> = [
  {
    id: "contact_id",
    label: "Id Contacto",
    sortValue: (row) => getContactIdValue(row),
    accessor: (row) => <span className="font-mono text-xs">{getContactIdValue(row)}</span>,
    defaultVisible: true,
  },
  {
    id: "contact_name",
    label: "Nombre contacto",
    sortValue: (row) => (canViewContactSensitiveRow(row) ? row.header : ""),
    accessor: (row) => <span className="font-medium">{canViewContactSensitiveRow(row) ? row.header : "—"}</span>,
    defaultVisible: true,
  },
  {
    id: "contact_account_code",
    label: "Id Empresa",
    sortValue: (row) => formatContactValue((row.raw as Record<string, unknown> | undefined)?.codigo_cuenta),
    accessor: (row) => {
      const raw = row.raw as Record<string, unknown> | undefined;
      return <span className="font-mono text-xs">{formatContactValue(raw?.codigo_cuenta)}</span>;
    },
    defaultVisible: true,
  },
  {
    id: "contact_company",
    label: "Nombre empresa",
    sortValue: (row) => formatContactValue((row.raw as Record<string, unknown> | undefined)?.company_name),
    accessor: (row) => {
      const raw = row.raw as Record<string, unknown> | undefined;
      return <span>{formatContactValue(raw?.company_name)}</span>;
    },
    defaultVisible: true,
  },
  {
    id: "contact_phone",
    label: "Teléfono",
    sortValue: (row) => {
      if (!canViewContactSensitiveRow(row)) return "";
      const raw = row.raw as Record<string, unknown> | undefined;
      return formatContactValue(raw?.telefono);
    },
    accessor: (row) => {
      if (!canViewContactSensitiveRow(row)) {
        return <span>—</span>;
      }
      const raw = row.raw as Record<string, unknown> | undefined;
      const phone = formatContactValue(raw?.telefono);
      return phone !== "—" ? (
        <a href={`tel:${phone}`} className="text-primary underline-offset-2 hover:underline">{phone}</a>
      ) : (
        <span>{phone}</span>
      );
    },
    defaultVisible: true,
  },
  {
    id: "contact_email",
    label: "Email",
    sortValue: (row) => {
      if (!canViewContactSensitiveRow(row)) return "";
      const raw = row.raw as Record<string, unknown> | undefined;
      return formatContactValue(raw?.correo);
    },
    accessor: (row) => {
      if (!canViewContactSensitiveRow(row)) {
        return <span>—</span>;
      }
      const raw = row.raw as Record<string, unknown> | undefined;
      const email = formatContactValue(raw?.correo);
      return email !== "—" ? (
        <a href={`mailto:${email}`} className="text-primary underline-offset-2 hover:underline">{email}</a>
      ) : (
        <span>{email}</span>
      );
    },
    defaultVisible: true,
  },
  {
    id: "contact_owner",
    label: "Propietario",
    sortValue: (row) => formatContactValue((row.raw as Record<string, unknown> | undefined)?.propietario_nombre),
    accessor: (row) => {
      const raw = row.raw as Record<string, unknown> | undefined;
      return <span>{formatContactValue(raw?.propietario_nombre)}</span>;
    },
    defaultVisible: true,
  },
  {
    id: "contact_created_at",
    label: "Creado en",
    sortValue: (row) => formatContactValue((row.raw as Record<string, unknown> | undefined)?.creado_en),
    accessor: (row) => {
      const raw = row.raw as Record<string, unknown> | undefined;
      return <span className="tabular-nums">{formatDate(raw?.creado_en)}</span>;
    },
    defaultVisible: true,
  },
];

const contactExtraColumns: ColumnDef<TableRow>[] = CONTACT_COLUMNS.map((column) => ({
  id: column.id,
  header: ({ column: tableColumn }) => <SortButton column={tableColumn} label={column.label} />,
  accessorFn: (row: TableRow) => column.sortValue(row),
  cell: ({ row }) => column.accessor(row.original),
  enableHiding: true,
  meta: { label: column.label },
}));

const contactColumnLabels = {
  header: "Nombre contacto",
  type: "Id Empresa",
  status: "Nombre empresa",
  target: "Teléfono",
  reviewer: "Email",
} as const;

const CONTACT_ORIGIN_OPTIONS = [
  { value: "prospeccion_propia", label: "Prospección propia" },
  { value: "referido_cliente", label: "Referido cliente" },
  { value: "llamada_entrante", label: "Llamada entrante" },
  { value: "visita_oficina", label: "Visita oficina" },
  { value: "evento_feria", label: "Evento o feria" },
  { value: "redes_sociales", label: "Redes sociales" },
  { value: "importacion", label: "Importación" },
] as const;

const CONTACT_STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "activo", label: "Activo" },
  { value: "inactivo", label: "Inactivo" },
] as const;

const BOOLEAN_FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "si", label: "Sí" },
  { value: "no", label: "No" },
] as const;

const ACCOUNT_TYPE_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "empresa", label: "Empresa" },
  { value: "persona_fisica_actividad_empresarial", label: "Persona física con actividad empresarial" },
] as const;

const CONTACT_FILTERS_STORAGE_KEY = "contacts-view-filters";

type StoredContactFilters = {
  searchTerm: string;
  ownerFilter: string;
  createdFromFilter: string;
  createdToFilter: string;
  advancedFilters: ContactAdvancedFilters;
};

function isStoredContactFilters(value: unknown): value is StoredContactFilters {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.searchTerm === "string" &&
    typeof record.ownerFilter === "string" &&
    typeof record.createdFromFilter === "string" &&
    typeof record.createdToFilter === "string" &&
    typeof record.advancedFilters === "object" &&
    record.advancedFilters !== null
  );
}

function getContactFiltersStorageKey(tenantKey: string): string {
  const normalized = tenantKey.trim();
  return normalized ? `${CONTACT_FILTERS_STORAGE_KEY}:${normalized}` : CONTACT_FILTERS_STORAGE_KEY;
}

export function ContactsDataTable({
  data,
  onFiltersChange,
  onVisibleRowsChange,
  onContactsDeleted,
  loading = false,
}: {
  data: ContactTableRow[];
  onFiltersChange?: (filters: ContactFilters) => void;
  onVisibleRowsChange?: (rows: ContactTableRow[]) => void;
  onContactsDeleted?: (keys: string[]) => void;
  loading?: boolean;
}) {
  const router = useRouter();
  const { context: permissionContext, loading: permissionsLoading } = usePermissions();
  const tenantKey = permissionContext.organizacion_id?.trim() || "unknown";
  const [tableRows, setTableRows] = React.useState<ContactTableRow[]>(data);
  const [filtersHydrated, setFiltersHydrated] = React.useState(false);
  const normalizedPerms = React.useMemo(
    () => (permissionContext.permisos ?? []).map((perm) => perm.toLowerCase()),
    [permissionContext.permisos],
  );
  const canExportCsv =
    permissionContext.es_admin ||
    permissionContext.es_owner ||
    normalizedPerms.includes("contacts.export_csv");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [ownerFilter, setOwnerFilter] = React.useState("all");
  const [createdFromFilter, setCreatedFromFilter] = React.useState("");
  const [createdToFilter, setCreatedToFilter] = React.useState("");
  const [advancedFilters, setAdvancedFilters] = React.useState<ContactAdvancedFilters>(() => cloneDefaultAdvancedFilters());
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [remoteSearchData, setRemoteSearchData] = React.useState<ContactTableRow[] | null>(null);
  const [remoteSearchTotalRows, setRemoteSearchTotalRows] = React.useState<number | null>(null);
  const [remoteSearchQuery, setRemoteSearchQuery] = React.useState("");
  const [remoteSearchLoading, setRemoteSearchLoading] = React.useState(false);
  const [remoteSearchError, setRemoteSearchError] = React.useState<string | null>(null);
  const tenantCatalogs = useTenantContactCatalogs();

  React.useEffect(() => {
    setTableRows(data);
  }, [data]);

  const canWrite =
    permissionContext.es_admin || permissionContext.es_owner || normalizedPerms.includes("contacts.write");
  const currentUserId = permissionContext.usuario_id?.trim() || null;
  const hasSalesRole = isSalesLevelRole(permissionContext.roles);
  const canEditAny =
    permissionContext.es_admin ||
    permissionContext.es_owner ||
    normalizedPerms.includes("contacts.write") ||
    hasSalesRole;
  const canDeleteAny =
    permissionContext.es_admin || permissionContext.es_owner || normalizedPerms.includes("contacts.delete");
  const canEditContactRow = React.useCallback(
    (row: TableRow) => {
      if (permissionContext.es_admin || permissionContext.es_owner) return true;
      if (!canEditAny || !currentUserId) return false;
      const ownerId = getContactOwnerId(row.raw as Record<string, unknown> | undefined);
      return Boolean(ownerId) && ownerId === currentUserId;
    },
    [canEditAny, currentUserId, permissionContext.es_admin, permissionContext.es_owner],
  );
  const canDeleteContactRow = React.useCallback((row: TableRow) => {
    void row;
    return canDeleteAny;
  }, [canDeleteAny]);
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
  const [createInitialMode, setCreateInitialMode] = React.useState<
    "empresa_existente" | "empresa_nueva" | "persona_fisica_actividad_empresarial"
  >("empresa_existente");
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkInitialContact, setLinkInitialContact] = React.useState<{
    id: string;
    label: string;
    company?: string | null;
    correo?: string | null;
    telefono?: string | null;
  } | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const [bulkDeleteIds, setBulkDeleteIds] = React.useState<string[]>([]);

  const [activeRow, setActiveRow] = React.useState<TableRow | null>(null);

  const [selectedVendorId, setSelectedVendorId] = React.useState("");
  const [vendorOptions, setVendorOptions] = React.useState<SalesRepOption[]>([]);
  const [vendorLoading, setVendorLoading] = React.useState(false);
  const [vendorError, setVendorError] = React.useState<string | null>(null);

  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const searchQuery = searchTerm.trim();

  React.useEffect(() => {
    if (permissionsLoading) return;
    const storageKey = getContactFiltersStorageKey(tenantKey);
    const stored = (() => {
      if (typeof window === "undefined") return null;
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!isStoredContactFilters(parsed)) return null;
        return {
          searchTerm: parsed.searchTerm,
          ownerFilter: parsed.ownerFilter,
          createdFromFilter: parsed.createdFromFilter,
          createdToFilter: parsed.createdToFilter,
          advancedFilters: { ...cloneDefaultAdvancedFilters(), ...parsed.advancedFilters },
        } as StoredContactFilters;
      } catch {
        return null;
      }
    })();
    if (stored) {
      setSearchTerm(stored.searchTerm);
      setOwnerFilter(stored.ownerFilter);
      setCreatedFromFilter(stored.createdFromFilter);
      setCreatedToFilter(stored.createdToFilter);
      setAdvancedFilters(stored.advancedFilters);
    } else {
      setSearchTerm("");
      setOwnerFilter("all");
      setCreatedFromFilter("");
      setCreatedToFilter("");
      setAdvancedFilters(cloneDefaultAdvancedFilters());
    }
    setFiltersHydrated(true);
  }, [permissionsLoading, tenantKey]);

  React.useEffect(() => {
    if (!filtersHydrated || typeof window === "undefined") return;
    try {
      const storageKey = getContactFiltersStorageKey(tenantKey);
      const payload: StoredContactFilters = {
        searchTerm,
        ownerFilter,
        createdFromFilter,
        createdToFilter,
        advancedFilters,
      };
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Ignore persistence failures.
    }
  }, [advancedFilters, createdFromFilter, createdToFilter, filtersHydrated, ownerFilter, searchTerm, tenantKey]);

  React.useEffect(() => {
    if (!filtersHydrated) return;
    onFiltersChange?.({
      search: searchQuery,
      owner: ownerFilter,
      createdFrom: createdFromFilter,
      createdTo: createdToFilter,
      advanced: advancedFilters,
    });
  }, [advancedFilters, createdFromFilter, createdToFilter, filtersHydrated, onFiltersChange, ownerFilter, searchQuery]);

  React.useEffect(() => {
    if (!filtersHydrated) return;
    const term = searchQuery;
    if (term.length < 2) {
      setRemoteSearchData(null);
      setRemoteSearchTotalRows(null);
      setRemoteSearchQuery("");
      setRemoteSearchError(null);
      setRemoteSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    setRemoteSearchLoading(true);
    setRemoteSearchError(null);

    const timeout = window.setTimeout(async () => {
      try {
        const params = buildListParams(
          {
            search: term,
            owner: ownerFilter,
            createdFrom: createdFromFilter,
            createdTo: createdToFilter,
            advanced: advancedFilters,
          },
          500,
        );
        const response = await fetch(`/api/personas/list?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `Error ${response.status}`);
        }
        const body = (await response.json()) as {
          items?: ContactTableRow[];
          totalRows?: number;
        };
        setRemoteSearchData(Array.isArray(body.items) ? body.items : []);
        setRemoteSearchTotalRows(typeof body.totalRows === "number" ? body.totalRows : null);
        setRemoteSearchQuery(term);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setRemoteSearchData(null);
          setRemoteSearchTotalRows(null);
          setRemoteSearchQuery("");
          setRemoteSearchError(error instanceof Error ? error.message : "No se pudo buscar contactos.");
        }
      } finally {
        setRemoteSearchLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [advancedFilters, createdFromFilter, createdToFilter, filtersHydrated, ownerFilter, searchQuery]);

  React.useEffect(() => {
    if (permissionsLoading || !canReassign) {
      setVendorOptions([]);
      setVendorError(null);
      return;
    }
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
  }, [permissionsLoading, canReassign, canReassignAny, tenantKey]);

  const [editPersonaId, setEditPersonaId] = React.useState<string | null>(null);
  const activeRaw = React.useMemo(() => (activeRow?.raw ?? {}) as Record<string, unknown>, [activeRow?.raw]);
  const activePersonaId =
    extractString(activeRaw, ["persona_id"]) ??
    extractString(activeRaw, ["contacto_id"]) ??
    extractString(activeRaw, ["id"]);
  const activeContactDeleteKey =
    extractString(activeRaw, ["codigo_contacto"]) ?? activePersonaId;
  const activePropietarioId = getContactOwnerId(activeRaw);

  const openEdit = (row: TableRow) => {
    const raw = (row.raw ?? {}) as Record<string, unknown>;
    const personaId =
      extractString(raw, ["persona_id"]) ??
      extractString(raw, ["contacto_id"]) ??
      extractString(raw, ["id"]);
    setActiveRow(row);
    setEditPersonaId(personaId);
    setError(null);
    setSuccess(null);
    setEditOpen(true);
  };

  const refreshContactRow = React.useCallback(async (personaId: string) => {
    const id = personaId.trim();
    if (!id) {
      router.refresh();
      return;
    }
    try {
      const response = await fetch('/api/personas/' + encodeURIComponent(id), { cache: 'no-store' });
      if (!response.ok) {
        router.refresh();
        return;
      }
      const detail = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const updateRows = (rows: ContactTableRow[]) =>
        rows.map((row) => {
          const rowRaw = row.raw as Record<string, unknown> | undefined;
          const rowId = extractString(rowRaw, ["persona_id"]) || extractString(rowRaw, ["contacto_id"]) || extractString(rowRaw, ["id"]);
          if (rowId !== id) {
            return row;
          }
          return mapContactDetailToTableRow(detail, row);
        });
      const hasRow = (rows: ContactTableRow[]) =>
        rows.some((row) => {
          const rowRaw = row.raw as Record<string, unknown> | undefined;
          return extractString(rowRaw, ["persona_id"]) === id || extractString(rowRaw, ["contacto_id"]) === id || extractString(rowRaw, ["id"]) === id;
        });
      setTableRows((current) => {
        const replaced = updateRows(current);
        if (!hasRow(current)) {
          const nextRow = mapContactDetailToTableRow(detail, null);
          return [nextRow, ...current];
        }
        return replaced;
      });
      setRemoteSearchData((current) => {
        if (!current || remoteSearchQuery !== searchQuery) {
          return current;
        }
        return updateRows(current);
      });
      router.refresh();
    } catch {
      router.refresh();
    }
  }, [remoteSearchQuery, router, searchQuery]);

  const handleCreated = React.useCallback(
    (personaId: string) => {
      setError(null);
      setSuccess(null);
      void refreshContactRow(personaId);
    },
    [refreshContactRow],
  );

  const openLinkFlow = (row?: TableRow | null) => {
    if (!row) {
      setLinkInitialContact(null);
      setLinkOpen(true);
      return;
    }
    const raw = (row.raw ?? {}) as Record<string, unknown>;
    const personaId =
      extractString(raw, ["persona_id"]) ??
      extractString(raw, ["contacto_id"]) ??
      extractString(raw, ["id"]);
    if (!personaId) return;
    setLinkInitialContact({
      id: personaId,
      label: row.header,
      company: extractString(raw, ["company_name"]),
      correo: extractString(raw, ["correo"]),
      telefono: extractString(raw, ["telefono"]),
    });
    setLinkOpen(true);
  };

  const extraColumns = React.useMemo<ColumnDef<TableRow>[]>(() => {
    const actionColumn: ColumnDef<TableRow> = {
      id: "acciones",
      header: "Acciones",
      cell: ({ row }: { row: { original: TableRow } }) => (
        <div className="flex justify-end gap-1">
          {canEditContactRow(row.original) ? (
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
                const ownerId = getContactOwnerId(row.original.raw as Record<string, unknown> | undefined);
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
          {canDeleteContactRow(row.original) ? (
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
    };

    if (!canWrite && !canReassign && !canEditAny && !canDeleteAny) return contactExtraColumns;

    return [actionColumn, ...contactExtraColumns];
  }, [canWrite, canReassign, canEditAny, canDeleteAny, canEditContactRow, canDeleteContactRow]);

  const contactColumnOrder = React.useMemo(
    () => [
      "contact_id",
      "contact_name",
      "contact_account_code",
      "contact_company",
      "contact_phone",
      "contact_email",
      "contact_owner",
      "contact_created_at",
      "acciones",
    ],
    [],
  );

  const contactVisibility = React.useMemo(
    () => ({
      session: false,
      type: false,
      chat: false,
      visits: false,
      reviewer: false,
      contact_id: true,
      contact_name: true,
      contact_account_code: true,
      contact_company: true,
      contact_phone: true,
      contact_email: true,
      contact_owner: true,
      contact_created_at: true,
      acciones: true,
    }),
    [],
  );

  const runAndReload = async (fn: () => Promise<void>) => {
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      await fn();
      setSuccess("Operación realizada.");
      setTimeout(() => router.refresh(), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operación fallida.");
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async () => {
    const deleteKey = activeContactDeleteKey?.trim();
    if (!deleteKey) {
      setError("No se encontró la persona a eliminar.");
      return;
    }
    await runAndReload(async () => {
      const response = await fetch(`/api/contactos/${encodeURIComponent(deleteKey)}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
      setDeleteOpen(false);
      setTableRows((current) =>
        current.filter((row) => {
          const rowRaw = row.raw as Record<string, unknown> | undefined;
          const rowKeys = new Set([
            extractString(rowRaw, ["codigo_contacto"]),
            extractString(rowRaw, ["persona_id"]),
            extractString(rowRaw, ["contacto_id"]),
            extractString(rowRaw, ["id"]),
          ].filter((value): value is string => Boolean(value)));
          return !rowKeys.has(deleteKey);
        }),
      );
      onContactsDeleted?.([deleteKey]);
    });
  };

  const handleOpenBulkDelete = (selectedRows: TableRow[]) => {
    const ids = selectedRows
      .map(
        (row) =>
          extractString(row.raw as Record<string, unknown> | undefined, ["codigo_contacto"]) ??
          extractString(row.raw as Record<string, unknown> | undefined, ["persona_id"]) ??
          extractString(row.raw as Record<string, unknown> | undefined, ["contacto_id"]) ??
          extractString(row.raw as Record<string, unknown> | undefined, ["id"]),
      )
      .filter((value): value is string => Boolean(value));
    if (!ids.length) return;
    setBulkDeleteIds(ids);
    setError(null);
    setSuccess(null);
    setBulkDeleteOpen(true);
  };

  const handleBulkDelete = async () => {
    if (!bulkDeleteIds.length) {
      setError("No se encontraron contactos seleccionados.");
      return;
    }
    setBulkDeleteOpen(false);
    await runAndReload(async () => {
      const response = await fetch("/api/personas/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: bulkDeleteIds }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
      setTableRows((current) =>
        current.filter((row) => {
          const rowRaw = row.raw as Record<string, unknown> | undefined;
          const rowKeys = new Set([
            extractString(rowRaw, ["codigo_contacto"]),
            extractString(rowRaw, ["persona_id"]),
            extractString(rowRaw, ["contacto_id"]),
            extractString(rowRaw, ["id"]),
          ].filter((value): value is string => Boolean(value)));
          return !bulkDeleteIds.some((deleteKey) => rowKeys.has(deleteKey));
        }),
      );
      onContactsDeleted?.(bulkDeleteIds);
    });
    setBulkDeleteIds([]);
  };

  const handleReassign = async () => {
    if (!activePersonaId || !selectedVendorId) return;
    await runAndReload(async () => {
      const response = await fetch(`/api/personas/${activePersonaId}/reassign`, {
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

  const sourceData = React.useMemo(() => {
    if (!searchQuery) return tableRows;
    if (remoteSearchQuery === searchQuery) {
      return remoteSearchData ?? [];
    }
    return [];
  }, [remoteSearchData, remoteSearchQuery, searchQuery, tableRows]);

  const ownerOptions = React.useMemo(() => {
    const options = new Map<string, string>();
    for (const vendor of vendorOptions) {
      if (!vendor || typeof vendor !== "object") continue;
      if (!vendor.id) continue;
      options.set(vendor.id, vendor.label);
    }
    for (const row of sourceData) {
      const raw = row.raw as Record<string, unknown> | undefined;
      const ownerKey = getOwnerFilterKey(raw);
      if (!ownerKey || options.has(ownerKey)) continue;
      options.set(ownerKey, getOwnerFilterLabel(raw));
    }
    if (ownerFilter !== "all" && ownerFilter !== "unassigned" && !options.has(ownerFilter)) {
      options.set(ownerFilter, ownerFilter);
    }
    return Array.from(options.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "es"));
  }, [ownerFilter, sourceData, vendorOptions]);

  const activeAdvancedFilterCount = React.useMemo(() => countAdvancedFilterSelections(advancedFilters), [advancedFilters]);
  const puestoOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.puestoOptions, advancedFilters.puesto),
    [advancedFilters.puesto, tenantCatalogs.puestoOptions],
  );
  const rolDecisionOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.rolDecisionOptions, advancedFilters.rolDecision),
    [advancedFilters.rolDecision, tenantCatalogs.rolDecisionOptions],
  );
  const clasificacionOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.clasificacionNegocioOptions, advancedFilters.clasificacion),
    [advancedFilters.clasificacion, tenantCatalogs.clasificacionNegocioOptions],
  );
  const tamanoOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.tamanoOptions, advancedFilters.tamano),
    [advancedFilters.tamano, tenantCatalogs.tamanoOptions],
  );

  const filteredData = React.useMemo(() => {
    const createdFrom = parseDateInput(createdFromFilter, "start");
    const createdTo = parseDateInput(createdToFilter, "end");

    return sourceData.filter((row) => {
      const raw = row.raw as Record<string, unknown> | undefined;
      if (ownerFilter !== "all" && getOwnerFilterKey(raw) !== ownerFilter) {
        return false;
      }
      const createdAt = getRowCreatedAt(raw);
      if (createdFrom !== null && createdAt !== null && createdAt < createdFrom) {
        return false;
      }
      if (createdFrom !== null && createdAt === null) {
        return false;
      }
      if (createdTo !== null && createdAt !== null && createdAt > createdTo) {
        return false;
      }
      if (createdTo !== null && createdAt === null) {
        return false;
      }
      if (!matchesAdvancedFilters(raw, advancedFilters)) {
        return false;
      }
      return true;
    });
  }, [advancedFilters, createdFromFilter, createdToFilter, ownerFilter, sourceData]);

  React.useEffect(() => {
    onVisibleRowsChange?.(filteredData);
  }, [filteredData, onVisibleRowsChange]);

  const resultsLabel =
    loading && !tableRows.length && !searchQuery
      ? "Cargando contactos..."
      : searchQuery.length > 0
        ? remoteSearchLoading
          ? "Buscando contactos..."
          : remoteSearchError
            ? remoteSearchError
            : remoteSearchTotalRows !== null
              ? `${filteredData.length} de ${remoteSearchTotalRows} contactos`
              : `${filteredData.length} contactos`
        : createdFromFilter || createdToFilter || ownerFilter !== "all" || activeAdvancedFilterCount > 0
          ? `${filteredData.length} de ${sourceData.length} contactos`
          : `${tableRows.length} contactos`;

  const toolbarLeadingActions = (
    <div className="flex w-full flex-wrap items-center gap-2">
      <div className="text-sm text-muted-foreground">{resultsLabel}</div>
      {activeAdvancedFilterCount > 0 ? (
        <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
          {activeAdvancedFilterCount} filtros avanzados
        </Badge>
      ) : null}
    </div>
  );

  const toolbarBelowActions = (
    <div className="rounded-xl border bg-muted/20 p-3 shadow-sm">
      <div className="grid gap-2 lg:grid-cols-[320px_200px_160px_160px_auto_auto]">
        <div className="grid min-w-0 gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Búsqueda</Label>
          <div className="relative">
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Nombre, correo, teléfono, empresa o código"
              aria-label="Buscar contacto"
              className="min-w-0 pr-24"
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
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Propietario</Label>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="h-9 w-full min-w-0">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="unassigned">Sin asignar</SelectItem>
              {ownerOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="created-from-filter" className="text-xs font-medium text-muted-foreground">
            Creado desde
          </Label>
          <Input
            id="created-from-filter"
            type="date"
            value={createdFromFilter}
            onChange={(event) => setCreatedFromFilter(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="created-to-filter" className="text-xs font-medium text-muted-foreground">
            Creado hasta
          </Label>
          <Input
            id="created-to-filter"
            type="date"
            value={createdToFilter}
            onChange={(event) => setCreatedToFilter(event.target.value)}
          />
        </div>
        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setOwnerFilter("all");
              setCreatedFromFilter("");
              setCreatedToFilter("");
              setSearchTerm("");
              setAdvancedFilters(cloneDefaultAdvancedFilters());
            }}
          >
            Limpiar filtros
          </Button>
        </div>
        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => setAdvancedOpen(true)}
          >
            <IconAdjustmentsHorizontal className="size-4" />
            Filtros avanzados
          </Button>
        </div>
      </div>
    </div>
  );

  const toolbarActions = (
    <div className="flex flex-wrap items-center gap-2">
      {canWrite ? (
        <>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setError(null);
              setSuccess(null);
              setCreateInitialMode("empresa_existente");
              setCreateOpen(true);
            }}
          >
            Nuevo contacto
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null);
              setSuccess(null);
              setCreateInitialMode("empresa_nueva");
              setCreateOpen(true);
            }}
          >
            Nueva empresa
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null);
              setSuccess(null);
              setCreateInitialMode("persona_fisica_actividad_empresarial");
              setCreateOpen(true);
            }}
          >
            Persona física con actividad empresarial
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setError(null);
              setSuccess(null);
              openLinkFlow(null);
            }}
          >
            Vincular contacto a empresa
          </Button>
        </>
      ) : null}
      {canExportCsv ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const exportUrl = new URL("/api/personas/export", window.location.origin);
            buildListParams(
              {
                search: searchTerm.trim(),
                owner: ownerFilter,
                createdFrom: createdFromFilter,
                createdTo: createdToFilter,
                advanced: advancedFilters,
              },
              500,
            ).forEach((value, key) => {
              exportUrl.searchParams.set(key, value);
            });
            const anchor = document.createElement("a");
            anchor.href = exportUrl.toString();
            anchor.rel = "noreferrer";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
          }}
        >
          <IconDownload className="size-4" />
          Exportar CSV
        </Button>
      ) : null}
    </div>
  );

  const advancedFiltersDialog = (
    <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Filtros avanzados</DialogTitle>
          <DialogDescription>
            Los filtros de búsqueda, propietario y fechas de creación siguen disponibles en la barra superior.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <section className="space-y-4 rounded-xl border bg-muted/20 p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Vendedores</h3>
              <p className="text-xs text-muted-foreground">Filtra por el vendedor asignado al contacto.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Propietario</Label>
                <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="unassigned">Sin asignar</SelectItem>
                    {ownerOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Ligado</Label>
                <Select
                  value={advancedFilters.ligado}
                  onValueChange={(value) => setAdvancedFilters((current) => ({ ...current, ligado: value as ContactAdvancedFilters["ligado"] }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOLEAN_FILTER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border bg-muted/20 p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Área Contactos</h3>
              <p className="text-xs text-muted-foreground">Origen, cargo, rol, estado y fechas de creación.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Origen</Label>
                <Select
                  value={advancedFilters.origen || "all"}
                  onValueChange={(value) => setAdvancedFilters((current) => ({ ...current, origen: value === "all" ? "" : value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {CONTACT_ORIGIN_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Puesto</Label>
                <ContactCatalogSelect
                  value={advancedFilters.puesto}
                  onValueChange={(value) => setAdvancedFilters((current) => ({ ...current, puesto: value }))}
                  options={puestoOptions}
                  placeholder={tenantCatalogs.loading ? "Cargando catálogo..." : "Todos"}
                  emptyLabel="Sin opciones configuradas"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Rol de decisión</Label>
                <ContactCatalogSelect
                  value={advancedFilters.rolDecision}
                  onValueChange={(value) => setAdvancedFilters((current) => ({ ...current, rolDecision: value }))}
                  options={rolDecisionOptions}
                  placeholder={tenantCatalogs.loading ? "Cargando catálogo..." : "Todos"}
                  emptyLabel="Sin opciones configuradas"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Estado</Label>
                <Select
                  value={advancedFilters.estadoContacto || "all"}
                  onValueChange={(value) =>
                    setAdvancedFilters((current) => ({ ...current, estadoContacto: value === "all" ? "" : value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value || "all"} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Captura completa</Label>
                <Select
                  value={advancedFilters.captura}
                  onValueChange={(value) =>
                    setAdvancedFilters((current) => ({ ...current, captura: value as ContactAdvancedFilters["captura"] }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOLEAN_FILTER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="adv-contact-created-from" className="text-xs font-medium text-muted-foreground">
                  Fecha de creación desde
                </Label>
                <Input
                  id="adv-contact-created-from"
                  type="date"
                  value={createdFromFilter}
                  onChange={(event) => setCreatedFromFilter(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="adv-contact-created-to" className="text-xs font-medium text-muted-foreground">
                  Fecha de creación hasta
                </Label>
                <Input
                  id="adv-contact-created-to"
                  type="date"
                  value={createdToFilter}
                  onChange={(event) => setCreatedToFilter(event.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border bg-muted/20 p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Área empresa y Persona física con actividad empresarial</h3>
              <p className="text-xs text-muted-foreground">Tipo de cuenta, tamaño, clasificación y fechas de incorporación.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Tipo de cuenta</Label>
                <Select
                  value={advancedFilters.tipoCuenta || "all"}
                  onValueChange={(value) =>
                    setAdvancedFilters((current) => ({ ...current, tipoCuenta: value === "all" ? "" : value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value || "all"} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Tamaño</Label>
                <ContactCatalogSelect
                  value={advancedFilters.tamano}
                  onValueChange={(value) => setAdvancedFilters((current) => ({ ...current, tamano: value }))}
                  options={tamanoOptions}
                  placeholder={tenantCatalogs.loading ? "Cargando catálogo..." : "Todos"}
                  emptyLabel="Sin opciones configuradas"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Clasificación</Label>
                <ContactCatalogSelect
                  value={advancedFilters.clasificacion}
                  onValueChange={(value) => setAdvancedFilters((current) => ({ ...current, clasificacion: value }))}
                  options={clasificacionOptions}
                  placeholder={tenantCatalogs.loading ? "Cargando catálogo..." : "Todos"}
                  emptyLabel="Sin opciones configuradas"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="adv-account-created-from" className="text-xs font-medium text-muted-foreground">
                  Fecha de creación desde
                </Label>
                <Input
                  id="adv-account-created-from"
                  type="date"
                  value={advancedFilters.fechaCreacionCuentaFrom}
                  onChange={(event) => setAdvancedFilters((current) => ({ ...current, fechaCreacionCuentaFrom: event.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="adv-account-created-to" className="text-xs font-medium text-muted-foreground">
                  Fecha de creación hasta
                </Label>
                <Input
                  id="adv-account-created-to"
                  type="date"
                  value={advancedFilters.fechaCreacionCuentaTo}
                  onChange={(event) => setAdvancedFilters((current) => ({ ...current, fechaCreacionCuentaTo: event.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="adv-incorp-from" className="text-xs font-medium text-muted-foreground">
                  Fecha de incorporación desde
                </Label>
                <Input
                  id="adv-incorp-from"
                  type="date"
                  value={advancedFilters.fechaIncorporacionFrom}
                  onChange={(event) => setAdvancedFilters((current) => ({ ...current, fechaIncorporacionFrom: event.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="adv-incorp-to" className="text-xs font-medium text-muted-foreground">
                  Fecha de incorporación hasta
                </Label>
                <Input
                  id="adv-incorp-to"
                  type="date"
                  value={advancedFilters.fechaIncorporacionTo}
                  onChange={(event) => setAdvancedFilters((current) => ({ ...current, fechaIncorporacionTo: event.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Fusionada</Label>
                <Select
                  value={advancedFilters.fusionada}
                  onValueChange={(value) => setAdvancedFilters((current) => ({ ...current, fusionada: value as ContactAdvancedFilters["fusionada"] }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOLEAN_FILTER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border bg-muted/20 p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Direcciones</h3>
              <p className="text-xs text-muted-foreground">País, estado y municipio del contacto o de su cuenta.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">País</Label>
                <Input
                  value={advancedFilters.pais}
                  onChange={(event) => setAdvancedFilters((current) => ({ ...current, pais: event.target.value }))}
                  placeholder="MX"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Estado</Label>
                <Input
                  value={advancedFilters.estadoDireccion}
                  onChange={(event) => setAdvancedFilters((current) => ({ ...current, estadoDireccion: event.target.value }))}
                  placeholder="Jalisco"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Municipio</Label>
                <Input
                  value={advancedFilters.municipio}
                  onChange={(event) => setAdvancedFilters((current) => ({ ...current, municipio: event.target.value }))}
                  placeholder="Guadalajara"
                />
              </div>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAdvancedFilters(cloneDefaultAdvancedFilters())}
          >
            Limpiar avanzados
          </Button>
          <Button type="button" variant="secondary" onClick={() => setAdvancedOpen(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const renderRowDetails = (row: TableRow) => (
    <ContactDetailPanel
      row={row}
      onEdit={() => openEdit(row)}
      canEdit={canEditContactRow(row)}
      onLink={() => openLinkFlow(row)}
      onReassign={() => {
        setActiveRow(row);
        const ownerId = getContactOwnerId(row.raw as Record<string, unknown> | undefined);
        setSelectedVendorId(ownerId ?? "");
        setError(null);
        setSuccess(null);
        setReassignOpen(true);
      }}
      canDelete={canDeleteContactRow(row)}
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
        forcedColumnOrder={contactColumnOrder}
        detailDescription="Detalle del contacto"
        toolbarLeadingActions={toolbarLeadingActions}
        toolbarBelowActions={toolbarBelowActions}
        renderRowDetails={renderRowDetails}
        hideDefaultActions
        initialVisibility={contactVisibility}
        storageKey="contacts-table-column-order"
        toolbarActions={toolbarActions}
        loading={loading && !filteredData.length}
        selectionActions={(selectedRows) => {
          if (!canWrite || !selectedRows.length) return null;
          if (!selectedRows.every((row) => canDeleteContactRow(row))) return null;
          return (
            <Button type="button" variant="destructive" size="sm" onClick={() => handleOpenBulkDelete(selectedRows)}>
              Eliminar seleccionados
            </Button>
          );
        }}
      />

      {advancedFiltersDialog}

      <ContactCreateFlow
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialMode={createInitialMode}
        onCreated={(personaId) => handleCreated(personaId)}
      />

      <ContactEditFlow
        open={editOpen}
        onOpenChange={setEditOpen}
        personaId={editPersonaId}
        onSaved={(personaId) => void refreshContactRow(personaId)}
      />

      <ContactLinkFlow
        open={linkOpen}
        onOpenChange={setLinkOpen}
        initialContact={linkInitialContact}
        onLinked={() => router.refresh()}
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

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar contactos seleccionados</DialogTitle>
            <DialogDescription>
              Esta acción elimina {bulkDeleteIds.length.toLocaleString("es-MX")} contacto
              {bulkDeleteIds.length === 1 ? "" : "s"} y no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Se eliminarán los contactos marcados en la tabla.
            </p>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="button" variant="destructive" disabled={pending} onClick={handleBulkDelete}>
                {pending ? "Eliminando..." : "Eliminar seleccionados"}
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setBulkDeleteOpen(false)}>
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

function getOwnerFilterKey(raw: Record<string, unknown> | undefined): string {
  const ownerId = extractFirstString(raw, ["propietario_id", "propietario_usuario_id"]);
  if (ownerId) return ownerId;
  const ownerName = extractString(raw, ["propietario_nombre"]);
  if (ownerName) return ownerName;
  return "unassigned";
}

function getOwnerFilterLabel(raw: Record<string, unknown> | undefined): string {
  return extractString(raw, ["propietario_nombre"]) || extractFirstString(raw, ["propietario_id", "propietario_usuario_id"]) || "Sin asignar";
}

function getRowCreatedAt(raw: Record<string, unknown> | undefined): number | null {
  const createdAt = extractFirstString(raw, ["creado_en"]);
  if (!createdAt) return null;
  const timestamp = Date.parse(createdAt);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isCaptureComplete(raw: Record<string, unknown> | undefined): boolean {
  if (!raw) return false;
  return [
    extractFirstString(raw, ["cuenta_tipo", "tipo"]) ?? "",
    extractFirstString(raw, ["tamano"]) ?? "",
    extractFirstString(raw, ["tipo_establecimiento"]) ?? "",
    extractFirstString(raw, ["estado"]) ?? "",
    extractFirstString(raw, ["origen"]) ?? "",
    extractFirstString(raw, ["puesto"]) ?? "",
    extractFirstString(raw, ["rol_decision"]) ?? "",
    extractFirstString(raw, ["area"]) ?? "",
  ].every((value) => value.trim().length > 0);
}

function formatContactValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("es-MX");
  }
  return String(value);
}

function canViewContactSensitiveRow(row: TableRow): boolean {
  const raw = (row.raw ?? {}) as Record<string, unknown>;
  return raw.can_view_sensitive_fields === true;
}

function ContactDetailPanel({
  row,
  onEdit,
  onLink,
  onReassign,
  onDelete,
  canEdit,
  canDelete,
}: {
  row: TableRow;
  onEdit: () => void;
  onLink: () => void;
  onReassign: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const raw = (row.raw ?? {}) as Record<string, unknown>;
  const canViewSensitiveFields = raw.can_view_sensitive_fields === true;

  const contactName = row.header;
  const contactId = formatContactValue(raw.id);
  const company = formatContactValue(raw.company_name);
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

  return (
    <div className="space-y-5 pb-6">
      <div className="rounded-xl border bg-muted/20 p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Vista secundaria</div>
        <div className="mt-1 text-sm text-muted-foreground">
          La ficha completa vive en su pantalla dedicada. Desde aquí solo puedes revisar lo esencial o saltar al detalle.
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {contactId !== "—" ? (
          <Button asChild size="sm">
            <Link href={`/personas/${encodeURIComponent(contactId)}`}>Abrir ficha</Link>
          </Button>
        ) : null}
        {canEdit ? (
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <IconPencil className="size-4" />
            Editar
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={onLink}>
          <IconLink className="size-4" />
          Vincular a empresa
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onReassign}>
          <IconArrowsLeftRight className="size-4" />
          Reasignar
        </Button>
        {canDelete ? (
          <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
            <IconTrash className="size-4" />
            Eliminar
          </Button>
        ) : null}
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
          <DetailItem icon={<IconBuilding className="size-4" />} label="Empresa" value={company} />
          <DetailItem icon={<IconUser className="size-4" />} label="Propietario" value={owner} />
          <DetailItem icon={<IconClock className="size-4" />} label="Último contacto" value={lastContact} />
          <DetailItem icon={<IconMessageCircle className="size-4" />} label="Conversaciones" value={conversations} />
          {canViewSensitiveFields ? (
            <>
              <DetailItem
                icon={<IconMail className="size-4" />}
                label="Correo"
                value={formatContactValue(raw.correo)}
                href={typeof raw.correo === "string" && raw.correo.trim() ? `mailto:${raw.correo.trim()}` : undefined}
              />
              <DetailItem
                icon={<IconPhone className="size-4" />}
                label="Teléfono"
                value={formatContactValue(raw.telefono)}
                href={typeof raw.telefono === "string" && raw.telefono.trim() ? `tel:${raw.telefono.trim()}` : undefined}
              />
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground sm:col-span-2">
              Los datos sensibles de contacto están ocultos por permisos.
            </div>
          )}
        </div>
      </div>
      <div className="rounded-xl border p-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Estado: {status}</Badge>
          <Badge variant="outline">Captura: {capture}</Badge>
          <Badge variant="outline">Origen: {origin}</Badge>
        </div>

        <Separator className="my-4" />

        <div className="grid gap-3 sm:grid-cols-2">
          <DetailItem label="Puesto" value={position} />
          <DetailItem label="Rol decisión" value={role} />
          <DetailItem label="Área" value={area} />
          {canViewSensitiveFields ? (
            <>
              <DetailItem label="C.P." value={formatContactValue(raw.codigo_postal)} />
              <DetailItem label="Municipio" value={formatContactValue(raw.municipio)} />
              <DetailItem label="Estado" value={formatContactValue(raw.entidad)} />
              <DetailItem label="País" value={formatContactValue(raw.pais)} />
              <DetailItem
                label="Sitio web"
                value={formatContactValue(raw.website)}
                href={typeof raw.website === "string" && raw.website.trim() ? raw.website.trim() : undefined}
              />
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground sm:col-span-2">
              Los datos de contacto y dirección están ocultos por permisos.
            </div>
          )}
        </div>

        <Separator className="my-4" />

        <div className="mb-2 text-sm font-medium">Notas</div>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {notes !== "—" ? notes : "Sin notas registradas."}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Para ver el registro completo, relaciones y acciones avanzadas, abre la ficha dedicada.
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
