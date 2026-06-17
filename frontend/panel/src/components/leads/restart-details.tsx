"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { IconCheck, IconLoader2, IconX } from "@tabler/icons-react";

import type { DataTableRow } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { reassignOpportunitySeller } from "@/lib/leads/actions";
import type { SalesRepOption } from "@/lib/leads/sales-reps";

type RestartCycleDetail = {
  oportunidad_id?: string | null;
  restart_sequence?: number | null;
  monto_estimado?: number | null;
  etapa_id?: string | null;
  estado?: string | null;
  asignado_a_usuario_id?: string | null;
  actualizado_en?: string | null;
  creado_en?: string | null;
};

type RestartRowRaw = {
  persona_id?: string | null;
  contacto_id?: string | null;
  contacto_correo?: string | null;
  contacto_telefono?: string | null;
  vendedor_nombre?: string | null;
  vendedor_id?: string | null;
  oportunidad_id?: string | null;
  monto_total?: number | null;
  monto_ciclo_actual?: number | null;
  monto_ciclos_previos?: number | null;
  ciclo_actual?: number | null;
  total_ciclos?: number | null;
  primer_ciclo_en?: string | null;
  ultimo_reinicio_en?: string | null;
  ciclos_detalle?: RestartCycleDetail[] | null;
};

type Props = {
  row: DataTableRow;
  salesReps: SalesRepOption[];
};

const UNASSIGNED_VALUE = "__none__";

export function LeadRestartDetails({ row, salesReps }: Props) {
  const raw = (row.raw || {}) as RestartRowRaw;
  const cycles = Array.isArray(raw.ciclos_detalle) ? raw.ciclos_detalle : [];
  const cicloActual = raw.ciclo_actual ?? cycles.length ?? 1;
  const totalCiclos = raw.total_ciclos ?? cicloActual;
  const currentAmount = Number(raw.monto_ciclo_actual ?? 0);
  const previousAmount = Number(raw.monto_ciclos_previos ?? 0);
  const totalAmount = currentAmount + previousAmount || Number(raw.monto_total ?? 0);
  const currentShare = totalAmount > 0 ? Math.round((currentAmount / totalAmount) * 100) : 0;
  const successCycles = cycles.filter((cycle) => {
    const estado = cycle.estado?.toLowerCase() ?? "";
    return estado.includes("ganado") || estado.includes("demo") || estado.includes("agend");
  }).length;
  const lastActivityLabel = formatDate(raw.ultimo_reinicio_en ?? raw.primer_ciclo_en);
  const daysSinceLast = daysSince(raw.ultimo_reinicio_en ?? raw.primer_ciclo_en);
  const [selectedRep, setSelectedRep] = useState<string>(raw.vendedor_id ?? UNASSIGNED_VALUE);
  const [localSellerName, setLocalSellerName] = useState<string>(raw.vendedor_nombre || "Sin asignar");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const options = useMemo(() => {
    return [{ id: UNASSIGNED_VALUE, name: "Sin asignar", phone: null, email: null }, ...salesReps];
  }, [salesReps]);
  const personaId = raw.persona_id ?? raw.contacto_id ?? null;
  const oportunidadesHref = personaId ? `/oportunidades?persona_id=${encodeURIComponent(personaId)}` : "/oportunidades";
  const inboxHref = personaId ? `/inbox?persona_id=${encodeURIComponent(personaId)}` : "/inbox";

  const handleAssigneeChange = useCallback(
    (value: string) => {
      if (!raw.oportunidad_id) {
        setFeedback({ type: "error", message: "No se encontró la oportunidad para reasignar." });
        return;
      }
      setSelectedRep(value);
      setFeedback(null);
      startTransition(async () => {
        const usuarioId = value === UNASSIGNED_VALUE ? null : value;
        const result = await reassignOpportunitySeller({
          oportunidadId: raw.oportunidad_id!,
          usuarioId,
        });
        if (!result.ok) {
          setFeedback({
            type: "error",
            message: result.error || "No se pudo actualizar el vendedor.",
          });
          return;
        }
        const nextName =
          options.find((option) => option.id === value)?.name || "Sin asignar";
        setLocalSellerName(nextName);
        setFeedback({
          type: "success",
          message: "Vendedor actualizado correctamente.",
        });
      });
    },
    [options, raw.oportunidad_id],
  );

  return (
    <div className="space-y-6 py-2">
      <header className="space-y-2">
        <Badge variant="secondary" className="text-xs uppercase">
          Reinicio #{cicloActual}
        </Badge>
        <p className="text-sm text-muted-foreground">
          Total de ciclos:{" "}
          <span className="font-medium text-slate-900">{totalCiclos}</span>. Última actividad el{" "}
          {lastActivityLabel} {daysSinceLast != null ? `(${daysSinceLast} días)` : null}
        </p>
        <div className="text-sm text-muted-foreground">
          Vendedor asignado:{" "}
          <span className="font-medium text-slate-900">
            {localSellerName}
          </span>
        </div>
      </header>

      <section className="rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Cambiar vendedor</h3>
            <p className="text-xs text-muted-foreground">
              Reasigna la oportunidad al vendedor que dará seguimiento.
            </p>
          </div>
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="seller-select" className="sr-only">
              Seleccionar vendedor
            </Label>
            <Select
              value={selectedRep}
              onValueChange={handleAssigneeChange}
              disabled={pending || !raw.oportunidad_id}
            >
              <SelectTrigger id="seller-select" className="w-full">
                <SelectValue placeholder="Seleccionar vendedor" />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          {pending ? (
            <>
              <IconLoader2 className="size-3 animate-spin text-slate-500" />
              <span className="text-muted-foreground">Actualizando vendedor…</span>
            </>
          ) : feedback ? (
            <>
              {feedback.type === "success" ? (
                <IconCheck className="size-3 text-green-600" />
              ) : (
                <IconX className="size-3 text-red-500" />
              )}
              <span
                className={
                  feedback.type === "success" ? "text-green-600" : "text-red-600"
                }
              >
                {feedback.message}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              Puedes dejarlo sin asignar si aún no hay un responsable definido.
            </span>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Monto acumulado" value={formatCurrency(raw.monto_total)} />
        <StatCard
          label="Monto ciclos previos"
          value={formatCurrency(raw.monto_ciclos_previos)}
        />
        <StatCard label="Monto ciclo actual" value={formatCurrency(raw.monto_ciclo_actual)} />
        <StatCard
          label="Primer ciclo registrado"
          value={formatDate(raw.primer_ciclo_en)}
        />
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Distribución del monto</h3>
        <p className="text-xs text-muted-foreground">
          {currentShare}% del valor total pertenece al ciclo actual.
        </p>
        <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
          <div
            className="h-2 rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, Math.max(0, currentShare))}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {formatCurrency(currentAmount)} ciclo actual · {formatCurrency(previousAmount)} ciclos previos
        </div>
      </section>

      <section className="rounded-lg border bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Historial de ciclos</h3>
        <p className="text-xs text-slate-500">
          Revisa las oportunidades registradas para este contacto en orden cronológico. {successCycles} de{" "}
          {totalCiclos} ciclos llegaron a demo o cierre positivo.
        </p>
        <Separator className="my-3" />
        {cycles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay ciclos previos registrados.</p>
        ) : (
          <ol className="space-y-3">
            {cycles.map((cycle, index) => (
              <li
                key={`${cycle.oportunidad_id ?? index}-${cycle.restart_sequence ?? index}`}
                className="rounded-md border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase text-slate-500">
                  <span>Ciclo #{cycle.restart_sequence ?? index + 1}</span>
                  <span>{formatDate(cycle.actualizado_en ?? cycle.creado_en)}</span>
                </div>
                <div className="mt-1 text-sm font-medium text-slate-900">
                  {cycle.estado || "Estado sin definir"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatCurrency(cycle.monto_estimado)} · Etapa {cycle.etapa_id?.slice(0, 6) || "—"}
                </div>
                {cycle.oportunidad_id ? (
                  <Link
                    href={oportunidadesHref}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Ver oportunidad
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-slate-900">Acciones rápidas</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link href={oportunidadesHref}>
              Ir a oportunidades
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={inboxHref}>Abrir en Inbox</Link>
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Estos accesos ayudan a revisar la conversación original o editar la oportunidad vigente.
        </p>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function formatCurrency(value: unknown): string {
  const number = typeof value === "number" ? value : Number(value ?? NaN);
  if (!Number.isFinite(number)) return "—";
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(number);
  } catch {
    return number.toLocaleString("es-MX");
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function daysSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 0;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}
