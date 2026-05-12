"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
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

import type { EmbudoCard, EmbudoData, EmbudoScoringKpis, EmbudoStage } from "@/lib/embudo/data";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateTimeCalendarPicker } from "@/components/ui/datetime-calendar-picker";
import { fromDateTimeLocalInput, toDateTimeLocalInput } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ScoringKpisOverview } from "@/components/embudo/scoring-kpis";
import { SessionRecovery } from "@/components/session-recovery";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";

export type EmbudoBoardClientProps = {
  etapas: EmbudoStage[];
  sinConversacion: EmbudoCard[];
  visitantesSinChat: number;
  scoringKpis: EmbudoScoringKpis | null;
  errors: string[];
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

type ProgressionContext = {
  card: EmbudoCard;
  originStage: EmbudoStage;
  destinationStage: EmbudoStage;
  pathStages: EmbudoStage[];
};

type ProgressionFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "datetime"
  | "select"
  | "checkbox"
  | "url";

type ProgressionOption = {
  value: string;
  label: string;
};

type ProgressionRequirementField = {
  key: string;
  label: string;
  type: ProgressionFieldType;
  options?: ProgressionOption[];
};

type SalesRepOption = {
  id: string;
  label: string;
};

const PRECALIFICADO_STAGE_CODE = "precalificado";
const DEMO_STAGE_CODE = "demo";
const DEMO_FORMAT_OPTIONS = [
  { value: "virtual", label: "Virtual" },
  { value: "presencial", label: "Presencial" },
  { value: "hibrida", label: "Híbrida" },
];

const STAGE_REQUIRED_FIELDS: Record<string, Array<{ key: string; label: string }>> = {
  demo: [
    { key: "demo_format", label: "Modalidad" },
  ],
  cerrado_ganado: [
    { key: "close_date", label: "Fecha de cierre" },
  ],
};
const BOARD_LIVE_REFRESH_MS = 5000;

function sortStages(stages: EmbudoStage[]): EmbudoStage[] {
  return [...stages].sort((a, b) => {
    if (a.orden !== b.orden) return (a.orden ?? Number.MAX_SAFE_INTEGER) - (b.orden ?? Number.MAX_SAFE_INTEGER);
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

function sanitizeString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
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
  scoringKpis,
  errors,
}: EmbudoBoardClientProps) {
  const [boardState, setBoardState] = useState<EmbudoData>({
    stages: etapas,
    sinConversacion,
    visitantesSinChat,
    scoringKpis,
    errors: errors ?? [],
  });

  const initialStages = useMemo(
    () =>
      sortStages(
        boardState.stages.map((stage) => ({
          ...stage,
          tarjetas: sortCards(stage.tarjetas ?? []),
        })),
      ),
    [boardState.stages],
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
  const [scheduleFormat, setScheduleFormat] = useState("");
  const [scheduleLink, setScheduleLink] = useState("");
  const [progressionContext, setProgressionContext] = useState<ProgressionContext | null>(null);
  const [progressionDialogOpen, setProgressionDialogOpen] = useState(false);
  const [progressionStagePrep, setProgressionStagePrep] = useState<StagePrepMetadata>({});
  const [progressionError, setProgressionError] = useState<string | null>(null);
  const [progressionPending, setProgressionPending] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [appliedDays, setAppliedDays] = useState(7);
  const [appliedCanal, setAppliedCanal] = useState("");
  const [appliedEstado, setAppliedEstado] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedTieneCita, setAppliedTieneCita] = useState("");
  const [appliedEtapaIds, setAppliedEtapaIds] = useState<string[]>([]);
  const [draftDays, setDraftDays] = useState(7);
  const [draftCanal, setDraftCanal] = useState("");
  const [draftEstado, setDraftEstado] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [draftTieneCita, setDraftTieneCita] = useState("");
  const [draftEtapaIds, setDraftEtapaIds] = useState<string[]>([]);

  const { context: permissionContext, loading: permissionsLoading } = usePermissions();
  const normalizedRoles = permissionContext.roles
    .map((role) => (role ?? "").toString().trim().toLowerCase())
    .filter(Boolean);
  const isAdminRole =
    Boolean(permissionContext.es_admin || permissionContext.es_owner) ||
    normalizedRoles.some((value) => value === "admin" || value.includes("admin"));
  const isSupervisorRole = normalizedRoles.some(
    (value) => value === "0002" || value === "supervisor" || value.includes("supervisor"),
  );
  const isPrivilegedRole = isAdminRole || isSupervisorRole;
  const isAgenteRole = normalizedRoles.some(
    (value) =>
      value === "0003" ||
      value === "agente" ||
      value === "vendedor" ||
      value.includes("agente") ||
      value.includes("vendedor"),
  );
  const showVendorFilter = !permissionsLoading && isPrivilegedRole;
  const [vendorOptions, setVendorOptions] = useState<SalesRepOption[]>([]);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [vendorError, setVendorError] = useState<string | null>(null);
  const [selectedVendedorId, setSelectedVendedorId] = useState("");

  useEffect(() => {
    if (!permissionsLoading && isAgenteRole && !isPrivilegedRole && permissionContext.usuario_id) {
      setSelectedVendedorId((current) => (current || permissionContext.usuario_id || ""));
    }
  }, [permissionsLoading, isAgenteRole, isPrivilegedRole, permissionContext.usuario_id]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardFetchError, setBoardFetchError] = useState<string | null>(null);
  const hasMountedRef = useRef(false);
  const boardFetchInFlightRef = useRef(false);
  const searchParams = useSearchParams();
  const pendingOpenIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (pendingOpenIdRef.current) return;
    const fromQuery =
      searchParams.get("oportunidadId") ||
      searchParams.get("oportunidad_id") ||
      searchParams.get("leadId") ||
      searchParams.get("lead_id");
    if (fromQuery && fromQuery.trim()) {
      pendingOpenIdRef.current = fromQuery.trim();
    }
  }, [searchParams]);

  useEffect(() => {
    const targetId = pendingOpenIdRef.current;
    if (!targetId) return;
    if (!stages.length) return;
    if (drawerOpen) return;

    let targetStage: EmbudoStage | null = null;
    let targetCard: EmbudoCard | null = null;
    for (const stage of stages) {
      const card = (stage.tarjetas ?? []).find((item) => item.oportunidadId === targetId);
      if (card) {
        targetStage = stage;
        targetCard = card;
        break;
      }
    }
    if (!targetStage || !targetCard) {
      return;
    }
    setSelectedStage(targetStage);
    setSelectedCard(targetCard);
    setDrawerMode("edit");
    setDrawerOpen(true);
    pendingOpenIdRef.current = null;
  }, [drawerOpen, stages]);

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
    const safeValue = Number.isFinite(boardState.visitantesSinChat)
      ? Math.max(boardState.visitantesSinChat, 0)
      : 0;
    return formatter.format(safeValue);
  }, [boardState.visitantesSinChat]);

  const fetchBoardData = useCallback(async (
    asignadoId?: string | null,
    options?: { silent?: boolean },
  ) => {
    const silent = Boolean(options?.silent);
    if (boardFetchInFlightRef.current) {
      return;
    }
    boardFetchInFlightRef.current = true;
    if (!silent) {
      setBoardLoading(true);
      setBoardFetchError(null);
    }
    try {
      const params = new URLSearchParams();
      params.set("limit", "400");
      if (asignadoId) {
        params.set("asignado_id", asignadoId);
      }
      if (appliedDays) {
        params.set("days", String(appliedDays));
      }
      if (appliedCanal) {
        params.set("canal", appliedCanal);
      }
      if (appliedEstado) {
        params.set("estado", appliedEstado);
      }
      if (appliedQuery.trim()) {
        params.set("q", appliedQuery.trim());
      }
      if (appliedTieneCita) {
        params.set("tiene_cita", appliedTieneCita);
      }
      if (appliedEtapaIds.length) {
        params.set("etapa_ids", appliedEtapaIds.join(","));
      }
      const response = await fetch(`/api/embudo/board?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const message = await response.text().catch(() => `Error ${response.status}`);
        throw new Error(message || `Error ${response.status}`);
      }
      const data: EmbudoData = await response.json();
      setBoardState({
        ...data,
        errors: Array.isArray(data.errors) ? data.errors : [],
      });
    } catch (error) {
      if (!silent) {
        setBoardFetchError(
          error instanceof Error ? error.message : "No se pudo actualizar el embudo.",
        );
      }
    } finally {
      if (!silent) {
        setBoardLoading(false);
      }
      boardFetchInFlightRef.current = false;
    }
  }, [appliedDays, appliedCanal, appliedEstado, appliedQuery, appliedTieneCita, appliedEtapaIds]);

  const fetchSupervisedVendors = useCallback(async () => {
    if (!showVendorFilter) return;
    setVendorLoading(true);
    setVendorError(null);
    try {
      const response = await fetch("/api/embudo/supervised?limit=200", { cache: "no-store" });
      if (!response.ok) {
        const message = await response.text().catch(() => `Error ${response.status}`);
        throw new Error(message || `Error ${response.status}`);
      }
      const payload = await response.json().catch(() => ({}));
      const vendedores = Array.isArray(payload?.vendedores) ? payload.vendedores : [];
      const vendorCandidates: Array<SalesRepOption | null> = vendedores.map(
        (user: { id?: string; nombre_completo?: string; correo?: string }) => {
          if (!user.id) return null;
          const label =
            user.nombre_completo?.trim() || user.correo?.trim() || "Sin vendedor asignado";
          return { id: user.id, label };
        },
      );
      setVendorOptions(
        vendorCandidates.filter((entry): entry is SalesRepOption => entry != null),
      );
    } catch (error) {
      setVendorError(
        error instanceof Error ? error.message : "No se pudo cargar los vendedores supervisados.",
      );
    } finally {
      setVendorLoading(false);
    }
  }, [showVendorFilter]);

  useEffect(() => {
    if (showVendorFilter && !vendorOptions.length) {
      void fetchSupervisedVendors();
    }
  }, [showVendorFilter, vendorOptions.length, fetchSupervisedVendors]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    void fetchBoardData(selectedVendedorId || undefined);
  }, [selectedVendedorId, appliedDays, appliedCanal, appliedEstado, appliedQuery, appliedTieneCita, appliedEtapaIds, fetchBoardData]);

  useEffect(() => {
    const refresh = () => {
      if (document.hidden) return;
      if (drawerOpen) return;
      if (movePending || schedulePending) return;
      void fetchBoardData(selectedVendedorId || undefined, { silent: true });
    };

    const timer = window.setInterval(refresh, BOARD_LIVE_REFRESH_MS);
    const handleVisibilityChange = () => refresh();
    const handleFocus = () => refresh();
    const handleOnline = () => refresh();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
    };
  }, [fetchBoardData, movePending, schedulePending, selectedVendedorId, drawerOpen]);

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
      const preferredCodes = [
        scheduleContext.destinationStage.codigo,
        scheduleContext.originStage.codigo,
        scheduleContext.card.etapaCodigo,
      ];
      const existingValue = readDemoScheduledAt(scheduleContext.card, ...preferredCodes);
      const existingFormat = readDemoPrepValue(scheduleContext.card, "demo_format", ...preferredCodes);
      const existingLink = readDemoPrepValue(scheduleContext.card, "demo_link", ...preferredCodes);
      setScheduleDateTime(existingValue ? toDateTimeLocalInput(existingValue) : "");
      setScheduleFormat(existingFormat ?? "");
      setScheduleLink(existingLink ?? "");
    }
  }, [scheduleContext]);

  const openScheduleDialog = useCallback((context: ScheduleContext) => {
    setScheduleContext(context);
    setScheduleError(null);
    setSchedulePending(false);
    setScheduleDialogOpen(true);
  }, []);

  const closeScheduleDialog = () => {
    setScheduleDialogOpen(false);
    setScheduleContext(null);
    setScheduleDateTime("");
    setScheduleFormat("");
    setScheduleLink("");
    setScheduleError(null);
    setSchedulePending(false);
  };

  const handleDrawerScheduleDemo = useCallback(
    (context: { card: EmbudoCard; originStage: EmbudoStage | null; targetStage: EmbudoStage }) => {
      openScheduleDialog({
        card: context.card,
        originStage: context.originStage ?? context.targetStage,
        destinationStage: context.targetStage,
      });
    },
    [openScheduleDialog],
  );

  const handleScheduleOpenChange = (open: boolean) => {
    if (!open) {
      closeScheduleDialog();
    } else if (scheduleContext) {
      setScheduleDialogOpen(true);
    }
  };

  const openProgressionDialog = useCallback((context: ProgressionContext) => {
    setProgressionContext(context);
    setProgressionStagePrep(extractStagePrep(context.card));
    setProgressionError(null);
    setProgressionPending(false);
    setProgressionDialogOpen(true);
  }, []);

  const closeProgressionDialog = useCallback(() => {
    setProgressionDialogOpen(false);
    setProgressionContext(null);
    setProgressionStagePrep({});
    setProgressionError(null);
    setProgressionPending(false);
  }, []);

  const handleProgressionFieldChange = useCallback(
    (stageCode: string, fieldKey: string, value: string | boolean) => {
      setProgressionStagePrep((prev) => {
        const next = { ...prev };
        const current = { ...(next[stageCode] ?? {}) };
        if (typeof value === "boolean") {
          current[fieldKey] = value;
        } else if (value.trim().length === 0) {
          delete current[fieldKey];
        } else {
          current[fieldKey] = value;
        }
        if (!Object.keys(current).length) {
          delete next[stageCode];
        } else {
          next[stageCode] = current;
        }
        return next;
      });
    },
    [],
  );

  const handleProgressionSubmit = async () => {
    if (!progressionContext) return;

    const { card, originStage, destinationStage, pathStages } = progressionContext;
    setProgressionPending(true);
    setProgressionError(null);
    setMovePending(true);

    try {
      let acceptedForWon = true;
      const pathIncludesWon = pathStages.some((stage) =>
        matchesStageCode(normalizeStageCode(stage), "cerrado_ganado"),
      );
      if (pathIncludesWon) {
        const acceptedCheck = await ensureLeadHasAcceptedQuote(card.oportunidadId);
        if (!acceptedCheck.ok) {
          setProgressionError(
            acceptedCheck.error || "No se pudo verificar las cotizaciones del lead.",
          );
          return;
        }
        acceptedForWon = acceptedCheck.accepted;
      }

      let furthestValidStage: EmbudoStage | null = null;
      let blockMessage: string | null = null;

      for (const stage of pathStages) {
        const stageCode = normalizeStageCode(stage);
        if (matchesStageCode(stageCode, "cerrado_ganado") && !acceptedForWon) {
          blockMessage =
            "Necesitas una cotización aceptada antes de mover el lead a Cerrado (Ganado).";
          break;
        }
        const missingRequirement = getMissingStageRequirementFromPrep(stage, progressionStagePrep);
        if (missingRequirement) {
          blockMessage = `Falta “${missingRequirement}” para completar la etapa “${stage.nombre}”.`;
          break;
        }
        furthestValidStage = stage;
      }

      const updateResult = await updateLeadCard({
        oportunidadId: card.oportunidadId,
        contactoId: card.contactoId,
        oportunidad: {
          metadata: {
            stage_prep: progressionStagePrep,
          },
        },
        mergeMetadata: true,
      });

      if (!updateResult.ok) {
        setProgressionError(updateResult.error || "No se pudieron guardar los datos del avance.");
        return;
      }

      if (!furthestValidStage) {
        setProgressionError(
          blockMessage || "No se pudo avanzar porque faltan datos de etapas intermedias.",
        );
        return;
      }

      const moveResult = await moveLeadCard({
        oportunidadId: card.oportunidadId,
        etapaDestino: furthestValidStage.id,
        fuente: "humano",
        expectedEtapa: originStage.id,
      });

      if (!moveResult.ok) {
        applyLeadResult(moveResult);
        setProgressionError(moveResult.error || "No se pudo mover el lead.");
        return;
      }

      const patchedResult: LeadActionResult = {
        ...moveResult,
        card: {
          ...moveResult.card,
          metadata: {
            ...(moveResult.card.metadata ?? {}),
            stage_prep: progressionStagePrep,
          },
        },
      };
      applyLeadResult(patchedResult);

      if (furthestValidStage.id !== destinationStage.id) {
        const info = blockMessage
          ? `${blockMessage} Se movió a “${furthestValidStage.nombre}”.`
          : `Se movió hasta “${furthestValidStage.nombre}” porque faltan datos en etapas posteriores.`;
        setDragMessage(info);
      } else {
        setDragMessage(null);
      }

      closeProgressionDialog();
    } finally {
      setProgressionPending(false);
      setMovePending(false);
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

    if (!scheduleFormat.trim()) {
      setScheduleError("Selecciona la modalidad de la demo.");
      return;
    }

    const isoValue = fromDateTimeLocalInput(scheduleDateTime);
    if (!isoValue) {
      setScheduleError("La fecha no tiene un formato válido.");
      return;
    }

    setScheduleError(null);
    setSchedulePending(true);
    setMovePending(true);

    const bookingPayload = {
      conversationId: sanitizeString(scheduleContext.card.conversacionId),
      contactoId: sanitizeString(scheduleContext.card.contactoId),
      oportunidadId: scheduleContext.card.oportunidadId,
      canal: sanitizeString(scheduleContext.card.canal),
      startAt: isoValue,
    };

    const bookingResult = await scheduleLeadDemo({
      ...bookingPayload,
    });

    if (!bookingResult.ok) {
      setScheduleError(bookingResult.error || "No se pudo agendar la demo.");
      setSchedulePending(false);
      setMovePending(false);
      return;
    }

    const extraFields: Record<string, unknown> = { demo_format: scheduleFormat.trim() };
    const linkValue = scheduleLink.trim();
    if (linkValue.length) {
      extraFields.demo_link = linkValue;
    }
    const stagePrep = buildUpdatedDemoStagePrep(
      scheduleContext.card,
      isoValue,
      bookingResult.booking.booking_id,
      scheduleContext.destinationStage.codigo,
      extraFields,
    );
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

    let patchedResult = result;
    if (result.ok && result.card) {
      const patchedCard: EmbudoCard = { ...result.card };
      const contactPayload = payload.contacto ?? {};
      const opportunityPayload = payload.oportunidad ?? {};

      if ("nombre_completo" in contactPayload) {
        const nextName = contactPayload.nombre_completo;
        patchedCard.nombre = typeof nextName === "string" ? nextName || null : null;
      }
      if ("correo" in contactPayload) {
        const nextEmail = contactPayload.correo;
        patchedCard.correo = typeof nextEmail === "string" ? nextEmail || null : null;
      }
      if ("telefono_e164" in contactPayload) {
        const nextPhone = contactPayload.telefono_e164;
        patchedCard.telefono = typeof nextPhone === "string" ? nextPhone || null : null;
      }
      if ("company_name" in contactPayload) {
        const nextCompany = contactPayload.company_name;
        patchedCard.empresa = typeof nextCompany === "string" ? nextCompany || null : null;
      }

      if ("titulo" in opportunityPayload) {
        const nextTitleRaw = opportunityPayload.titulo;
        const nextTitle =
          typeof nextTitleRaw === "string" && nextTitleRaw.trim().length
            ? nextTitleRaw.trim()
            : null;
        if (nextTitle !== null) {
          patchedCard.titulo = nextTitle;
          patchedCard.proyectoNombre = nextTitle;
          patchedCard.metadata = {
            ...(patchedCard.metadata ?? {}),
            project_name: nextTitle,
          };
        } else if (!patchedCard.titulo) {
          patchedCard.titulo = patchedCard.nombre ?? "Oportunidad sin nombre";
          if (patchedCard.metadata) {
            delete patchedCard.metadata.project_name;
          }
        }
      }
      if ("descripcion" in opportunityPayload) {
        const nextDescRaw = opportunityPayload.descripcion;
        const nextDesc =
          typeof nextDescRaw === "string" && nextDescRaw.trim().length
            ? nextDescRaw.trim()
            : null;
        patchedCard.proyectoNecesidades = nextDesc ?? patchedCard.proyectoNecesidades ?? null;
      }

      patchedResult = { ...result, card: patchedCard };
    }

    applyLeadResult(patchedResult);
    if (patchedResult.ok) {
      setSelectedCard(patchedResult.card);
    } else if (patchedResult.latestCard) {
      setSelectedCard(patchedResult.latestCard);
    }

    return patchedResult;
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
    if (matchesStageCode(nextStageCode, DEMO_STAGE_CODE) && context?.stagePrep) {
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
    setMovePending(true);
    try {
      const bookingResult = await scheduleLeadDemo({
        conversationId: sanitizeString(selectedCard.conversacionId),
        contactoId: sanitizeString(selectedCard.contactoId),
        oportunidadId: selectedCard.oportunidadId,
        canal: sanitizeString(selectedCard.canal),
        startAt: isoValue,
      });
      if (!bookingResult.ok) {
        return { ok: false as const, error: bookingResult.error || "No se pudo agendar la demo." };
      }

      const stagePrepEntry = resolveStagePrepStateEntry(
        stagePrepState,
        targetStage.codigo,
        selectedCard.etapaCodigo,
        DEMO_STAGE_CODE,
      );
      const extraFields = stagePrepStateEntryToMetadata(stagePrepEntry, ["demo_scheduled_at"]);

      const demoStagePrep = buildUpdatedDemoStagePrep(
        selectedCard,
        isoValue,
        bookingResult.booking.booking_id,
        targetStage.codigo,
        extraFields ?? undefined,
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
    const orderedDraggableStages = sortStages(stages).filter(
      (stage) => (stage.orden ?? Number.MAX_SAFE_INTEGER) >= 2,
    );
    const currentStageIndex = orderedDraggableStages.findIndex(
      (stage) => stage.id === activeDragStage.id,
    );
    const destinationStageIndex = orderedDraggableStages.findIndex(
      (stage) => stage.id === destinationStage.id,
    );
    if (currentStageIndex === -1 || destinationStageIndex === -1) {
      setDragMessage("No se pudo validar la secuencia de etapas para mover la tarjeta.");
      handleDragCancel();
      return;
    }
    if (destinationStageIndex <= currentStageIndex) {
      setDragMessage("Solo puedes mover la tarjeta hacia adelante en el embudo.");
      handleDragCancel();
      return;
    }
    if (destinationStage.orden != null && destinationStage.orden < 2) {
      setDragMessage("No puedes mover leads a etapas anteriores a Precalificado.");
      handleDragCancel();
      return;
    }
    const pathStages = orderedDraggableStages.slice(currentStageIndex + 1, destinationStageIndex + 1);
    if (pathStages.length > 1) {
      openProgressionDialog({
        card: activeDragCard,
        originStage: activeDragStage,
        destinationStage,
        pathStages,
      });
      handleDragCancel();
      return;
    }
    if (movePending) {
      handleDragCancel();
      return;
    }

    const destinationCode = normalizeStageCode(destinationStage);
    const skipStageRequirementCheck = matchesStageCode(destinationCode, DEMO_STAGE_CODE);
    const missingStageRequirement = skipStageRequirementCheck
      ? null
      : getMissingStageRequirement(destinationStage, activeDragCard);
    if (missingStageRequirement) {
      setDragMessage(
        `Completa el campo “${missingStageRequirement}” en la sección ${destinationStage.nombre} antes de avanzar.`,
      );
      handleDragCancel();
      return;
    }

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

    const movingFromPrecalificado = matchesStageCode(normalizeStageCode(activeDragStage), PRECALIFICADO_STAGE_CODE);
    const movingToDemo = matchesStageCode(normalizeStageCode(destinationStage), DEMO_STAGE_CODE);
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
    boardState.sinConversacion.length > 0 ||
    boardState.visitantesSinChat > 0;

  const sanitizedBoardErrors = (boardState.errors ?? []).map(sanitizeBoardMessage).filter(Boolean);
  const errorMessages = boardFetchError ? [boardFetchError] : sanitizedBoardErrors;
  const showFiltersButton = true;
  const activeFiltersCount =
    (selectedVendedorId ? 1 : 0) +
    (appliedCanal ? 1 : 0) +
    (appliedEstado ? 1 : 0) +
    (appliedQuery.trim() ? 1 : 0) +
    (appliedTieneCita ? 1 : 0) +
    (appliedEtapaIds.length ? 1 : 0) +
    (appliedDays !== 7 ? 1 : 0);

  return (
    <>
      <SessionRecovery errors={boardState.errors} />
      {errorMessages.length ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <p className="font-medium">Se detectaron errores al cargar el embudo:</p>
          <ul className="list-disc pl-5">
            {errorMessages.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="space-y-4">
        {boardState.scoringKpis ? <ScoringKpisOverview kpis={boardState.scoringKpis} /> : null}
        {showFiltersButton ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDraftDays(appliedDays);
                setDraftCanal(appliedCanal);
                setDraftEstado(appliedEstado);
                setDraftQuery(appliedQuery);
                setDraftTieneCita(appliedTieneCita);
                setDraftEtapaIds(appliedEtapaIds);
                setFiltersOpen(true);
              }}
              className="gap-2"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtros{activeFiltersCount ? ` (${activeFiltersCount})` : ""}
            </Button>
            {boardLoading ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-muted-foreground/60 px-3 py-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Actualizando
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Filtros</DialogTitle>
            <DialogDescription>
              Ajusta la vista del embudo. Los filtros aplican a oportunidades y KPIs.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-[70vh] space-y-4 overflow-auto pr-1">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ventana KPIs
              </Label>
              <Select value={String(draftDays)} onValueChange={(value) => setDraftDays(Number(value) || 7)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="7 días" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="7">7 días</SelectItem>
                  <SelectItem value="30">30 días</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Canal
              </Label>
              <Select value={draftCanal} onValueChange={(value) => setDraftCanal(value)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="Todos los canales" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="webchat">Webchat</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tiene cita
              </Label>
              <Select value={draftTieneCita} onValueChange={(value) => setDraftTieneCita(value)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="con_cita">Con cita</SelectItem>
                  <SelectItem value="sin_cita">Sin cita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Estado
              </Label>
              <Select value={draftEstado} onValueChange={(value) => setDraftEstado(value)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="abierta">Abierta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Buscar
              </Label>
              <Input
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="Nombre, correo, teléfono o título…"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Etapas
              </Label>
              <div className="max-h-56 space-y-2 overflow-auto rounded-lg border border-border/60 bg-background/50 p-3">
                {boardState.stages.map((stage) => {
                  const checked = draftEtapaIds.includes(stage.id);
                  return (
                    <label key={stage.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={checked}
                        onChange={(event) => {
                          const nextChecked = event.target.checked;
                          setDraftEtapaIds((prev) => {
                            if (nextChecked) {
                              return prev.includes(stage.id) ? prev : [...prev, stage.id];
                            }
                            return prev.filter((value) => value !== stage.id);
                          });
                        }}
                      />
                      <span className="truncate">{stage.nombre}</span>
                    </label>
                  );
                })}
                {!boardState.stages.length ? (
                  <p className="text-xs text-muted-foreground">No hay etapas disponibles.</p>
                ) : null}
              </div>
              {draftEtapaIds.length ? (
                <p className="text-xs text-muted-foreground">
                  Seleccionadas: {draftEtapaIds.length}
                </p>
              ) : null}
            </div>
            {showVendorFilter ? (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Vendedor
                </Label>
                <Select value={selectedVendedorId} onValueChange={(value) => setSelectedVendedorId(value)}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Todos los vendedores" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {vendorOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedVendedorId("")}
                    disabled={!selectedVendedorId}
                  >
                    Limpiar filtro
                  </Button>
                  {vendorLoading ? (
                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Cargando…
                    </span>
                  ) : null}
                </div>
                {vendorError ? <p className="text-xs text-destructive">{vendorError}</p> : null}
              </div>
            ) : null}
          </div>
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraftDays(7);
                setDraftCanal("");
                setDraftEstado("");
                setDraftQuery("");
                setDraftTieneCita("");
                setDraftEtapaIds([]);
                setAppliedDays(7);
                setAppliedCanal("");
                setAppliedEstado("");
                setAppliedQuery("");
                setAppliedTieneCita("");
                setAppliedEtapaIds([]);
                if (showVendorFilter) setSelectedVendedorId("");
              }}
            >
              Limpiar
            </Button>
            <Button
              type="button"
              onClick={() => {
                setAppliedDays(draftDays);
                setAppliedCanal(draftCanal === "all" ? "" : draftCanal);
                setAppliedEstado(draftEstado === "all" ? "" : draftEstado);
                setAppliedQuery(draftQuery);
                setAppliedTieneCita(draftTieneCita === "all" ? "" : draftTieneCita);
                setAppliedEtapaIds(draftEtapaIds);
                setFiltersOpen(false);
              }}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        onScheduleDemo={
          selectedCard
            ? (context) => handleDrawerScheduleDemo(context)
            : undefined
        }
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
            <DateTimeCalendarPicker
              id="schedule-demo-datetime"
              label="Fecha y hora de la demo *"
              value={scheduleDateTime}
              onChange={setScheduleDateTime}
              minValue={scheduleMinValue || undefined}
              disabled={schedulePending}
              description="Usa tu zona horaria local."
            />
            <div className="space-y-2">
              <Label htmlFor="schedule-demo-format" className="text-sm font-medium">
                Modalidad *
              </Label>
              <select
                id="schedule-demo-format"
                value={scheduleFormat}
                onChange={(event) => setScheduleFormat(event.target.value)}
                disabled={schedulePending}
                className="bg-background border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" disabled>
                  Selecciona la modalidad
                </option>
                {DEMO_FORMAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-demo-link" className="text-sm font-medium">
                Enlace o ubicación
              </Label>
              <Input
                id="schedule-demo-link"
                value={scheduleLink}
                onChange={(event) => setScheduleLink(event.target.value)}
                placeholder="https://..."
                disabled={schedulePending}
              />
              <p className="text-xs text-muted-foreground">Ingresa la sala virtual o dirección de la demo.</p>
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

      <Dialog
        open={progressionDialogOpen && !!progressionContext}
        onOpenChange={(open) => {
          if (!open) closeProgressionDialog();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Avance de etapas</DialogTitle>
            <DialogDescription>
              Completa los campos requeridos para avanzar desde
              {` “${progressionContext?.originStage.nombre ?? ""}” `}
              hasta
              {` “${progressionContext?.destinationStage.nombre ?? ""}”.`}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-4 overflow-auto pr-1">
            {(progressionContext?.pathStages ?? []).map((stage) => {
              const requirements = getStageRequirements(stage);
              if (!requirements.length) {
                return (
                  <div key={stage.id} className="rounded-lg border p-3">
                    <p className="text-sm font-medium">{stage.nombre}</p>
                    <p className="text-xs text-muted-foreground">Sin campos obligatorios.</p>
                  </div>
                );
              }
              const stageEntry = resolveStagePrepEntry(
                progressionStagePrep,
                stage.codigo,
                normalizeStageCode(stage),
                resolveStageRequirementKey(normalizeStageCode(stage)) ?? undefined,
              );
              const stageKey =
                stageEntry?.key ||
                normalizeStageCode(stage) ||
                stage.codigo.toLowerCase();

              return (
                <div key={stage.id} className="space-y-3 rounded-lg border p-3">
                  <p className="text-sm font-medium">{stage.nombre}</p>
                  {requirements.map((requirement) => {
                    const value = readStagePrepFieldValue(
                      progressionStagePrep,
                      stage,
                      requirement.key,
                    );
                    const inputId = `progression-${stage.id}-${requirement.key}`;
                    const fieldType = requirement.type;
                    const stringValue = typeof value === "string" ? value : "";
                    const boolValue = value === true;
                    return (
                      <div key={requirement.key} className="space-y-1">
                        <Label htmlFor={inputId} className="text-xs font-medium">
                          {requirement.label} *
                        </Label>
                        {fieldType === "select" ? (
                          <select
                            id={inputId}
                            className="bg-background border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-10 w-full items-center rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                            value={stringValue}
                            onChange={(event) =>
                              handleProgressionFieldChange(stageKey, requirement.key, event.target.value)
                            }
                            disabled={progressionPending}
                          >
                            <option value="">Selecciona una opción</option>
                            {(requirement.options ?? []).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : fieldType === "checkbox" ? (
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              id={inputId}
                              type="checkbox"
                              className="h-4 w-4"
                              checked={boolValue}
                              onChange={(event) =>
                                handleProgressionFieldChange(stageKey, requirement.key, event.target.checked)
                              }
                              disabled={progressionPending}
                            />
                            <span>Marcar como completado</span>
                          </label>
                        ) : fieldType === "textarea" ? (
                          <textarea
                            id={inputId}
                            className="bg-background border-input focus-visible:border-ring focus-visible:ring-ring/50 min-h-[90px] w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                            value={stringValue}
                            onChange={(event) =>
                              handleProgressionFieldChange(stageKey, requirement.key, event.target.value)
                            }
                            disabled={progressionPending}
                          />
                        ) : (
                          <Input
                            id={inputId}
                            type={resolveProgressionInputType(fieldType)}
                            value={stringValue}
                            onChange={(event) =>
                              handleProgressionFieldChange(stageKey, requirement.key, event.target.value)
                            }
                            disabled={progressionPending}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {progressionError ? (
              <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {progressionError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeProgressionDialog} disabled={progressionPending}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleProgressionSubmit()} disabled={progressionPending}>
              Guardar y avanzar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
type StagePrepEntry = { key: string; value: Record<string, unknown> };

function normalizeStageCode(stage: EmbudoStage | null): string {
  return stage?.codigo?.toLowerCase() ?? "";
}

function matchesStageCode(value: string, expected: string): boolean {
  if (!value || !expected) {
    return false;
  }
  const normalized = value.toLowerCase();
  const target = expected.toLowerCase();
  return normalized === target || normalized.endsWith(`_${target}`);
}

function sanitizeBoardMessage(message: string | null | undefined) {
  const trimmed = typeof message === "string" ? message.trim() : "";
  if (!trimmed) return "";
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return "El endpoint devolvió HTML en lugar de JSON (verifica la ruta o el proxy).";
  }
  if (/jwt\s+expired/i.test(trimmed)) {
    return "Tu sesión en Supabase caducó; estamos renovando el token automáticamente.";
  }
  if (/invalid\s+jwt/i.test(trimmed)) {
    return "El token de autenticación es inválido. Vuelve a iniciar sesión.";
  }
  return trimmed;
}

function resolveStagePrepEntry(stagePrep: StagePrepMetadata, ...codes: Array<string | null | undefined>): StagePrepEntry | null {
  if (!stagePrep) return null;
  const normalizedCodes: string[] = [];
  const seen = new Set<string>();
  for (const code of codes) {
    if (typeof code !== "string") continue;
    const trimmed = code.trim().toLowerCase();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalizedCodes.push(trimmed);
  }
  if (!normalizedCodes.length) {
    return null;
  }

  const entries = Object.entries(stagePrep);

  for (const candidate of normalizedCodes) {
    const direct = entries.find(([key]) => key.toLowerCase() === candidate);
    if (direct) {
      const [key, value] = direct;
      return { key, value };
    }
  }

  for (const candidate of normalizedCodes) {
    const suffix = candidate.split("_").pop();
    if (!suffix) continue;
    const normalizedSuffix = suffix.toLowerCase();
    for (const [key, value] of entries) {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey === normalizedSuffix || normalizedKey.endsWith(`_${normalizedSuffix}`)) {
        return { key, value };
      }
    }
  }

  return null;
}

function resolveStageRequirementKey(stageCode: string): string | null {
  if (!stageCode) return null;
  if (STAGE_REQUIRED_FIELDS[stageCode]) {
    return stageCode;
  }
  const parts = stageCode.split("_");
  const suffix = parts[parts.length - 1];
  if (suffix && STAGE_REQUIRED_FIELDS[suffix]) {
    return suffix;
  }
  return null;
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

function readDemoPrepValue(
  card: EmbudoCard | null,
  fieldKey: string,
  ...preferredStageCodes: Array<string | null | undefined>
): string | null {
  if (!card) return null;
  const stagePrep = extractStagePrep(card);
  const entry = resolveStagePrepEntry(stagePrep, ...preferredStageCodes, card.etapaCodigo, DEMO_STAGE_CODE);
  if (!entry) return null;
  const value = entry.value[fieldKey];
  return typeof value === "string" ? value : null;
}

function readDemoScheduledAt(card: EmbudoCard | null, ...preferredStageCodes: Array<string | null | undefined>) {
  return readDemoPrepValue(card, "demo_scheduled_at", ...preferredStageCodes);
}

function buildUpdatedDemoStagePrep(
  card: EmbudoCard,
  isoValue: string,
  bookingId?: string | null,
  stageCode?: string | null,
  extraFields?: Record<string, unknown> | null,
): StagePrepMetadata {
  const current = extractStagePrep(card);
  const resolvedEntry = resolveStagePrepEntry(current, stageCode, DEMO_STAGE_CODE);
  const targetKey = resolvedEntry?.key ?? (stageCode?.trim().toLowerCase() || DEMO_STAGE_CODE);
  const demoPrep: Record<string, unknown> = { ...(resolvedEntry?.value ?? {}) };
  demoPrep["demo_scheduled_at"] = isoValue;
  if (bookingId) {
    demoPrep["demo_booking_id"] = bookingId;
  }
  if (extraFields) {
    for (const [fieldKey, fieldValue] of Object.entries(extraFields)) {
      if (fieldValue == null) continue;
      if (typeof fieldValue === "string") {
        const trimmed = fieldValue.trim();
        if (!trimmed.length) continue;
        demoPrep[fieldKey] = trimmed;
      } else {
        demoPrep[fieldKey] = fieldValue;
      }
    }
  }
  return {
    ...current,
    [targetKey]: demoPrep,
  };
}

function getMissingStageRequirement(stage: EmbudoStage, card: EmbudoCard): string | null {
  const stageCode = normalizeStageCode(stage);
  const requirementKey = resolveStageRequirementKey(stageCode);
  const requirements = requirementKey ? STAGE_REQUIRED_FIELDS[requirementKey] : undefined;
  if (!requirements || !requirements.length) {
    return null;
  }
  const stagePrep = extractStagePrep(card);
  const entry = resolveStagePrepEntry(stagePrep, stage.codigo, stageCode, requirementKey);
  const values = entry?.value ?? {};
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

function getStageRequirements(stage: EmbudoStage): ProgressionRequirementField[] {
  const fromDrawerPrep = getStageRequirementsFromDrawerPrep(stage);
  if (fromDrawerPrep.length) {
    return fromDrawerPrep;
  }
  const stageCode = normalizeStageCode(stage);
  const requirementKey = resolveStageRequirementKey(stageCode);
  const fallback = requirementKey ? STAGE_REQUIRED_FIELDS[requirementKey] ?? [] : [];
  return fallback.map((field) => ({
    ...field,
    type: field.key.endsWith("_date") ? "date" : field.key === "demo_format" ? "select" : "text",
    options: field.key === "demo_format" ? DEMO_FORMAT_OPTIONS : undefined,
  }));
}

function getStageRequirementsFromDrawerPrep(stage: EmbudoStage): ProgressionRequirementField[] {
  const prep = findDrawerPrepCandidate(stage.metadatos);
  if (!prep) return [];
  const sections = Array.isArray(prep.sections) ? prep.sections : [];
  const fields: ProgressionRequirementField[] = [];

  for (const rawSection of sections) {
    if (!isPlainRecord(rawSection)) continue;
    const sectionFields = Array.isArray(rawSection.fields) ? rawSection.fields : [];
    for (const rawField of sectionFields) {
      if (!isPlainRecord(rawField)) continue;
      if (rawField.required !== true) continue;
      const key = typeof rawField.key === "string" ? rawField.key.trim() : "";
      if (!key) continue;
      const labelRaw = typeof rawField.label === "string" ? rawField.label.trim() : "";
      const typeRaw = typeof rawField.type === "string" ? rawField.type.toLowerCase() : "text";
      const type = resolveProgressionFieldType(typeRaw);
      const options = type === "select" ? parseProgressionOptions(rawField.options) : undefined;
      fields.push({
        key,
        label: labelRaw || key,
        type,
        options,
      });
    }
  }

  return fields;
}

function resolveProgressionFieldType(value: string): ProgressionFieldType {
  switch (value) {
    case "textarea":
    case "number":
    case "date":
    case "datetime":
    case "select":
    case "checkbox":
    case "url":
      return value;
    default:
      return "text";
  }
}

function parseProgressionOptions(rawOptions: unknown): ProgressionOption[] | undefined {
  if (!Array.isArray(rawOptions)) return undefined;
  const options = rawOptions
    .map((option) => {
      if (typeof option === "string") {
        const trimmed = option.trim();
        return trimmed ? { value: trimmed, label: trimmed } : null;
      }
      if (!isPlainRecord(option)) return null;
      const value = typeof option.value === "string" ? option.value.trim() : "";
      const label = typeof option.label === "string" ? option.label.trim() : value;
      if (!value) return null;
      return { value, label: label || value };
    })
    .filter((item): item is ProgressionOption => !!item);
  return options.length ? options : undefined;
}

function findDrawerPrepCandidate(meta: Record<string, unknown>): Record<string, unknown> | null {
  const visited = new Set<Record<string, unknown>>();
  const walk = (node: Record<string, unknown>): Record<string, unknown> | null => {
    if (visited.has(node)) return null;
    visited.add(node);
    const direct = node["drawer_prep"];
    if (isPlainRecord(direct)) return direct;
    for (const nestedKey of ["metadatos", "metadata"]) {
      const nested = node[nestedKey];
      if (isPlainRecord(nested)) {
        const found = walk(nested);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(meta);
}

function resolveProgressionInputType(type: ProgressionFieldType): "text" | "number" | "date" | "datetime-local" | "url" {
  switch (type) {
    case "date":
      return "date";
    case "datetime":
      return "datetime-local";
    case "number":
      return "number";
    case "url":
      return "url";
    default:
      return "text";
  }
}

function readStagePrepFieldValue(
  stagePrep: StagePrepMetadata,
  stage: EmbudoStage,
  fieldKey: string,
): string | boolean | undefined {
  const stageCode = normalizeStageCode(stage);
  const requirementKey = resolveStageRequirementKey(stageCode);
  const entry = resolveStagePrepEntry(stagePrep, stage.codigo, stageCode, requirementKey ?? undefined);
  const rawValue = entry?.value?.[fieldKey];
  if (typeof rawValue === "string" || typeof rawValue === "boolean") {
    return rawValue;
  }
  return undefined;
}

function getMissingStageRequirementFromPrep(
  stage: EmbudoStage,
  stagePrep: StagePrepMetadata,
): string | null {
  const requirements = getStageRequirements(stage);
  if (!requirements.length) {
    return null;
  }
  for (const requirement of requirements) {
    const value = readStagePrepFieldValue(stagePrep, stage, requirement.key);
    const complete =
      requirement.type === "checkbox"
        ? value === true
        : typeof value === "string" && value.trim().length > 0;
    if (!complete) {
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

function resolveStagePrepStateEntry(
  state: StagePrepState | undefined,
  ...codes: Array<string | null | undefined>
): Record<string, string | boolean> | null {
  if (!state) {
    return null;
  }
  const normalizedCodes: string[] = [];
  const seen = new Set<string>();
  for (const code of codes) {
    if (typeof code !== "string") continue;
    const trimmed = code.trim().toLowerCase();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalizedCodes.push(trimmed);
  }
  if (!normalizedCodes.length) {
    return null;
  }
  const entries = Object.entries(state);
  for (const candidate of normalizedCodes) {
    const direct = entries.find(([key]) => key.toLowerCase() === candidate);
    if (direct) {
      return direct[1];
    }
  }
  for (const candidate of normalizedCodes) {
    const suffix = candidate.split("_").pop();
    if (!suffix) continue;
    const normalizedSuffix = suffix.toLowerCase();
    for (const [key, value] of entries) {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey === normalizedSuffix || normalizedKey.endsWith(`_${normalizedSuffix}`)) {
        return value;
      }
    }
  }
  return null;
}

function stagePrepStateEntryToMetadata(
  entry: Record<string, string | boolean> | null,
  excludeKeys: string[] = [],
): Record<string, unknown> | null {
  if (!entry) return null;
  const exclude = new Set(excludeKeys.map((key) => key.toLowerCase()));
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (exclude.has(key.toLowerCase())) {
      continue;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length) {
        metadata[key] = trimmed;
      }
      continue;
    }
    metadata[key] = value;
  }
  return Object.keys(metadata).length ? metadata : null;
}
