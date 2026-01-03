"use client"

import dynamic from "next/dynamic"
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Globe,
  ListChecks,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Save,
  Search,
  Target,
  Trash2,
} from "lucide-react";

const ProspeccionResultsMap = dynamic(
  () => import("../google-busqueda/google-results-map").then((mod) => mod.GoogleResultsMap),
  {
    ssr: false,
    loading: () => <div className="h-[420px] w-full rounded-xl bg-muted" />,
  },
);
import {
  createDenueBusqueda,
  deleteDenueBusqueda,
  deleteDenueResultados,
  listDenueBusquedas,
  listDenueResultados,
  type CreateDenueSearchPayload,
  type CreateDenueSearchResponse,
  type DenueBusquedaItem,
  type DenueResultadoItem,
} from "@/lib/prospeccion/denue-client";
import type { GoogleResultadoItem } from "@/lib/prospeccion/google-client";
import { guardarProspectos } from "@/lib/prospeccion/prospectos-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const DEFAULT_CENTER = { lat: 19.432608, lng: -99.133209 };
const numberFormatter = new Intl.NumberFormat("es-MX");
const RADIUS_MIN = 100;
const RADIUS_MAX = 5_000;
const LIST_PAGE_SIZE = 250;

const ACTIONS = [
  { key: "email", label: "Enviar correo", icon: <Mail className="h-4 w-4" /> },
  { key: "whatsapp", label: "WhatsApp", icon: <Phone className="h-4 w-4" /> },
  { key: "letter", label: "Carta", icon: <ListChecks className="h-4 w-4" /> },
] as const;

type ContactFilterValue = "any" | "with" | "without";
type EstratoFilterValue = "any" | "micro" | "pequena" | "mediana" | "grande";

type FormValues = {
  query: string;
  radio_m: number;
  lat: number;
  lng: number;
};

type FeedbackState = {
  type: "success" | "error" | "info";
  message: string;
} | null;

export function DenueBusquedaView() {
  const [formValues, setFormValues] = useState<FormValues>({
    query: "",
    radio_m: 1500,
    lat: DEFAULT_CENTER.lat,
    lng: DEFAULT_CENTER.lng,
  });
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [busquedas, setBusquedas] = useState<DenueBusquedaItem[]>([]);
  const [isLoadingBusquedas, setIsLoadingBusquedas] = useState(true);
  const [activeBusquedaId, setActiveBusquedaId] = useState<string | null>(null);
  const [resultados, setResultados] = useState<DenueResultadoItem[]>([]);
  const [isLoadingResultados, setIsLoadingResultados] = useState(false);
  const [resultadosPagination, setResultadosPagination] = useState({ limit: LIST_PAGE_SIZE, offset: 0 });
  const [resultadosTotal, setResultadosTotal] = useState(0);
  const [filterText, setFilterText] = useState("");
  const [phoneFilter, setPhoneFilter] = useState<ContactFilterValue>("any");
  const [emailFilter, setEmailFilter] = useState<ContactFilterValue>("any");
  const [websiteFilter, setWebsiteFilter] = useState<ContactFilterValue>("any");
  const [estratoFilter, setEstratoFilter] = useState<EstratoFilterValue>("any");
  const [selectedActividades, setSelectedActividades] = useState<Set<string>>(new Set());
  const [actividadSearch, setActividadSearch] = useState("");
  const [actividadDrawerOpen, setActividadDrawerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingBusquedaId, setDeletingBusquedaId] = useState<string | null>(null);
  const [isDeletingResultados, setIsDeletingResultados] = useState(false);
  const [isSavingProspectos, setIsSavingProspectos] = useState(false);
  const busquedasRef = useRef<DenueBusquedaItem[]>([]);
  const activeBusqueda = useMemo(
    () => busquedas.find((item) => item.id === activeBusquedaId) ?? null,
    [busquedas, activeBusquedaId],
  );

  const updateFormValue = useCallback(<K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const loadBusquedas = useCallback(async () => {
    setIsLoadingBusquedas(true);
    try {
      const response = await listDenueBusquedas({ limit: 8 });
      setBusquedas(response.items ?? []);
      return response.items ?? [];
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "No fue posible consultar las búsquedas recientes.",
      });
      return [];
    } finally {
      setIsLoadingBusquedas(false);
    }
  }, []);

  useEffect(() => {
    busquedasRef.current = busquedas;
  }, [busquedas]);

  const fetchResultadosPage = useCallback(
    async ({
      busquedaId,
      limit,
      offset,
    }: {
      busquedaId: string;
      limit: number;
      offset: number;
    }) => {
      setIsLoadingResultados(true);
      try {
        const response = await listDenueResultados({
          busquedaId,
          limit,
          offset,
          order: "recientes",
        });
        const rows = response.items ?? [];
        setResultados(rows);
        setResultadosPagination({ limit, offset });
        const totalRecords = response.total ?? rows.length;
        setResultadosTotal(totalRecords);
        return {
          totalRecords,
          response,
        };
      } finally {
        setIsLoadingResultados(false);
      }
    },
    [],
  );

  const loadResultadosForBusqueda = useCallback(
    async (busquedaId: string) => {
      if (!busquedaId) {
        return;
      }
      setSelectedIds(new Set());
      setSelectedActividades(new Set());
      setActividadSearch("");
      setActiveBusquedaId(busquedaId);
      try {
        const { totalRecords } = await fetchResultadosPage({
          busquedaId,
          limit: LIST_PAGE_SIZE,
          offset: 0,
        });
        const selectedBusqueda = busquedasRef.current.find((item) => item.id === busquedaId);
        if (selectedBusqueda) {
          setFormValues((prev) => ({
            ...prev,
            query: selectedBusqueda.query ?? prev.query,
            lat: typeof selectedBusqueda.lat === "number" ? selectedBusqueda.lat : prev.lat,
            lng: typeof selectedBusqueda.lng === "number" ? selectedBusqueda.lng : prev.lng,
            radio_m: typeof selectedBusqueda.radio_m === "number" ? selectedBusqueda.radio_m : prev.radio_m,
          }));
        }
        setBusquedas((prev) =>
          prev.map((item) =>
            item.id === busquedaId ? { ...item, total_encontrados: totalRecords } : item,
          ),
        );
      } catch (error) {
        setFeedback({
          type: "error",
          message: error instanceof Error ? error.message : "No fue posible consultar los resultados.",
        });
      }
    },
    [fetchResultadosPage],
  );

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      const items = await loadBusquedas();
      if (cancelled) {
        return;
      }
      if (items.length) {
        await loadResultadosForBusqueda(items[0]!.id);
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadBusquedas, loadResultadosForBusqueda]);

  useEffect(() => {
    if (activeBusquedaId) {
      return;
    }
    if (!busquedas.length) {
      return;
    }
    void loadResultadosForBusqueda(busquedas[0]!.id);
  }, [activeBusquedaId, busquedas, loadResultadosForBusqueda]);

  useEffect(() => {
    if (!resultados.length) {
      setSelectedIds(new Set());
      return;
    }
    const validIds = new Set(resultados.map((item) => item.resultado_id));
    setSelectedIds((current) => {
      const next = new Set<string>();
      current.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        }
      });
      return next;
    });
  }, [resultados]);

  const busquedaDescriptor = useMemo(() => {
    if (!activeBusqueda) return null;
    if (activeBusqueda.query?.trim()) {
      return activeBusqueda.query.trim();
    }
    return null;
  }, [activeBusqueda]);

  const generalFilteredResults = useMemo(() => {
    const text = filterText.trim().toLowerCase();
    return resultados.filter((item) => {
      if (text.length) {
        const haystack = [
          item.display_name,
          item.actividad,
          item.address,
          item.phone,
          item.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(text)) {
          return false;
        }
      }
      if (phoneFilter === "with" && !item.phone) return false;
      if (phoneFilter === "without" && item.phone) return false;
      if (emailFilter === "with" && !item.email) return false;
      if (emailFilter === "without" && item.email) return false;
      if (websiteFilter === "with" && !item.website) return false;
      if (websiteFilter === "without" && item.website) return false;
      if (estratoFilter !== "any") {
        const label = (item.estrato ?? "").toLowerCase();
        if (estratoFilter === "micro" && !label.includes("micro")) return false;
        if (estratoFilter === "pequena" && !label.includes("peque")) return false;
        if (estratoFilter === "mediana" && !label.includes("mediana")) return false;
        if (estratoFilter === "grande" && !label.includes("grande")) return false;
      }
      return true;
    });
  }, [
    filterText,
    phoneFilter,
    emailFilter,
    websiteFilter,
    estratoFilter,
    resultados,
  ]);

  const filteredResults = useMemo(() => {
    const hasSelected = selectedActividades.size > 0;
    const searchText = actividadSearch.trim().toLowerCase();
    const hasSearch = Boolean(searchText);
    if (!hasSelected && !hasSearch) {
      return generalFilteredResults;
    }
    return generalFilteredResults.filter((item) => {
      const actividadTexto =
        typeof item.actividad === "string"
          ? item.actividad.trim()
          : item.actividad && typeof item.actividad === "object" && "text" in item.actividad
            ? String((item.actividad as { text?: unknown }).text ?? "").trim()
            : "";
      if (!actividadTexto) {
        return false;
      }
      const matchesSearch = !hasSearch || actividadTexto.toLowerCase().includes(searchText);
      const matchesSelected = !hasSelected || selectedActividades.has(actividadTexto);
      return matchesSearch && matchesSelected;
    });
  }, [actividadSearch, generalFilteredResults, selectedActividades]);

  const totalFiltered = filteredResults.length;
  const effectiveTotal = Math.max(resultadosTotal || 0, totalFiltered);
  const totalPages = Math.max(
    1,
    Math.ceil(effectiveTotal / resultadosPagination.limit),
  );
  const currentPage = Math.min(
    totalPages - 1,
    Math.floor(resultadosPagination.offset / resultadosPagination.limit),
  );
  const pageOffset = resultadosPagination.offset;
  const maxPageOffset = Math.max(0, (totalPages - 1) * resultadosPagination.limit);

  useEffect(() => {
    if (resultadosPagination.offset > maxPageOffset) {
      setResultadosPagination((prev) => ({ ...prev, offset: maxPageOffset }));
    }
  }, [resultadosPagination.offset, resultadosPagination.limit, maxPageOffset]);

  const paginatedResults = filteredResults;
  const pageStart = effectiveTotal === 0 ? 0 : pageOffset + 1;
  const pageEnd =
    effectiveTotal === 0
      ? 0
      : Math.min(pageOffset + paginatedResults.length, effectiveTotal);
  const hasPrevPage = resultadosPagination.offset > 0;
  const hasNextPage = resultadosPagination.offset < maxPageOffset;
  const mapResults = useMemo<GoogleResultadoItem[]>(
    () =>
      filteredResults.map((item) => ({
        ...item,
        rating: null,
        reviews: null,
        google_primary_type: null,
        google_primary_type_display_name: null,
        google_types: [],
      })),
    [filteredResults],
  );


  const selectedVisibleCount = useMemo(() => {
    if (!selectedIds.size) return 0;
    let count = 0;
    for (const item of paginatedResults) {
      if (selectedIds.has(item.resultado_id)) {
        count += 1;
      }
    }
    return count;
  }, [paginatedResults, selectedIds]);

  const handleToggleSelection = useCallback((resultadoId: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(resultadoId);
      } else {
        next.delete(resultadoId);
      }
      return next;
    });
  }, []);

  const handleSelectAllVisible = useCallback(
    (checked: boolean) => {
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const item of paginatedResults) {
          if (!item.resultado_id) continue;
          if (checked) {
            next.add(item.resultado_id);
          } else {
            next.delete(item.resultado_id);
          }
        }
        return next;
      });
    },
    [paginatedResults],
  );

  const actividadOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const item of generalFilteredResults) {
      if (typeof item.actividad === "string" && item.actividad.trim()) {
        unique.add(item.actividad.trim());
      } else if (
        item.actividad &&
        typeof item.actividad === "object" &&
        "text" in item.actividad &&
        typeof (item.actividad as { text?: unknown }).text === "string"
      ) {
        const value = String((item.actividad as { text?: string }).text ?? "").trim();
        if (value) unique.add(value);
      }
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b, "es"));
  }, [generalFilteredResults]);
  const filteredActividadOptions = useMemo(() => {
    if (!actividadSearch.trim()) {
      return actividadOptions;
    }
    const query = actividadSearch.trim().toLowerCase();
    return actividadOptions.filter((actividad) => actividad.toLowerCase().includes(query));
  }, [actividadOptions, actividadSearch]);

  const handleActividadToggle = useCallback((value: string, checked: boolean) => {
    setSelectedActividades((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(value);
      } else {
        next.delete(value);
      }
      return next;
    });
  }, []);

  const handleSelectAllActividades = useCallback(() => {
    setSelectedActividades(new Set(filteredActividadOptions));
  }, [filteredActividadOptions]);

  const handleClearActividades = useCallback(() => {
    setSelectedActividades(new Set());
  }, []);

  const handleClearAllFilters = useCallback(() => {
    setEstratoFilter("any");
    setPhoneFilter("any");
    setEmailFilter("any");
    setWebsiteFilter("any");
    setFilterText("");
    setActividadSearch("");
    handleClearActividades();
    setResultadosPagination((prev) => ({ ...prev, limit: LIST_PAGE_SIZE, offset: 0 }));
  }, [handleClearActividades]);

  const handleLimitChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value) || 50;
      const limit = Math.min(500, Math.max(50, value));
      setResultadosPagination((prev) => ({ ...prev, limit, offset: 0 }));
      if (!activeBusquedaId) {
        return;
      }
      void fetchResultadosPage({ busquedaId: activeBusquedaId, limit, offset: 0 }).catch((error) => {
        setFeedback({
          type: "error",
          message:
            error instanceof Error ? error.message : "No fue posible actualizar el número de resultados por página.",
        });
      });
    },
    [activeBusquedaId, fetchResultadosPage, setFeedback],
  );

  const handleDeleteBusqueda = useCallback(
    async (busquedaId: string) => {
      if (!busquedaId) {
        return;
      }
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(
          "¿Eliminar esta captura de DENUE? Se borrarán todos sus resultados.",
        );
        if (!confirmed) {
          return;
        }
      }
      setDeletingBusquedaId(busquedaId);
      try {
        await deleteDenueBusqueda(busquedaId);
        setFeedback({
          type: "success",
          message: "La búsqueda se eliminó correctamente.",
        });
        const remaining = await loadBusquedas();
        if (!remaining.length) {
          setActiveBusquedaId(null);
          setResultados([]);
          setResultadosPagination({ limit: LIST_PAGE_SIZE, offset: 0 });
          setSelectedIds(new Set());
          setSelectedActividades(new Set());
          setActividadSearch("");
          return;
        }
        const stillExists = activeBusquedaId
          ? remaining.some((item) => item.id === activeBusquedaId)
          : false;
        if (busquedaId === activeBusquedaId || !stillExists) {
          await loadResultadosForBusqueda(remaining[0]!.id);
        }
      } catch (error) {
        setFeedback({
          type: "error",
          message: error instanceof Error ? error.message : "No fue posible eliminar la búsqueda.",
        });
      } finally {
        setDeletingBusquedaId(null);
      }
    },
    [
      activeBusquedaId,
      loadBusquedas,
      loadResultadosForBusqueda,
      setFeedback,
    ],
  );

  const handleDeleteSelectedResultados = useCallback(async () => {
    if (!selectedIds.size) {
      setFeedback({
        type: "info",
        message: "Selecciona al menos un registro para poder eliminarlo.",
      });
      return;
    }
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("¿Eliminar los resultados seleccionados? Esta acción no se puede deshacer.");
      if (!confirmed) {
        return;
      }
    }
    const ids = Array.from(selectedIds);
    setIsDeletingResultados(true);
    try {
      await deleteDenueResultados(ids);
      setFeedback({
        type: "success",
        message: `Se eliminaron ${ids.length} registros.`,
      });
      if (activeBusquedaId) {
        await Promise.all([
          loadResultadosForBusqueda(activeBusquedaId),
          loadBusquedas(),
        ]);
      } else {
        setResultados([]);
        setSelectedIds(new Set());
        await loadBusquedas();
      }
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "No fue posible eliminar los resultados seleccionados.",
      });
    } finally {
      setIsDeletingResultados(false);
    }
  }, [activeBusquedaId, loadBusquedas, loadResultadosForBusqueda, selectedIds, setFeedback]);

  const goToPage = useCallback(
    (pageIndex: number) => {
      if (!activeBusquedaId) {
        return;
      }
      const clamped = Math.min(Math.max(pageIndex, 0), Math.max(0, totalPages - 1));
      const nextOffset = clamped * resultadosPagination.limit;
      void fetchResultadosPage({
        busquedaId: activeBusquedaId,
        limit: resultadosPagination.limit,
        offset: nextOffset,
      }).catch((error) => {
        setFeedback({
          type: "error",
          message: error instanceof Error ? error.message : "No fue posible cambiar la página.",
        });
      });
    },
    [activeBusquedaId, fetchResultadosPage, resultadosPagination.limit, setFeedback, totalPages],
  );

  const handlePrevPage = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);
  const handleNextPage = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);

  const handleCenterChange = useCallback((coords: { lat: number; lng: number }) => {
    updateFormValue("lat", Number(coords.lat.toFixed(6)));
    updateFormValue("lng", Number(coords.lng.toFixed(6)));
  }, [updateFormValue]);

  const runBusqueda = useCallback(async () => {
    setFeedback(null);
    if (!formValues.query.trim().length) {
      setFeedback({ type: "error", message: "Captura el texto o palabra clave a buscar." });
      return;
    }

    const payload: CreateDenueSearchPayload = {
      query: formValues.query.trim(),
      lat: formValues.lat,
      lng: formValues.lng,
      radio_m: formValues.radio_m,
      meta: {
        source: "panel",
      },
    };

    setIsSearching(true);
    try {
      const response: CreateDenueSearchResponse = await createDenueBusqueda(payload);
      setFeedback({
        type: "success",
        message: `Se guardaron ${response.upserted} resultados desde DENUE (${response.denue_results ?? response.upserted} encontrados).`,
      });
      await loadBusquedas();
      await loadResultadosForBusqueda(response.busqueda_id);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "No fue posible ejecutar la búsqueda.",
      });
    } finally {
      setIsSearching(false);
    }
  }, [formValues, loadBusquedas, loadResultadosForBusqueda]);

  const handleAction = useCallback(
    (action: (typeof ACTIONS)[number]["key"]) => {
      if (!selectedIds.size) {
        setFeedback({ type: "info", message: "Selecciona al menos un prospecto para ejecutar una acción." });
        return;
      }
      const message =
        action === "email"
          ? "Próximamente podrás lanzar una campaña de correo directamente desde aquí."
          : action === "whatsapp"
            ? "La integración con WhatsApp se añadirá en la siguiente iteración."
            : "La generación de cartas físicas se configurará después de definir la plantilla.";
      setFeedback({ type: "info", message });
    },
    [selectedIds.size],
  );

  const handleGuardarSeleccion = useCallback(async () => {
    if (!selectedIds.size) {
      setFeedback({
        type: "info",
        message: "Selecciona al menos un resultado para guardarlo como prospecto.",
      });
      return;
    }
    setIsSavingProspectos(true);
    try {
      const response = await guardarProspectos({
        fuente: "denue",
        resultado_ids: Array.from(selectedIds),
        metadata: {
          busqueda_id: activeBusqueda?.id,
          busqueda_query: activeBusqueda?.query,
        },
      });
      setFeedback({
        type: "success",
        message: `Se guardaron ${response.total} prospectos desde DENUE. Continúa con la verificación en la vista Prospección.`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "No fue posible guardar los resultados como prospectos.",
      });
    } finally {
      setIsSavingProspectos(false);
    }
  }, [activeBusqueda?.id, activeBusqueda?.query, selectedIds]);

  return (
    <div className="space-y-6">
      {feedback ? (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            feedback.type === "error" && "border-destructive/70 bg-destructive/10 text-destructive",
            feedback.type === "success" && "border-emerald-500/60 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
            feedback.type === "info" && "border-primary/40 bg-primary/5 text-primary",
          )}
        >
          {feedback.message}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4" />
            Parámetros de búsqueda
          </CardTitle>
          <CardDescription>Define el centro y el radio antes de consultar DENUE.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_repeat(2,minmax(0,1fr))_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label htmlFor="query">Palabra clave o giro</Label>
              <Input
                id="query"
                placeholder="Ej. cafeterías, autolavado, ferretería"
                value={formValues.query}
                onChange={(event) => updateFormValue("query", event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                DENUE buscará negocios cuyo nombre o actividad coincida con este texto.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="radius">Radio (m)</Label>
              <div className="space-y-1">
                <input
                  id="radius"
                  type="range"
                  min={RADIUS_MIN}
                  max={RADIUS_MAX}
                  step={100}
                  value={formValues.radio_m}
                  onChange={(event) => updateFormValue("radio_m", Number(event.target.value))}
                  className="w-full"
                />
                <p className="text-[11px] text-muted-foreground">
                  {numberFormatter.format(formValues.radio_m)} m · máximo {numberFormatter.format(RADIUS_MAX)} m ({numberFormatter.format(
                    RADIUS_MAX / 1000,
                  )} km)
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lat">Latitud</Label>
              <Input
                id="lat"
                type="number"
                value={formValues.lat}
                onChange={(event) => updateFormValue("lat", Number(event.target.value))}
                step={0.000001}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lng">Longitud</Label>
              <Input
                id="lng"
                type="number"
                value={formValues.lng}
                onChange={(event) => updateFormValue("lng", Number(event.target.value))}
                step={0.000001}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Acciones</Label>
              <div className="flex flex-wrap gap-2">
                <Button onClick={runBusqueda} disabled={isSearching} className="flex-1 min-w-[140px]">
                  {isSearching ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  Buscar y guardar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    updateFormValue("lat", DEFAULT_CENTER.lat);
                    updateFormValue("lng", DEFAULT_CENTER.lng);
                    updateFormValue("radio_m", 1500);
                  }}
                >
                  Restablecer centro
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Resultados almacenados</CardTitle>
                  <CardDescription className="space-y-0.5">
                    <span>
                      {isLoadingResultados
                        ? "Descargando datos…"
                        : `${numberFormatter.format(totalFiltered)} de ${numberFormatter.format(
                            effectiveTotal,
                          )} coincidencias`}
                    </span>
                    {busquedaDescriptor ? (
                      <span className="block text-muted-foreground/80">Búsqueda: {busquedaDescriptor}</span>
                    ) : null}
                  </CardDescription>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => activeBusquedaId && loadResultadosForBusqueda(activeBusquedaId)}
                  disabled={!activeBusquedaId || isLoadingResultados}
                >
                  <RefreshCw className={cn("h-4 w-4", isLoadingResultados && "animate-spin")} />
                </Button>
              </div>
            <div className="grid gap-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs font-normal" htmlFor="estrato-filter">
                  Tamaño
                </Label>
                <select
                  id="estrato-filter"
                  value={estratoFilter}
                  onChange={(event) => setEstratoFilter(event.target.value as EstratoFilterValue)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="any">Todos</option>
                  <option value="micro">Micro (0-10)</option>
                  <option value="pequena">Pequeña (11-50)</option>
                  <option value="mediana">Mediana (51-250)</option>
                  <option value="grande">Grande (250+)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-normal" htmlFor="phone-filter">
                  Teléfono
                </Label>
                <select
                  id="phone-filter"
                  value={phoneFilter}
                  onChange={(event) => setPhoneFilter(event.target.value as ContactFilterValue)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="any">Todos</option>
                  <option value="with">Con teléfono</option>
                  <option value="without">Sin teléfono</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-normal" htmlFor="email-filter">
                  Email
                </Label>
                <select
                  id="email-filter"
                  value={emailFilter}
                  onChange={(event) => setEmailFilter(event.target.value as ContactFilterValue)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="any">Todos</option>
                  <option value="with">Con email</option>
                  <option value="without">Sin email</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-normal" htmlFor="website-filter">
                  Sitio web
                </Label>
                <select
                  id="website-filter"
                  value={websiteFilter}
                  onChange={(event) => setWebsiteFilter(event.target.value as ContactFilterValue)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="any">Todos</option>
                  <option value="with">Con sitio web</option>
                  <option value="without">Sin sitio web</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1 min-w-[160px]">
                <Label className="text-xs font-normal">Filtrar texto</Label>
                <Input
                  value={filterText}
                  onChange={(event) => setFilterText(event.target.value)}
                  placeholder="Nombre, giro o colonia"
                  className="h-8 w-40 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-normal">Clase de actividad</Label>
                <Drawer open={actividadDrawerOpen} onOpenChange={setActividadDrawerOpen} direction="right">
                  <DrawerTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                      disabled={!actividadOptions.length}
                    >
                      Seleccionar
                    </Button>
                  </DrawerTrigger>
                  <DrawerContent className="sm:max-w-xl">
                    <DrawerHeader>
                      <DrawerTitle>Clase de actividad</DrawerTitle>
                      <DrawerDescription>
                        Selecciona una o varias clases del DENUE para filtrar los resultados mostrados.
                      </DrawerDescription>
                    </DrawerHeader>
                    <div className="flex flex-1 flex-col gap-4 overflow-hidden px-4">
                      <div className="space-y-1">
                        <Label className="text-xs font-normal text-muted-foreground" htmlFor="actividad-search">
                          Filtrar clases
                        </Label>
                        <Input
                          id="actividad-search"
                          value={actividadSearch}
                          onChange={(event) => setActividadSearch(event.target.value)}
                          placeholder="Ej. restaurante, hospital…"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={handleSelectAllActividades}
                          disabled={!actividadOptions.length}
                        >
                          Seleccionar todas
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={handleClearActividades}
                          disabled={!selectedActividades.size}
                        >
                          Limpiar selección
                        </Button>
                      </div>
                      {actividadOptions.length ? (
                        filteredActividadOptions.length ? (
                          <ScrollArea className="h-[60vh] rounded-lg border border-border/60">
                            <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
                              {filteredActividadOptions.map((actividad) => {
                                const checked = selectedActividades.has(actividad);
                                return (
                                  <label
                                    key={actividad}
                                    className={cn(
                                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                                      checked ? "border-primary bg-primary/5" : "border-border/60",
                                    )}
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(value) => handleActividadToggle(actividad, Boolean(value))}
                                    />
                                    <span className="line-clamp-2">{actividad}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </ScrollArea>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No hay clases que coincidan con &quot;{actividadSearch.trim()}&quot;.
                          </p>
                        )
                      ) : (
                        <p className="text-sm text-muted-foreground">Aún no hay clases disponibles para esta búsqueda.</p>
                      )}
                    </div>
                    <DrawerFooter className="border-t border-border/40 bg-muted/30">
                      <Button type="button" onClick={() => setActividadDrawerOpen(false)}>
                        Aplicar filtros
                      </Button>
                      <DrawerClose asChild>
                        <Button type="button" variant="ghost">
                          Cerrar
                        </Button>
                      </DrawerClose>
                    </DrawerFooter>
                  </DrawerContent>
                </Drawer>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-normal">Limpiar</Label>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleClearAllFilters}
                  className="flex items-center gap-2 bg-emerald-600 px-4 text-white hover:bg-emerald-700"
                >
                  Limpiar filtros
                </Button>
              </div>
              <div className="space-y-1 min-w-[140px]">
                <Label className="text-xs font-normal">Resultados por página</Label>
                <Input
                  type="number"
                  min={50}
                  max={500}
                  step={50}
                  value={resultadosPagination.limit}
                  onChange={handleLimitChange}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  Seleccionados: {numberFormatter.format(selectedIds.size)}{" "}
                  {selectedVisibleCount && selectedVisibleCount !== selectedIds.size
                    ? `(en vista: ${selectedVisibleCount})`
                    : null}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => handleSelectAllVisible(true)}
                  disabled={!paginatedResults.length}
                >
                  Seleccionar página
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => handleSelectAllVisible(false)}
                  disabled={!paginatedResults.length}
                >
                  Quitar selección
                </Button>
              </div>
              <p>
                {numberFormatter.format(totalFiltered)} registros · página {currentPage + 1} de {totalPages}
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleGuardarSeleccion}
                  disabled={!selectedIds.size || isSavingProspectos}
                  className="flex items-center gap-2"
                >
                  {isSavingProspectos ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Guardar como prospectos
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={handleDeleteSelectedResultados}
                  disabled={!selectedIds.size || isDeletingResultados}
                  className="flex items-center gap-2"
                >
                  {isDeletingResultados ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Eliminar seleccionados
                </Button>
                {ACTIONS.map((action) => (
                  <Button
                    key={action.key}
                    variant="secondary"
                    size="sm"
                    onClick={() => handleAction(action.key)}
                    disabled={!selectedIds.size}
                    className="flex items-center gap-2"
                  >
                    {action.icon}
                    {action.label}
                  </Button>
                ))}
              </div>
              <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {!filteredResults.length ? (
                  <p className="text-sm text-muted-foreground">
                    {isLoadingResultados
                      ? "Cargando resultados…"
                      : "No hay coincidencias con los filtros actuales."}
                  </p>
                ) : (
                  paginatedResults.map((item) => {
                    const actividadTexto =
                      typeof item.actividad === "string"
                        ? item.actividad
                        : item.actividad && typeof item.actividad === "object" && "text" in item.actividad
                          ? String((item.actividad as { text?: unknown }).text ?? "")
                          : "";
                    const isSelected = selectedIds.has(item.resultado_id);
                    return (
                      <div
                        key={item.resultado_id}
                        className={cn(
                          "rounded-xl border p-3 text-sm transition",
                          isSelected ? "border-primary bg-primary/5" : "border-border/60",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) =>
                              handleToggleSelection(item.resultado_id, Boolean(checked))
                            }
                          />
                          <div className="flex-1 space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                {((actividadTexto && actividadTexto.trim().length) || busquedaDescriptor) && (
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                                    {actividadTexto && actividadTexto.trim().length
                                      ? actividadTexto.trim()
                                      : busquedaDescriptor}
                                  </p>
                                )}
                                <p className="font-semibold">
                                  {item.display_name ?? item.actividad ?? "Sin nombre"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {item.address ?? "Sin dirección"}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              {item.phone ? (
                                <span className="inline-flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {item.phone}
                                </span>
                              ) : null}
                              {item.email ? (
                                <span className="inline-flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {item.email}
                                </span>
                              ) : null}
                              {item.website ? (
                                <a
                                  className="inline-flex items-center gap-1 text-primary"
                                  href={formatWebsiteUrl(item.website)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Globe className="h-3 w-3" />
                                  Sitio web
                                  <ArrowUpRight className="h-3 w-3" />
                                </a>
                              ) : null}
                              {typeof item.distancia_m === "number" ? (
                                <span>{(item.distancia_m / 1000).toFixed(2)} km</span>
                              ) : null}
                            </div>
                            {item.estrato ? (
                              <p className="text-xs text-muted-foreground">Tamaño: {item.estrato}</p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={isLoadingResultados || !hasPrevPage}
                >
                  Anterior
                </Button>
                <span>
                  {effectiveTotal === 0
                    ? "No hay registros"
                    : `Mostrando ${numberFormatter.format(pageStart)}-${numberFormatter.format(
                        pageEnd,
                      )} de ${numberFormatter.format(effectiveTotal)}`}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={isLoadingResultados || !hasNextPage}
                >
                  Siguiente
                </Button>
              </div>
          </CardContent>
        </Card>
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Mapa de resultados</CardTitle>
              <CardDescription>Mueve el marcador para actualizar el centro.</CardDescription>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => {
                setFeedback({ type: "info", message: "Haz clic en el mapa o arrastra el marcador azul para ajustar la búsqueda." });
              }}
            >
              <MapPin className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <div className="h-full min-h-[460px]">
              <ProspeccionResultsMap
                center={{ lat: formValues.lat, lng: formValues.lng }}
                radius={formValues.radio_m}
                results={mapResults}
                highlightIds={selectedIds}
                onCenterChange={handleCenterChange}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Búsquedas recientes</CardTitle>
          <CardDescription>Vuelve a cargar resultados anteriores o reutiliza sus parámetros.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoadingBusquedas ? (
            <p className="text-sm text-muted-foreground">Cargando historial…</p>
          ) : busquedas.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {busquedas.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    activeBusquedaId === item.id && "border-primary bg-primary/5",
                  )}
                >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{item.query || "(Sin texto)"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.creado_en).toLocaleString("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={activeBusquedaId === item.id ? "secondary" : "outline"}
                      onClick={() => loadResultadosForBusqueda(item.id)}
                    >
                      Ver
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Eliminar búsqueda"
                      onClick={() => handleDeleteBusqueda(item.id)}
                      disabled={deletingBusquedaId === item.id}
                      className="text-destructive hover:text-destructive"
                    >
                      {deletingBusquedaId === item.id ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Radio {typeof item.radio_m === "number" ? numberFormatter.format(item.radio_m) : "-"} m · {item.total_encontrados ?? 0} registros
                </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no hay capturas registradas.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatWebsiteUrl(raw: string): string {
  const value = raw.trim();
  if (!value) {
    return "#";
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `https://${value.replace(/^\/+/, "")}`;
}
