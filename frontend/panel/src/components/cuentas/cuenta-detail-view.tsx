"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconBuilding, IconTrash, IconUserPlus, IconUsers, IconX } from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

function getText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "—";
}

function formatDate(value: unknown): string {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-MX");
}

export function CuentaDetailView({ cuentaId }: { cuentaId: string }) {
  const router = useRouter();
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
        router.replace(`/cuentas/${encodeURIComponent(body.target_cuenta_id)}`);
      } else {
        void loadData();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo fusionar.");
    } finally {
      setMergeSubmitting(false);
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
            <Link href="/crm">
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
          <Button asChild variant="outline">
            <Link href="/crm">
              <IconArrowLeft className="mr-2 size-4" />
              Volver al listado
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setMergeOpen(true)}>
            <IconUsers className="mr-2 size-4" />
            Fusionar
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
              <Link href="/crm">
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
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Fusionar empresa</h2>
              <p className="text-sm text-muted-foreground">
                Busca la empresa destino. La fuente quedará archivada con trazabilidad de merge.
              </p>
            </div>
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
