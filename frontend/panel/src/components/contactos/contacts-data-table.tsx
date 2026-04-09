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

type CreateContactForm = {
  nombre_nombres: string;
  apellido_paterno: string;
  apellido_materno: string;
  nombre_completo: string;
  codigo_contacto: string;
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
  fecha_incorporacion: string;
  contacto_extra_json: string;
};

type CreateAccountForm = {
  nombre: string;
  codigo_cuenta: string;
  razon_social: string;
  rfc: string;
  tipo_industria: string;
  tamano: string;
  email: string;
  telefono: string;
  website: string;
  uso_cfdi: string;
  metodo_pago: string;
  forma_pago: string;
  email_facturacion: string;
  notas: string;
  necesidad_proposito: string;
  fecha_incorporacion: string;
  cuenta_extra_json: string;
};

const EMPTY_CONTACT_FORM: CreateContactForm = {
  nombre_nombres: "",
  apellido_paterno: "",
  apellido_materno: "",
  nombre_completo: "",
  codigo_contacto: "",
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
  fecha_incorporacion: "",
  contacto_extra_json: "",
};

const EMPTY_ACCOUNT_FORM: CreateAccountForm = {
  nombre: "",
  codigo_cuenta: "",
  razon_social: "",
  rfc: "",
  tipo_industria: "",
  tamano: "",
  email: "",
  telefono: "",
  website: "",
  uso_cfdi: "",
  metodo_pago: "",
  forma_pago: "",
  email_facturacion: "",
  notas: "",
  necesidad_proposito: "",
  fecha_incorporacion: "",
  cuenta_extra_json: "",
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
  const canCreate =
    permissionContext.es_admin ||
    permissionContext.es_owner ||
    normalizedPerms.includes("contacts.write");

  const [reassignOpen, setReassignOpen] = React.useState(false);
  const [activeRow, setActiveRow] = React.useState<TableRow | null>(null);
  const [selectedVendorId, setSelectedVendorId] = React.useState("");
  const [vendorOptions, setVendorOptions] = React.useState<SalesRepOption[]>([]);
  const [vendorLoading, setVendorLoading] = React.useState(false);
  const [vendorError, setVendorError] = React.useState<string | null>(null);
  const [reassignPending, setReassignPending] = React.useState(false);
  const [reassignError, setReassignError] = React.useState<string | null>(null);
  const [reassignSuccess, setReassignSuccess] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createPending, setCreatePending] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = React.useState<string | null>(null);
  const [shouldCreateAccount, setShouldCreateAccount] = React.useState(false);
  const [contactForm, setContactForm] = React.useState<CreateContactForm>({ ...EMPTY_CONTACT_FORM });
  const [accountForm, setAccountForm] = React.useState<CreateAccountForm>({ ...EMPTY_ACCOUNT_FORM });

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

  const buildPayload = (
    form: Record<string, string>,
    excludeKeys: string[],
  ): Record<string, unknown> => {
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(form)) {
      if (excludeKeys.includes(key)) continue;
      const trimmed = value.trim();
      if (!trimmed.length) continue;
      payload[key] = trimmed;
    }
    return payload;
  };

  const parseJsonObject = (raw: string, fieldLabel: string): Record<string, unknown> => {
    const trimmed = raw.trim();
    if (!trimmed.length) return {};
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${fieldLabel} debe ser un objeto JSON.`);
    }
    return parsed as Record<string, unknown>;
  };

  const resetCreateDialog = () => {
    setContactForm({ ...EMPTY_CONTACT_FORM });
    setAccountForm({ ...EMPTY_ACCOUNT_FORM });
    setShouldCreateAccount(false);
    setCreateError(null);
    setCreateSuccess(null);
  };

  const handleCreateContact = async () => {
    setCreatePending(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const contacto = buildPayload(contactForm, ["contacto_extra_json"]);
      const contactoExtras = parseJsonObject(contactForm.contacto_extra_json, "Campos avanzados de contacto");
      Object.assign(contacto, contactoExtras);

      let cuenta: Record<string, unknown> | undefined;
      if (shouldCreateAccount) {
        cuenta = buildPayload(accountForm, ["cuenta_extra_json"]);
        const cuentaExtras = parseJsonObject(accountForm.cuenta_extra_json, "Campos avanzados de empresa");
        Object.assign(cuenta, cuentaExtras);
      }

      const response = await fetch("/api/contactos/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crear_cuenta: shouldCreateAccount,
          cuenta,
          contacto,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setCreateError(body.error || `Error ${response.status}`);
        return;
      }
      setCreateSuccess("Contacto creado correctamente.");
      setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "No se pudo crear el contacto.");
    } finally {
      setCreatePending(false);
    }
  };

  const toolbarActions = canCreate ? (
    <Button
      type="button"
      size="sm"
      onClick={() => {
        resetCreateDialog();
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
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Crear contacto</DialogTitle>
            <DialogDescription>
              Registra un contacto nuevo y, opcionalmente, crea su empresa en el mismo flujo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input
                placeholder="Nombres"
                value={contactForm.nombre_nombres}
                onChange={(event) => setContactForm((prev) => ({ ...prev, nombre_nombres: event.target.value }))}
              />
              <Input
                placeholder="Apellido paterno"
                value={contactForm.apellido_paterno}
                onChange={(event) => setContactForm((prev) => ({ ...prev, apellido_paterno: event.target.value }))}
              />
              <Input
                placeholder="Apellido materno"
                value={contactForm.apellido_materno}
                onChange={(event) => setContactForm((prev) => ({ ...prev, apellido_materno: event.target.value }))}
              />
              <Input
                placeholder="Nombre completo (opcional)"
                value={contactForm.nombre_completo}
                onChange={(event) => setContactForm((prev) => ({ ...prev, nombre_completo: event.target.value }))}
              />
              <Input
                placeholder="Correo"
                value={contactForm.correo}
                onChange={(event) => setContactForm((prev) => ({ ...prev, correo: event.target.value }))}
              />
              <Input
                placeholder="Teléfono (E.164 recomendado)"
                value={contactForm.telefono_e164}
                onChange={(event) => setContactForm((prev) => ({ ...prev, telefono_e164: event.target.value }))}
              />
              <Input
                placeholder="Código contacto (opcional)"
                value={contactForm.codigo_contacto}
                onChange={(event) => setContactForm((prev) => ({ ...prev, codigo_contacto: event.target.value }))}
              />
              <Select
                value={contactForm.persona_fisica_moral || undefined}
                onValueChange={(value) => setContactForm((prev) => ({ ...prev, persona_fisica_moral: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Persona física / moral" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fisica">Física</SelectItem>
                  <SelectItem value="moral">Moral</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Puesto"
                value={contactForm.puesto}
                onChange={(event) => setContactForm((prev) => ({ ...prev, puesto: event.target.value }))}
              />
              <Input
                placeholder="Área"
                value={contactForm.area}
                onChange={(event) => setContactForm((prev) => ({ ...prev, area: event.target.value }))}
              />
              <Input
                placeholder="Rol de decisión"
                value={contactForm.rol_decision}
                onChange={(event) => setContactForm((prev) => ({ ...prev, rol_decision: event.target.value }))}
              />
              <Input
                placeholder="Origen"
                value={contactForm.origen}
                onChange={(event) => setContactForm((prev) => ({ ...prev, origen: event.target.value }))}
              />
              <Input
                placeholder="Empresa (texto)"
                value={contactForm.company_name}
                onChange={(event) => setContactForm((prev) => ({ ...prev, company_name: event.target.value }))}
              />
              <Input
                placeholder="RFC contacto"
                value={contactForm.rfc}
                onChange={(event) => setContactForm((prev) => ({ ...prev, rfc: event.target.value }))}
              />
              <Input
                placeholder="Razón social contacto"
                value={contactForm.razon_social}
                onChange={(event) => setContactForm((prev) => ({ ...prev, razon_social: event.target.value }))}
              />
              <Input
                placeholder="Fecha incorporación (YYYY-MM-DD)"
                value={contactForm.fecha_incorporacion}
                onChange={(event) => setContactForm((prev) => ({ ...prev, fecha_incorporacion: event.target.value }))}
              />
            </div>
            <Textarea
              placeholder="Notas"
              value={contactForm.notes}
              onChange={(event) => setContactForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
            <Textarea
              placeholder="Necesidad / propósito"
              value={contactForm.necesidad_proposito}
              onChange={(event) => setContactForm((prev) => ({ ...prev, necesidad_proposito: event.target.value }))}
            />
            <Textarea
              placeholder='Campos avanzados contacto (JSON objeto), ej: {"tipo_vialidad":"Calle","codigo_postal":"78000"}'
              value={contactForm.contacto_extra_json}
              onChange={(event) => setContactForm((prev) => ({ ...prev, contacto_extra_json: event.target.value }))}
              className="font-mono text-xs"
            />

            <div className="flex items-center space-x-2">
              <Checkbox
                id="crear-cuenta"
                checked={shouldCreateAccount}
                onCheckedChange={(value) => setShouldCreateAccount(Boolean(value))}
              />
              <label htmlFor="crear-cuenta" className="text-sm text-muted-foreground">
                Crear empresa y vincularla al contacto
              </label>
            </div>

            {shouldCreateAccount ? (
              <div className="space-y-3 rounded-md border p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Input
                    placeholder="Nombre empresa"
                    value={accountForm.nombre}
                    onChange={(event) => setAccountForm((prev) => ({ ...prev, nombre: event.target.value }))}
                  />
                  <Input
                    placeholder="Código empresa (opcional)"
                    value={accountForm.codigo_cuenta}
                    onChange={(event) => setAccountForm((prev) => ({ ...prev, codigo_cuenta: event.target.value }))}
                  />
                  <Input
                    placeholder="Razón social"
                    value={accountForm.razon_social}
                    onChange={(event) => setAccountForm((prev) => ({ ...prev, razon_social: event.target.value }))}
                  />
                  <Input
                    placeholder="RFC"
                    value={accountForm.rfc}
                    onChange={(event) => setAccountForm((prev) => ({ ...prev, rfc: event.target.value }))}
                  />
                  <Input
                    placeholder="Industria"
                    value={accountForm.tipo_industria}
                    onChange={(event) => setAccountForm((prev) => ({ ...prev, tipo_industria: event.target.value }))}
                  />
                  <Input
                    placeholder="Tamaño"
                    value={accountForm.tamano}
                    onChange={(event) => setAccountForm((prev) => ({ ...prev, tamano: event.target.value }))}
                  />
                  <Input
                    placeholder="Correo"
                    value={accountForm.email}
                    onChange={(event) => setAccountForm((prev) => ({ ...prev, email: event.target.value }))}
                  />
                  <Input
                    placeholder="Teléfono"
                    value={accountForm.telefono}
                    onChange={(event) => setAccountForm((prev) => ({ ...prev, telefono: event.target.value }))}
                  />
                  <Input
                    placeholder="Website"
                    value={accountForm.website}
                    onChange={(event) => setAccountForm((prev) => ({ ...prev, website: event.target.value }))}
                  />
                  <Input
                    placeholder="Fecha incorporación (YYYY-MM-DD)"
                    value={accountForm.fecha_incorporacion}
                    onChange={(event) => setAccountForm((prev) => ({ ...prev, fecha_incorporacion: event.target.value }))}
                  />
                </div>
                <Textarea
                  placeholder="Notas empresa"
                  value={accountForm.notas}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, notas: event.target.value }))}
                />
                <Textarea
                  placeholder='Campos avanzados empresa (JSON objeto), ej: {"tipo_vialidad":"Av","codigo_postal":"01234"}'
                  value={accountForm.cuenta_extra_json}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, cuenta_extra_json: event.target.value }))}
                  className="font-mono text-xs"
                />
              </div>
            ) : null}

            {createError ? <p className="text-xs text-destructive">{createError}</p> : null}
            {createSuccess ? <p className="text-xs text-emerald-600">{createSuccess}</p> : null}
            <div className="flex items-center gap-2">
              <Button type="button" onClick={handleCreateContact} disabled={createPending}>
                {createPending ? "Creando..." : "Crear contacto"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={createPending}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
