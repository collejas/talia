"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GeoLocationSelects } from "@/components/contactos/geo-location-selects";
import { ContactCatalogSelect, mergeCatalogOptions } from "@/components/contactos/contact-catalog-select";
import { usePermissions } from "@/hooks/use-permissions";
import {
  getRfcLengthMessage,
  isValidRfcLength,
  sanitizeRfcInput,
  sanitizePhoneInput,
} from "@/components/contactos/contact-input-sanitizers";
import { useTenantContactCatalogs } from "@/components/contactos/use-contact-catalogs";
import {
  AccountDirectionCard,
  AccountDirectionDraft,
  AccountDirectionPrimaryType,
  buildDirectionPayload,
  createEmptyDirectionDraft,
  expandDirectionRelationTypes,
  directionTypeIncludesFiscal,
  directionTypeIncludesPrincipal,
} from "@/components/cuentas/account-directions";
import { toast } from "sonner";

type CreateAccountForm = {
  tipo: "empresa" | "persona_fisica_actividad_empresarial";
  tipo_persona: "" | "fisica" | "moral";
  nombre_comercial: string;
  razon_social: string;
  codigo_cuenta: string;
  rfc: string;
  sitio_web: string;
  tamano: string;
  tipo_establecimiento: string;
  fecha_incorporacion: string;
  latitud: string;
  longitud: string;
  telefono_principal_e164: string;
  telefono_principal_tipo_linea: string;
  telefono_principal_extension: string;
  telefono_secundario_e164: string;
  telefono_secundario_tipo_linea: string;
  telefono_secundario_extension: string;
  notas: string;
  uso_cfdi: string;
  forma_pago: string;
  metodo_pago: string;
  email_facturacion: string;
  pais: string;
  clave_entidad: string;
  entidad: string;
  clave_municipio: string;
  municipio: string;
  clave_localidad: string;
  localidad: string;
  tipo_vialidad: string;
  nombre_vialidad: string;
  numero_exterior: string;
  letra_exterior: string;
  edificio: string;
  edificio_piso: string;
  numero_interior: string;
  letra_interior: string;
  tipo_asentamiento: string;
  nombre_asentamiento: string;
  tipo_centro_comercial: string;
  corredor_industrial: string;
  numero_local: string;
  codigo_postal: string;
};

const PHONE_LINE_TYPE_OPTIONS = [
  { value: "movil", label: "Móvil" },
  { value: "fijo", label: "Fijo" },
  { value: "whatsapp", label: "WhatsApp" },
] as const;

function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        <span>{label}</span>
      </Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  );
}

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

const INITIAL_FORM: CreateAccountForm = {
  tipo: "empresa",
  tipo_persona: "moral",
  nombre_comercial: "",
  razon_social: "",
  codigo_cuenta: "",
  rfc: "",
  sitio_web: "",
  tamano: "",
  tipo_establecimiento: "",
  fecha_incorporacion: "",
  latitud: "",
  longitud: "",
  telefono_principal_e164: "",
  telefono_principal_tipo_linea: "movil",
  telefono_principal_extension: "",
  telefono_secundario_e164: "",
  telefono_secundario_tipo_linea: "movil",
  telefono_secundario_extension: "",
  notas: "",
  uso_cfdi: "",
  forma_pago: "",
  metodo_pago: "",
  email_facturacion: "",
  pais: "MX",
  clave_entidad: "",
  entidad: "",
  clave_municipio: "",
  municipio: "",
  clave_localidad: "",
  localidad: "",
  tipo_vialidad: "",
  nombre_vialidad: "",
  numero_exterior: "",
  letra_exterior: "",
  edificio: "",
  edificio_piso: "",
  numero_interior: "",
  letra_interior: "",
  tipo_asentamiento: "",
  nombre_asentamiento: "",
  tipo_centro_comercial: "",
  corredor_industrial: "",
  numero_local: "",
  codigo_postal: "",
};

type Props = {
  onCreated?: () => void;
};

export function AccountCreateDialog({ onCreated }: Props) {
  const router = useRouter();
  const { context: permissionContext } = usePermissions();
  const tenantCatalogs = useTenantContactCatalogs();
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [codeLoading, setCodeLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<CreateAccountForm>(INITIAL_FORM);
  const [primaryDirectionType, setPrimaryDirectionType] = React.useState<AccountDirectionPrimaryType>("fiscal");
  const [extraDirections, setExtraDirections] = React.useState<AccountDirectionDraft[]>([]);
  const currentUserId = permissionContext.usuario_id?.trim() || null;

  const openDialog = React.useCallback(() => {
    setForm(INITIAL_FORM);
    setError(null);
    setPrimaryDirectionType("fiscal");
    setExtraDirections([]);
    setOpen(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const run = async () => {
      setCodeLoading(true);
      try {
        const response = await fetch(
          `/api/personas/cuentas/codigo-siguiente?tipo=${encodeURIComponent(form.tipo)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = (await response.json().catch(() => ({}))) as { codigo_cuenta?: string | null; error?: string };
        if (!response.ok) {
          throw new Error(body.error || "No se pudo generar el ID de empresa.");
        }
        setForm((prev) =>
          prev.codigo_cuenta === (body.codigo_cuenta ?? "") ? prev : { ...prev, codigo_cuenta: body.codigo_cuenta ?? "" },
        );
      } catch (fetchError) {
        if ((fetchError as Error).name !== "AbortError") {
          setForm((prev) => ({ ...prev, codigo_cuenta: "" }));
        }
      } finally {
        if (!controller.signal.aborted) {
          setCodeLoading(false);
        }
      }
    };
    void run();
    return () => controller.abort();
  }, [open, form.tipo]);

  const clasificacionNegocioOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.clasificacionNegocioOptions, form.tipo_establecimiento),
    [form.tipo_establecimiento, tenantCatalogs.clasificacionNegocioOptions],
  );
  const tamanoOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.tamanoOptions, form.tamano),
    [form.tamano, tenantCatalogs.tamanoOptions],
  );
  const usoCfdiOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.usoCfdiOptions, form.uso_cfdi),
    [form.uso_cfdi, tenantCatalogs.usoCfdiOptions],
  );
  const formaPagoOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.formaPagoOptions, form.forma_pago),
    [form.forma_pago, tenantCatalogs.formaPagoOptions],
  );
  const metodoPagoOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.metodoPagoOptions, form.metodo_pago),
    [form.metodo_pago, tenantCatalogs.metodoPagoOptions],
  );
  const rfcHint = React.useMemo(() => getRfcLengthMessage(form.tipo), [form.tipo]);

  const handleCreateConfirm = async () => {
    const primaryDirection = {
      key: "primary",
      tipo: primaryDirectionType,
      pais: form.pais,
      clave_entidad: form.clave_entidad,
      entidad: form.entidad,
      clave_municipio: form.clave_municipio,
      municipio: form.municipio,
      clave_localidad: form.clave_localidad,
      localidad: form.localidad,
      tipo_vialidad: form.tipo_vialidad,
      nombre_vialidad: form.nombre_vialidad,
      numero_exterior: form.numero_exterior,
      letra_exterior: form.letra_exterior,
      edificio: form.edificio,
      edificio_piso: form.edificio_piso,
      numero_interior: form.numero_interior,
      letra_interior: form.letra_interior,
      tipo_asentamiento: form.tipo_asentamiento,
      nombre_asentamiento: form.nombre_asentamiento,
      tipo_centro_comercial: form.tipo_centro_comercial,
      corredor_industrial: form.corredor_industrial,
      numero_local: form.numero_local,
      codigo_postal: form.codigo_postal,
      latitud: form.latitud,
      longitud: form.longitud,
    } satisfies AccountDirectionDraft;
    const fiscalDirectionsCount =
      (directionTypeIncludesFiscal(primaryDirection.tipo) ? 1 : 0) +
      extraDirections.filter((item) => directionTypeIncludesFiscal(item.tipo)).length;
    if (fiscalDirectionsCount > 1) {
      setError("No es posible agregar una segunda dirección fiscal. Cambia la dirección existente a principal o sucursal antes de capturar otra fiscal.");
      return;
    }
    if (!form.nombre_comercial.trim() && !form.razon_social.trim()) {
      setError("La empresa requiere nombre comercial o razón social.");
      return;
    }
    if (!form.tipo_persona.trim()) {
      setError("Selecciona el tipo de persona.");
      return;
    }
    if (!isValidRfcLength(form.rfc, form.tipo)) {
      setError(getRfcLengthMessage(form.tipo));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/cuentas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: form.tipo,
          nombre: form.nombre_comercial.trim() || form.razon_social.trim(),
          tipo_persona: form.tipo_persona.trim(),
          nombre_comercial: form.nombre_comercial.trim() || null,
          razon_social: form.razon_social.trim() || null,
          codigo_cuenta: form.codigo_cuenta.trim() || null,
          rfc: sanitizeRfcInput(form.rfc) || null,
          sitio_web: form.sitio_web.trim() || null,
          tamano: form.tamano.trim() || null,
          tipo_establecimiento: form.tipo_establecimiento.trim() || null,
          fecha_incorporacion: form.fecha_incorporacion.trim() || null,
          latitud: form.latitud.trim() && Number.isFinite(Number(form.latitud)) ? Number(form.latitud) : null,
          longitud: form.longitud.trim() && Number.isFinite(Number(form.longitud)) ? Number(form.longitud) : null,
          telefono_principal_e164: sanitizePhoneInput(form.telefono_principal_e164) || null,
          telefono_principal_tipo_linea: form.telefono_principal_tipo_linea || null,
          telefono_principal_extension: sanitizePhoneInput(form.telefono_principal_extension) || null,
          telefono_secundario_e164: sanitizePhoneInput(form.telefono_secundario_e164) || null,
          telefono_secundario_tipo_linea: form.telefono_secundario_tipo_linea || null,
          telefono_secundario_extension: sanitizePhoneInput(form.telefono_secundario_extension) || null,
          notas: form.notas.trim() || null,
          uso_cfdi: form.uso_cfdi.trim() || null,
          forma_pago: form.forma_pago.trim() || null,
          metodo_pago: form.metodo_pago.trim() || null,
          email_facturacion: form.email_facturacion.trim() || null,
          pais: form.pais.trim() || null,
          clave_entidad: form.clave_entidad.trim() || null,
          entidad: form.entidad.trim() || null,
          clave_municipio: form.clave_municipio.trim() || null,
          municipio: form.municipio.trim() || null,
          clave_localidad: form.clave_localidad.trim() || null,
          localidad: form.localidad.trim() || null,
          tipo_vialidad: form.tipo_vialidad.trim() || null,
          nombre_vialidad: form.nombre_vialidad.trim() || null,
          numero_exterior: form.numero_exterior.trim() || null,
          letra_exterior: form.letra_exterior.trim() || null,
          edificio: form.edificio.trim() || null,
          edificio_piso: form.edificio_piso.trim() || null,
          numero_interior: form.numero_interior.trim() || null,
          letra_interior: form.letra_interior.trim() || null,
          tipo_asentamiento: form.tipo_asentamiento.trim() || null,
          colonia: form.nombre_asentamiento.trim() || null,
          nombre_asentamiento: form.nombre_asentamiento.trim() || null,
          tipo_centro_comercial: form.tipo_centro_comercial.trim() || null,
          corredor_industrial: form.corredor_industrial.trim() || null,
          numero_local: form.numero_local.trim() || null,
          codigo_postal: form.codigo_postal.trim() || null,
          propietario_usuario_id: currentUserId || null,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok) {
        throw new Error(body.error || "No se pudo crear la empresa.");
      }
      const createdAccountId = typeof body.id === "string" ? body.id.trim() : "";
      if (createdAccountId) {
        const directionsToCreate: Array<{ tipo_relacion: "fiscal" | "principal" | "sucursal"; direccion: ReturnType<typeof buildDirectionPayload> }> = [];
        for (const relationType of expandDirectionRelationTypes(primaryDirection.tipo)) {
          directionsToCreate.push({
            tipo_relacion: relationType,
            direccion: buildDirectionPayload(primaryDirection, relationType),
          });
        }
        for (const direction of extraDirections) {
          for (const relationType of expandDirectionRelationTypes(direction.tipo)) {
            directionsToCreate.push({
              tipo_relacion: relationType,
              direccion: buildDirectionPayload(direction, relationType),
            });
          }
        }
        for (const entry of directionsToCreate) {
          const relationResponse = await fetch(`/api/cuentas/${encodeURIComponent(createdAccountId)}/direcciones`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tipo_relacion: entry.tipo_relacion,
              activo: true,
              es_principal: entry.tipo_relacion === "principal",
              direccion: entry.direccion,
            }),
          });
          if (!relationResponse.ok) {
            const relationBody = (await relationResponse.json().catch(() => ({}))) as { error?: string };
            throw new Error(relationBody.error || "No se pudieron guardar las direcciones de la empresa.");
          }
        }
      }
      toast.success("Empresa creada.");
      setOpen(false);
      onCreated?.();
      router.refresh();
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "No se pudo crear la empresa.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-end">
        <Button onClick={openDialog}>Nueva empresa</Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <FormSection
              title="Datos de la empresa"
              description="Captura la identidad comercial, fiscal y de contacto principal."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="create-tipo">Tipo de alta *</Label>
                  <select
                    id="create-tipo"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                    value={form.tipo}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        tipo: event.target.value as CreateAccountForm["tipo"],
                        tipo_persona: event.target.value === "persona_fisica_actividad_empresarial" ? "fisica" : "moral",
                      }))
                    }
                  >
                    <option value="empresa">Empresa</option>
                    <option value="persona_fisica_actividad_empresarial">Persona física con actividad empresarial</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-nombre-comercial">Nombre comercial *</Label>
                  <Input
                    id="create-nombre-comercial"
                    value={form.nombre_comercial}
                    onChange={(event) => setForm((prev) => ({ ...prev, nombre_comercial: event.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-razon-social">Razón social *</Label>
                  <Input
                    id="create-razon-social"
                    value={form.razon_social}
                    onChange={(event) => setForm((prev) => ({ ...prev, razon_social: event.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-id">ID de empresa</Label>
                  <Input
                    id="create-id"
                    value={form.codigo_cuenta || (codeLoading ? "Generando..." : "Se generará automáticamente")}
                    readOnly
                    disabled
                    className="bg-muted"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-tipo-persona">Tipo persona *</Label>
                  <select
                    id="create-tipo-persona"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
                    value={form.tipo_persona}
                    onChange={(event) => setForm((prev) => ({ ...prev, tipo_persona: event.target.value as CreateAccountForm["tipo_persona"] }))}
                    disabled={form.tipo === "persona_fisica_actividad_empresarial"}
                  >
                    <option value="">Selecciona</option>
                    <option value="fisica">Física</option>
                    <option value="moral">Moral</option>
                  </select>
                </div>
                <div className="md:col-span-2 -mt-2 text-xs text-muted-foreground">
                  Debes completar al menos nombre comercial o razón social.
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-rfc">RFC</Label>
                  <p className="text-xs text-muted-foreground">{rfcHint}</p>
                  <Input
                    id="create-rfc"
                    value={form.rfc}
                    maxLength={13}
                    autoCapitalize="characters"
                    onChange={(event) => setForm((prev) => ({ ...prev, rfc: sanitizeRfcInput(event.target.value) }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-telefono-1">Teléfono principal</Label>
                  <div className="space-y-2">
                    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px]">
                      <Input
                        id="create-telefono-1"
                        value={form.telefono_principal_e164}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(event) => setForm((prev) => ({ ...prev, telefono_principal_e164: sanitizePhoneInput(event.target.value) }))}
                      />
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                        value={form.telefono_principal_tipo_linea}
                        onChange={(event) => setForm((prev) => ({ ...prev, telefono_principal_tipo_linea: event.target.value }))}
                      >
                        {PHONE_LINE_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {form.telefono_principal_tipo_linea === "fijo" ? (
                      <Input
                        placeholder="Extensión"
                        value={form.telefono_principal_extension}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(event) => setForm((prev) => ({ ...prev, telefono_principal_extension: sanitizePhoneInput(event.target.value) }))}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-telefono-2">Teléfono 2</Label>
                  <div className="space-y-2">
                    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px]">
                      <Input
                        id="create-telefono-2"
                        value={form.telefono_secundario_e164}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(event) => setForm((prev) => ({ ...prev, telefono_secundario_e164: sanitizePhoneInput(event.target.value) }))}
                      />
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                        value={form.telefono_secundario_tipo_linea}
                        onChange={(event) => setForm((prev) => ({ ...prev, telefono_secundario_tipo_linea: event.target.value }))}
                      >
                        {PHONE_LINE_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {form.telefono_secundario_tipo_linea === "fijo" ? (
                      <Input
                        placeholder="Extensión"
                        value={form.telefono_secundario_extension}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(event) => setForm((prev) => ({ ...prev, telefono_secundario_extension: sanitizePhoneInput(event.target.value) }))}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-sitio-web">Sitio web</Label>
                  <Input id="create-sitio-web" value={form.sitio_web} onChange={(event) => setForm((prev) => ({ ...prev, sitio_web: event.target.value }))} />
                </div>
                <Field label="Tamaño">
                  <ContactCatalogSelect
                    value={form.tamano}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, tamano: value }))}
                    options={tamanoOptions}
                    placeholder={tenantCatalogs.loading ? "Cargando catálogo..." : "Selecciona un tamaño"}
                    disabled={tamanoOptions.length === 0}
                    emptyLabel="Configura tamaños en Extras"
                  />
                </Field>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="create-clasificacion-negocio">Clasificación de negocio</Label>
                  <ContactCatalogSelect
                    value={form.tipo_establecimiento}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, tipo_establecimiento: value }))}
                    options={clasificacionNegocioOptions}
                    placeholder={tenantCatalogs.loading ? "Cargando catálogo..." : "Selecciona una clasificación"}
                    disabled={clasificacionNegocioOptions.length === 0}
                    emptyLabel="Configura opciones en Cuenta y contactos"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-fecha">Fecha de incorporación</Label>
                  <Input id="create-fecha" type="date" value={form.fecha_incorporacion || getTodayIsoDate()} readOnly disabled className="bg-muted" />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="create-notas">Notas</Label>
                  <Textarea id="create-notas" value={form.notas} onChange={(event) => setForm((prev) => ({ ...prev, notas: event.target.value }))} rows={4} />
                </div>
              </div>
            </FormSection>

            <FormSection
              title="Direcciones"
              description="Agrega el domicilio principal y, si aplica, sucursales o una dirección fiscal diferente."
            >
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="create-direccion-tipo">Tipo de dirección principal</Label>
                  <select
                    id="create-direccion-tipo"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                    value={primaryDirectionType}
                      onChange={(event) => setPrimaryDirectionType(event.target.value as AccountDirectionPrimaryType)}
                    >
                      <option value="fiscal">Fiscal</option>
                      <option value="principal">Principal</option>
                      <option value="sucursal">Sucursal</option>
                      <option value="fiscal_principal">Fiscal + principal</option>
                  </select>
                {primaryDirectionType === "fiscal" && extraDirections.some((item) => directionTypeIncludesFiscal(item.tipo)) ? (
                  <p className="text-xs text-amber-600">
                    Ya existe una dirección fiscal adicional. Cámbiala a principal o sucursal antes de guardar otra fiscal.
                  </p>
                ) : null}
                {primaryDirectionType !== "fiscal" && extraDirections.some((item) => directionTypeIncludesFiscal(item.tipo)) ? (
                  <p className="text-xs text-amber-600">
                    Ya existe una dirección fiscal adicional. Solo puede haber una dirección fiscal activa por empresa.
                  </p>
                ) : null}
              </div>
              <GeoLocationSelects
                countryCode={form.pais}
                stateCode={form.clave_entidad}
                municipalityCode={form.clave_municipio}
                onCountryChange={(countryCode) => {
                  const nextCountry = countryCode || "MX";
                  setForm((prev) => ({
                    ...prev,
                    pais: nextCountry,
                    ...(nextCountry !== "MX"
                      ? {
                          clave_entidad: "",
                          entidad: "",
                          clave_municipio: "",
                          municipio: "",
                        }
                      : {}),
                  }));
                }}
                onStateChange={(stateCode, stateName) => {
                  setForm((prev) => ({
                    ...prev,
                    clave_entidad: stateCode,
                    entidad: stateName,
                    clave_municipio: "",
                    municipio: "",
                  }));
                }}
                onMunicipalityChange={(municipalityCode, municipalityName) => {
                  setForm((prev) => ({
                    ...prev,
                    clave_municipio: municipalityCode,
                    municipio: municipalityName,
                  }));
                }}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Localidad">
                  <Input value={form.localidad} onChange={(event) => setForm((prev) => ({ ...prev, localidad: event.target.value }))} />
                </Field>
                <Field label="Tipo de vialidad">
                  <Input value={form.tipo_vialidad} onChange={(event) => setForm((prev) => ({ ...prev, tipo_vialidad: event.target.value }))} />
                </Field>
                <Field label="Nombre de vialidad">
                  <Input value={form.nombre_vialidad} onChange={(event) => setForm((prev) => ({ ...prev, nombre_vialidad: event.target.value }))} />
                </Field>
                <Field label="Número exterior">
                  <Input value={form.numero_exterior} onChange={(event) => setForm((prev) => ({ ...prev, numero_exterior: event.target.value }))} />
                </Field>
                <Field label="Letra exterior">
                  <Input value={form.letra_exterior} onChange={(event) => setForm((prev) => ({ ...prev, letra_exterior: event.target.value }))} />
                </Field>
                <Field label="Edificio">
                  <Input value={form.edificio} onChange={(event) => setForm((prev) => ({ ...prev, edificio: event.target.value }))} />
                </Field>
                <Field label="Piso / nivel">
                  <Input value={form.edificio_piso} onChange={(event) => setForm((prev) => ({ ...prev, edificio_piso: event.target.value }))} />
                </Field>
                <Field label="Número interior">
                  <Input value={form.numero_interior} onChange={(event) => setForm((prev) => ({ ...prev, numero_interior: event.target.value }))} />
                </Field>
                <Field label="Letra interior">
                  <Input value={form.letra_interior} onChange={(event) => setForm((prev) => ({ ...prev, letra_interior: event.target.value }))} />
                </Field>
                <Field label="Tipo de asentamiento">
                  <Input value={form.tipo_asentamiento} onChange={(event) => setForm((prev) => ({ ...prev, tipo_asentamiento: event.target.value }))} />
                </Field>
                <Field label="Colonia">
                  <Input
                    id="create-nombre-asentamiento"
                    value={form.nombre_asentamiento}
                    onChange={(event) => setForm((prev) => ({ ...prev, nombre_asentamiento: event.target.value }))}
                  />
                </Field>
                <Field label="Tipo de centro comercial">
                  <Input id="create-tipo-centro-comercial" value={form.tipo_centro_comercial} onChange={(event) => setForm((prev) => ({ ...prev, tipo_centro_comercial: event.target.value }))} />
                </Field>
                <Field label="Corredor industrial">
                  <Input id="create-corredor-industrial" value={form.corredor_industrial} onChange={(event) => setForm((prev) => ({ ...prev, corredor_industrial: event.target.value }))} />
                </Field>
                <Field label="Número local">
                  <Input id="create-numero-local" value={form.numero_local} onChange={(event) => setForm((prev) => ({ ...prev, numero_local: event.target.value }))} />
                </Field>
                <Field label="Código postal">
                  <Input id="create-codigo-postal" value={form.codigo_postal} onChange={(event) => setForm((prev) => ({ ...prev, codigo_postal: event.target.value }))} />
                </Field>
                <Field label="Latitud">
                  <Input id="create-latitud" type="number" step="any" value={form.latitud} onChange={(event) => setForm((prev) => ({ ...prev, latitud: event.target.value }))} />
                </Field>
                <Field label="Longitud">
                  <Input id="create-longitud" type="number" step="any" value={form.longitud} onChange={(event) => setForm((prev) => ({ ...prev, longitud: event.target.value }))} />
                </Field>
              </div>
              <div className="flex items-center justify-between gap-3 pt-2">
                <div>
                  <div className="text-sm font-semibold">Direcciones adicionales</div>
                  <p className="text-xs text-muted-foreground">
                    Puedes agregar sucursales o una dirección principal distinta. Solo puede haber una fiscal activa.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setExtraDirections((prev) => [...prev, createEmptyDirectionDraft()])}>
                  Agregar dirección
                </Button>
              </div>
              {extraDirections.length ? (
                <div className="space-y-4">
                  {extraDirections.map((direction, index) => (
                    <AccountDirectionCard
                      key={direction.key}
                      idPrefix={`create-extra-direction-${index}`}
                      value={direction}
                      lockFiscal={directionTypeIncludesFiscal(primaryDirectionType)}
                      onChange={(next) =>
                        setExtraDirections((prev) => prev.map((item, currentIndex) => (currentIndex === index ? next : item)))
                      }
                      onRemove={() =>
                        setExtraDirections((prev) => prev.filter((_, currentIndex) => currentIndex !== index))
                      }
                    />
                  ))}
                </div>
              ) : null}
            </FormSection>

            <FormSection title="Datos fiscales" description="Captura la información de facturación de la empresa.">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Uso CFDI">
                  <ContactCatalogSelect
                    value={form.uso_cfdi}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, uso_cfdi: value }))}
                    options={usoCfdiOptions}
                    placeholder="Selecciona un uso CFDI"
                    emptyLabel="Configura los usos CFDI en Extras"
                  />
                </Field>
                <Field label="Forma de pago">
                  <ContactCatalogSelect
                    value={form.forma_pago}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, forma_pago: value }))}
                    options={formaPagoOptions}
                    placeholder="Selecciona una forma de pago"
                    emptyLabel="Configura las formas de pago en Extras"
                  />
                </Field>
                <Field label="Método de pago">
                  <ContactCatalogSelect
                    value={form.metodo_pago}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, metodo_pago: value }))}
                    options={metodoPagoOptions}
                    placeholder="Selecciona un método de pago"
                    emptyLabel="Configura los métodos de pago en Extras"
                  />
                </Field>
                <Field label="Email de facturación">
                  <Input
                    id="create-email-facturacion"
                    value={form.email_facturacion}
                    onChange={(event) => setForm((prev) => ({ ...prev, email_facturacion: event.target.value }))}
                  />
                </Field>
              </div>
            </FormSection>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleCreateConfirm()} disabled={submitting}>
                {submitting ? "Creando..." : "Crear empresa"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
