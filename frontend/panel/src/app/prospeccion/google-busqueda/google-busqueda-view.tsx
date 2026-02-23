"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Star,
  Target,
  Trash2,
} from "lucide-react";

const GoogleResultsMap = dynamic(() => import("./google-results-map").then((mod) => mod.GoogleResultsMap), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full rounded-xl bg-muted" />,
});
import {
  createGoogleBusqueda,
  deleteGoogleBusqueda,
  deleteGoogleResultados,
  listGoogleBusquedas,
  listGoogleResultados,
  listGoogleResultadosMap,
  type CreateGoogleSearchPayload,
  type GoogleBusquedaItem,
  type GoogleResultadoItem,
  type GoogleResultadosMapItem,
  type GoogleSearchStrategy,
} from "@/lib/prospeccion/google-client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/hooks/use-permissions";

const DEFAULT_CENTER = { lat: 19.432608, lng: -99.133209 };
const numberFormatter = new Intl.NumberFormat("es-MX");
const RADIUS_MIN = 100;
const RADIUS_MAX = 10_000;
const DEFAULT_TYPES = "restaurant,store";
const LIST_PAGE_SIZE = 5000;
const MAP_RESULTS_LIMIT = 5000;
const BUSQUEDAS_PAGE_SIZE = 100;
const BUSQUEDAS_MAX_ITEMS = 2000;

type ContactFilterValue = "any" | "with" | "without";

const ACTIONS = [
  { key: "email", label: "Enviar correo", icon: <Mail className="h-4 w-4" /> },
  { key: "whatsapp", label: "WhatsApp", icon: <Phone className="h-4 w-4" /> },
  { key: "letter", label: "Carta", icon: <ListChecks className="h-4 w-4" /> },
] as const;

type FormValues = {
  strategy: GoogleSearchStrategy;
  query: string;
  includedTypesText: string;
  radio_m: number;
  lat: number;
  lng: number;
  language_code: string;
  region_code: string;
};

type FeedbackState = {
  type: "success" | "error" | "info";
  message: string;
} | null;

export function GoogleBusquedaView() {
  const { context } = usePermissions();
  const canRunBusquedas = (context.es_admin || context.es_owner) || context.permisos.includes("busquedas.run");
  const canDeleteBusquedas = (context.es_admin || context.es_owner) || context.permisos.includes("busquedas.delete");
  const canSaveProspectos = (context.es_admin || context.es_owner) || context.permisos.includes("prospectos.create");
  const [formValues, setFormValues] = useState<FormValues>({
    strategy: "nearby",
    query: "",
  includedTypesText: DEFAULT_TYPES,
  radio_m: 1500,
  lat: DEFAULT_CENTER.lat,
  lng: DEFAULT_CENTER.lng,
  language_code: "es",
  region_code: "MX",
});
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [busquedas, setBusquedas] = useState<GoogleBusquedaItem[]>([]);
  const busquedasRef = useRef<GoogleBusquedaItem[]>([]);
  const [isLoadingBusquedas, setIsLoadingBusquedas] = useState(true);
  const [activeBusquedaId, setActiveBusquedaId] = useState<string | null>(null);
  const [resultados, setResultados] = useState<GoogleResultadoItem[]>([]);
  const [isLoadingResultados, setIsLoadingResultados] = useState(false);
  const [resultadosPagination, setResultadosPagination] = useState({ limit: LIST_PAGE_SIZE, offset: 0 });
  const [resultadosTotal, setResultadosTotal] = useState(0);
  const [minRatingFilter, setMinRatingFilter] = useState(0);
  const [phoneFilter, setPhoneFilter] = useState<ContactFilterValue>("any");
  const [websiteFilter, setWebsiteFilter] = useState<ContactFilterValue>("any");
  const [filterText, setFilterText] = useState("");
  const [debouncedFilterText, setDebouncedFilterText] = useState("");
  const [selectedActividades, setSelectedActividades] = useState<Set<string>>(new Set());
  const [actividadDrawerOpen, setActividadDrawerOpen] = useState(false);
  const [actividadSearch, setActividadSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mapViewport, setMapViewport] = useState<{ bounds: { west: number; south: number; east: number; north: number }; zoom: number } | null>(
    null,
  );
  const [mapItems, setMapItems] = useState<GoogleResultadosMapItem[]>([]);
  const [mapTruncated, setMapTruncated] = useState(false);
  const [deletingBusquedaId, setDeletingBusquedaId] = useState<string | null>(null);
  const [isDeletingResultados, setIsDeletingResultados] = useState(false);
  const [isSavingProspectos, setIsSavingProspectos] = useState(false);
  const [queuedBusquedaId, setQueuedBusquedaId] = useState<string | null>(null);
  const [resultsLoadedForId, setResultsLoadedForId] = useState<string | null>(null);
  const activeBusqueda = useMemo(
    () => busquedas.find((item) => item.id === activeBusquedaId) ?? null,
    [busquedas, activeBusquedaId],
  );
  const resultadosCount = resultados.length;
  const [denseMode, setDenseMode] = useState(false);
  const selectedActividadesList = useMemo(
    () => Array.from(selectedActividades).sort((a, b) => a.localeCompare(b, "es")),
    [selectedActividades],
  );

  const updateFormValue = useCallback(<K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const loadBusquedas = useCallback(async () => {
    setIsLoadingBusquedas(true);
    try {
      const allItems: GoogleBusquedaItem[] = [];
      let offset = 0;
      let total = Number.POSITIVE_INFINITY;
      while (offset < total && allItems.length < BUSQUEDAS_MAX_ITEMS) {
        const response = await listGoogleBusquedas({ limit: BUSQUEDAS_PAGE_SIZE, offset });
        const page = response.items ?? [];
        if (!page.length) {
          total = 0;
          break;
        }
        allItems.push(...page);
        total = typeof response.total === "number" ? response.total : allItems.length;
        offset += BUSQUEDAS_PAGE_SIZE;
        if (page.length < BUSQUEDAS_PAGE_SIZE) {
          break;
        }
      }
      if (allItems.length >= BUSQUEDAS_MAX_ITEMS) {
        setFeedback({
          type: "info",
          message: `Se muestran las primeras ${numberFormatter.format(BUSQUEDAS_MAX_ITEMS)} búsquedas. Usa el filtro del backend para acotar si necesitas más.`,
        });
      }
      setBusquedas(allItems);
      busquedasRef.current = allItems;
      return allItems;
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

  const loadResultadosForBusqueda = useCallback(async (busquedaId: string) => {
    setResultadosPagination({ limit: LIST_PAGE_SIZE, offset: 0 });
    setSelectedIds(new Set());
    setActiveBusquedaId(busquedaId);
    const selectedBusqueda = busquedasRef.current.find((item) => item.id === busquedaId);
    if (selectedBusqueda) {
      setFormValues((prev) => ({
        ...prev,
        query: selectedBusqueda.query ?? prev.query,
        lat: typeof selectedBusqueda.lat === "number" ? selectedBusqueda.lat : prev.lat,
        lng: typeof selectedBusqueda.lng === "number" ? selectedBusqueda.lng : prev.lng,
        radio_m: typeof selectedBusqueda.radio_m === "number" ? selectedBusqueda.radio_m : prev.radio_m,
      }));
      const denseFlag = Boolean(selectedBusqueda.meta?.dense_mode);
      setDenseMode(denseFlag);
    }
    setMapItems([]);
    setMapTruncated(false);
    setMapViewport(null);
  }, []);

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
      setSelectedActividades(new Set());
      setActividadSearch("");
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

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedFilterText(filterText.trim());
    }, 350);
    return () => {
      window.clearTimeout(handle);
    };
  }, [filterText]);

  useEffect(() => {
    if (!selectedActividades.size) {
      return;
    }
    const available = new Set<string>();
    for (const item of resultados) {
      if (typeof item.actividad === "string" && item.actividad.trim()) {
        available.add(item.actividad.trim());
      } else if (
        item.actividad &&
        typeof item.actividad === "object" &&
        "text" in item.actividad &&
        typeof (item.actividad as { text?: unknown }).text === "string"
      ) {
        const value = String((item.actividad as { text?: string }).text ?? "").trim();
        if (value) available.add(value);
      }
    }
    let changed = false;
    const next = new Set<string>();
    selectedActividades.forEach((value) => {
      if (available.has(value)) {
        next.add(value);
      } else {
        changed = true;
      }
    });
    if (changed) {
      setSelectedActividades(next);
    }
  }, [resultados, selectedActividades]);

  useEffect(() => {
    if (!activeBusquedaId) {
      return;
    }
    setBusquedas((current) => {
      if (!current.length) {
        return current;
      }
      let changed = false;
      const next = current.map((item) => {
        if (item.id !== activeBusquedaId) {
          return item;
        }
        const newTotal = resultadosCount;
        if (typeof item.total_encontrados === "number" && item.total_encontrados === newTotal) {
          return item;
        }
        if (item.total_encontrados == null && newTotal === 0) {
          return item;
        }
        changed = true;
        return { ...item, total_encontrados: newTotal };
      });
      if (changed) {
        busquedasRef.current = next;
        return next;
      }
      return current;
    });
  }, [activeBusquedaId, resultadosCount]);

  useEffect(() => {
    if (!activeBusquedaId) {
      return;
    }
    const status = activeBusqueda?.meta?.status;
    if (!status || status === "completed" || status === "failed") {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (cancelled) {
        return;
      }
      try {
        await loadBusquedas();
      } finally {
        if (!cancelled) {
          timer = setTimeout(poll, 2000);
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [activeBusquedaId, activeBusqueda?.meta?.status, loadBusquedas]);

  useEffect(() => {
    if (!activeBusquedaId) {
      return;
    }
    if (activeBusqueda?.meta?.status === "completed") {
      void loadResultadosForBusqueda(activeBusquedaId);
    }
  }, [activeBusquedaId, activeBusqueda?.meta?.status, loadResultadosForBusqueda]);

  useEffect(() => {
    if (!activeBusquedaId) {
      return;
    }
    if (queuedBusquedaId !== activeBusquedaId) {
      return;
    }
    const status = activeBusqueda?.meta?.status;
    if (status === "completed" && resultsLoadedForId === activeBusquedaId) {
      setFeedback({
        type: "success",
        message: (() => {
          const declaredTotal = activeBusqueda?.total_encontrados;
          const finalCount =
            typeof declaredTotal === "number" && declaredTotal >= 0
              ? declaredTotal
              : resultadosCount;
          if (finalCount > 0) {
            return `La búsqueda terminó y se encontraron ${numberFormatter.format(finalCount)} resultados.`;
          }
          return "La búsqueda terminó, pero no se encontraron resultados.";
        })(),
      });
      setQueuedBusquedaId(null);
    } else if (status === "failed") {
      const rawError = activeBusqueda?.meta?.error;
      const detail =
        typeof rawError === "string" && rawError.trim()
          ? rawError
          : "La búsqueda falló. Intenta nuevamente.";
      setFeedback({
        type: "error",
        message: detail,
      });
      setQueuedBusquedaId(null);
    }
  }, [
    activeBusquedaId,
    activeBusqueda?.meta?.status,
    activeBusqueda?.meta?.error,
    activeBusqueda?.total_encontrados,
    resultadosCount,
    queuedBusquedaId,
    resultsLoadedForId,
  ]);

  const busquedaDescriptor = useMemo(() => {
    if (!activeBusqueda) return null;
    const meta = (activeBusqueda.meta ?? {}) as { included_types?: unknown };
    const metaTypes = Array.isArray(meta.included_types)
      ? meta.included_types.filter((value): value is string => typeof value === "string")
      : [];
    if (activeBusqueda.query?.trim()) {
      return activeBusqueda.query.trim();
    }
    if (metaTypes.length) {
      return metaTypes.join(", ");
    }
    return null;
  }, [activeBusqueda]);

  const currentResultFilters = useMemo(() => {
    const phonePresent = phoneFilter === "any" ? undefined : phoneFilter === "with";
    const websitePresent = websiteFilter === "any" ? undefined : websiteFilter === "with";
    const minRating = minRatingFilter > 0 ? minRatingFilter : undefined;
    const actividades = selectedActividadesList.length ? selectedActividadesList : undefined;
    const q = debouncedFilterText.trim().length ? debouncedFilterText.trim() : undefined;
    return {
      q,
      phonePresent,
      websitePresent,
      minRating,
      actividades,
    };
  }, [debouncedFilterText, minRatingFilter, phoneFilter, selectedActividadesList, websiteFilter]);

  const mapFiltersKey = useMemo(() => {
    const actividadesKey = selectedActividadesList.join("\u0001");
    return [debouncedFilterText, minRatingFilter, phoneFilter, websiteFilter, actividadesKey].join("|");
  }, [debouncedFilterText, minRatingFilter, phoneFilter, selectedActividadesList, websiteFilter]);

  const fetchResultadosPage = useCallback(
    async (payload: {
      busquedaId: string;
      limit: number;
      offset: number;
      filters: {
        q?: string;
        phonePresent?: boolean;
        websitePresent?: boolean;
        minRating?: number;
        actividades?: string[];
      };
    }) => {
      setIsLoadingResultados(true);
      try {
        const response = await listGoogleResultados({
          busquedaId: payload.busquedaId,
          limit: payload.limit,
          offset: payload.offset,
          q: payload.filters.q,
          phonePresent: payload.filters.phonePresent,
          websitePresent: payload.filters.websitePresent,
          minRating: payload.filters.minRating,
          actividades: payload.filters.actividades,
        });
        const rows = response.items ?? [];
        setResultados(rows);
        setResultadosTotal(typeof response.total === "number" ? response.total : rows.length);
        setResultsLoadedForId(payload.busquedaId);
      } finally {
        setIsLoadingResultados(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!activeBusquedaId) return;
    void fetchResultadosPage({
      busquedaId: activeBusquedaId,
      limit: resultadosPagination.limit,
      offset: resultadosPagination.offset,
      filters: currentResultFilters,
    }).catch((error) => {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "No fue posible consultar los resultados.",
      });
    });
  }, [
    activeBusquedaId,
    currentResultFilters,
    fetchResultadosPage,
    resultadosPagination.limit,
    resultadosPagination.offset,
    setFeedback,
  ]);

  useEffect(() => {
    if (!activeBusquedaId || !mapViewport) {
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void listGoogleResultadosMap({
        busquedaId: activeBusquedaId,
        bbox: mapViewport.bounds,
        zoom: mapViewport.zoom,
        q: currentResultFilters.q,
        phonePresent: currentResultFilters.phonePresent,
        websitePresent: currentResultFilters.websitePresent,
        minRating: currentResultFilters.minRating,
        actividades: currentResultFilters.actividades,
        limit: MAP_RESULTS_LIMIT,
      })
        .then((response) => {
          if (cancelled) return;
          setMapItems(response.items ?? []);
          setMapTruncated(Boolean(response.truncated));
        })
        .catch(() => {
          if (cancelled) return;
          setMapItems([]);
          setMapTruncated(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [
    activeBusquedaId,
    currentResultFilters,
    mapFiltersKey,
    mapViewport,
  ]);

  const actividadOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const item of resultados) {
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
  }, [resultados]);

  const filteredActividadOptions = useMemo(() => {
    if (!actividadSearch.trim()) {
      return actividadOptions;
    }
    const query = actividadSearch.trim().toLowerCase();
    return actividadOptions.filter((actividad) => actividad.toLowerCase().includes(query));
  }, [actividadOptions, actividadSearch]);

  const totalFiltered = resultadosTotal || 0;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / resultadosPagination.limit));
  const currentPage = Math.min(
    totalPages - 1,
    Math.floor(resultadosPagination.offset / resultadosPagination.limit),
  );
  const pageOffset = resultadosPagination.offset;

  useEffect(() => {
    const maxOffset = Math.max(0, (totalPages - 1) * resultadosPagination.limit);
    if (resultadosPagination.offset > maxOffset) {
      setResultadosPagination((prev) => ({ ...prev, offset: maxOffset }));
    }
  }, [resultadosPagination.offset, resultadosPagination.limit, totalPages]);

  const paginatedResults = resultados;
  const pageStart = totalFiltered === 0 ? 0 : pageOffset + 1;
  const pageEnd =
    totalFiltered === 0 ? 0 : Math.min(pageOffset + resultadosPagination.limit, totalFiltered);

  type MapRenderItem = GoogleResultadoItem & { kind?: "point" | "cluster"; count?: number; id?: string };
  const mapResults = useMemo<MapRenderItem[]>(() => {
    if (!mapViewport) {
      return paginatedResults;
    }
    if (!mapItems.length) {
      return [];
    }
    return mapItems.map((item) => {
      if (item.kind === "cluster") {
        const clusterId = item.id ?? `${item.lat ?? "0"},${item.lng ?? "0"}`;
        return {
          resultado_id: `cluster:${clusterId}`,
          busqueda_id: activeBusquedaId ?? "",
          display_name: null,
          actividad: null,
          phone: null,
          email: null,
          website: null,
          address: null,
          lat: item.lat ?? null,
          lng: item.lng ?? null,
          rating: null,
          reviews: null,
          distancia_m: null,
          maps_url: null,
          google_primary_type: null,
          google_primary_type_display_name: null,
          google_types: null,
          kind: "cluster",
          count: item.count ?? undefined,
          id: item.id ?? undefined,
        };
      }
      return {
        resultado_id: item.resultado_id ?? item.id ?? "",
        busqueda_id: item.busqueda_id ?? activeBusquedaId ?? "",
        display_name: item.display_name ?? null,
        actividad: item.actividad ?? null,
        phone: item.phone ?? null,
        email: item.email ?? null,
        website: item.website ?? null,
        address: item.address ?? null,
        lat: item.lat ?? null,
        lng: item.lng ?? null,
        rating: item.rating ?? null,
        reviews: item.reviews ?? null,
        distancia_m: item.distancia_m ?? null,
        maps_url: item.maps_url ?? null,
        google_primary_type: item.google_primary_type ?? null,
        google_primary_type_display_name: item.google_primary_type_display_name ?? null,
        google_types: item.google_types ?? null,
        kind: "point",
        count: item.count ?? undefined,
        id: item.id ?? undefined,
      };
    });
  }, [activeBusquedaId, mapItems, mapViewport, paginatedResults]);

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

  const handleActividadToggle = (value: string, checked: boolean) => {
    setSelectedActividades((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(value);
      } else {
        next.delete(value);
      }
      return next;
    });
  };

  const handleSelectAllActividades = () => {
    setSelectedActividades(new Set(filteredActividadOptions));
  };

  const handleClearActividades = () => {
    setSelectedActividades(new Set());
  };

  const handleClearAllFilters = useCallback(() => {
    setMinRatingFilter(0);
    setPhoneFilter("any");
    setWebsiteFilter("any");
    setFilterText("");
    setDebouncedFilterText("");
    setActividadSearch("");
    handleClearActividades();
    setResultadosPagination((prev) => ({ ...prev, limit: LIST_PAGE_SIZE, offset: 0 }));
  }, []);

  const handleLimitChange = useCallback(() => {
    setResultadosPagination((prev) => ({ ...prev, limit: LIST_PAGE_SIZE, offset: 0 }));
  }, []);

  const handleDeleteBusqueda = useCallback(
    async (busquedaId: string) => {
      if (!busquedaId) {
        return;
      }
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(
          "¿Eliminar esta captura de Google Places? Se borrarán todos sus resultados.",
        );
        if (!confirmed) {
          return;
        }
      }
      setDeletingBusquedaId(busquedaId);
      try {
        await deleteGoogleBusqueda(busquedaId);
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
        const stillExists = activeBusquedaId ? remaining.some((item) => item.id === activeBusquedaId) : false;
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
    [activeBusquedaId, loadBusquedas, loadResultadosForBusqueda],
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
      await deleteGoogleResultados(ids);
      setFeedback({
        type: "success",
        message: `Se eliminaron ${ids.length} registros.`,
      });
      if (activeBusquedaId) {
        await Promise.all([loadResultadosForBusqueda(activeBusquedaId), loadBusquedas()]);
      } else {
        setResultados([]);
        setSelectedIds(new Set());
      }
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "No fue posible eliminar los resultados seleccionados.",
      });
    } finally {
      setIsDeletingResultados(false);
    }
  }, [activeBusquedaId, loadBusquedas, loadResultadosForBusqueda, selectedIds]);

  const goToPage = useCallback(
    (pageIndex: number) => {
      const clamped = Math.min(Math.max(pageIndex, 0), Math.max(0, totalPages - 1));
      setResultadosPagination((prev) => ({ ...prev, offset: clamped * prev.limit }));
    },
    [totalPages],
  );

  const handlePrevPage = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);
  const handleNextPage = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);

  const handleCenterChange = useCallback((coords: { lat: number; lng: number }) => {
    updateFormValue("lat", Number(coords.lat.toFixed(6)));
    updateFormValue("lng", Number(coords.lng.toFixed(6)));
  }, [updateFormValue]);

  const runBusqueda = useCallback(async () => {
    setFeedback(null);
    const includedTypes = formValues.includedTypesText
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (formValues.strategy === "nearby" && !includedTypes.length) {
      setFeedback({ type: "error", message: "Agrega al menos una clasificación para la búsqueda Nearby." });
      return;
    }
    if (formValues.strategy === "text" && !formValues.query.trim().length) {
      setFeedback({ type: "error", message: "Captura el texto a buscar cuando usas la estrategia text." });
      return;
    }

    const payload: CreateGoogleSearchPayload = {
      query: formValues.strategy === "text" ? formValues.query.trim() : undefined,
      lat: formValues.lat,
      lng: formValues.lng,
      radio_m: formValues.radio_m,
      included_types: includedTypes.length ? includedTypes : undefined,
      strategy: formValues.strategy,
      language_code: formValues.language_code || undefined,
      region_code: formValues.region_code || undefined,
      dense_mode: denseMode,
      meta: {
        source: "panel",
      },
    };

    setIsSearching(true);
    try {
      setResultsLoadedForId(null);
      const response = await createGoogleBusqueda(payload);
      const queuedMessage =
        response.status === "queued"
          ? "La búsqueda quedó en cola y se procesará en segundo plano; los resultados estarán listos en unos instantes."
          : "La búsqueda ya se procesó y los resultados están disponibles.";
      setFeedback({ type: "success", message: queuedMessage });
      if (response.status === "queued") {
        setQueuedBusquedaId(response.busqueda_id);
      } else {
        setQueuedBusquedaId(null);
      }
      await loadBusquedas();
      await loadResultadosForBusqueda(response.busqueda_id);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "No fue posible ejecutar la búsqueda.",
      });
      setQueuedBusquedaId(null);
    } finally {
      setIsSearching(false);
    }
  }, [denseMode, formValues, loadBusquedas, loadResultadosForBusqueda]);

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
        fuente: "google_places",
        resultado_ids: Array.from(selectedIds),
        metadata: {
          busqueda_id: activeBusqueda?.id,
          busqueda_query: activeBusqueda?.query,
        },
      });
      setFeedback({
        type: "success",
        message: `Se guardaron ${response.total} prospectos. Continúa con la verificación desde la vista Prospección.`,
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
              <CardDescription>Define el centro, el radio y la estrategia antes de consultar Google.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-6">
                <div className="space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Label htmlFor="strategy" className="cursor-help">
                          Estrategia
                        </Label>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Cambia entre búsqueda por cercanía (clasificaciones) o por texto libre.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Select
                    value={formValues.strategy}
                    onValueChange={(value) => updateFormValue("strategy", value as GoogleSearchStrategy)}
                  >
                    <SelectTrigger id="strategy" className="h-9">
                      <SelectValue placeholder="Selecciona" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nearby">Cercanía</SelectItem>
                      <SelectItem value="text">Texto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Label htmlFor="query" className="cursor-help">
                          Texto a buscar
                        </Label>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Frase para Places Text Search. Sólo se usa cuando eliges la estrategia Texto.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Input
                    id="query"
                    placeholder="Ej. cafeterías con terraza"
                    value={formValues.query}
                    onChange={(event) => updateFormValue("query", event.target.value)}
                    disabled={formValues.strategy !== "text"}
                    className={cn(
                      "h-9",
                      formValues.strategy === "text"
                        ? "border-primary/70 bg-primary/5"
                        : "border-border bg-muted text-muted-foreground",
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Label htmlFor="types" className="cursor-help">
                          Clasificaciones
                        </Label>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Lista de tipos de Places separados por coma. Aplica cuando usas Cercanía.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Input
                    id="types"
                    placeholder="restaurant,store"
                    value={formValues.includedTypesText}
                    onChange={(event) => updateFormValue("includedTypesText", event.target.value)}
                    disabled={formValues.strategy !== "nearby"}
                    className={cn(
                      "h-9",
                      formValues.strategy === "nearby"
                        ? "border-primary/70 bg-primary/5"
                        : "border-border bg-muted text-muted-foreground",
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="radius-range">Radio (m)</Label>
                  <input
                    id="radius-range"
                    type="range"
                    min={RADIUS_MIN}
                    max={RADIUS_MAX}
                    step={100}
                    value={formValues.radio_m}
                    onChange={(event) => updateFormValue("radio_m", Number(event.target.value))}
                    className="w-full"
                  />
                  <span className="block text-xs text-muted-foreground text-right">
                    {numberFormatter.format(formValues.radio_m)} m
                  </span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lat">Latitud</Label>
                  <Input
                    id="lat"
                    type="number"
                    value={formValues.lat}
                    onChange={(event) => updateFormValue("lat", Number(event.target.value))}
                    step={0.000001}
                    className="h-9 max-w-[120px]"
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
                    className="h-9 max-w-[120px]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Label htmlFor="language_code" className="cursor-help">
                          Idioma
                        </Label>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Idioma en el que Google devolverá nombres y direcciones.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Input
                    id="language_code"
                    value={formValues.language_code}
                    onChange={(event) => updateFormValue("language_code", event.target.value)}
                    placeholder="es"
                  />
                </div>
                <div className="space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Label htmlFor="region_code" className="cursor-help">
                          Región
                        </Label>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Sesga los resultados hacia el país indicado (código ISO, ej. MX).
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Input
                    id="region_code"
                    value={formValues.region_code}
                    onChange={(event) => updateFormValue("region_code", event.target.value)}
                    placeholder="MX"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Checkbox
                  checked={denseMode}
                  onCheckedChange={(value) => setDenseMode(Boolean(value))}
                />
                <span className="text-xs text-muted-foreground">
                  Modo denso (más tiles y sin límite, aunque tarde más)
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {canRunBusquedas ? (
                  <Button onClick={runBusqueda} disabled={isSearching}>
                    {isSearching ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="mr-2 h-4 w-4" />
                    )}
                    Buscar y guardar
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    updateFormValue("lat", DEFAULT_CENTER.lat);
                    updateFormValue("lng", DEFAULT_CENTER.lng);
                    updateFormValue("radio_m", 1500);
                    updateFormValue("includedTypesText", DEFAULT_TYPES);
                  }}
                >
                  Restablecer centro
                </Button>
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
                      : totalFiltered
                        ? `Mostrando ${numberFormatter.format(pageStart)}-${numberFormatter.format(pageEnd)} de ${numberFormatter.format(
                            totalFiltered,
                          )} coincidencias`
                        : "0 coincidencias"}
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
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <div className="space-y-1">
                <Label className="text-xs font-normal">Rating</Label>
                <select
                  value={String(minRatingFilter)}
                  onChange={(event) => setMinRatingFilter(Number(event.target.value))}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="0">Todos</option>
                  <option value="3">3+</option>
                  <option value="4">4+</option>
                  <option value="4.5">4.5+</option>
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
                  placeholder="Nombre, giro o dirección"
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
                      disabled={!activeBusquedaId}
                    >
                      Seleccionar
                    </Button>
                  </DrawerTrigger>
                  <DrawerContent className="sm:max-w-xl">
                    <DrawerHeader>
                      <DrawerTitle>Clase de actividad</DrawerTitle>
                      <DrawerDescription>
                        Selecciona una o varias clases para filtrar los resultados mostrados.
                      </DrawerDescription>
                    </DrawerHeader>
                    <div className="flex flex-1 flex-col gap-4 overflow-hidden px-4">
                      <div className="space-y-1">
                        <Label className="text-xs font-normal text-muted-foreground">
                          Filtrar clases
                        </Label>
                        <Input
                          value={actividadSearch}
                          onChange={(event) => setActividadSearch(event.target.value)}
                          placeholder="Ej. restaurant, hotel…"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={handleSelectAllActividades}
                          disabled={!filteredActividadOptions.length}
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
                      {filteredActividadOptions.length ? (
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
                        <p className="text-sm text-muted-foreground">No hay clases que coincidan.</p>
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
                  min={5000}
                  max={5000}
                  step={5000}
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
                  variant="ghost"
                  size="sm"
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
              {canSaveProspectos ? (
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
              ) : null}
              {canDeleteBusquedas ? (
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
              ) : null}
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
              {!totalFiltered ? (
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
                            {typeof item.rating === "number" ? (
                              <Badge variant="secondary" className="flex items-center gap-1">
                                <Star className="h-3 w-3 text-amber-500" />
                                {item.rating.toFixed(1)}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {item.phone ? (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {item.phone}
                              </span>
                            ) : null}
                            {item.website ? (
                              <a
                                className="inline-flex items-center gap-1 text-primary"
                                href={item.website}
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
                          {Array.isArray(item.google_types) && item.google_types.length ? (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {item.google_types.slice(0, 4).map((type) => (
                                <Badge key={type} variant="outline" className="text-[11px]">
                                  {type}
                                </Badge>
                              ))}
                              {item.google_types.length > 4 ? (
                                <Badge variant="outline">+{item.google_types.length - 4}</Badge>
                              ) : null}
                            </div>
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
                disabled={isLoadingResultados || currentPage === 0 || !totalFiltered}
              >
                Anterior
              </Button>
              <span>
                {totalFiltered === 0
                  ? "No hay registros"
                  : `Mostrando ${numberFormatter.format(pageStart)}-${numberFormatter.format(
                      pageEnd,
                    )} de ${numberFormatter.format(totalFiltered)}`}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleNextPage}
                disabled={isLoadingResultados || currentPage >= totalPages - 1 || !totalFiltered}
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
              <CardDescription>
                Mueve el marcador para actualizar el centro.
                {mapTruncated ? <span className="mt-1 block">Demasiados puntos en esta vista: acerca el zoom.</span> : null}
              </CardDescription>
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
              <GoogleResultsMap
                center={{ lat: formValues.lat, lng: formValues.lng }}
                radius={formValues.radio_m}
                results={mapResults}
                highlightIds={selectedIds}
                onCenterChange={handleCenterChange}
                onViewportChange={setMapViewport}
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
            <ScrollArea className="h-[360px] rounded-lg border border-border/60">
              <div className="min-w-[860px]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Búsqueda</TableHead>
                      <TableHead className="w-36 text-right">Registros</TableHead>
                      <TableHead className="w-28 text-right">Radio</TableHead>
                      <TableHead className="w-44">Fecha</TableHead>
                      <TableHead className="w-36 text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {busquedas.map((item) => {
                      const createdLabel = new Date(item.creado_en).toLocaleString("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                      });
                      const isActive = activeBusquedaId === item.id;
                      return (
                        <TableRow key={item.id} className={isActive ? "bg-primary/5" : undefined}>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium">{item.query || "(Sin texto)"}</p>
                              <p className="text-xs text-muted-foreground">{item.id}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {typeof item.total_encontrados === "number"
                              ? numberFormatter.format(item.total_encontrados)
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {typeof item.radio_m === "number" ? numberFormatter.format(item.radio_m) : "-"}
                          </TableCell>
                          <TableCell>{createdLabel}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant={isActive ? "secondary" : "outline"}
                                onClick={() => loadResultadosForBusqueda(item.id)}
                              >
                                Ver
                              </Button>
                              {canDeleteBusquedas ? (
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
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no hay capturas registradas.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
