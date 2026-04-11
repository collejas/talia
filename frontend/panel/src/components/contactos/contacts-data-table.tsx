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
import { Label } from "@/components/ui/label";
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
  clave_entidad: string;
  entidad: string;
  clave_municipio: string;
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
  clave_entidad: string;
  entidad: string;
  clave_municipio: string;
  municipio: string;
  pais: string;
  tipo_establecimiento: string;
};

type GeoCountryOption = {
  code: string;
  name: string;
  name_long?: string | null;
};

type GeoStateOption = {
  code: string;
  name: string;
};

type GeoMunicipalityOption = {
  state_code: string;
  code: string;
  cvegeo?: string | null;
  name: string;
};

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4 shadow-sm">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold leading-none">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  );
}

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
  clave_entidad: "",
  entidad: "",
  clave_municipio: "",
  municipio: "",
  pais: "MX",
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
  clave_entidad: "",
  entidad: "",
  clave_municipio: "",
  municipio: "",
  pais: "MX",
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

function normalizeGeoText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function isMexicoCountry(value: string): boolean {
  const normalized = normalizeGeoText(value);
  return normalized === "mx" || normalized === "mexico" || normalized === "mex";
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
  geoCountries,
  geoStates,
  geoMunicipalities,
  geoLoading,
}: {
  value: ContactDraft;
  onChange: React.Dispatch<React.SetStateAction<ContactDraft>>;
  geoCountries: GeoCountryOption[];
  geoStates: GeoStateOption[];
  geoMunicipalities: GeoMunicipalityOption[];
  geoLoading: boolean;
}) {
  const set = (field: keyof ContactDraft, next: string) => onChange((prev) => ({ ...prev, [field]: next }));
  const uid = React.useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const mexico = isMexicoCountry(value.pais);
  const selectedStateCode = React.useMemo(() => {
    if (value.clave_entidad.trim()) return value.clave_entidad.trim().padStart(2, "0");
    const byName = geoStates.find((item) => normalizeGeoText(item.name) === normalizeGeoText(value.entidad));
    return byName?.code ?? "";
  }, [geoStates, value.clave_entidad, value.entidad]);
  const selectedMunicipalityCode = React.useMemo(() => {
    if (value.clave_municipio.trim()) return value.clave_municipio.trim().padStart(3, "0");
    const byName = geoMunicipalities.find((item) => normalizeGeoText(item.name) === normalizeGeoText(value.municipio));
    return byName?.code ?? "";
  }, [geoMunicipalities, value.clave_municipio, value.municipio]);

  return (
    <div className="space-y-4">
      <FormSection
        title="Datos del contacto"
        description="Los campos muestran su nombre arriba para que el formulario siga siendo claro aunque ya esté lleno."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Tipo de persona" htmlFor={fieldId("persona_fisica_moral")}>
            <Select value={value.persona_fisica_moral || undefined} onValueChange={(v) => set("persona_fisica_moral", v)}>
              <SelectTrigger id={fieldId("persona_fisica_moral")}>
                <SelectValue placeholder="Selecciona una opción" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fisica">Física</SelectItem>
                <SelectItem value="moral">Moral</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Origen" hint="Fuente o canal por el que llegó el contacto." htmlFor={fieldId("origen")}>
            <Input id={fieldId("origen")} placeholder="manual_panel_contactos" value={value.origen} onChange={(e) => set("origen", e.target.value)} />
          </Field>
          <Field label="Nombres" htmlFor={fieldId("nombre_nombres")}>
            <Input id={fieldId("nombre_nombres")} placeholder="Nombres" value={value.nombre_nombres} onChange={(e) => set("nombre_nombres", e.target.value)} />
          </Field>
          <Field label="Apellido paterno" htmlFor={fieldId("apellido_paterno")}>
            <Input id={fieldId("apellido_paterno")} placeholder="Apellido paterno" value={value.apellido_paterno} onChange={(e) => set("apellido_paterno", e.target.value)} />
          </Field>
          <Field label="Apellido materno" htmlFor={fieldId("apellido_materno")}>
            <Input id={fieldId("apellido_materno")} placeholder="Apellido materno" value={value.apellido_materno} onChange={(e) => set("apellido_materno", e.target.value)} />
          </Field>
          <Field label="Nombre completo" htmlFor={fieldId("nombre_completo")} hint="Usa este campo si ya tienes el nombre consolidado.">
            <Input id={fieldId("nombre_completo")} placeholder="Nombre completo" value={value.nombre_completo} onChange={(e) => set("nombre_completo", e.target.value)} />
          </Field>
          <Field label="Correo" htmlFor={fieldId("correo")}>
            <Input id={fieldId("correo")} placeholder="correo@ejemplo.com" value={value.correo} onChange={(e) => set("correo", e.target.value)} />
          </Field>
          <Field label="Teléfono" htmlFor={fieldId("telefono_e164")} hint="Formato recomendado E.164, por ejemplo +5215555555555.">
            <Input id={fieldId("telefono_e164")} placeholder="+5215555555555" value={value.telefono_e164} onChange={(e) => set("telefono_e164", e.target.value)} />
          </Field>
          <Field label="Puesto" htmlFor={fieldId("puesto")}>
            <Input id={fieldId("puesto")} placeholder="Puesto" value={value.puesto} onChange={(e) => set("puesto", e.target.value)} />
          </Field>
          <Field label="Área" htmlFor={fieldId("area")}>
            <Input id={fieldId("area")} placeholder="Área" value={value.area} onChange={(e) => set("area", e.target.value)} />
          </Field>
          <Field label="Rol de decisión" htmlFor={fieldId("rol_decision")}>
            <Input id={fieldId("rol_decision")} placeholder="Rol de decisión" value={value.rol_decision} onChange={(e) => set("rol_decision", e.target.value)} />
          </Field>
          <Field label="Sitio web" htmlFor={fieldId("website")}>
            <Input id={fieldId("website")} placeholder="https://..." value={value.website} onChange={(e) => set("website", e.target.value)} />
          </Field>
          <Field label="Tipo de establecimiento" htmlFor={fieldId("tipo_establecimiento")}>
            <Input id={fieldId("tipo_establecimiento")} placeholder="Tipo de establecimiento" value={value.tipo_establecimiento} onChange={(e) => set("tipo_establecimiento", e.target.value)} />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Empresa y datos fiscales"
        description="Este bloque se usa cuando el contacto también representa a una empresa o una razón social."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Empresa" htmlFor={fieldId("company_name")}>
            <Input id={fieldId("company_name")} placeholder="Empresa" value={value.company_name} onChange={(e) => set("company_name", e.target.value)} />
          </Field>
          <Field label="Razón social" htmlFor={fieldId("razon_social")}>
            <Input id={fieldId("razon_social")} placeholder="Razón social" value={value.razon_social} onChange={(e) => set("razon_social", e.target.value)} />
          </Field>
          <Field label="RFC" htmlFor={fieldId("rfc")}>
            <Input id={fieldId("rfc")} placeholder="RFC" value={value.rfc} onChange={(e) => set("rfc", e.target.value)} />
          </Field>
          <Field label="Uso CFDI" htmlFor={fieldId("uso_cfdi")}>
            <Input id={fieldId("uso_cfdi")} placeholder="Uso CFDI" value={value.uso_cfdi} onChange={(e) => set("uso_cfdi", e.target.value)} />
          </Field>
          <Field label="Método de pago" htmlFor={fieldId("metodo_pago")}>
            <Input id={fieldId("metodo_pago")} placeholder="Método de pago" value={value.metodo_pago} onChange={(e) => set("metodo_pago", e.target.value)} />
          </Field>
          <Field label="Forma de pago" htmlFor={fieldId("forma_pago")}>
            <Input id={fieldId("forma_pago")} placeholder="Forma de pago" value={value.forma_pago} onChange={(e) => set("forma_pago", e.target.value)} />
          </Field>
          <Field label="Email de facturación" htmlFor={fieldId("email_facturacion")}>
            <Input id={fieldId("email_facturacion")} placeholder="facturacion@ejemplo.com" value={value.email_facturacion} onChange={(e) => set("email_facturacion", e.target.value)} />
          </Field>
          <Field label="Industria" htmlFor={fieldId("tipo_industria")}>
            <Input id={fieldId("tipo_industria")} placeholder="Industria" value={value.tipo_industria} onChange={(e) => set("tipo_industria", e.target.value)} />
          </Field>
          <Field label="Tamaño" htmlFor={fieldId("tamano")}>
            <Input id={fieldId("tamano")} placeholder="Tamaño" value={value.tamano} onChange={(e) => set("tamano", e.target.value)} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Ubicación y notas" description="Aquí se concentran los datos de dirección y contexto operativo.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="País" htmlFor={fieldId("pais")}>
            <Select
              value={value.pais || undefined}
              onValueChange={(nextCountry) => {
                onChange((prev) => {
                  const next: ContactDraft = { ...prev, pais: nextCountry };
                  if (!isMexicoCountry(nextCountry)) {
                    next.clave_entidad = "";
                    next.clave_municipio = "";
                  }
                  return next;
                });
              }}
            >
              <SelectTrigger id={fieldId("pais")}>
                <SelectValue placeholder={geoLoading ? "Cargando países..." : "Selecciona un país"} />
              </SelectTrigger>
              <SelectContent>
                {geoCountries.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {mexico ? (
            <>
              <Field label="Estado (México)" htmlFor={fieldId("clave_entidad")}>
                <Select
                  value={selectedStateCode || undefined}
                  onValueChange={(stateCode) => {
                    const state = geoStates.find((item) => item.code === stateCode);
                    onChange((prev) => ({
                      ...prev,
                      clave_entidad: stateCode,
                      entidad: state?.name ?? prev.entidad,
                      clave_municipio: "",
                      municipio: "",
                    }));
                  }}
                >
                  <SelectTrigger id={fieldId("clave_entidad")}>
                    <SelectValue placeholder={geoLoading ? "Cargando estados..." : "Selecciona un estado"} />
                  </SelectTrigger>
                  <SelectContent>
                    {geoStates.map((state) => (
                      <SelectItem key={state.code} value={state.code}>
                        {state.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Municipio (México)" htmlFor={fieldId("clave_municipio")}>
                <Select
                  value={selectedMunicipalityCode || undefined}
                  onValueChange={(municipalityCode) => {
                    const municipality = geoMunicipalities.find((item) => item.code === municipalityCode);
                    onChange((prev) => ({
                      ...prev,
                      clave_municipio: municipalityCode,
                      municipio: municipality?.name ?? prev.municipio,
                    }));
                  }}
                  disabled={!selectedStateCode}
                >
                  <SelectTrigger id={fieldId("clave_municipio")}>
                    <SelectValue placeholder={!selectedStateCode ? "Selecciona estado primero" : "Selecciona un municipio"} />
                  </SelectTrigger>
                  <SelectContent>
                    {geoMunicipalities.map((municipality) => (
                      <SelectItem key={`${municipality.state_code}-${municipality.code}`} value={municipality.code}>
                        {municipality.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </>
          ) : (
            <>
              <Field label="Entidad / estado" htmlFor={fieldId("entidad")}>
                <Input
                  id={fieldId("entidad")}
                  placeholder="Entidad / estado"
                  value={value.entidad}
                  onChange={(e) =>
                    onChange((prev) => ({
                      ...prev,
                      entidad: e.target.value,
                      clave_entidad: "",
                      clave_municipio: "",
                    }))
                  }
                />
              </Field>
              <Field label="Municipio / ciudad" htmlFor={fieldId("municipio")}>
                <Input
                  id={fieldId("municipio")}
                  placeholder="Municipio / ciudad"
                  value={value.municipio}
                  onChange={(e) =>
                    onChange((prev) => ({
                      ...prev,
                      municipio: e.target.value,
                      clave_municipio: "",
                    }))
                  }
                />
              </Field>
            </>
          )}
          <Field label="Código postal" htmlFor={fieldId("codigo_postal")}>
            <Input id={fieldId("codigo_postal")} placeholder="Código postal" value={value.codigo_postal} onChange={(e) => set("codigo_postal", e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Notas internas" htmlFor={fieldId("notes")}>
            <Textarea id={fieldId("notes")} placeholder="Notas" value={value.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          <Field label="Necesidad / propósito" htmlFor={fieldId("necesidad_proposito")}>
            <Textarea
              id={fieldId("necesidad_proposito")}
              placeholder="Necesidad / propósito"
              value={value.necesidad_proposito}
              onChange={(e) => set("necesidad_proposito", e.target.value)}
            />
          </Field>
        </div>
      </FormSection>
    </div>
  );
}

function AccountForm({
  value,
  onChange,
  geoCountries,
  geoStates,
  geoMunicipalities,
  geoLoading,
}: {
  value: AccountDraft;
  onChange: React.Dispatch<React.SetStateAction<AccountDraft>>;
  geoCountries: GeoCountryOption[];
  geoStates: GeoStateOption[];
  geoMunicipalities: GeoMunicipalityOption[];
  geoLoading: boolean;
}) {
  const set = (field: keyof AccountDraft, next: string) => onChange((prev) => ({ ...prev, [field]: next }));
  const uid = React.useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const mexico = isMexicoCountry(value.pais);
  const selectedStateCode = React.useMemo(() => {
    if (value.clave_entidad.trim()) return value.clave_entidad.trim().padStart(2, "0");
    const byName = geoStates.find((item) => normalizeGeoText(item.name) === normalizeGeoText(value.entidad));
    return byName?.code ?? "";
  }, [geoStates, value.clave_entidad, value.entidad]);
  const selectedMunicipalityCode = React.useMemo(() => {
    if (value.clave_municipio.trim()) return value.clave_municipio.trim().padStart(3, "0");
    const byName = geoMunicipalities.find((item) => normalizeGeoText(item.name) === normalizeGeoText(value.municipio));
    return byName?.code ?? "";
  }, [geoMunicipalities, value.clave_municipio, value.municipio]);

  return (
    <div className="space-y-4">
      <FormSection title="Empresa y facturación" description="Agrupa los datos que normalmente se usan para identificar la cuenta y facturarla.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nombre empresa" htmlFor={fieldId("nombre")}>
            <Input id={fieldId("nombre")} placeholder="Nombre empresa" value={value.nombre} onChange={(e) => set("nombre", e.target.value)} />
          </Field>
          <Field label="Razón social" htmlFor={fieldId("razon_social")}>
            <Input id={fieldId("razon_social")} placeholder="Razón social" value={value.razon_social} onChange={(e) => set("razon_social", e.target.value)} />
          </Field>
          <Field label="RFC" htmlFor={fieldId("rfc")}>
            <Input id={fieldId("rfc")} placeholder="RFC" value={value.rfc} onChange={(e) => set("rfc", e.target.value)} />
          </Field>
          <Field label="Uso CFDI" htmlFor={fieldId("uso_cfdi")}>
            <Input id={fieldId("uso_cfdi")} placeholder="Uso CFDI" value={value.uso_cfdi} onChange={(e) => set("uso_cfdi", e.target.value)} />
          </Field>
          <Field label="Método de pago" htmlFor={fieldId("metodo_pago")}>
            <Input id={fieldId("metodo_pago")} placeholder="Método de pago" value={value.metodo_pago} onChange={(e) => set("metodo_pago", e.target.value)} />
          </Field>
          <Field label="Forma de pago" htmlFor={fieldId("forma_pago")}>
            <Input id={fieldId("forma_pago")} placeholder="Forma de pago" value={value.forma_pago} onChange={(e) => set("forma_pago", e.target.value)} />
          </Field>
          <Field label="Email de facturación" htmlFor={fieldId("email_facturacion")}>
            <Input id={fieldId("email_facturacion")} placeholder="facturacion@ejemplo.com" value={value.email_facturacion} onChange={(e) => set("email_facturacion", e.target.value)} />
          </Field>
          <Field label="Industria" htmlFor={fieldId("tipo_industria")}>
            <Input id={fieldId("tipo_industria")} placeholder="Industria" value={value.tipo_industria} onChange={(e) => set("tipo_industria", e.target.value)} />
          </Field>
          <Field label="Tamaño" htmlFor={fieldId("tamano")}>
            <Input id={fieldId("tamano")} placeholder="Tamaño" value={value.tamano} onChange={(e) => set("tamano", e.target.value)} />
          </Field>
          <Field label="Teléfono" htmlFor={fieldId("telefono")}>
            <Input id={fieldId("telefono")} placeholder="Teléfono" value={value.telefono} onChange={(e) => set("telefono", e.target.value)} />
          </Field>
          <Field label="Email" htmlFor={fieldId("email")}>
            <Input id={fieldId("email")} placeholder="Email" value={value.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Website" htmlFor={fieldId("website")}>
            <Input id={fieldId("website")} placeholder="https://..." value={value.website} onChange={(e) => set("website", e.target.value)} />
          </Field>
          <Field label="Tipo de establecimiento" htmlFor={fieldId("tipo_establecimiento")}>
            <Input id={fieldId("tipo_establecimiento")} placeholder="Tipo de establecimiento" value={value.tipo_establecimiento} onChange={(e) => set("tipo_establecimiento", e.target.value)} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Ubicación" description="Si el país es México, el estado y municipio se eligen de catálogo.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="País" htmlFor={fieldId("pais")}>
            <Select
              value={value.pais || undefined}
              onValueChange={(nextCountry) => {
                onChange((prev) => {
                  const next: AccountDraft = { ...prev, pais: nextCountry };
                  if (!isMexicoCountry(nextCountry)) {
                    next.clave_entidad = "";
                    next.clave_municipio = "";
                  }
                  return next;
                });
              }}
            >
              <SelectTrigger id={fieldId("pais")}>
                <SelectValue placeholder={geoLoading ? "Cargando países..." : "Selecciona un país"} />
              </SelectTrigger>
              <SelectContent>
                {geoCountries.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {mexico ? (
            <>
              <Field label="Estado (México)" htmlFor={fieldId("clave_entidad")}>
                <Select
                  value={selectedStateCode || undefined}
                  onValueChange={(stateCode) => {
                    const state = geoStates.find((item) => item.code === stateCode);
                    onChange((prev) => ({
                      ...prev,
                      clave_entidad: stateCode,
                      entidad: state?.name ?? prev.entidad,
                      clave_municipio: "",
                      municipio: "",
                    }));
                  }}
                >
                  <SelectTrigger id={fieldId("clave_entidad")}>
                    <SelectValue placeholder={geoLoading ? "Cargando estados..." : "Selecciona un estado"} />
                  </SelectTrigger>
                  <SelectContent>
                    {geoStates.map((state) => (
                      <SelectItem key={state.code} value={state.code}>
                        {state.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Municipio (México)" htmlFor={fieldId("clave_municipio")}>
                <Select
                  value={selectedMunicipalityCode || undefined}
                  onValueChange={(municipalityCode) => {
                    const municipality = geoMunicipalities.find((item) => item.code === municipalityCode);
                    onChange((prev) => ({
                      ...prev,
                      clave_municipio: municipalityCode,
                      municipio: municipality?.name ?? prev.municipio,
                    }));
                  }}
                  disabled={!selectedStateCode}
                >
                  <SelectTrigger id={fieldId("clave_municipio")}>
                    <SelectValue placeholder={!selectedStateCode ? "Selecciona estado primero" : "Selecciona un municipio"} />
                  </SelectTrigger>
                  <SelectContent>
                    {geoMunicipalities.map((municipality) => (
                      <SelectItem key={`${municipality.state_code}-${municipality.code}`} value={municipality.code}>
                        {municipality.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </>
          ) : (
            <>
              <Field label="Entidad / estado" htmlFor={fieldId("entidad")}>
                <Input
                  id={fieldId("entidad")}
                  placeholder="Entidad / estado"
                  value={value.entidad}
                  onChange={(e) =>
                    onChange((prev) => ({
                      ...prev,
                      entidad: e.target.value,
                      clave_entidad: "",
                      clave_municipio: "",
                    }))
                  }
                />
              </Field>
              <Field label="Municipio / ciudad" htmlFor={fieldId("municipio")}>
                <Input
                  id={fieldId("municipio")}
                  placeholder="Municipio / ciudad"
                  value={value.municipio}
                  onChange={(e) =>
                    onChange((prev) => ({
                      ...prev,
                      municipio: e.target.value,
                      clave_municipio: "",
                    }))
                  }
                />
              </Field>
            </>
          )}
          <Field label="Código postal" htmlFor={fieldId("codigo_postal")}>
            <Input id={fieldId("codigo_postal")} placeholder="Código postal" value={value.codigo_postal} onChange={(e) => set("codigo_postal", e.target.value)} />
          </Field>
          <Field label="Tipo de vialidad" htmlFor={fieldId("tipo_vialidad")}>
            <Input id={fieldId("tipo_vialidad")} placeholder="Tipo de vialidad" value={value.tipo_vialidad} onChange={(e) => set("tipo_vialidad", e.target.value)} />
          </Field>
          <Field label="Nombre de vialidad" htmlFor={fieldId("nombre_vialidad")}>
            <Input id={fieldId("nombre_vialidad")} placeholder="Nombre de vialidad" value={value.nombre_vialidad} onChange={(e) => set("nombre_vialidad", e.target.value)} />
          </Field>
          <Field label="Número exterior" htmlFor={fieldId("numero_exterior")}>
            <Input id={fieldId("numero_exterior")} placeholder="Número exterior" value={value.numero_exterior} onChange={(e) => set("numero_exterior", e.target.value)} />
          </Field>
          <Field label="Número interior" htmlFor={fieldId("numero_interior")}>
            <Input id={fieldId("numero_interior")} placeholder="Número interior" value={value.numero_interior} onChange={(e) => set("numero_interior", e.target.value)} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Notas" description="Espacio libre para contexto comercial o administrativo.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Notas internas" htmlFor={fieldId("notas")}>
            <Textarea id={fieldId("notas")} placeholder="Notas" value={value.notas} onChange={(e) => set("notas", e.target.value)} />
          </Field>
          <Field label="Necesidad / propósito" htmlFor={fieldId("necesidad_proposito")}>
            <Textarea
              id={fieldId("necesidad_proposito")}
              placeholder="Necesidad / propósito"
              value={value.necesidad_proposito}
              onChange={(e) => set("necesidad_proposito", e.target.value)}
            />
          </Field>
        </div>
      </FormSection>
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
  const [geoCountries, setGeoCountries] = React.useState<GeoCountryOption[]>([]);
  const [geoStates, setGeoStates] = React.useState<GeoStateOption[]>([]);
  const [geoMunicipalitiesContact, setGeoMunicipalitiesContact] = React.useState<GeoMunicipalityOption[]>([]);
  const [geoMunicipalitiesAccount, setGeoMunicipalitiesAccount] = React.useState<GeoMunicipalityOption[]>([]);
  const [geoLoading, setGeoLoading] = React.useState(false);

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

  const contactStateCode = React.useMemo(() => {
    const explicit = contactForm.clave_entidad.trim();
    if (explicit) return explicit.padStart(2, "0");
    const byName = geoStates.find((item) => normalizeGeoText(item.name) === normalizeGeoText(contactForm.entidad));
    return byName?.code ?? "";
  }, [contactForm.clave_entidad, contactForm.entidad, geoStates]);

  const accountStateCode = React.useMemo(() => {
    const explicit = accountForm.clave_entidad.trim();
    if (explicit) return explicit.padStart(2, "0");
    const byName = geoStates.find((item) => normalizeGeoText(item.name) === normalizeGeoText(accountForm.entidad));
    return byName?.code ?? "";
  }, [accountForm.clave_entidad, accountForm.entidad, geoStates]);

  React.useEffect(() => {
    const controller = new AbortController();
    const loadGeoBaseCatalogs = async () => {
      setGeoLoading(true);
      try {
        const [countriesRes, statesRes] = await Promise.all([
          fetch("/api/contactos/catalogos/paises", { cache: "no-store", signal: controller.signal }),
          fetch("/api/contactos/catalogos/estados?pais=MX", { cache: "no-store", signal: controller.signal }),
        ]);
        if (countriesRes.ok) {
          const countriesBody = (await countriesRes.json()) as { items?: GeoCountryOption[] };
          setGeoCountries(Array.isArray(countriesBody.items) ? countriesBody.items : []);
        }
        if (statesRes.ok) {
          const statesBody = (await statesRes.json()) as { items?: GeoStateOption[] };
          setGeoStates(Array.isArray(statesBody.items) ? statesBody.items : []);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setGeoCountries([]);
          setGeoStates([]);
        }
      } finally {
        setGeoLoading(false);
      }
    };

    loadGeoBaseCatalogs();
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    if (!isMexicoCountry(contactForm.pais) || !contactStateCode) {
      setGeoMunicipalitiesContact([]);
      return;
    }
    const controller = new AbortController();
    const loadMunicipalities = async () => {
      try {
        const res = await fetch(
          `/api/contactos/catalogos/municipios?pais=MX&estado=${encodeURIComponent(contactStateCode)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!res.ok) {
          setGeoMunicipalitiesContact([]);
          return;
        }
        const body = (await res.json()) as { items?: GeoMunicipalityOption[] };
        setGeoMunicipalitiesContact(Array.isArray(body.items) ? body.items : []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setGeoMunicipalitiesContact([]);
        }
      }
    };
    loadMunicipalities();
    return () => controller.abort();
  }, [contactForm.pais, contactStateCode]);

  React.useEffect(() => {
    if (!isMexicoCountry(accountForm.pais) || !accountStateCode) {
      setGeoMunicipalitiesAccount([]);
      return;
    }
    const controller = new AbortController();
    const loadMunicipalities = async () => {
      try {
        const res = await fetch(
          `/api/contactos/catalogos/municipios?pais=MX&estado=${encodeURIComponent(accountStateCode)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!res.ok) {
          setGeoMunicipalitiesAccount([]);
          return;
        }
        const body = (await res.json()) as { items?: GeoMunicipalityOption[] };
        setGeoMunicipalitiesAccount(Array.isArray(body.items) ? body.items : []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setGeoMunicipalitiesAccount([]);
        }
      }
    };
    loadMunicipalities();
    return () => controller.abort();
  }, [accountForm.pais, accountStateCode]);

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
      clave_entidad: extractString(raw, ["clave_entidad"]) ?? "",
      entidad: extractString(raw, ["entidad"]) ?? "",
      clave_municipio: extractString(raw, ["clave_municipio"]) ?? "",
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader className="space-y-2">
            <DialogTitle>Crear contacto</DialogTitle>
            <DialogDescription>
              Formulario dividido por bloques para que cada campo sea fácil de reconocer y editar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <ContactForm
              value={contactForm}
              onChange={setContactForm}
              geoCountries={geoCountries}
              geoStates={geoStates}
              geoMunicipalities={geoMunicipalitiesContact}
              geoLoading={geoLoading}
            />
            <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
              <div className="flex items-center space-x-2">
                <Checkbox id="create-account" checked={createWithAccount} onCheckedChange={(v) => setCreateWithAccount(Boolean(v))} />
                <label htmlFor="create-account" className="text-sm text-muted-foreground">
                  Crear empresa y vincularla
                </label>
              </div>
            </div>
            {createWithAccount ? (
              <AccountForm
                value={accountForm}
                onChange={setAccountForm}
                geoCountries={geoCountries}
                geoStates={geoStates}
                geoMunicipalities={geoMunicipalitiesAccount}
                geoLoading={geoLoading}
              />
            ) : null}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader className="space-y-2">
            <DialogTitle>Editar contacto</DialogTitle>
            <DialogDescription>
              Cada campo tiene su etiqueta visible para identificarlo con claridad incluso cuando ya está lleno.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <ContactForm
              value={contactForm}
              onChange={setContactForm}
              geoCountries={geoCountries}
              geoStates={geoStates}
              geoMunicipalities={geoMunicipalitiesContact}
              geoLoading={geoLoading}
            />
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
