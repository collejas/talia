"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconBuilding, IconUsers, IconX } from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AccountDetail = Record<string, unknown>;
type SearchItem = {
  id: string;
  nombre: string;
  alias: string | null;
  tipo: string | null;
  correo: string | null;
  telefono: string | null;
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
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
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
      if (!response.ok) throw new Error(body.error || "No se pudo cargar la cuenta.");
      setDetail(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la cuenta.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [cuentaId]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

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
        if (!response.ok) throw new Error(body.error || "No se pudieron buscar cuentas.");
        setMergeResults(Array.isArray(body.items) ? body.items : []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMergeError(err instanceof Error ? err.message : "No se pudieron buscar cuentas.");
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
      toast.error("Selecciona una cuenta destino.");
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
      toast.success("Fusión de cuenta completada.");
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

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="rounded-2xl border bg-background p-8 text-sm text-muted-foreground">Cargando cuenta...</div>
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
        <div className="rounded-2xl border bg-background p-8 text-sm text-destructive">{error || "No se encontró la cuenta."}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Ficha de cuenta</div>
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
            <CardDescription>Datos base de la cuenta y trazabilidad operativa.</CardDescription>
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
            <CardDescription>Acceso rápido a la ficha, edición y merge.</CardDescription>
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
              Fusionar con otra cuenta
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="max-w-2xl">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Fusionar cuenta</h2>
              <p className="text-sm text-muted-foreground">
                Busca la cuenta destino. La fuente quedará archivada con trazabilidad de merge.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="merge-target-account">Buscar cuenta destino</Label>
              <Input
                id="merge-target-account"
                value={mergeQuery}
                onChange={(event) => setMergeQuery(event.target.value)}
                placeholder="Nombre, RFC, alias..."
              />
            </div>
            {mergeLoading ? <p className="text-xs text-muted-foreground">Buscando cuentas...</p> : null}
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
    </div>
  );
}
