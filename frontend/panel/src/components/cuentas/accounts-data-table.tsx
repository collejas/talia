"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconDotsVertical, IconPencil, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientDataTable } from "@/components/client-data-table";
import type { DataTableRow } from "@/components/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { GeoLocationSelects } from "@/components/contactos/geo-location-selects";
import { ContactCatalogSelect, mergeCatalogOptions } from "@/components/contactos/contact-catalog-select";
import { useTenantContactCatalogs } from "@/components/contactos/use-contact-catalogs";

type Props = {
  rows: DataTableRow[];
};

type DeleteTarget = {
  id: string;
  name: string;
};

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

const PHONE_LINE_TYPE_OPTIONS = [
  { value: "movil", label: "Móvil" },
  { value: "fijo", label: "Fijo" },
  { value: "whatsapp", label: "WhatsApp" },
] as const;

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

function AccountRowActions({
  row,
  onDeleteRequest,
}: {
  row: DataTableRow;
  onDeleteRequest: (target: DeleteTarget) => void;
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
        <DropdownMenuItem asChild>
          <Link href={`/cuentas/${encodeURIComponent(accountId)}?edit=1`}>
            <IconPencil className="mr-2 size-4" />
            Editar
          </Link>
        </DropdownMenuItem>
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
  const router = useRouter();
  const tenantCatalogs = useTenantContactCatalogs();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createSubmitting, setCreateSubmitting] = React.useState(false);
  const [createCodeLoading, setCreateCodeLoading] = React.useState(false);
  const [createExtrasOpen, setCreateExtrasOpen] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [createForm, setCreateForm] = React.useState<CreateAccountForm>({
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
  });
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = React.useState(false);

  const extraColumns = React.useMemo<ColumnDef<DataTableRow>[]>(() => [
    {
      id: "actions",
      cell: ({ row }) => (
        <AccountRowActions
          row={row.original}
          onDeleteRequest={(target) => setDeleteTarget(target)}
        />
      ),
      meta: { label: "Acciones", reorderable: false },
    },
  ], []);

  React.useEffect(() => {
    if (!createOpen) return;
    const controller = new AbortController();
    const run = async () => {
      setCreateCodeLoading(true);
      try {
        const response = await fetch(
          `/api/personas/cuentas/codigo-siguiente?tipo=${encodeURIComponent(createForm.tipo)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = (await response.json().catch(() => ({}))) as { codigo_cuenta?: string | null; error?: string };
        if (!response.ok) {
          throw new Error(body.error || "No se pudo generar el ID de empresa.");
        }
        setCreateForm((prev) =>
          prev.codigo_cuenta === (body.codigo_cuenta ?? "") ? prev : { ...prev, codigo_cuenta: body.codigo_cuenta ?? "" },
        );
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setCreateForm((prev) => ({ ...prev, codigo_cuenta: "" }));
        }
      } finally {
        if (!controller.signal.aborted) {
          setCreateCodeLoading(false);
        }
      }
    };
    void run();
    return () => controller.abort();
  }, [createOpen, createForm.tipo]);

  const openCreateDialog = () => {
    setCreateForm({
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
    });
    setCreateError(null);
    setCreateExtrasOpen(false);
    setCreateOpen(true);
  };

  const handleCreateConfirm = async () => {
    if (!createForm.nombre_comercial.trim() && !createForm.razon_social.trim()) {
      setCreateError("La empresa requiere nombre comercial o razón social.");
      return;
    }
    if (!createForm.tipo_persona.trim()) {
      setCreateError("Selecciona el tipo de persona.");
      return;
    }
    if (!createForm.telefono_principal_e164.trim()) {
      setCreateError("El teléfono principal es obligatorio.");
      return;
    }
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/cuentas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: createForm.tipo,
          nombre: createForm.nombre_comercial.trim() || createForm.razon_social.trim(),
          tipo_persona: createForm.tipo_persona.trim(),
          nombre_comercial: createForm.nombre_comercial.trim() || null,
          razon_social: createForm.razon_social.trim() || null,
          codigo_cuenta: createForm.codigo_cuenta.trim() || null,
          rfc: createForm.rfc.trim() || null,
          sitio_web: createForm.sitio_web.trim() || null,
          tamano: createForm.tamano.trim() || null,
          tipo_establecimiento: createForm.tipo_establecimiento.trim() || null,
          fecha_incorporacion: createForm.fecha_incorporacion.trim() || null,
          latitud: createForm.latitud.trim() && Number.isFinite(Number(createForm.latitud)) ? Number(createForm.latitud) : null,
          longitud: createForm.longitud.trim() && Number.isFinite(Number(createForm.longitud)) ? Number(createForm.longitud) : null,
          telefono_principal_e164: createForm.telefono_principal_e164.trim() || null,
          telefono_principal_tipo_linea: createForm.telefono_principal_tipo_linea || null,
          telefono_principal_extension: createForm.telefono_principal_extension.trim() || null,
          telefono_secundario_e164: createForm.telefono_secundario_e164.trim() || null,
          telefono_secundario_tipo_linea: createForm.telefono_secundario_tipo_linea || null,
          telefono_secundario_extension: createForm.telefono_secundario_extension.trim() || null,
          notas: createForm.notas.trim() || null,
          uso_cfdi: createForm.uso_cfdi.trim() || null,
          forma_pago: createForm.forma_pago.trim() || null,
          metodo_pago: createForm.metodo_pago.trim() || null,
          email_facturacion: createForm.email_facturacion.trim() || null,
          pais: createForm.pais.trim() || null,
          clave_entidad: createForm.clave_entidad.trim() || null,
          entidad: createForm.entidad.trim() || null,
          clave_municipio: createForm.clave_municipio.trim() || null,
          municipio: createForm.municipio.trim() || null,
          clave_localidad: createForm.clave_localidad.trim() || null,
          localidad: createForm.localidad.trim() || null,
          tipo_vialidad: createForm.tipo_vialidad.trim() || null,
          nombre_vialidad: createForm.nombre_vialidad.trim() || null,
          numero_exterior: createForm.numero_exterior.trim() || null,
          letra_exterior: createForm.letra_exterior.trim() || null,
          edificio: createForm.edificio.trim() || null,
          edificio_piso: createForm.edificio_piso.trim() || null,
          numero_interior: createForm.numero_interior.trim() || null,
          letra_interior: createForm.letra_interior.trim() || null,
          tipo_asentamiento: createForm.tipo_asentamiento.trim() || null,
          nombre_asentamiento: createForm.nombre_asentamiento.trim() || null,
          tipo_centro_comercial: createForm.tipo_centro_comercial.trim() || null,
          corredor_industrial: createForm.corredor_industrial.trim() || null,
          numero_local: createForm.numero_local.trim() || null,
          codigo_postal: createForm.codigo_postal.trim() || null,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "No se pudo crear la empresa.");
      }
      toast.success("Empresa creada.");
      setCreateOpen(false);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo crear la empresa.";
      setCreateError(message);
      toast.error(message);
    } finally {
      setCreateSubmitting(false);
    }
  };

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

  const clasificacionNegocioOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.clasificacionNegocioOptions, createForm.tipo_establecimiento),
    [createForm.tipo_establecimiento, tenantCatalogs.clasificacionNegocioOptions],
  );

  return (
    <>
      <div className="mb-4 flex items-center justify-end">
        <Button onClick={openCreateDialog}>
          Nueva empresa
        </Button>
      </div>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva empresa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="create-tipo">Tipo de alta *</Label>
                  <select
                    id="create-tipo"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                    value={createForm.tipo}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
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
                    value={createForm.nombre_comercial}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, nombre_comercial: event.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-razon-social">Razón social *</Label>
                  <Input
                    id="create-razon-social"
                    value={createForm.razon_social}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, razon_social: event.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-id">ID de empresa</Label>
                  <Input
                    id="create-id"
                    value={createForm.codigo_cuenta || (createCodeLoading ? "Generando..." : "Se generará automáticamente")}
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
                    value={createForm.tipo_persona}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, tipo_persona: event.target.value as CreateAccountForm["tipo_persona"] }))}
                    disabled={createForm.tipo === "persona_fisica_actividad_empresarial"}
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
                  <Input
                    id="create-rfc"
                    value={createForm.rfc}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, rfc: event.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-telefono-1">Teléfono principal *</Label>
                  <div className="space-y-2">
                    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px]">
                      <Input
                        id="create-telefono-1"
                        value={createForm.telefono_principal_e164}
                        onChange={(event) => setCreateForm((prev) => ({ ...prev, telefono_principal_e164: event.target.value }))}
                      />
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                        value={createForm.telefono_principal_tipo_linea}
                        onChange={(event) => setCreateForm((prev) => ({ ...prev, telefono_principal_tipo_linea: event.target.value }))}
                      >
                        {PHONE_LINE_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {createForm.telefono_principal_tipo_linea === "fijo" ? (
                      <Input
                        placeholder="Extensión"
                        value={createForm.telefono_principal_extension}
                        onChange={(event) => setCreateForm((prev) => ({ ...prev, telefono_principal_extension: event.target.value }))}
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
                        value={createForm.telefono_secundario_e164}
                        onChange={(event) => setCreateForm((prev) => ({ ...prev, telefono_secundario_e164: event.target.value }))}
                      />
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                        value={createForm.telefono_secundario_tipo_linea}
                        onChange={(event) => setCreateForm((prev) => ({ ...prev, telefono_secundario_tipo_linea: event.target.value }))}
                      >
                        {PHONE_LINE_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {createForm.telefono_secundario_tipo_linea === "fijo" ? (
                      <Input
                        placeholder="Extensión"
                        value={createForm.telefono_secundario_extension}
                        onChange={(event) => setCreateForm((prev) => ({ ...prev, telefono_secundario_extension: event.target.value }))}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-tamano">Tamaño</Label>
                  <Input
                    id="create-tamano"
                    value={createForm.tamano}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, tamano: event.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-sitio-web">Sitio web</Label>
                  <Input
                    id="create-sitio-web"
                    value={createForm.sitio_web}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, sitio_web: event.target.value }))}
                  />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="create-clasificacion-negocio">Clasificación de negocio</Label>
                  <ContactCatalogSelect
                    value={createForm.tipo_establecimiento}
                    onValueChange={(value) => setCreateForm((prev) => ({ ...prev, tipo_establecimiento: value }))}
                    options={clasificacionNegocioOptions}
                    placeholder={tenantCatalogs.loading ? "Cargando catálogo..." : "Selecciona una clasificación"}
                    disabled={clasificacionNegocioOptions.length === 0}
                    emptyLabel="Configura opciones en Cuenta y contactos"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-fecha">Fecha de incorporación</Label>
                  <Input
                    id="create-fecha"
                    type="date"
                    value={createForm.fecha_incorporacion}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, fecha_incorporacion: event.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-latitud">Latitud</Label>
                  <Input
                    id="create-latitud"
                    type="number"
                    step="any"
                    value={createForm.latitud}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, latitud: event.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-longitud">Longitud</Label>
                  <Input
                    id="create-longitud"
                    type="number"
                    step="any"
                    value={createForm.longitud}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, longitud: event.target.value }))}
                  />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="create-notas">Notas</Label>
                  <Textarea
                    id="create-notas"
                    value={createForm.notas}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, notas: event.target.value }))}
                    rows={4}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-border/60 bg-gradient-to-b from-muted/40 to-background p-4 shadow-sm">
                  <div className="text-sm font-semibold">Resumen</div>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl border border-border/60 bg-background p-3">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Empresa</div>
                      <div className="mt-1 text-sm font-semibold">
                        {createForm.nombre_comercial || createForm.razon_social || "Pendiente"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {[createForm.codigo_cuenta, createForm.rfc, createForm.sitio_web].filter(Boolean).join(" · ") || "Sin datos"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background p-3">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Contacto</div>
                      <div className="mt-1 text-sm font-semibold">
                        {[createForm.telefono_principal_e164, createForm.telefono_secundario_e164].filter(Boolean).join(" · ") || "Sin teléfono"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {createForm.tipo_persona || "Sin tipo de persona"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Datos opcionales</div>
                      <div className="text-xs text-muted-foreground">Datos fiscales, ubicación y domicilio.</div>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setCreateExtrasOpen((prev) => !prev)}>
                      {createExtrasOpen ? "Ocultar extras" : "Completar extras"}
                    </Button>
                  </div>
                  {createExtrasOpen ? (
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-2">
                        <Label htmlFor="create-uso-cfdi">Uso CFDI</Label>
                        <Input
                          id="create-uso-cfdi"
                          value={createForm.uso_cfdi}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, uso_cfdi: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-forma-pago">Forma de pago</Label>
                        <Input
                          id="create-forma-pago"
                          value={createForm.forma_pago}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, forma_pago: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-metodo-pago">Método de pago</Label>
                        <Input
                          id="create-metodo-pago"
                          value={createForm.metodo_pago}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, metodo_pago: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-email-facturacion">Email de facturación</Label>
                        <Input
                          id="create-email-facturacion"
                          value={createForm.email_facturacion}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, email_facturacion: event.target.value }))}
                        />
                      </div>
                      <GeoLocationSelects
                        countryCode={createForm.pais}
                        stateCode={createForm.clave_entidad}
                        municipalityCode={createForm.clave_municipio}
                        onCountryChange={(countryCode) => {
                          const nextCountry = countryCode || "MX";
                          setCreateForm((prev) => ({
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
                          setCreateForm((prev) => ({
                            ...prev,
                            clave_entidad: stateCode,
                            entidad: stateName,
                            clave_municipio: "",
                            municipio: "",
                          }));
                        }}
                        onMunicipalityChange={(municipalityCode, municipalityName) => {
                          setCreateForm((prev) => ({
                            ...prev,
                            clave_municipio: municipalityCode,
                            municipio: municipalityName,
                          }));
                        }}
                      />
                      <div className="grid gap-2">
                        <Label htmlFor="create-clave-localidad">Clave de localidad</Label>
                        <Input
                          id="create-clave-localidad"
                          value={createForm.clave_localidad}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, clave_localidad: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-localidad">Localidad</Label>
                        <Input
                          id="create-localidad"
                          value={createForm.localidad}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, localidad: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-tipo-vialidad">Tipo de vialidad</Label>
                        <Input
                          id="create-tipo-vialidad"
                          value={createForm.tipo_vialidad}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, tipo_vialidad: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-nombre-vialidad">Nombre de vialidad</Label>
                        <Input
                          id="create-nombre-vialidad"
                          value={createForm.nombre_vialidad}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, nombre_vialidad: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-numero-exterior">Número exterior</Label>
                        <Input
                          id="create-numero-exterior"
                          value={createForm.numero_exterior}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, numero_exterior: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-letra-exterior">Letra exterior</Label>
                        <Input
                          id="create-letra-exterior"
                          value={createForm.letra_exterior}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, letra_exterior: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-edificio">Edificio</Label>
                        <Input
                          id="create-edificio"
                          value={createForm.edificio}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, edificio: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-edificio-piso">Piso / nivel</Label>
                        <Input
                          id="create-edificio-piso"
                          value={createForm.edificio_piso}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, edificio_piso: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-numero-interior">Número interior</Label>
                        <Input
                          id="create-numero-interior"
                          value={createForm.numero_interior}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, numero_interior: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-letra-interior">Letra interior</Label>
                        <Input
                          id="create-letra-interior"
                          value={createForm.letra_interior}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, letra_interior: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-tipo-asentamiento">Tipo de asentamiento</Label>
                        <Input
                          id="create-tipo-asentamiento"
                          value={createForm.tipo_asentamiento}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, tipo_asentamiento: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-nombre-asentamiento">Nombre de asentamiento</Label>
                        <Input
                          id="create-nombre-asentamiento"
                          value={createForm.nombre_asentamiento}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, nombre_asentamiento: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-tipo-centro-comercial">Tipo de centro comercial</Label>
                        <Input
                          id="create-tipo-centro-comercial"
                          value={createForm.tipo_centro_comercial}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, tipo_centro_comercial: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-corredor-industrial">Corredor industrial</Label>
                        <Input
                          id="create-corredor-industrial"
                          value={createForm.corredor_industrial}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, corredor_industrial: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-numero-local">Número local</Label>
                        <Input
                          id="create-numero-local"
                          value={createForm.numero_local}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, numero_local: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="create-codigo-postal">Código postal</Label>
                        <Input
                          id="create-codigo-postal"
                          value={createForm.codigo_postal}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, codigo_postal: event.target.value }))}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={createSubmitting}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleCreateConfirm()} disabled={createSubmitting}>
                {createSubmitting ? "Creando..." : "Crear empresa"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
