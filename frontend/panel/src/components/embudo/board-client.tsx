"use client";

import { useEffect, useMemo, useState } from "react";

import type { EmbudoCard, EmbudoStage } from "@/lib/embudo/data";
import { EmbudoStageColumn } from "@/components/embudo/stage-column";
import { updateLeadCard, type LeadActionResult } from "@/lib/embudo/actions";
import { LeadDrawer, type LeadDrawerSubmitPayload } from "@/components/embudo/lead-drawer";

type EmbudoBoardClientProps = {
  etapas: EmbudoStage[];
  sinConversacion: EmbudoCard[];
};

type SelectedCard = {
  stageId: string;
  stageNombre: string;
  card: EmbudoCard;
};

function sortStages(stages: EmbudoStage[]): EmbudoStage[] {
  return [...stages].sort((a, b) => {
    if (a.orden !== b.orden) return (a.orden ?? Number.MAX_SAFE_INTEGER) - (b.orden ?? Number.MAX_SAFE_INTEGER);
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

function sortCards(cards: EmbudoCard[]): EmbudoCard[] {
  return [...cards].sort((a, b) => {
    const aTime = a.actualizadoEn ? Date.parse(a.actualizadoEn) : 0;
    const bTime = b.actualizadoEn ? Date.parse(b.actualizadoEn) : 0;
    return bTime - aTime;
  });
}

export function EmbudoBoardClient({ etapas, sinConversacion }: EmbudoBoardClientProps) {
  const initialStages = useMemo(
    () =>
      sortStages(
        etapas.map((stage) => ({
          ...stage,
          tarjetas: sortCards(stage.tarjetas ?? []),
        })),
      ),
    [etapas],
  );

  const [stages, setStages] = useState<EmbudoStage[]>(initialStages);
  const [selected, setSelected] = useState<SelectedCard | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setStages(initialStages);
  }, [initialStages]);

  const handleCardClick = (stage: EmbudoStage, card: EmbudoCard) => {
    setSelected({
      stageId: stage.id,
      stageNombre: stage.nombre,
      card,
    });
    setDrawerOpen(true);
  };

  function applyLeadResult(result: LeadActionResult) {
    if (!result.ok) return;
    const { stage, card } = result;
    setStages((prev) => {
      const updated = prev.map((item) => {
        if (item.id === stage.id) {
          const filtered = (item.tarjetas ?? []).filter((existing) => existing.tarjetaId !== card.tarjetaId);
          return {
            ...item,
            nombre: stage.nombre,
            categoria: stage.categoria,
            orden: stage.orden,
            tarjetas: sortCards([...filtered, card]),
          };
        }
        if ((item.tarjetas ?? []).some((existing) => existing.tarjetaId === card.tarjetaId)) {
          return {
            ...item,
            tarjetas: item.tarjetas.filter((existing) => existing.tarjetaId !== card.tarjetaId),
          };
        }
        return item;
      });

      const exists = updated.some((item) => item.id === stage.id);
      const resultStages = exists
        ? updated
        : [
            ...updated,
            {
              ...stage,
              tarjetas: [card],
            },
          ];
      return sortStages(
        resultStages.map((item) => ({
          ...item,
          tarjetas: sortCards(item.tarjetas ?? []),
        })),
      );
    });
    setSelected({
      stageId: stage.id,
      stageNombre: stage.nombre,
      card,
    });
  }

  async function handleLeadSubmit(payload: LeadDrawerSubmitPayload) {
    if (!selected) {
      return { ok: false as const, error: "No se encontró el lead seleccionado." };
    }

    const result = await updateLeadCard({
      tarjetaId: selected.card.tarjetaId,
      contacto: payload.contacto,
      tarjeta: payload.tarjeta,
      mergeMetadata: payload.mergeMetadata ?? true,
    });

    if (result.ok) {
      applyLeadResult(result);
    }

    return result;
  }

  const handleDrawerOpenChange = (open: boolean) => {
    setDrawerOpen(open);
    if (!open) {
      setSelected((prev) => (prev ? { ...prev } : null));
    }
  };

  const hasContent = stages.some((stage) => stage.tarjetas.length > 0) || sinConversacion.length > 0;

  return (
    <>
      {!hasContent ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aún no hay etapas configuradas en tu embudo.
        </div>
      ) : (
        <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
          <div className="w-[320px] shrink-0">
            <section className="flex h-full min-h-[420px] flex-col rounded-xl border border-primary/60 bg-primary/5">
              <div className="px-4 py-4">
                <h3 className="text-sm font-semibold text-primary">Sin conversación</h3>
                <p className="text-xs text-muted-foreground">Leads creados manualmente</p>
                <p className="mt-3 text-3xl font-bold text-primary">{sinConversacion.length}</p>
              </div>
              <div className="mt-2 space-y-2 px-4 pb-4 text-xs text-muted-foreground">
                <p>Estos leads no tienen conversación asociada. Puedes asignarlos manualmente a una etapa cuando estén listos.</p>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20"
                  disabled
                >
                  Crear lead manual
                </button>
              </div>
            </section>
          </div>

          {stages.map((stage) => (
            <div key={stage.id} className="w-[320px] shrink-0">
              <EmbudoStageColumn
                stage={stage}
                onCardClick={(card) => handleCardClick(stage, card)}
                canDrop={false}
                dropDisabled
              />
            </div>
          ))}
        </div>
      )}

      <LeadDrawer
        open={drawerOpen && !!selected}
        onOpenChange={handleDrawerOpenChange}
        stageName={selected?.stageNombre ?? null}
        card={selected?.card ?? null}
        onSubmit={handleLeadSubmit}
      />
    </>
  );
}
