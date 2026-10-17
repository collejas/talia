"use client";

import { useState, useTransition } from "react";

import { renamePipelineStage, type PipelineStage } from "@/app/settings/pipeline/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = { initialStages: PipelineStage[] };

export function PipelineStageNamesPanel({ initialStages }: Props) {
  const [stages, setStages] = useState(initialStages);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateName(stageId: string, nombre: string) {
    setStages((current) => current.map((stage) => (stage.id === stageId ? { ...stage, nombre } : stage)));
  }

  function save(stage: PipelineStage) {
    setMessage(null);
    setError(null);
    setSavingId(stage.id);
    startTransition(async () => {
      try {
        const updated = await renamePipelineStage({ stageId: stage.id, nombre: stage.nombre });
        setStages((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setMessage(`Se guardó “${updated.nombre}”.`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo guardar el nombre de la etapa.");
      } finally {
        setSavingId(null);
      }
    });
  }

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold">Nombres visibles</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Edita solo el nombre comercial. Los códigos internos no se muestran al equipo ni se pueden cambiar aquí.
        </p>
      </div>
      <div className="divide-y">
        {stages.map((stage) => {
          const saving = isPending && savingId === stage.id;
          return (
            <div key={stage.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div className="grid gap-2">
                <label htmlFor={`pipeline-stage-${stage.id}`} className="text-sm font-medium">
                  Etapa {stage.orden}
                </label>
                <Input
                  id={`pipeline-stage-${stage.id}`}
                  value={stage.nombre}
                  maxLength={120}
                  disabled={isPending}
                  onChange={(event) => updateName(stage.id, event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {stage.categoria === "ganada" ? "Resultado ganado" : stage.categoria === "perdida" ? "Resultado perdido" : "Etapa abierta"}
                </p>
              </div>
              <Button type="button" size="sm" onClick={() => save(stage)} disabled={isPending || !stage.nombre.trim()}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          );
        })}
      </div>
      {error ? <p className="border-t px-5 py-3 text-sm text-destructive">{error}</p> : null}
      {message ? <p className="border-t px-5 py-3 text-sm text-muted-foreground">{message}</p> : null}
    </section>
  );
}
