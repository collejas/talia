"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
import {
  createLeadCard,
  deleteLeadCard,
  moveLeadCard,
  scheduleLeadDemo,
  updateLeadCard,
  type LeadActionResult,
  type LeadDeleteResult,
} from "@/lib/embudo/actions";
import {
  LeadDrawer,
  type LeadAdvanceStagePayload,
  type LeadDrawerCreatePayload,
  type LeadDrawerSubmitPayload,
  type StagePrepState,
} from "@/components/embudo/lead-drawer";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fromDateTimeLocalInput, toDateTimeLocalInput } from "@/lib/datetime";
import { toast } from "sonner";

type EmbudoBoardClientProps = {
  etapas: EmbudoStage[];
  sinConversacion: EmbudoCard[];
  visitantesSinChat: number;
};

type StageCardPair = {
  stage: EmbudoStage;
  card: EmbudoCard;
};

type ScheduleContext = {
  card: EmbudoCard;
  originStage: EmbudoStage;
  destinationStage: EmbudoStage;
};

const PRECALIFICADO_STAGE_CODE = "precalificado";
const DEMO_STAGE_CODE = "demo";

const STAGE_REQUIRED_FIELDS: Record<string, Array<{ key: string; label: string }>> = {
  demo: [
    { key: "demo_format", label: "Modalidad" },
  ],
  cerrado_ganado: [
    { key: "close_date", label: "Fecha de cierre" },
  ],
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

export function EmbudoBoardClient({
  etapas,
  sinConversacion,
  visitantesSinChat,
}: EmbudoBoardClientProps) {
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
  const [selectedStage, setSelectedStage] = useState<EmbudoStage | null>(null);
  const [selectedCard, setSelectedCard] = useState<EmbudoCard | null>(null);
  const [drawerMode, setDrawerMode] = useState<"edit" | "create">("edit");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dragMessage, setDragMessage] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeDragCard, setActiveDragCard] = useState<EmbudoCard | null>(null);
  const [activeDragStage, setActiveDragStage] = useState<EmbudoStage | null>(null);
  const [movePending, setMovePending] = useState(false);
  const [scheduleContext, setScheduleContext] = useState<ScheduleContext | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState("");
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [schedulePending, setSchedulePending] = useState(false);

  const scheduleMinValue = useMemo(() => toDateTimeLocalInput(new Date().toISOString()), []);

  const ensureLeadHasAcceptedQuote = useCallback(
    async (
      oportunidadId: string,
    ): Promise<{ ok: boolean; accepted: boolean; error?: string }> => {
      try {
        const response = await fetch(
          `/api/embudo/leads/${oportunidadId}/quotes?status=aceptada`,
          { cache: "no-store" },
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message =
            typeof body?.error === "string" && body.error ? body.error : `Error ${response.status}`;
          return { ok: false, accepted: false, error: message };
        }
        const quotes = Array.isArray(body?.quotes) ? (body.quotes as unknown[]) : [];
        return { ok: true, accepted: quotes.length > 0 };
      } catch (error) {
        return {
          ok: false,
          accepted: false,
          error:
            error instanceof Error
              ? error.message
              : "No se pudo verificar las cotizaciones del lead.",
        };
      }
    },
    [],
  );

  const visitantesDisplay = useMemo(() => {
    const formatter = new Intl.NumberFormat("es-MX");
    const safeValue = Number.isFinite(visitantesSinChat) ? Math.max(visitantesSinChat, 0) : 0;
    return formatter.format(safeValue);
  }, [visitantesSinChat]);

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

  useEffect(() => {
    if (scheduleContext) {
      const existingValue = readDemoScheduledAt(scheduleContext.card);
      setScheduleDateTime(existingValue ? toDateTimeLocalInput(existingValue) : "");
    }
  }, [scheduleContext]);

  const openScheduleDialog = (context: ScheduleContext) => {
    setScheduleContext(context);
    setScheduleError(null);
    setSchedulePending(false);
    setScheduleDialogOpen(true);
  };

  const closeScheduleDialog = () => {
    setScheduleDialogOpen(false);
    setScheduleContext(null);
    setScheduleDateTime("");
    setScheduleError(null);
    setSchedulePending(false);
  };

  const handleScheduleOpenChange = (open: boolean) => {
    if (!open) {
      closeScheduleDialog();
    } else if (scheduleContext) {
      setScheduleDialogOpen(true);
    }
  };

  const handleCardClick = (stage: EmbudoStage, card: EmbudoCard) => {
    setSelectedStage(stage);
    setSelectedCard(card);
    setDrawerMode("edit");
    setDrawerOpen(true);
  };

  const handleAddLead = (stage: EmbudoStage) => {
    setSelectedStage(stage);
    setSelectedCard(null);
    setDrawerMode("create");
    setDrawerOpen(true);
  };

  const handleScheduleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scheduleContext) return;

    if (!scheduleDateTime.trim()) {
      setScheduleError("Selecciona la fecha y hora de la demo.");
      return;
    }

    const isoValue = fromDateTimeLocalInput(scheduleDateTime);
    if (!isoValue) {
      setScheduleError("La fecha no tiene un formato válido.");
      return;
    }

    if (!scheduleContext.card.conversacionId) {
      setScheduleError("Este lead no tiene conversación vinculada, no puedo agendar la demo.");
      return;
    }

    setScheduleError(null);
    setSchedulePending(true);
    setMovePending(true);

    const bookingResult = await scheduleLeadDemo({
      conversationId: scheduleContext.card.conversacionId,
      startAt: isoValue,
    });

    if (!bookingResult.ok) {
      setScheduleError(bookingResult.error || "No se pudo agendar la demo.");
      setSchedulePending(false);
      setMovePending(false);
      return;
    }

    const stagePrep = buildUpdatedDemoStagePrep(scheduleContext.card, isoValue, bookingResult.booking.booking_id);
    const updateResult = await updateLeadCard({
      oportunidadId: scheduleContext.card.oportunidadId,
      contactoId: scheduleContext.card.contactoId,
      oportunidad: {
        metadata: {
          stage_prep: stagePrep,
        },
      },
      mergeMetadata: true,
    });

    if (!updateResult.ok) {
      setScheduleError(updateResult.error || "No se pudo guardar la cita.");
      setSchedulePending(false);
      setMovePending(false);
      return;
    }

    const destinationStage =
      stages.find((stage) => stage.id === scheduleContext.destinationStage.id) ?? scheduleContext.destinationStage;
    const updatedCard: EmbudoCard = {
      ...updateResult.card,
      etapaId: destinationStage.id,
      etapaNombre: destinationStage.nombre,
      metadata: {
        ...(updateResult.card.metadata ?? {}),
        stage_prep: stagePrep,
      },
    };

    setSchedulePending(false);
    setMovePending(false);

    setDragMessage(null);
    applyLeadResult({
      ok: true,
      stage: destinationStage,
      card: updatedCard,
    });
    closeScheduleDialog();
  };

  function applyLeadResult(result: LeadActionResult) {
    notifyLeadConflict(result);
    const stage = result.ok ? result.stage : result.latestStage;
    const card = result.ok ? result.card : result.latestCard;
    if (!stage || !card) return;
    setStages((prev) => {
      const updated = prev.map((item) => {
        if (item.id === stage.id) {
          const filtered = (item.tarjetas ?? []).filter((existing) => existing.oportunidadId !== card.oportunidadId);
          return {
            ...item,
            tableroId: stage.tableroId || item.tableroId,
            nombre: stage.nombre,
            codigo: stage.codigo,
            categoria: stage.categoria,
            orden: stage.orden,
            metadatos: stage.metadatos,
            tarjetas: sortCards([...filtered, card]),
          };
        }
        if ((item.tarjetas ?? []).some((existing) => existing.oportunidadId === card.oportunidadId)) {
          return {
            ...item,
            tarjetas: item.tarjetas.filter((existing) => existing.oportunidadId !== card.oportunidadId),
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
              tableroId: stage.tableroId || selectedStage?.tableroId || stage.tableroId,
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
    setSelectedStage(stage);
    setSelectedCard(card);
    setDrawerMode("edit");
  }

  function notifyLeadConflict(result: LeadActionResult) {
    if (result.ok || !result.latestStage) {
      return;
    }
    const stageLabel = result.latestStage.nombre || "otra etapa";
    const cardLabel = result.latestCard?.titulo || "La oportunidad";
    toast.info(`${cardLabel} cambió a ${stageLabel} en otra sesión. Actualizamos la oportunidad.`, {
      duration: 6000,
    });
  }

  async function handleLeadSubmit(payload: LeadDrawerSubmitPayload) {
    if (!selectedCard) {
      return { ok: false as const, error: "No se encontró el lead seleccionado." };
    }

    const result = await updateLeadCard({
      oportunidadId: selectedCard.oportunidadId,
      contactoId: selectedCard.contactoId,
      contacto: payload.contacto,
      oportunidad: payload.oportunidad,
      mergeMetadata: payload.mergeMetadata ?? true,
    });

    applyLeadResult(result);

    return result;
  }

  async function handleLeadCreate(payload: LeadDrawerCreatePayload) {
    const result = await createLeadCard(payload);
    if (result.ok) {
      applyLeadResult(result);
    }
    return result;
  }

  async function handleAutoAdvanceStage(nextStage: EmbudoStage, context?: LeadAdvanceStagePayload) {
    if (!selectedCard) {
      return { ok: false as const, error: "No se encontró el lead seleccionado." };
    }
    const nextStageCode = normalizeStageCode(nextStage);
    if (nextStageCode === DEMO_STAGE_CODE && context?.stagePrep) {
      return await handleDrawerDemoAdvance(nextStage, context.stagePrep);
    }
    if (nextStageCode === "cerrado_ganado") {
      const acceptedCheck = await ensureLeadHasAcceptedQuote(selectedCard.oportunidadId);
      if (!acceptedCheck.ok) {
        return { ok: false as const, error: acceptedCheck.error || "No se pudo verificar las cotizaciones." };
      }
      if (!acceptedCheck.accepted) {
        return {
          ok: false as const,
          error: "Necesitas una cotización aceptada antes de marcar el lead como ganado.",
        };
      }
    }
    setMovePending(true);
    const result = await moveLeadCard({
      oportunidadId: selectedCard.oportunidadId,
      etapaDestino: nextStage.id,
      fuente: "humano",
      expectedEtapa: selectedCard.etapaId,
    });
    setMovePending(false);
    if (!result.ok) {
      applyLeadResult(result);
      return { ok: false as const, error: result.error || "No se pudo avanzar el lead." };
    }
    applyLeadResult(result);
    return { ok: true as const };
  }

  async function handleDrawerDemoAdvance(
    targetStage: EmbudoStage,
    stagePrepState: StagePrepState,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!selectedCard) {
      return { ok: false as const, error: "No se encontró el lead seleccionado." };
    }
    const localValue = readStagePrepValue(stagePrepState, DEMO_STAGE_CODE, "demo_scheduled_at");
    if (!localValue) {
      return {
        ok: false as const,
        error: "Completa la fecha de la demo en la tarjeta antes de avanzar.",
      };
    }
    const isoValue = fromDateTimeLocalInput(localValue);
    if (!isoValue) {
      return { ok: false as const, error: "La fecha de la demo no tiene un formato válido." };
    }
    if (!selectedCard.conversacionId) {
      return {
        ok: false as const,
        error: "Este lead no tiene conversación vinculada, no puedo agendar la demo.",
      };
    }

    setMovePending(true);
    try {
      const bookingResult = await scheduleLeadDemo({
        conversationId: selectedCard.conversacionId,
        startAt: isoValue,
      });
      if (!bookingResult.ok) {
        return { ok: false as const, error: bookingResult.error || "No se pudo agendar la demo." };
      }

      const demoStagePrep = buildUpdatedDemoStagePrep(
        selectedCard,
        isoValue,
        bookingResult.booking.booking_id,
      );
      const updateResult = await updateLeadCard({
        oportunidadId: selectedCard.oportunidadId,
        contactoId: selectedCard.contactoId,
        oportunidad: {
          metadata: {
            stage_prep: demoStagePrep,
          },
        },
        mergeMetadata: true,
      });

      if (!updateResult.ok) {
        return { ok: false as const, error: updateResult.error || "No se pudo guardar la cita." };
      }

      const destinationStage = stages.find((stage) => stage.id === targetStage.id) ?? targetStage;
      const updatedCard: EmbudoCard = {
        ...updateResult.card,
        etapaId: destinationStage.id,
        etapaNombre: destinationStage.nombre,
        metadata: {
          ...(updateResult.card.metadata ?? {}),
          stage_prep: demoStagePrep,
        },
      };
      applyLeadResult({
        ok: true,
        stage: destinationStage,
        card: updatedCard,
      });
      return { ok: true as const };
    } finally {
      setMovePending(false);
    }
  }

  async function handleLeadDelete(): Promise<LeadDeleteResult> {
    if (!selectedCard) {
      return { ok: false, error: "No se encontró el lead seleccionado." };
    }

    const result = await deleteLeadCard({ oportunidadId: selectedCard.oportunidadId, contactoId: selectedCard.contactoId });
    if (result.ok) {
      setStages((prev) =>
        sortStages(
          prev.map((stage) => ({
            ...stage,
            tarjetas: stage.tarjetas.filter((card) => card.oportunidadId !== selectedCard.oportunidadId),
          })),
        ),
      );
      setSelectedStage(null);
      setSelectedCard(null);
      setDrawerOpen(false);
    }
    return result;
  }

  const handleDrawerOpenChange = (open: boolean) => {
    setDrawerOpen(open);
    if (!open) {
      setSelectedStage(null);
      setSelectedCard(null);
      setDrawerMode("edit");
    }
  };

  const findCardById = (cardId: string): StageCardPair | null => {
    for (const stage of stages) {
      const card = stage.tarjetas.find((item) => item.oportunidadId === cardId);
      if (card) {
        return { stage, card };
      }
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const cardId = String(event.active.id);
    const stageInfo = findCardById(cardId);
    if (!stageInfo) return;

    const sourceStage = stages.find((item) => item.id === stageInfo.stage.id) ?? stageInfo.stage;

    if (sourceStage.orden != null && sourceStage.orden < 2) {
      setDragMessage("Solo puedes arrastrar leads a partir de la etapa Precalificado.");
      setActiveDragId(null);
      setActiveDragCard(null);
      setActiveDragStage(null);
      return;
    }

    setDragMessage(null);
    setActiveDragId(cardId);
    setActiveDragCard(stageInfo.card);
    setActiveDragStage(sourceStage);
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

    const missingStageRequirement = getMissingStageRequirement(destinationStage, activeDragCard);
    if (missingStageRequirement) {
      setDragMessage(
        `Completa el campo “${missingStageRequirement}” en la sección ${destinationStage.nombre} antes de avanzar.`,
      );
      handleDragCancel();
      return;
    }

    const destinationCode = normalizeStageCode(destinationStage);
    if (destinationCode === "cerrado_ganado") {
      const acceptedCheck = await ensureLeadHasAcceptedQuote(activeDragCard.oportunidadId);
      if (!acceptedCheck.ok) {
        setDragMessage(acceptedCheck.error ?? "No se pudo verificar las cotizaciones del lead.");
        handleDragCancel();
        return;
      }
      if (!acceptedCheck.accepted) {
        setDragMessage("Necesitas una cotización aceptada antes de marcar el lead como ganado.");
        handleDragCancel();
        return;
      }
    }

    const movingFromPrecalificado = normalizeStageCode(activeDragStage) === PRECALIFICADO_STAGE_CODE;
    const movingToDemo = normalizeStageCode(destinationStage) === DEMO_STAGE_CODE;
    if (movingFromPrecalificado && movingToDemo) {
      openScheduleDialog({
        card: activeDragCard,
        originStage: activeDragStage,
        destinationStage,
      });
      handleDragCancel();
      return;
    }

    setMovePending(true);
    const result = await moveLeadCard({
      oportunidadId: activeDragCard.oportunidadId,
      etapaDestino: destinationStage.id,
      fuente: "humano",
      expectedEtapa: activeDragStage.id,
    });
    setMovePending(false);

    if (!result.ok) {
      applyLeadResult(result);
      setDragMessage(result.error || "No se pudo mover el lead.");
      handleDragCancel();
      return;
    }
    setDragMessage(null);
    applyLeadResult(result);
    handleDragCancel();
  };

  const hasContent =
    stages.some((stage) => stage.tarjetas.length > 0) ||
    sinConversacion.length > 0 ||
    visitantesSinChat > 0;

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
          <div className="flex flex-1 gap-4 overflow-x-auto pb-2 pr-2">
            <div className="w-[320px] shrink-0">
              <section className="flex h-full min-h-[420px] flex-col rounded-xl border border-primary/60 bg-primary/5">
                <div className="px-4 py-4">
                  <h3 className="text-sm font-semibold text-primary">Sin conversación</h3>
                  <p className="text-xs text-muted-foreground">Visitas al webchat sin iniciar chat</p>
                  <p className="mt-3 text-3xl font-bold text-primary">{visitantesDisplay}</p>
                </div>
                <div className="mt-2 space-y-2 px-4 pb-4 text-xs text-muted-foreground">
                  <p>
                    Estos visitantes cerraron el webchat sin enviar mensajes. Úsalos como señal temprana
                    para optimizar el embudo.
                  </p>
                </div>
              </section>
            </div>

            {stages.map((stage) => (
              <div key={stage.id} className="w-[320px] shrink-0">
                <EmbudoStageColumn
                  stage={stage}
                  onCardClick={(card) => handleCardClick(stage, card)}
                  onAddLead={() => handleAddLead(stage)}
                  droppableId={stage.id}
                  canDrop={(stage.orden ?? Number.MAX_SAFE_INTEGER) >= 2}
                  dropDisabled={(stage.orden ?? Number.MAX_SAFE_INTEGER) < 2}
                  renderCard={(card) => (
                    <DraggableCard
                      key={card.oportunidadId}
                      card={card}
                      onClick={() => handleCardClick(stage, card)}
                      stageId={stage.id}
                      dragDisabled={(stage.orden ?? Number.MAX_SAFE_INTEGER) < 2}
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
        open={drawerOpen && !!selectedStage}
        onOpenChange={handleDrawerOpenChange}
        currentStage={selectedStage}
        allStages={stages}
        card={selectedCard}
        mode={drawerMode}
        onSubmit={handleLeadSubmit}
        onCreate={handleLeadCreate}
        onDelete={handleLeadDelete}
        onAdvanceStage={handleAutoAdvanceStage}
      />

      <Sheet open={scheduleDialogOpen && !!scheduleContext} onOpenChange={handleScheduleOpenChange}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Agendar demo</SheetTitle>
            <SheetDescription>
              {scheduleContext
                ? `Define la fecha y hora antes de mover “${scheduleContext.card.titulo}” a “${scheduleContext.destinationStage.nombre}”.`
                : "Define la fecha y hora de la demo."}
            </SheetDescription>
          </SheetHeader>
          <form className="flex flex-col gap-4 px-4 pb-6" onSubmit={handleScheduleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="schedule-demo-datetime" className="text-sm font-medium">
                Fecha y hora de la demo *
              </Label>
              <Input
                id="schedule-demo-datetime"
                type="datetime-local"
                value={scheduleDateTime}
                onChange={(event) => setScheduleDateTime(event.target.value)}
                min={scheduleMinValue || undefined}
                required
                disabled={schedulePending}
              />
              <p className="text-xs text-muted-foreground">Usa tu zona horaria local.</p>
            </div>
            {scheduleError ? (
              <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {scheduleError}
              </p>
            ) : null}
            <SheetFooter className="flex-row justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeScheduleDialog} disabled={schedulePending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={schedulePending}>
                Confirmar demo
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

type DraggableCardProps = {
  card: EmbudoCard;
  onClick?: () => void;
  disabled?: boolean;
  stageId: string;
  dragDisabled?: boolean;
};

function DraggableCard({ card, onClick, disabled = false, stageId, dragDisabled = false }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggableCard({
    card,
    stageId,
    dragDisabled,
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
  dragDisabled?: boolean;
};

function useDraggableCard({ card, stageId, dragDisabled }: UseDraggableCardArgs) {
  const result = useDraggable({
    id: card.oportunidadId,
    data: {
      stageId,
    },
    disabled: dragDisabled,
  });
  return result;
}

type StagePrepMetadata = Record<string, Record<string, unknown>>;

function normalizeStageCode(stage: EmbudoStage | null): string {
  return stage?.codigo?.toLowerCase() ?? "";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractStagePrep(card: EmbudoCard | null): StagePrepMetadata {
  if (!card) return {};
  const metadata = card.metadata;
  if (!isPlainRecord(metadata)) return {};
  const stagePrepRaw = metadata.stage_prep;
  if (!isPlainRecord(stagePrepRaw)) return {};

  const normalized: StagePrepMetadata = {};
  for (const [stageCode, rawValue] of Object.entries(stagePrepRaw)) {
    if (isPlainRecord(rawValue)) {
      normalized[stageCode] = { ...rawValue };
    }
  }
  return normalized;
}

function readDemoScheduledAt(card: EmbudoCard | null): string | null {
  const stagePrep = extractStagePrep(card);
  const demoPrep = stagePrep[DEMO_STAGE_CODE];
  if (!demoPrep) return null;
  const value = demoPrep["demo_scheduled_at"];
  return typeof value === "string" ? value : null;
}

function buildUpdatedDemoStagePrep(card: EmbudoCard, isoValue: string, bookingId?: string | null): StagePrepMetadata {
  const current = extractStagePrep(card);
  const demoPrep: Record<string, unknown> = { ...(current[DEMO_STAGE_CODE] ?? {}) };
  demoPrep["demo_scheduled_at"] = isoValue;
  if (bookingId) {
    demoPrep["demo_booking_id"] = bookingId;
  }
  return {
    ...current,
    [DEMO_STAGE_CODE]: demoPrep,
  };
}

function getMissingStageRequirement(stage: EmbudoStage, card: EmbudoCard): string | null {
  const stageCode = normalizeStageCode(stage);
  const requirements = STAGE_REQUIRED_FIELDS[stageCode];
  if (!requirements || !requirements.length) {
    return null;
  }
  const stagePrep = extractStagePrep(card);
  const values = stagePrep[stageCode] ?? {};
  for (const requirement of requirements) {
    const rawValue = values[requirement.key];
    const hasValue =
      typeof rawValue === "string" ? rawValue.trim().length > 0 : rawValue === true;
    if (!hasValue) {
      return requirement.label;
    }
  }
  return null;
}

function readStagePrepValue(
  state: StagePrepState | undefined,
  stageCode: string,
  fieldKey: string,
): string | null {
  if (!state) return null;
  const stageValues = state[stageCode];
  if (!stageValues) return null;
  const rawValue = stageValues[fieldKey];
  if (typeof rawValue !== "string") {
    return null;
  }
  const trimmed = rawValue.trim();
  return trimmed.length ? trimmed : null;
}
