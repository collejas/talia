"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  closestCenter,
  useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import type { EmbudoCard, EmbudoStage } from "@/lib/embudo/data";
import { EmbudoStageColumn } from "@/components/embudo/stage-column";
import { EmbudoCardItem } from "@/components/embudo/card-item";
import { moveLeadCard, updateLeadCard, type LeadActionResult } from "@/lib/embudo/actions";
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
  const [dragMessage, setDragMessage] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeDragCard, setActiveDragCard] = useState<EmbudoCard | null>(null);
  const [activeDragStage, setActiveDragStage] = useState<EmbudoStage | null>(null);
  const [movePending, setMovePending] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

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

  const findCardById = (cardId: string): SelectedCard | null => {
    for (const stage of stages) {
      const card = stage.tarjetas.find((item) => item.tarjetaId === cardId);
      if (card) {
        return { stageId: stage.id, stageNombre: stage.nombre, card };
      }
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const cardId = String(event.active.id);
    const stageInfo = findCardById(cardId);
    if (!stageInfo) return;

    const stage = stages.find((item) => item.id === stageInfo.stageId);
    if (!stage) return;

    if (stage.orden != null && stage.orden < 2) {
      setDragMessage("Solo puedes arrastrar leads a partir de la etapa Precalificado.");
      setActiveDragId(null);
      setActiveDragCard(null);
      setActiveDragStage(null);
      return;
    }

    setDragMessage(null);
    setActiveDragId(cardId);
    setActiveDragCard(stageInfo.card);
    setActiveDragStage(stage);
  };

  const handleDragCancel = () => {
    setActiveDragId(null);
    setActiveDragCard(null);
    setActiveDragStage(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!activeDragId || !activeDragCard || !activeDragStage) {
      handleDragCancel();
      return;
    }
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) {
      handleDragCancel();
      return;
    }
    if (overId === activeDragStage.id) {
      handleDragCancel();
      return;
    }

    const destinationStage = stages.find((stage) => stage.id === overId);
    if (!destinationStage) {
      handleDragCancel();
      return;
    }
    if (destinationStage.orden != null && destinationStage.orden < 2) {
      setDragMessage("No puedes mover leads a etapas anteriores a Precalificado.");
      handleDragCancel();
      return;
    }
    if (movePending) {
      handleDragCancel();
      return;
    }

    setMovePending(true);
    const result = await moveLeadCard({
      tarjetaId: activeDragCard.tarjetaId,
      etapaDestino: destinationStage.id,
      fuente: "humano",
      expectedEtapa: activeDragStage.id,
    });
    setMovePending(false);

    if (!result.ok) {
      setDragMessage(result.error || "No se pudo mover el lead.");
      handleDragCancel();
      return;
    }
    setDragMessage(null);
    applyLeadResult(result);
    handleDragCancel();
  };

  const hasContent = stages.some((stage) => stage.tarjetas.length > 0) || sinConversacion.length > 0;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
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
                  droppableId={stage.id}
                  canDrop={(stage.orden ?? Number.MAX_SAFE_INTEGER) >= 2}
                  dropDisabled={(stage.orden ?? Number.MAX_SAFE_INTEGER) < 2}
                  renderCard={(card) => (
                    <DraggableCard
                      key={card.tarjetaId}
                      card={card}
                      onClick={() => handleCardClick(stage, card)}
                      disabled={(stage.orden ?? Number.MAX_SAFE_INTEGER) < 2}
                      stageId={stage.id}
                    />
                  )}
                />
              </div>
            ))}
          </div>
        )}

        <DragOverlay dropAnimation={null}>
          {activeDragCard ? (
            <div className="w-[320px]">
              <EmbudoCardItem card={activeDragCard} isDragging disabled />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {dragMessage ? (
        <p className="mt-2 rounded border border-amber-300 bg-amber-100 px-3 py-2 text-sm text-amber-900">{dragMessage}</p>
      ) : null}

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

type DraggableCardProps = {
  card: EmbudoCard;
  onClick?: () => void;
  disabled?: boolean;
  stageId: string;
};

function DraggableCard({ card, onClick, disabled = false, stageId }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggableCard({
    card,
    stageId,
    disabled,
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div ref={setNodeRef} style={style} className="touch-none">
      <EmbudoCardItem
        card={card}
        onClick={onClick}
        disabled={disabled}
        isDragging={isDragging}
        dragAttributes={attributes}
        dragListeners={listeners}
      />
    </div>
  );
}

type UseDraggableCardArgs = {
  card: EmbudoCard;
  stageId: string;
  disabled?: boolean;
};

function useDraggableCard({ card, stageId, disabled }: UseDraggableCardArgs) {
  const result = useDraggable({
    id: card.tarjetaId,
    data: {
      stageId,
    },
    disabled,
  });
  return result;
}
