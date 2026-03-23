"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  IconAlertCircle,
  IconClipboard,
  IconCloudUpload,
  IconRefresh,
  IconUserPlus,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  ClienteDocumento,
  PortalDocumentRequirement,
  PortalEstadoResponse,
} from "@/types/clientes";

const STATE_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pendiente: "outline",
  en_progreso: "secondary",
  completado: "default",
};

const DOCUMENT_STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  validado: "default",
  recibido: "secondary",
  rechazado: "destructive",
  pendiente: "outline",
};

type Props = {
  token: string;
  initialState: PortalEstadoResponse;
};

type FiscalFormState = {
  rfc: string;
  razon_social: string;
  domicilio_fiscal: string;
  domicilio_fisico: string;
  regimen_fiscal: string;
};

type ResponsableFormState = {
  nombre: string;
  correo: string;
  telefono_e164: string;
  rol: string;
  es_responsable_principal: boolean;
};

const EMPTY_RESPONSABLE: ResponsableFormState = {
  nombre: "",
  correo: "",
  telefono_e164: "",
  rol: "",
  es_responsable_principal: false,
};

export function PortalClientApp({ token, initialState }: Props) {
  const [state, setState] = useState(initialState);
  const [fiscalForm, setFiscalForm] = useState<FiscalFormState>(() => buildFiscalForm(initialState));
  const [savingFiscal, setSavingFiscal] = useState(false);
  const [uploadingTipo, setUploadingTipo] = useState<string | null>(null);
  const [responsableForm, setResponsableForm] = useState<ResponsableFormState>(EMPTY_RESPONSABLE);
  const [creatingResponsable, setCreatingResponsable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const documentosMap = useMemo(() => {
    const map = new Map<string, ClienteDocumento>();
    state.cliente.documentos?.forEach((doc) => {
      map.set(doc.tipo, doc);
    });
    return map;
  }, [state.cliente.documentos]);

  useEffect(() => {
    setFiscalForm(buildFiscalForm(state));
  }, [state]);

  const refreshState = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/portal/${token}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string" ? payload.error : "No se pudo actualizar la vista.",
        );
      }
      setState(payload as PortalEstadoResponse);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar la vista.");
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  const handleFiscalSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingFiscal(true);
    try {
      const response = await fetch(`/api/portal/${token}/fiscales`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fiscalForm),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "No se pudo guardar la información fiscal.",
        );
      }
      toast.success("Datos guardados correctamente.");
      await refreshState();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar la información fiscal.",
      );
    } finally {
      setSavingFiscal(false);
    }
  };

  const handleUploadChange = async (
    tipo: string,
    event: React.ChangeEvent<HTMLInputElement>,
    requirement?: PortalDocumentRequirement,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingTipo(tipo);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("tipo", tipo);
      if (requirement?.titulo) {
        formData.append("descripcion", requirement.titulo);
      }
      const response = await fetch(`/api/portal/${token}/documentos/upload`, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string" ? payload.error : "No se pudo subir el documento.",
        );
      }
      toast.success("Documento recibido.");
      await refreshState();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo subir el documento.");
    } finally {
      setUploadingTipo(null);
    }
  };

  const handleResponsableSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!responsableForm.nombre.trim()) {
      toast.error("Agrega al menos el nombre del responsable.");
      return;
    }
    setCreatingResponsable(true);
    try {
      const response = await fetch(`/api/portal/${token}/responsables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(responsableForm),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string" ? payload.error : "No se pudo registrar al responsable.",
        );
      }
      toast.success("Responsable agregado.");
      setResponsableForm(EMPTY_RESPONSABLE);
      await refreshState();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar al responsable.");
    } finally {
      setCreatingResponsable(false);
    }
  };

  const contactoNombre =
    state.cliente.razon_social || state.cliente.contacto?.company_name || state.cliente.contacto?.nombre_completo;
  const expiraEn = state.portal.expira_en ? new Date(state.portal.expira_en) : null;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
        <header className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Tal-IA Onboarding</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-white">{contactoNombre ?? "Cliente"}</h1>
              <p className="text-sm text-slate-300">
                Completa la información fiscal y sube los documentos solicitados para activar tu servicio.
              </p>
            </div>
            <Badge variant={STATUS_BADGE[state.cliente.estado_onboarding] ?? "outline"}>
              {STATE_LABELS[state.cliente.estado_onboarding] ?? "Pendiente"}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            {expiraEn ? (
              <span>Enlace vigente hasta {formatDate(expiraEn)}</span>
            ) : null}
            <button
              type="button"
              onClick={refreshState}
              className="inline-flex items-center gap-1 text-slate-200 hover:text-white"
            >
              <IconRefresh className={cn("size-3", refreshing && "animate-spin")}/>
              Actualizar
            </button>
          </div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Datos fiscales</p>
              <h2 className="text-lg font-semibold">Información para facturación</h2>
            </div>
            <IconClipboard className="hidden w-5 text-slate-400 md:block" />
          </div>
          <form className="space-y-4" onSubmit={handleFiscalSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-xs font-medium text-slate-200">
                RFC
                <Input
                  value={fiscalForm.rfc}
                  className="mt-1 bg-slate-900/40 text-white"
                  placeholder="XAXX010101000"
                  onChange={(event) => setFiscalForm((prev) => ({ ...prev, rfc: event.target.value.toUpperCase() }))}
                />
              </label>
              <label className="text-xs font-medium text-slate-200">
                Razón social
                <Input
                  value={fiscalForm.razon_social}
                  className="mt-1 bg-slate-900/40 text-white"
                  placeholder="Empresa S.A. de C.V."
                  onChange={(event) => setFiscalForm((prev) => ({ ...prev, razon_social: event.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-slate-200 md:col-span-2">
                Domicilio fiscal
                <Textarea
                  value={fiscalForm.domicilio_fiscal}
                  className="mt-1 bg-slate-900/40 text-white"
                  placeholder="Calle, número, colonia, CP y ciudad"
                  onChange={(event) => setFiscalForm((prev) => ({ ...prev, domicilio_fiscal: event.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-slate-200 md:col-span-2">
                Domicilio físico (si es diferente)
                <Textarea
                  value={fiscalForm.domicilio_fisico}
                  className="mt-1 bg-slate-900/40 text-white"
                  placeholder="Especifica dónde operará el servicio"
                  onChange={(event) => setFiscalForm((prev) => ({ ...prev, domicilio_fisico: event.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-slate-200">
                Régimen fiscal
                <Input
                  value={fiscalForm.regimen_fiscal}
                  className="mt-1 bg-slate-900/40 text-white"
                  placeholder="General, Simplificado, etc."
                  onChange={(event) => setFiscalForm((prev) => ({ ...prev, regimen_fiscal: event.target.value }))}
                />
              </label>
            </div>
            <Button type="submit" disabled={savingFiscal} className="w-full md:w-auto">
              {savingFiscal ? "Guardando..." : "Guardar información"}
            </Button>
          </form>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Documentos</p>
              <h2 className="text-lg font-semibold">Sube los archivos requeridos</h2>
            </div>
            <p className="text-xs text-slate-400">
              Se aceptan PDF, imágenes o archivos escaneados menores a 25 MB.
            </p>
          </div>
          <div className="space-y-3">
            {state.documentos_requeridos.map((item) => {
              const doc = documentosMap.get(item.tipo);
              const estado = doc?.estado ?? "pendiente";
              return (
                <div
                  key={item.tipo}
                  className="rounded-2xl border border-white/10 bg-slate-900/30 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-medium text-white">{item.titulo}</p>
                      <p className="text-xs text-slate-400">{item.descripcion}</p>
                      {doc?.metadatos?.nombre ? (
                        <p className="text-xs text-slate-400">
                          Último archivo: {String(doc.metadatos.nombre)}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant={DOCUMENT_STATUS_BADGE[estado] ?? "outline"}>{estado}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10">
                      <IconCloudUpload className="size-4" />
                      <span>{uploadingTipo === item.tipo ? "Subiendo..." : "Subir archivo"}</span>
                      <input
                        type="file"
                        className="hidden"
                        accept="application/pdf,image/*"
                        disabled={uploadingTipo !== null}
                        onChange={(event) => handleUploadChange(item.tipo, event, item)}
                      />
                    </label>
                    {doc?.estado === "validado" ? (
                      <span className="text-xs text-emerald-300">Documento validado ✅</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Responsables</p>
              <h2 className="text-lg font-semibold">¿Con quién coordinaremos el proyecto?</h2>
            </div>
            <IconUserPlus className="hidden w-5 text-slate-400 md:block" />
          </div>
          <div className="space-y-4">
            {state.cliente.responsables?.length ? (
              <ul className="space-y-2">
                {state.cliente.responsables.map((responsable) => (
                  <li
                    key={responsable.id}
                    className="rounded-2xl border border-white/10 bg-slate-900/30 px-4 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-white">{responsable.nombre}</p>
                      {responsable.es_responsable_principal ? (
                        <Badge variant="secondary">Principal</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-400">
                      {[responsable.correo, responsable.telefono_e164, responsable.rol]
                        .filter(Boolean)
                        .join(" · ") || "Sin datos de contacto"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 rounded-2xl border border-dashed border-white/20 bg-slate-900/30 px-4 py-3 text-sm text-slate-300">
                <IconAlertCircle className="size-4" />
                Aún no registras responsables para este proyecto.
              </div>
            )}

            <form className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4" onSubmit={handleResponsableSubmit}>
              <p className="text-sm font-semibold text-white">Agregar responsable</p>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs font-medium text-slate-200">
                  Nombre completo
                  <Input
                    value={responsableForm.nombre}
                    className="mt-1 bg-slate-900/20 text-white"
                    placeholder="Nombre y apellidos"
                    onChange={(event) =>
                      setResponsableForm((prev) => ({ ...prev, nombre: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="text-xs font-medium text-slate-200">
                  Correo
                  <Input
                    type="email"
                    value={responsableForm.correo}
                    className="mt-1 bg-slate-900/20 text-white"
                    placeholder="correo@empresa.com"
                    onChange={(event) =>
                      setResponsableForm((prev) => ({ ...prev, correo: event.target.value }))
                    }
                  />
                </label>
                <label className="text-xs font-medium text-slate-200">
                  Teléfono (WhatsApp)
                  <Input
                    value={responsableForm.telefono_e164}
                    className="mt-1 bg-slate-900/20 text-white"
                    placeholder="+52 55 0000 0000"
                    onChange={(event) =>
                      setResponsableForm((prev) => ({ ...prev, telefono_e164: event.target.value }))
                    }
                  />
                </label>
                <label className="text-xs font-medium text-slate-200">
                  Rol
                  <Input
                    value={responsableForm.rol}
                    className="mt-1 bg-slate-900/20 text-white"
                    placeholder="PM, TI, Finanzas..."
                    onChange={(event) =>
                      setResponsableForm((prev) => ({ ...prev, rol: event.target.value }))
                    }
                  />
                </label>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-slate-200">
                <Checkbox
                  checked={responsableForm.es_responsable_principal}
                  onCheckedChange={(checked) =>
                    setResponsableForm((prev) => ({
                      ...prev,
                      es_responsable_principal: Boolean(checked),
                    }))
                  }
                />
                Responsable principal del proyecto
              </label>
              <Button type="submit" disabled={creatingResponsable} className="w-full md:w-auto">
                {creatingResponsable ? "Guardando..." : "Guardar responsable"}
              </Button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

function buildFiscalForm(state: PortalEstadoResponse): FiscalFormState {
  return {
    rfc: state.cliente.rfc ?? "",
    razon_social: state.cliente.razon_social ?? "",
    domicilio_fiscal: state.cliente.domicilio_fiscal ?? "",
    domicilio_fisico: state.cliente.domicilio_fisico ?? "",
    regimen_fiscal: state.cliente.regimen_fiscal ?? "",
  };
}

function formatDate(date: Date): string {
  try {
    return new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}
