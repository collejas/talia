"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconBuilding, IconLink, IconPencil, IconUsers, IconX } from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ContactEditFlow } from "@/components/contactos/contact-edit-flow";
import { ContactLinkFlow } from "@/components/contactos/contact-link-flow";

type PersonaDetail = Record<string, unknown>;
type PersonaRelation = Record<string, unknown>;
type SearchItem = {
  id: string;
  nombre: string | null;
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

function getText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "—";
}

function getBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function formatDate(value: unknown): string {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-MX");
}

export function PersonaDetailView({ personaId }: { personaId: string }) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<PersonaDetail | null>(null);
  const [relations, setRelations] = React.useState<PersonaRelation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const [mergeQuery, setMergeQuery] = React.useState("");
  const [mergeResults, setMergeResults] = React.useState<SearchItem[]>([]);
  const [mergeLoading, setMergeLoading] = React.useState(false);
  const [mergeError, setMergeError] = React.useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = React.useState<string>("");
  const [mergeSubmitting, setMergeSubmitting] = React.useState(false);
  const [dedupeLoading, setDedupeLoading] = React.useState(true);
  const [dedupeError, setDedupeError] = React.useState<string | null>(null);
  const [dedupeCandidates, setDedupeCandidates] = React.useState<DedupeCandidate[]>([]);
  const [dedupeSuggestedId, setDedupeSuggestedId] = React.useState<string | null>(null);
  const [dedupeRequiresConfirmation, setDedupeRequiresConfirmation] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detailResponse, relationsResponse] = await Promise.all([
        fetch(`/api/personas/${encodeURIComponent(personaId)}`, { cache: "no-store" }),
        fetch(`/api/personas/${encodeURIComponent(personaId)}/relaciones`, { cache: "no-store" }),
      ]);

      const detailBody = (await detailResponse.json().catch(() => ({}))) as PersonaDetail & { error?: string };
      if (!detailResponse.ok) throw new Error(detailBody.error || "No se pudo cargar el detalle.");
      const relationsBody = (await relationsResponse.json().catch(() => ({}))) as
        | PersonaRelation[]
        | { error?: string; items?: PersonaRelation[] };
      const relationsError = Array.isArray(relationsBody) ? undefined : relationsBody.error;
      if (!relationsResponse.ok) throw new Error(relationsError || "No se pudieron cargar las relaciones.");

      setDetail(detailBody);
      setRelations(
        Array.isArray(relationsBody)
          ? relationsBody
          : Array.isArray(relationsBody.items)
            ? relationsBody.items
            : [],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la ficha.");
      setDetail(null);
      setRelations([]);
    } finally {
      setLoading(false);
    }
  }, [personaId]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  React.useEffect(() => {
    const loadDedupe = async () => {
      setDedupeLoading(true);
      setDedupeError(null);
      try {
        const response = await fetch(`/api/personas/${encodeURIComponent(personaId)}/dedupe`, {
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
    };
    void loadDedupe();
  }, [personaId]);

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
        const response = await fetch(`/api/agenda/contacts/search?q=${encodeURIComponent(query)}&limit=8`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => ({}))) as { items?: SearchItem[]; error?: string };
        if (!response.ok) {
          throw new Error(body.error || "No se pudieron buscar candidatos.");
        }
        setMergeResults(Array.isArray(body.items) ? body.items : []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMergeError(err instanceof Error ? err.message : "No se pudieron buscar candidatos.");
          setMergeResults([]);
        }
      } finally {
        setMergeLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [mergeOpen, mergeQuery]);

  const contactName = getText(detail?.nombre_completo ?? detail?.nombre);
  const companyName = getText(detail?.company_name);
  const email = getText(detail?.correo_principal ?? detail?.correo);
  const phoneBase = getText(detail?.telefono_principal_e164 ?? detail?.telefono_e164);
  const phoneExtension = getText(detail?.telefono_principal_extension);
  const phone = phoneBase && phoneExtension ? `${phoneBase} ext. ${phoneExtension}` : phoneBase;
  const notes = getText(detail?.notas ?? detail?.notes);
  const status = getText(detail?.estado);
  const origin = getText(detail?.origen);
  const role = getText(detail?.rol_decision);
  const area = getText(detail?.area);
  const position = getText(detail?.puesto);
  const lastUpdated = formatDate(detail?.actualizado_en);
  const createdAt = formatDate(detail?.creado_en);
  const relationCount = relations.length.toLocaleString("es-MX");

  const handleMerge = async () => {
    if (!mergeTargetId) {
      toast.error("Selecciona una persona destino.");
      return;
    }
    setMergeSubmitting(true);
    try {
      const response = await fetch(`/api/personas/${encodeURIComponent(personaId)}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_persona_id: mergeTargetId }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; target_persona_id?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo fusionar.");
      toast.success("Fusión completada.");
      setMergeOpen(false);
      setMergeQuery("");
      setMergeResults([]);
      setMergeTargetId("");
      if (body.target_persona_id) {
        router.replace(`/personas/${encodeURIComponent(body.target_persona_id)}`);
      } else {
        void loadData();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo fusionar.");
    } finally {
      setMergeSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="rounded-2xl border bg-background p-8 text-sm text-muted-foreground">Cargando ficha...</div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-6xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Button asChild variant="outline">
            <Link href="/contactos">
              <IconArrowLeft className="mr-2 size-4" />
              Volver
            </Link>
          </Button>
        </div>
        <div className="rounded-2xl border bg-background p-8 text-sm text-destructive">{error || "No se encontró la persona."}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Ficha de persona</div>
          <h1 className="text-3xl font-semibold tracking-tight">{contactName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {companyName !== "—" ? companyName : "Sin empresa asociada"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/contactos">
              <IconArrowLeft className="mr-2 size-4" />
              Volver al listado
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <IconPencil className="mr-2 size-4" />
            Editar
          </Button>
          <Button variant="outline" onClick={() => setLinkOpen(true)}>
            <IconLink className="mr-2 size-4" />
            Vincular a empresa
          </Button>
          <Button variant="secondary" onClick={() => setMergeOpen(true)}>
            <IconUsers className="mr-2 size-4" />
            Fusionar duplicado
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
              <CardDescription>Datos principales de la persona y su contexto.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <SummaryItem label="Correo" value={email} />
                <SummaryItem label="Teléfono" value={phone} />
                <SummaryItem label="Puesto" value={position} />
                <SummaryItem label="Área" value={area} />
                <SummaryItem label="Rol decisión" value={role} />
                <SummaryItem label="Estado" value={status} />
                <SummaryItem label="Origen" value={origin} />
                <SummaryItem label="Actualizado" value={lastUpdated} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notas</CardTitle>
              <CardDescription>Contexto de seguimiento y observaciones comerciales.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{notes !== "—" ? notes : "Sin notas registradas."}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Relaciones</CardTitle>
              <CardDescription>
                {relationCount} relación{relations.length === 1 ? "" : "es"} registradas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!relations.length ? (
                <p className="text-sm text-muted-foreground">No hay relaciones registradas.</p>
              ) : (
                relations.map((relation) => (
                  <div key={String(relation.id ?? relation.cuenta_id)} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{getText(relation.cuenta_nombre ?? relation.cuenta_id)}</div>
                        <div className="text-xs text-muted-foreground">{getText(relation.cuenta_alias)}</div>
                      </div>
                      <Badge variant={getBoolean(relation.activo) ? "default" : "secondary"}>
                        {getBoolean(relation.activo) ? "Activa" : "Inactiva"}
                      </Badge>
                    </div>
                    <Separator className="my-3" />
                    <div className="grid gap-2 text-sm md:grid-cols-2">
                      <SummaryItem label="Principal" value={getBoolean(relation.es_contacto_principal) ? "Sí" : "No"} />
                      <SummaryItem label="Facturación" value={getBoolean(relation.es_contacto_facturacion) ? "Sí" : "No"} />
                      <SummaryItem label="Representante legal" value={getBoolean(relation.es_representante_legal) ? "Sí" : "No"} />
                      <SummaryItem label="Inicio" value={getText(relation.fecha_inicio)} />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Posibles duplicados</CardTitle>
              <CardDescription>Regla formal de dedupe para esta persona.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
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

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Identidad</CardTitle>
              <CardDescription>Datos canónicos del registro.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SummaryItem label="ID" value={getText(detail.id)} />
              <SummaryItem label="Creado" value={createdAt} />
              <SummaryItem label="Empresa" value={companyName} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Acciones rápidas</CardTitle>
              <CardDescription>Continúa el trabajo desde esta ficha dedicada.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full justify-start" variant="outline" onClick={() => setEditOpen(true)}>
                <IconPencil className="mr-2 size-4" />
                Editar persona
              </Button>
              <Button className="w-full justify-start" variant="outline" onClick={() => setLinkOpen(true)}>
                <IconBuilding className="mr-2 size-4" />
                Vincular a empresa
              </Button>
              <Button className="w-full justify-start" variant="secondary" onClick={() => setMergeOpen(true)}>
                <IconUsers className="mr-2 size-4" />
                Fusionar duplicado
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ContactEditFlow
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) void loadData();
        }}
        personaId={personaId}
        onSaved={() => void loadData()}
      />

      <ContactLinkFlow
        open={linkOpen}
        onOpenChange={(open) => {
          setLinkOpen(open);
          if (!open) void loadData();
        }}
        initialContact={
          detail
            ? {
                id: personaId,
                label: contactName,
                company: companyName !== "—" ? companyName : null,
                correo: email !== "—" ? email : null,
                telefono: phone !== "—" ? phone : null,
              }
            : null
        }
        onLinked={() => void loadData()}
      />

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <div className="space-y-4">
            <div>
              <div className="text-lg font-semibold">Fusionar duplicado</div>
              <p className="text-sm text-muted-foreground">
                El registro actual se archivará y sus relaciones, oportunidades y datos faltantes se moverán a la persona destino.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="merge-target">Buscar persona destino</Label>
              <Input
                id="merge-target"
                value={mergeQuery}
                onChange={(e) => setMergeQuery(e.target.value)}
                placeholder="Nombre, correo o teléfono"
              />
            </div>

            {mergeLoading ? <p className="text-xs text-muted-foreground">Buscando candidatos...</p> : null}
            {mergeError ? <p className="text-xs text-destructive">{mergeError}</p> : null}

            {mergeResults.length ? (
              <div className="space-y-2">
                {mergeResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full rounded-xl border px-4 py-3 text-left ${mergeTargetId === item.id ? "border-foreground bg-muted/40" : "border-border/60 bg-background"}`}
                    onClick={() => setMergeTargetId(item.id)}
                  >
                    <div className="text-sm font-medium">{item.nombre || "Sin nombre"}</div>
                    <div className="text-xs text-muted-foreground">
                      {[item.correo, item.telefono, item.empresa].filter(Boolean).join(" · ") || "Sin datos adicionales"}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void handleMerge()} disabled={mergeSubmitting || !mergeTargetId}>
                {mergeSubmitting ? "Fusionando..." : "Fusionar seleccionado"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setMergeOpen(false)} disabled={mergeSubmitting}>
                <IconX className="mr-2 size-4" />
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
