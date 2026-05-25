"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { IconArrowLeft, IconBuilding, IconPencil, IconTrash, IconUserPlus, IconUsers, IconX } from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GeoLocationSelects } from "@/components/contactos/geo-location-selects";
import { ContactCatalogSelect, mergeCatalogOptions } from "@/components/contactos/contact-catalog-select";
import { sanitizePhoneInput, sanitizeRfcInput } from "@/components/contactos/contact-input-sanitizers";
import { useTenantContactCatalogs } from "@/components/contactos/use-contact-catalogs";

type AccountDetail = Record<string, unknown>;
type AccountRelation = {
  id: string;
  cuenta_id: string;
  persona_id: string;
  rol_en_cuenta: string | null;
  puesto: string | null;
  es_contacto_principal: boolean;
  es_contacto_facturacion: boolean;
  es_representante_legal: boolean;
  activo: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  notas: string | null;
  persona?: {
    id: string;
    nombre_completo: string | null;
    correo_principal: string | null;
    telefono_principal_e164: string | null;
    company_name: string | null;
  } | null;
};
type SearchItem = {
  id: string;
  nombre: string;
  alias: string | null;
  tipo: string | null;
  correo: string | null;
  telefono: string | null;
  empresa: string | null;
};
type DedupeCandidate = {
  id: string;
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
  empresa: string | null;
  nivel: string;
  motivo: string;
};
type AccountEditForm = {
  nombre: string;
  alias: string;
  razon_social: string;
  rfc: string;
  website: string;
  correo: string;
  telefono: string;
  industria: string;
  tamano: string;
  tipo_establecimiento: string;
  uso_cfdi: string;
  metodo_pago: string;
  forma_pago: string;
  email_facturacion: string;
  pais: string;
  clave_entidad: string;
  entidad: string;
  clave_municipio: string;
  municipio: string;
  localidad: string;
  clave_localidad: string;
  tipo_vialidad: string;
  nombre_vialidad: string;
  numero_exterior: string;
  letra_exterior: string;
  numero_interior: string;
  letra_interior: string;
  edificio: string;
  edificio_piso: string;
  tipo_asentamiento: string;
  nombre_asentamiento: string;
  tipo_centro_comercial: string;
  corredor_industrial: string;
  numero_local: string;
  codigo_postal: string;
  notas: string;
  necesidad_proposito: string;
};

function getText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "—";
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

function getInputText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
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

function formatDate(value: unknown): string {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-MX");
}

export function CuentaDetailView({ cuentaId }: { cuentaId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [detail, setDetail] = React.useState<AccountDetail | null>(null);
  const [relations, setRelations] = React.useState<AccountRelation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [relationsLoading, setRelationsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [relationsError, setRelationsError] = React.useState<string | null>(null);
  const [addRelationOpen, setAddRelationOpen] = React.useState(false);
  const [relationQuery, setRelationQuery] = React.useState("");
  const [relationResults, setRelationResults] = React.useState<SearchItem[]>([]);
  const [relationTargetId, setRelationTargetId] = React.useState<string>("");
  const [relationRole, setRelationRole] = React.useState("contacto_principal");
  const [relationSubmitting, setRelationSubmitting] = React.useState(false);
  const [relationDeletingId, setRelationDeletingId] = React.useState<string | null>(null);
  const [dedupeLoading, setDedupeLoading] = React.useState(true);
  const [dedupeError, setDedupeError] = React.useState<string | null>(null);
  const [dedupeCandidates, setDedupeCandidates] = React.useState<DedupeCandidate[]>([]);
  const [dedupeSuggestedId, setDedupeSuggestedId] = React.useState<string | null>(null);
  const [dedupeRequiresConfirmation, setDedupeRequiresConfirmation] = React.useState(false);
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const [mergeQuery, setMergeQuery] = React.useState("");
  const [mergeResults, setMergeResults] = React.useState<SearchItem[]>([]);
  const [mergeLoading, setMergeLoading] = React.useState(false);
  const [mergeError, setMergeError] = React.useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = React.useState<string>("");
  const [mergeSubmitting, setMergeSubmitting] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editSubmitting, setEditSubmitting] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState<AccountEditForm>({
    nombre: "",
    alias: "",
    razon_social: "",
    rfc: "",
    website: "",
    correo: "",
    telefono: "",
    industria: "",
    tamano: "",
    tipo_establecimiento: "",
    uso_cfdi: "",
    metodo_pago: "",
    forma_pago: "",
    email_facturacion: "",
    pais: "",
    clave_entidad: "",
    entidad: "",
    clave_municipio: "",
    municipio: "",
    localidad: "",
    clave_localidad: "",
    tipo_vialidad: "",
    nombre_vialidad: "",
    numero_exterior: "",
    letra_exterior: "",
    numero_interior: "",
    letra_interior: "",
    edificio: "",
    edificio_piso: "",
    tipo_asentamiento: "",
    nombre_asentamiento: "",
    tipo_centro_comercial: "",
    corredor_industrial: "",
    numero_local: "",
    codigo_postal: "",
    notas: "",
    necesidad_proposito: "",
  });

  const tenantCatalogs = useTenantContactCatalogs();
  const usoCfdiOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.usoCfdiOptions, editForm.uso_cfdi),
    [editForm.uso_cfdi, tenantCatalogs.usoCfdiOptions],
  );
  const tamanoOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.tamanoOptions, editForm.tamano),
    [editForm.tamano, tenantCatalogs.tamanoOptions],
  );
  const formaPagoOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.formaPagoOptions, editForm.forma_pago),
    [editForm.forma_pago, tenantCatalogs.formaPagoOptions],
  );
  const metodoPagoOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.metodoPagoOptions, editForm.metodo_pago),
    [editForm.metodo_pago, tenantCatalogs.metodoPagoOptions],
  );

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/cuentas/${encodeURIComponent(cuentaId)}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as AccountDetail & { error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo cargar la empresa.");
      setDetail(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la empresa.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [cuentaId]);

  const loadRelations = React.useCallback(async () => {
    setRelationsLoading(true);
    setRelationsError(null);
    try {
      const response = await fetch(`/api/cuentas/${encodeURIComponent(cuentaId)}/relaciones`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as { items?: AccountRelation[]; error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudieron cargar las relaciones.");
      setRelations(Array.isArray(body.items) ? body.items : []);
    } catch (err) {
      setRelationsError(err instanceof Error ? err.message : "No se pudieron cargar las relaciones.");
      setRelations([]);
    } finally {
      setRelationsLoading(false);
    }
  }, [cuentaId]);

  const loadDedupe = React.useCallback(async () => {
    setDedupeLoading(true);
    setDedupeError(null);
    try {
      const response = await fetch(`/api/cuentas/${encodeURIComponent(cuentaId)}/dedupe`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as {
        candidatos?: DedupeCandidate[];
        sugerencia_reutilizar_id?: string | null;
        requiere_confirmacion?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "No se pudieron cargar los candidatos.");
      setDedupeCandidates(Array.isArray(body.candidatos) ? body.candidatos : []);
      setDedupeSuggestedId(body.sugerencia_reutilizar_id ?? null);
      setDedupeRequiresConfirmation(Boolean(body.requiere_confirmacion));
    } catch (err) {
      setDedupeError(err instanceof Error ? err.message : "No se pudieron cargar los candidatos.");
      setDedupeCandidates([]);
      setDedupeSuggestedId(null);
      setDedupeRequiresConfirmation(false);
    } finally {
      setDedupeLoading(false);
    }
  }, [cuentaId]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  React.useEffect(() => {
    void loadRelations();
  }, [loadRelations]);

  React.useEffect(() => {
    void loadDedupe();
  }, [loadDedupe]);

  React.useEffect(() => {
    if (searchParams.get("edit") === "1" && detail && !editOpen) {
      openEditDialog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, detail]);

  React.useEffect(() => {
    const query = relationQuery.trim();
    if (!addRelationOpen) return;
    if (query.length < 2) {
      setRelationResults([]);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      try {
        const response = await fetch(`/api/personas/search?q=${encodeURIComponent(query)}&limit=10`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => ({}))) as { items?: SearchItem[]; error?: string };
        if (!response.ok) throw new Error(body.error || "No se pudieron buscar personas.");
        setRelationResults(Array.isArray(body.items) ? body.items : []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setRelationResults([]);
        }
      }
    };
    void run();
    return () => controller.abort();
  }, [addRelationOpen, relationQuery]);

  React.useEffect(() => {
    const query = mergeQuery.trim();
    if (!mergeOpen) return;
    if (query.length < 2) {
      setMergeResults([]);
      setMergeLoading(false);
      setMergeError(null);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      setMergeLoading(true);
      setMergeError(null);
      try {
        const response = await fetch(`/api/personas/cuentas?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => ({}))) as { items?: SearchItem[]; error?: string };
        if (!response.ok) throw new Error(body.error || "No se pudieron buscar empresas.");
        setMergeResults(Array.isArray(body.items) ? body.items : []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMergeError(err instanceof Error ? err.message : "No se pudieron buscar empresas.");
          setMergeResults([]);
        }
      } finally {
        setMergeLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [mergeOpen, mergeQuery]);

  const name = getText(detail?.nombre);
  const alias = getText(detail?.alias);
  const tipo = getText(detail?.tipo);
  const rfc = getText(detail?.rfc);
  const industry = getText(detail?.industria);
  const email = getText(detail?.correo ?? detail?.email);
  const phone = getText(detail?.telefono);
  const website = getText(detail?.sitio_web ?? detail?.website);
  const updatedAt = formatDate(detail?.actualizado_en);
  const createdAt = formatDate(detail?.creado_en);

  const handleMerge = async () => {
    if (!mergeTargetId) {
      toast.error("Selecciona una empresa destino.");
      return;
    }
    setMergeSubmitting(true);
    try {
      const response = await fetch(`/api/cuentas/${encodeURIComponent(cuentaId)}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_cuenta_id: mergeTargetId }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; target_cuenta_id?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo fusionar.");
      toast.success("Fusión de empresa completada.");
      setMergeOpen(false);
      setMergeQuery("");
      setMergeResults([]);
      setMergeTargetId("");
      if (body.target_cuenta_id) {
        router.replace(`/empresas/${encodeURIComponent(body.target_cuenta_id)}`);
      } else {
        void loadData();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo fusionar.");
    } finally {
      setMergeSubmitting(false);
    }
  };

  const openEditDialog = () => {
    setEditForm({
      nombre: getInputText(detail?.nombre),
      alias: getInputText(detail?.alias),
      razon_social: getInputText(detail?.razon_social),
      rfc: sanitizeRfcInput(getInputText(detail?.rfc)),
      website: getInputText(detail?.website ?? detail?.sitio_web),
      correo: getInputText(detail?.correo ?? detail?.email ?? detail?.correo_principal),
      telefono: sanitizePhoneInput(getInputText(detail?.telefono)),
      industria: getInputText(detail?.industria),
      tamano: getInputText(detail?.tamano),
      tipo_establecimiento: getInputText(detail?.tipo_establecimiento),
      uso_cfdi: getInputText(detail?.uso_cfdi),
      metodo_pago: getInputText(detail?.metodo_pago),
      forma_pago: getInputText(detail?.forma_pago),
      email_facturacion: getInputText(detail?.email_facturacion),
      pais: getInputText(detail?.pais),
      clave_entidad: getInputText(detail?.clave_entidad),
      entidad: getInputText(detail?.entidad),
      clave_municipio: getInputText(detail?.clave_municipio),
      municipio: getInputText(detail?.municipio),
      localidad: getInputText(detail?.localidad),
      clave_localidad: getInputText(detail?.clave_localidad),
      tipo_vialidad: getInputText(detail?.tipo_vialidad),
      nombre_vialidad: getInputText(detail?.nombre_vialidad),
      numero_exterior: getInputText(detail?.numero_exterior),
      letra_exterior: getInputText(detail?.letra_exterior),
      numero_interior: getInputText(detail?.numero_interior),
      letra_interior: getInputText(detail?.letra_interior),
      edificio: getInputText(detail?.edificio),
      edificio_piso: getInputText(detail?.edificio_piso),
      tipo_asentamiento: getInputText(detail?.tipo_asentamiento),
      nombre_asentamiento: getInputText(detail?.nombre_asentamiento),
      tipo_centro_comercial: getInputText(detail?.tipo_centro_comercial),
      corredor_industrial: getInputText(detail?.corredor_industrial),
      numero_local: getInputText(detail?.numero_local),
      codigo_postal: getInputText(detail?.codigo_postal),
      notas: getInputText(detail?.notas),
      necesidad_proposito: getInputText(detail?.necesidad_proposito),
    });
    setEditError(null);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    const normalizedRfc = sanitizeRfcInput(editForm.rfc);
    if (editForm.rfc.trim() && normalizedRfc.length !== 13) {
      const message = "El RFC debe tener exactamente 13 caracteres alfanuméricos.";
      setEditError(message);
      toast.error(message);
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      const response = await fetch(`/api/cuentas/${encodeURIComponent(cuentaId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: editForm.nombre.trim(),
          alias: editForm.alias.trim(),
          razon_social: editForm.razon_social.trim(),
          rfc: sanitizeRfcInput(editForm.rfc) || null,
          website: editForm.website.trim(),
          correo: editForm.correo.trim(),
          telefono: sanitizePhoneInput(editForm.telefono) || null,
          industria: editForm.industria.trim(),
          tamano: editForm.tamano.trim(),
          tipo_establecimiento: editForm.tipo_establecimiento.trim(),
          uso_cfdi: editForm.uso_cfdi.trim(),
          metodo_pago: editForm.metodo_pago.trim(),
          forma_pago: editForm.forma_pago.trim(),
          email_facturacion: editForm.email_facturacion.trim(),
          pais: editForm.pais.trim(),
          clave_entidad: editForm.clave_entidad.trim(),
          entidad: editForm.entidad.trim(),
          clave_municipio: editForm.clave_municipio.trim(),
          municipio: editForm.municipio.trim(),
          localidad: editForm.localidad.trim(),
          clave_localidad: editForm.clave_localidad.trim(),
          tipo_vialidad: editForm.tipo_vialidad.trim(),
          nombre_vialidad: editForm.nombre_vialidad.trim(),
          numero_exterior: editForm.numero_exterior.trim(),
          letra_exterior: editForm.letra_exterior.trim(),
          numero_interior: editForm.numero_interior.trim(),
          letra_interior: editForm.letra_interior.trim(),
          edificio: editForm.edificio.trim(),
          edificio_piso: editForm.edificio_piso.trim(),
          tipo_asentamiento: editForm.tipo_asentamiento.trim(),
          nombre_asentamiento: editForm.nombre_asentamiento.trim(),
          tipo_centro_comercial: editForm.tipo_centro_comercial.trim(),
          corredor_industrial: editForm.corredor_industrial.trim(),
          numero_local: editForm.numero_local.trim(),
          codigo_postal: editForm.codigo_postal.trim(),
          notas: editForm.notas.trim(),
          necesidad_proposito: editForm.necesidad_proposito.trim(),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo actualizar la empresa.");
      toast.success("Empresa actualizada.");
      setEditOpen(false);
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo actualizar la empresa.";
      setEditError(message);
      toast.error(message);
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/cuentas/${encodeURIComponent(cuentaId)}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        const blockedMessage = formatDeleteBlockedMessage(body.error);
        if (blockedMessage) throw new Error(blockedMessage);
        throw new Error(body.error || "No se pudo eliminar la empresa.");
      }
      toast.success("Empresa eliminada.");
      setDeleteOpen(false);
      router.push("/empresas");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo eliminar la empresa.";
      setDeleteError(message);
      toast.error(message);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleAddRelation = async () => {
    if (!relationTargetId) {
      toast.error("Selecciona una persona.");
      return;
    }
    setRelationSubmitting(true);
    try {
      const response = await fetch(`/api/cuentas/${encodeURIComponent(cuentaId)}/relaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona_id: relationTargetId,
          rol_en_cuenta: relationRole,
          activo: true,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo vincular.");
      toast.success("Relación agregada.");
      setAddRelationOpen(false);
      setRelationQuery("");
      setRelationResults([]);
      setRelationTargetId("");
      setRelationRole("contacto_principal");
      await loadRelations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo vincular.");
    } finally {
      setRelationSubmitting(false);
    }
  };

  const handleRemoveRelation = async (relacionId: string) => {
    setRelationDeletingId(relacionId);
    try {
      const response = await fetch(
        `/api/cuentas/${encodeURIComponent(cuentaId)}/relaciones/${encodeURIComponent(relacionId)}`,
        {
          method: "DELETE",
        },
      );
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo eliminar la relación.");
      toast.success("Relación eliminada.");
      await loadRelations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar la relación.");
    } finally {
      setRelationDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="rounded-2xl border bg-background p-8 text-sm text-muted-foreground">Cargando empresa...</div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-6xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Button asChild variant="outline">
            <Link href="/empresas">
              <IconArrowLeft className="mr-2 size-4" />
              Volver
            </Link>
          </Button>
        </div>
        <div className="rounded-2xl border bg-background p-8 text-sm text-destructive">{error || "No se encontró la empresa."}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Ficha de empresa</div>
          <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{alias !== "—" ? alias : "Sin alias"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={openEditDialog}>
            <IconPencil className="mr-2 size-4" />
            Editar
          </Button>
          <Button asChild variant="outline">
            <Link href="/empresas">
              <IconArrowLeft className="mr-2 size-4" />
              Volver al listado
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setMergeOpen(true)}>
            <IconUsers className="mr-2 size-4" />
            Fusionar
          </Button>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <IconTrash className="mr-2 size-4" />
            Eliminar
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
            <CardDescription>Datos base de la empresa y trazabilidad operativa.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <div className="grid gap-1">
              <span className="text-muted-foreground">Tipo</span>
              <span>{tipo}</span>
            </div>
            <div className="grid gap-1">
              <span className="text-muted-foreground">Industria</span>
              <span>{industry}</span>
            </div>
            <div className="grid gap-1">
              <span className="text-muted-foreground">RFC</span>
              <span>{rfc}</span>
            </div>
            <div className="grid gap-1">
              <span className="text-muted-foreground">Correo</span>
              <span>{email}</span>
            </div>
            <div className="grid gap-1">
              <span className="text-muted-foreground">Teléfono</span>
              <span>{phone}</span>
            </div>
            <div className="grid gap-1">
              <span className="text-muted-foreground">Sitio web</span>
              <span>{website}</span>
            </div>
            <div className="grid gap-1">
              <span className="text-muted-foreground">Creado</span>
              <span>{createdAt}</span>
            </div>
            <div className="grid gap-1">
              <span className="text-muted-foreground">Actualizado</span>
              <span>{updatedAt}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acciones</CardTitle>
            <CardDescription>Acceso rápido a la ficha, vínculos y merge.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button asChild variant="outline" className="justify-start">
              <Link href="/empresas">
                <IconBuilding className="mr-2 size-4" />
                Volver al listado
              </Link>
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => setMergeOpen(true)}>
              <IconUsers className="mr-2 size-4" />
              Fusionar con otra empresa
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => setAddRelationOpen(true)}>
              <IconUserPlus className="mr-2 size-4" />
              Vincular persona
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Relaciones de empresa</CardTitle>
            <CardDescription>Personas vinculadas a esta empresa y su rol operativo.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {relationsLoading ? (
              <p className="text-sm text-muted-foreground">Cargando relaciones...</p>
            ) : relationsError ? (
              <p className="text-sm text-destructive">{relationsError}</p>
            ) : relations.length ? (
              relations.map((relation) => {
                const person = relation.persona;
                const personName = person?.nombre_completo || getText(relation.persona_id);
                const personSubtitle = person?.correo_principal || person?.telefono_principal_e164 || person?.company_name || "Sin datos";
                return (
                  <div key={relation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
                    <div className="grid gap-1">
                      <div className="font-medium">{personName}</div>
                      <div className="text-xs text-muted-foreground">
                        {relation.rol_en_cuenta || "contacto_principal"} · {personSubtitle}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {relation.activo ? "Activa" : "Inactiva"} · {relation.puesto || "Sin puesto"}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/personas/${encodeURIComponent(relation.persona_id)}`}>
                          Abrir persona
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleRemoveRelation(relation.id)}
                        disabled={relationDeletingId === relation.id}
                      >
                        <IconTrash className="mr-2 size-4" />
                        {relationDeletingId === relation.id ? "Quitando..." : "Quitar"}
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">No hay relaciones registradas.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Posibles duplicados</CardTitle>
            <CardDescription>Regla formal de dedupe para esta empresa.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {dedupeLoading ? (
              <p className="text-sm text-muted-foreground">Cargando candidatos...</p>
            ) : dedupeError ? (
              <p className="text-sm text-destructive">{dedupeError}</p>
            ) : dedupeCandidates.length ? (
              <>
                {dedupeRequiresConfirmation ? (
                  <p className="text-xs text-muted-foreground">Hay candidatos que requieren confirmación manual.</p>
                ) : null}
                {dedupeCandidates.map((candidate) => (
                  <div key={candidate.id} className="rounded-xl border bg-muted/20 p-4 text-sm">
                    <div className="font-medium">{candidate.nombre || candidate.id}</div>
                    <div className="text-xs text-muted-foreground">
                      {candidate.nivel} · {candidate.motivo} · {candidate.empresa || "Sin empresa"}
                    </div>
                  </div>
                ))}
                {dedupeSuggestedId ? (
                  <div className="text-xs text-muted-foreground">
                    Sugerido para reutilizar: {dedupeSuggestedId}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Sin candidatos de dedupe.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fusionar empresa</DialogTitle>
            <DialogDescription>
              Busca la empresa destino. La fuente quedará archivada con trazabilidad de merge.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="merge-target-account">Buscar empresa destino</Label>
              <Input
                id="merge-target-account"
                value={mergeQuery}
                onChange={(event) => setMergeQuery(event.target.value)}
                placeholder="Nombre, RFC, alias..."
              />
            </div>
            {mergeLoading ? <p className="text-xs text-muted-foreground">Buscando empresas...</p> : null}
            {mergeError ? <p className="text-xs text-destructive">{mergeError}</p> : null}
            {mergeResults.length ? (
              <div className="grid gap-2">
                {mergeResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full rounded-xl border px-4 py-3 text-left ${mergeTargetId === item.id ? "border-foreground bg-muted/40" : "border-border/60 bg-background"}`}
                    onClick={() => setMergeTargetId(item.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{item.nombre}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.alias || "Sin alias"} · {item.tipo || "Cuenta"}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.telefono || item.correo || "Sin datos"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setMergeOpen(false)} disabled={mergeSubmitting}>
                <IconX className="mr-2 size-4" />
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleMerge()} disabled={mergeSubmitting || !mergeTargetId}>
                {mergeSubmitting ? "Fusionando..." : "Fusionar seleccionado"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Vas a eliminar <strong>{name}</strong>.
            </p>
            <p className="text-muted-foreground">
              El sistema bloqueará la eliminación si la empresa tiene contactos u oportunidades vinculadas.
            </p>
            {deleteError ? <p className="text-destructive">{deleteError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteSubmitting}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDeleteAccount()} disabled={deleteSubmitting}>
              {deleteSubmitting ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Editar empresa</DialogTitle>
            <DialogDescription>
              Actualiza los datos principales sin tocar el código de empresa.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(90vh-6rem)] space-y-4 overflow-y-auto pr-1">

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="edit-nombre">Nombre</Label>
                <Input
                  id="edit-nombre"
                  value={editForm.nombre}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, nombre: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-alias">Alias</Label>
                <Input
                  id="edit-alias"
                  value={editForm.alias}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, alias: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-razon-social">Razón social</Label>
                <Input
                  id="edit-razon-social"
                  value={editForm.razon_social}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, razon_social: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-rfc">RFC</Label>
                <Input
                  id="edit-rfc"
                  value={editForm.rfc}
                  maxLength={13}
                  autoCapitalize="characters"
                  onChange={(event) => setEditForm((prev) => ({ ...prev, rfc: sanitizeRfcInput(event.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-correo">Correo</Label>
                <Input
                  id="edit-correo"
                  value={editForm.correo}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, correo: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-telefono">Teléfono</Label>
                <Input
                  id="edit-telefono"
                  value={editForm.telefono}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  onChange={(event) => setEditForm((prev) => ({ ...prev, telefono: sanitizePhoneInput(event.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-industria">Industria</Label>
                <Input
                  id="edit-industria"
                  value={editForm.industria}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, industria: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-sitio-web">Sitio web</Label>
                <Input
                  id="edit-sitio-web"
                  value={editForm.website}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, website: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-tamano">Tamaño</Label>
                <ContactCatalogSelect
                  value={editForm.tamano}
                  onValueChange={(value) => setEditForm((prev) => ({ ...prev, tamano: value }))}
                  options={tamanoOptions}
                  placeholder="Selecciona un tamaño"
                  disabled={tamanoOptions.length === 0}
                  emptyLabel="Configura tamaños en Extras"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-tipo-establecimiento">Clasificación de negocio</Label>
                <Input
                  id="edit-tipo-establecimiento"
                  value={editForm.tipo_establecimiento}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, tipo_establecimiento: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Uso CFDI">
                <ContactCatalogSelect
                  value={editForm.uso_cfdi}
                  onValueChange={(value) => setEditForm((prev) => ({ ...prev, uso_cfdi: value }))}
                  options={usoCfdiOptions}
                  placeholder="Selecciona un uso CFDI"
                  emptyLabel="Configura los usos CFDI en Extras"
                />
              </Field>
              <Field label="Forma de pago">
                <ContactCatalogSelect
                  value={editForm.forma_pago}
                  onValueChange={(value) => setEditForm((prev) => ({ ...prev, forma_pago: value }))}
                  options={formaPagoOptions}
                  placeholder="Selecciona una forma de pago"
                  emptyLabel="Configura las formas de pago en Extras"
                />
              </Field>
              <Field label="Método de pago">
                <ContactCatalogSelect
                  value={editForm.metodo_pago}
                  onValueChange={(value) => setEditForm((prev) => ({ ...prev, metodo_pago: value }))}
                  options={metodoPagoOptions}
                  placeholder="Selecciona un método de pago"
                  emptyLabel="Configura los métodos de pago en Extras"
                />
              </Field>
              <Field label="Email de facturación">
                <Input
                  id="edit-email-facturacion"
                  value={editForm.email_facturacion}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, email_facturacion: event.target.value }))}
                />
              </Field>
            </div>

            <div className="grid gap-4">
              <GeoLocationSelects
                countryCode={editForm.pais || "MX"}
                stateCode={editForm.clave_entidad}
                municipalityCode={editForm.clave_municipio}
                onCountryChange={(countryCode) =>
                  setEditForm((prev) => ({
                    ...prev,
                    pais: countryCode,
                    clave_entidad: "",
                    entidad: "",
                    clave_municipio: "",
                    municipio: "",
                  }))
                }
                onStateChange={(stateCode, stateName) =>
                  setEditForm((prev) => ({
                    ...prev,
                    clave_entidad: stateCode,
                    entidad: stateName,
                    clave_municipio: "",
                    municipio: "",
                  }))
                }
                onMunicipalityChange={(municipalityCode, municipalityName) =>
                  setEditForm((prev) => ({
                    ...prev,
                    clave_municipio: municipalityCode,
                    municipio: municipalityName,
                  }))
                }
              />
              <div className="grid gap-2">
                <Label htmlFor="edit-localidad">Localidad</Label>
                <Input
                  id="edit-localidad"
                  value={editForm.localidad}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, localidad: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="edit-tipo-vialidad">Tipo de vialidad</Label>
                <Input
                  id="edit-tipo-vialidad"
                  value={editForm.tipo_vialidad}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, tipo_vialidad: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-nombre-vialidad">Nombre de vialidad</Label>
                <Input
                  id="edit-nombre-vialidad"
                  value={editForm.nombre_vialidad}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, nombre_vialidad: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-numero-exterior">Número exterior</Label>
                <Input
                  id="edit-numero-exterior"
                  value={editForm.numero_exterior}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, numero_exterior: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-letra-exterior">Letra exterior</Label>
                <Input
                  id="edit-letra-exterior"
                  value={editForm.letra_exterior}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, letra_exterior: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-numero-interior">Número interior</Label>
                <Input
                  id="edit-numero-interior"
                  value={editForm.numero_interior}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, numero_interior: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-letra-interior">Letra interior</Label>
                <Input
                  id="edit-letra-interior"
                  value={editForm.letra_interior}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, letra_interior: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-edificio">Edificio</Label>
                <Input
                  id="edit-edificio"
                  value={editForm.edificio}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, edificio: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-edificio-piso">Piso / nivel</Label>
                <Input
                  id="edit-edificio-piso"
                  value={editForm.edificio_piso}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, edificio_piso: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-tipo-asentamiento">Tipo de asentamiento</Label>
                <Input
                  id="edit-tipo-asentamiento"
                  value={editForm.tipo_asentamiento}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, tipo_asentamiento: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-nombre-asentamiento">Nombre de asentamiento</Label>
                <Input
                  id="edit-nombre-asentamiento"
                  value={editForm.nombre_asentamiento}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, nombre_asentamiento: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-tipo-centro-comercial">Tipo de centro comercial</Label>
                <Input
                  id="edit-tipo-centro-comercial"
                  value={editForm.tipo_centro_comercial}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, tipo_centro_comercial: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-corredor-industrial">Corredor industrial</Label>
                <Input
                  id="edit-corredor-industrial"
                  value={editForm.corredor_industrial}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, corredor_industrial: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-numero-local">Número local</Label>
                <Input
                  id="edit-numero-local"
                  value={editForm.numero_local}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, numero_local: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-codigo-postal">Código postal</Label>
                <Input
                  id="edit-codigo-postal"
                  value={editForm.codigo_postal}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, codigo_postal: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-notas">Notas</Label>
              <Textarea
                id="edit-notas"
                value={editForm.notas}
                onChange={(event) => setEditForm((prev) => ({ ...prev, notas: event.target.value }))}
                rows={4}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-necesidad-proposito">Necesidad / propósito</Label>
              <Textarea
                id="edit-necesidad-proposito"
                value={editForm.necesidad_proposito}
                onChange={(event) => setEditForm((prev) => ({ ...prev, necesidad_proposito: event.target.value }))}
                rows={3}
              />
            </div>

            {editError ? <p className="text-sm text-destructive">{editError}</p> : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={editSubmitting}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleSaveEdit()} disabled={editSubmitting}>
                {editSubmitting ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addRelationOpen} onOpenChange={setAddRelationOpen}>
        <DialogContent className="max-w-2xl">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Vincular persona</h2>
              <p className="text-sm text-muted-foreground">
                Busca una persona y asígnala a esta cuenta sin pasar por el flujo legacy.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="relation-person-search">Buscar persona</Label>
              <Input
                id="relation-person-search"
                value={relationQuery}
                onChange={(event) => setRelationQuery(event.target.value)}
                placeholder="Nombre, correo, teléfono..."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="relation-role">Rol en cuenta</Label>
              <Input
                id="relation-role"
                value={relationRole}
                onChange={(event) => setRelationRole(event.target.value)}
                placeholder="contacto_principal"
              />
            </div>
            {relationResults.length ? (
              <div className="grid gap-2">
                {relationResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full rounded-xl border px-4 py-3 text-left ${relationTargetId === item.id ? "border-foreground bg-muted/40" : "border-border/60 bg-background"}`}
                    onClick={() => setRelationTargetId(item.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{item.nombre}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.empresa || "Sin empresa"}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.telefono || item.correo || "Sin datos"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAddRelationOpen(false)} disabled={relationSubmitting}>
                <IconX className="mr-2 size-4" />
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleAddRelation()} disabled={relationSubmitting || !relationTargetId}>
                {relationSubmitting ? "Vinculando..." : "Vincular seleccionado"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
