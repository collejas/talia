"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { IconClipboard, IconLink, IconRefresh } from "@tabler/icons-react";

import type { EmbudoCard, EmbudoStage } from "@/lib/embudo/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type {
  ClienteDocumento,
  ClienteRecord,
  ClienteDocumentoTipo,
} from "@/types/clientes";

const DOCUMENT_COPY: Record<string, { title: string; hint: string }> = {
  constancia_fiscal: {
    title: "Constancia fiscal",
    hint: "Archivo PDF vigente emitido por el SAT.",
  },
  comprobante_domicilio: {
    title: "Comprobante de domicilio",
    hint: "Estado de cuenta o recibo (menor a 3 meses).",
  },
  identificacion_oficial: {
    title: "Identificación oficial",
    hint: "INE o pasaporte de quien firmará.",
  },
  contrato_servicio: {
    title: "Contrato de servicios",
    hint: "Versión firmada por ambas partes.",
  },
  nda: {
    title: "Acuerdo de confidencialidad",
    hint: "Opcional si ya existe un NDA previo.",
  },
  otro: {
    title: "Documento adicional",
    hint: "Cualquier archivo complementario.",
  },
};

const DOCUMENT_ORDER: ClienteDocumentoTipo[] = [
  "constancia_fiscal",
  "comprobante_domicilio",
  "identificacion_oficial",
  "contrato_servicio",
  "nda",
];

const ONBOARDING_STATE_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
};

type ClienteFormState = {
  rfc: string;
  razon_social: string;
  domicilio_fiscal: string;
  domicilio_fisico: string;
  regimen_fiscal: string;
  estado_onboarding: "pendiente" | "en_progreso" | "completado";
};

const EMPTY_FORM: ClienteFormState = {
  rfc: "",
  razon_social: "",
  domicilio_fiscal: "",
  domicilio_fisico: "",
  regimen_fiscal: "",
  estado_onboarding: "pendiente",
};

export type LeadOnboardingPanelProps = {
  card: EmbudoCard | null;
  currentStage: EmbudoStage | null;
  isOpen: boolean;
  isCreateMode: boolean;
  active: boolean;
};

type PortalLinkResponse = {
  link?: string;
  email?: {
    sent?: boolean;
    recipients?: string[];
    attempted?: boolean;
    reason?: string;
  };
  error?: string;
};

type ClienteContextResponse = {
  cliente?: ClienteRecord | null;
  cliente_por_oportunidad?: ClienteRecord | null;
  cliente_existente_por_contacto?: ClienteRecord | null;
  puede_convertir?: boolean;
  razon_no_convertir?: string | null;
  error?: string;
};

export function LeadOnboardingPanel({
  card,
  currentStage,
  isOpen,
  isCreateMode,
  active,
}: LeadOnboardingPanelProps) {
  const oportunidadId = card?.oportunidadId ?? null;
  const [cliente, setCliente] = useState<ClienteRecord | null>(null);
  const [clienteError, setClienteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [portalGenerating, setPortalGenerating] = useState(false);
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const [clienteContext, setClienteContext] = useState<{
    puedeConvertir: boolean;
    razonNoConvertir: string | null;
  }>({
    puedeConvertir: false,
    razonNoConvertir: null,
  });
  const [formState, setFormState] = useState<ClienteFormState>(EMPTY_FORM);

  const shouldLoad = active && isOpen && !isCreateMode && Boolean(oportunidadId);

  const loadCliente = useCallback(async () => {
    if (!oportunidadId) return;
    setLoading(true);
    setClienteError(null);
    try {
      const response = await fetch(`/api/embudo/leads/${oportunidadId}/cliente`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "No se pudo recuperar al cliente.",
        );
      }
      const data = payload as ClienteContextResponse;
      const clienteActivo = data?.cliente ?? data?.cliente_existente_por_contacto ?? null;
      setCliente(clienteActivo);
      setClienteContext({
        puedeConvertir: Boolean(data?.puede_convertir),
        razonNoConvertir: data?.razon_no_convertir ?? null,
      });
    } catch (error) {
      setClienteError(
        error instanceof Error ? error.message : "No se pudo recuperar al cliente.",
      );
      setClienteContext({ puedeConvertir: false, razonNoConvertir: null });
    } finally {
      setLoading(false);
    }
  }, [oportunidadId]);

  useEffect(() => {
    if (shouldLoad) {
      loadCliente();
    }
  }, [shouldLoad, loadCliente]);

  useEffect(() => {
    if (!cliente) {
      setFormState({ ...EMPTY_FORM });
      return;
    }
    setFormState({
      rfc: cliente.rfc ?? "",
      razon_social: cliente.razon_social ?? "",
      domicilio_fiscal: cliente.domicilio_fiscal ?? "",
      domicilio_fisico: cliente.domicilio_fisico ?? "",
      regimen_fiscal: cliente.regimen_fiscal ?? "",
      estado_onboarding: cliente.estado_onboarding ?? "pendiente",
    });
  }, [cliente]);

  const documentMap = useMemo(() => {
    const map = new Map<string, ClienteDocumento>();
    (cliente?.documentos ?? []).forEach((doc) => {
      map.set(doc.tipo, doc);
    });
    return map;
  }, [cliente?.documentos]);

  const stageIsWon = currentStage?.categoria === "ganada";
  const canConvert = clienteContext.puedeConvertir;

  const handleConvert = async () => {
    if (!oportunidadId) return;
    setConverting(true);
    try {
      const response = await fetch(`/api/embudo/leads/${oportunidadId}/convertir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forzar: !canConvert }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "No se pudo convertir el lead.",
        );
      }
      toast.success("Lead convertido a cliente.");
      await loadCliente();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo convertir el lead.");
    } finally {
      setConverting(false);
    }
  };

  const formChanged = useMemo(() => {
    if (!cliente) return false;
    return (
      formState.rfc !== (cliente.rfc ?? "") ||
      formState.razon_social !== (cliente.razon_social ?? "") ||
      formState.domicilio_fiscal !== (cliente.domicilio_fiscal ?? "") ||
      formState.domicilio_fisico !== (cliente.domicilio_fisico ?? "") ||
      formState.regimen_fiscal !== (cliente.regimen_fiscal ?? "") ||
      formState.estado_onboarding !== (cliente.estado_onboarding ?? "pendiente")
    );
  }, [cliente, formState]);

  const handleSaveCliente = async () => {
    if (!cliente) return;
    const payload: Record<string, string> = {};
    (Object.keys(formState) as Array<keyof ClienteFormState>).forEach((key) => {
      const currentValue = formState[key]?.trim?.() ?? formState[key];
      const original = (cliente as Record<string, unknown>)[key];
      if ((original ?? "") !== currentValue) {
        payload[key] = currentValue;
      }
    });
    if (!Object.keys(payload).length) {
      toast.info("No hay cambios por guardar.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/embudo/clientes/${cliente.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(
          typeof body?.error === "string" ? body.error : "No se pudo guardar al cliente.",
        );
      }
      toast.success("Datos fiscales guardados.");
      await loadCliente();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar al cliente.");
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePortalLink = async () => {
    if (!cliente) return;
    setPortalGenerating(true);
    try {
      const response = await fetch(`/api/embudo/clientes/${cliente.id}/portal-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await response.json().catch(() => ({}))) as PortalLinkResponse;
      if (!response.ok) {
        throw new Error(
          typeof body?.error === "string" ? body.error : "No se pudo generar el enlace.",
        );
      }
      const link = typeof body?.link === "string" ? body.link : null;
      setPortalLink(link);
      if (link && navigator?.clipboard) {
        await navigator.clipboard.writeText(link).catch(() => undefined);
      }
      const emailInfo = body?.email;
      if (emailInfo?.sent && emailInfo.recipients?.length) {
        toast.success(`Enlace enviado a ${emailInfo.recipients.join(", ")}.`);
      } else if (emailInfo?.attempted && emailInfo?.reason === "missing_recipient") {
        toast.success("Enlace listo; no se encontró correo para enviar automáticamente.");
      } else {
        toast.success("Enlace listo para compartir.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar el enlace.");
    } finally {
      setPortalGenerating(false);
    }
  };

  if (isCreateMode || !card) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-medium text-muted-foreground">Guarda el lead para ver el onboarding.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
      {clienteError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {clienteError}
        </div>
      ) : null}
      <section className="space-y-3 rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Estado</p>
            <p className="text-lg font-semibold text-foreground">
              {cliente ? ONBOARDING_STATE_LABELS[cliente.estado_onboarding] ?? "Pendiente" : "Lead sin cliente"}
            </p>
            <p className="text-sm text-muted-foreground">
              {cliente
                ? "Comparte el enlace del portal o captura los datos manualmente."
                : "Convierte el lead a cliente para iniciar el onboarding."}
            </p>
          </div>
          {canConvert ? (
            <Button onClick={handleConvert} disabled={converting || !oportunidadId} variant="default">
              {converting ? "Convirtiendo..." : "Convertir a cliente"}
            </Button>
          ) : (
            <div className="max-w-sm rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {clienteContext.razonNoConvertir === "cliente_ya_existe"
                ? "Ya existe un cliente con este contacto."
                : stageIsWon
                  ? "No está disponible porque ya existe un cliente previo."
                  : "Disponible solo cuando la oportunidad esté ganada y no exista un cliente previo."}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <IconLink className="size-4" />
            Portal para compartir con el cliente
          </div>
          <p className="text-xs text-muted-foreground">
            Genera un enlace temporal para que el cliente suba los documentos y complete su papelería.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleGeneratePortalLink} disabled={!cliente || portalGenerating}>
              {portalGenerating ? "Generando..." : "Generar enlace"}
            </Button>
            {portalLink ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  navigator?.clipboard?.writeText(portalLink);
                  toast.success("Enlace copiado.");
                }}
                className="flex items-center gap-1"
              >
                <IconClipboard className="size-4" /> Copiar enlace
              </Button>
            ) : null}
          </div>
          {portalLink ? (
            <p className="break-all text-xs text-primary">{portalLink}</p>
          ) : null}
        </div>
      </section>

      {cliente ? (
        <section className="space-y-4 rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm">
          <header>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Datos fiscales</p>
            <h3 className="text-base font-semibold">Configuración de facturación</h3>
          </header>
          <div className="grid gap-3">
            <label className="text-xs font-medium text-muted-foreground">
              RFC
              <Input
                value={formState.rfc}
                onChange={(event) => setFormState((prev) => ({ ...prev, rfc: event.target.value }))}
                placeholder="XAXX010101000"
                className="mt-1"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Razón social
              <Input
                value={formState.razon_social}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, razon_social: event.target.value }))
                }
                placeholder="Empresa S.A. de C.V."
                className="mt-1"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Domicilio fiscal
              <Textarea
                value={formState.domicilio_fiscal}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, domicilio_fiscal: event.target.value }))
                }
                placeholder="Calle, número, colonia, CP"
                className="mt-1"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Domicilio físico
              <Textarea
                value={formState.domicilio_fisico}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, domicilio_fisico: event.target.value }))
                }
                placeholder="Si es distinto al fiscal"
                className="mt-1"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Régimen fiscal
              <Input
                value={formState.regimen_fiscal}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, regimen_fiscal: event.target.value }))
                }
                placeholder="General de Ley Personas Morales"
                className="mt-1"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Estado del onboarding
              <select
                value={formState.estado_onboarding}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    estado_onboarding: event.target.value as ClienteFormState["estado_onboarding"],
                  }))
                }
                className="mt-1 h-9 rounded-md border border-border bg-background px-3 text-sm"
              >
                {Object.entries(ONBOARDING_STATE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSaveCliente} disabled={!formChanged || saving}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
            {formChanged ? (
              <span className="text-xs text-muted-foreground">Tienes cambios sin guardar.</span>
            ) : null}
          </div>
        </section>
      ) : null}

      {cliente ? (
        <section className="space-y-4 rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm">
          <header>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Documentos</p>
            <h3 className="text-base font-semibold">Seguimiento de expedientes</h3>
          </header>
          <div className="space-y-3">
            {DOCUMENT_ORDER.map((tipo) => {
              const doc = documentMap.get(tipo);
              const copy = DOCUMENT_COPY[tipo] ?? { title: tipo, hint: "" };
              const estado = doc?.estado ?? "pendiente";
              return (
                <div
                  key={tipo}
                  className="flex flex-col gap-1 rounded-xl border border-border/60 bg-background/40 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{copy.title}</p>
                      <p className="text-xs text-muted-foreground">{copy.hint}</p>
                    </div>
                    <Badge
                      variant={
                        estado === "validado"
                          ? "default"
                          : estado === "rechazado"
                            ? "destructive"
                            : estado === "recibido"
                              ? "secondary"
                              : "outline"
                      }
                    >
                      {estado}
                    </Badge>
                  </div>
                  {doc?.metadatos?.nombre ? (
                    <p className="text-xs text-muted-foreground">
                      Último archivo: {String(doc.metadatos.nombre)}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {cliente ? (
        <section className="space-y-4 rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm">
          <header>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Responsables</p>
            <h3 className="text-base font-semibold">Contactos del lado del cliente</h3>
          </header>
          {cliente.responsables?.length ? (
            <ul className="space-y-2">
              {cliente.responsables.map((responsable) => (
                <li
                  key={responsable.id}
                  className="rounded-xl border border-border/60 bg-background/30 px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">{responsable.nombre}</p>
                    {responsable.es_responsable_principal ? (
                      <Badge variant="secondary">Principal</Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[responsable.correo, responsable.telefono_e164, responsable.rol]
                      .filter(Boolean)
                      .join(" · ") || "Sin datos de contacto"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no se registran responsables.</p>
          )}
        </section>
      ) : null}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <IconRefresh className="size-3 animate-spin" /> Cargando información del cliente...
        </div>
      ) : null}
    </div>
  );
}
