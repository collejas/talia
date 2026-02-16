"use client"

import dynamic from "next/dynamic"
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Globe,
  Info,
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
  getDenueResultadosBounds,
  listDenueActividades,
  listDenueBusquedas,
  listDenueCatalogos,
  listDenueResultados,
  listDenueResultadosMap,
  type CreateDenueSearchPayload,
  type CreateDenueSearchResponse,
  type DenueBusquedaItem,
  type DenueResultadosMapItem,
  type DenueCatalogosResponse,
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
import {
  DenueAdvancedFilters,
  DenueAdvancedSearchModal,
} from "./advanced-denue-search-modal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissions } from "@/hooks/use-permissions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const DEFAULT_CENTER = { lat: 19.432608, lng: -99.133209 };
const numberFormatter = new Intl.NumberFormat("es-MX");
const RADIUS_MIN = 100;
const RADIUS_MAX = 5_000;
const LIST_PAGE_SIZE = 500;
const BUSQUEDAS_PAGE_SIZE = 100;
const BUSQUEDAS_MAX_ITEMS = 2000;
const QUERY_TOOLTIP_ID = "denue-query-tooltip";
const QUERY_TOOLTIP_TEXT =
  "Palabra(s) a buscar en el nombre del establecimiento, razón social, calle, colonia, clase de la actividad económica, entidad federativa, municipio y localidad. Para buscar más de una palabra se deberán separar con una coma. Para buscar todos los establecimientos se deberá ingresar la palabra \"todos\".";

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

type AdvancedSearchPayload = Pick<
  CreateDenueSearchPayload,
  "modo" | "texto_busqueda" | "actividad_codigos" | "estrato_ids" | "geo_estados" | "geo_municipios"
>;

type BusquedaMetaFilters = {
  geo_estados?: string[];
  geo_municipios?: string[];
  actividad_codigos?: string[];
  estrato_ids?: string[];
  texto_busqueda?: string;
};

type GeoLookups = {
  states: Map<string, string>;
  municipalities: Map<string, string>;
};

type ScianLookups = {
  titles: Map<string, string>;
};

function extractBusquedaMeta(item: DenueBusquedaItem): { source?: string; modo?: string; filters?: BusquedaMetaFilters } {
  const meta = item.meta;
  if (!meta || typeof meta !== "object") {
    return {};
  }
  const source = typeof (meta as Record<string, unknown>).source === "string" ? String((meta as Record<string, unknown>).source) : undefined;
  const modo = typeof (meta as Record<string, unknown>).modo === "string" ? String((meta as Record<string, unknown>).modo) : undefined;
  const advanced = (meta as Record<string, unknown>).advanced_filters;
  const filters =
    advanced && typeof advanced === "object"
      ? {
        geo_estados: Array.isArray((advanced as Record<string, unknown>).geo_estados)
          ? ((advanced as Record<string, unknown>).geo_estados as unknown[]).map(String)
          : undefined,
        geo_municipios: Array.isArray((advanced as Record<string, unknown>).geo_municipios)
          ? ((advanced as Record<string, unknown>).geo_municipios as unknown[]).map(String)
          : undefined,
        actividad_codigos: Array.isArray((advanced as Record<string, unknown>).actividad_codigos)
          ? ((advanced as Record<string, unknown>).actividad_codigos as unknown[]).map(String)
          : undefined,
        estrato_ids: Array.isArray((advanced as Record<string, unknown>).estrato_ids)
          ? ((advanced as Record<string, unknown>).estrato_ids as unknown[]).map(String)
          : undefined,
        texto_busqueda: typeof (advanced as Record<string, unknown>).texto_busqueda === "string"
          ? String((advanced as Record<string, unknown>).texto_busqueda).trim()
          : undefined,
      }
      : undefined;
  return { source, modo, filters };
}

function buildGeoLookups(states: DenueCatalogosResponse["geo"]["states"]): GeoLookups {
  const stateMap = new Map<string, string>();
  const municipalityMap = new Map<string, string>();
  for (const state of states) {
    const stateCode = String(state.code ?? "").trim().padStart(2, "0");
    if (stateCode && state.name) {
      stateMap.set(stateCode, String(state.name).trim());
    }
    for (const municipio of state.municipalities ?? []) {
      const municipioCode = String(municipio.code ?? "").trim().padStart(3, "0");
      if (stateCode && municipioCode && municipio.name) {
        municipalityMap.set(`${stateCode}::${municipioCode}`, String(municipio.name).trim());
      }
    }
  }
  return { states: stateMap, municipalities: municipalityMap };
}

function buildScianLookups(scian: DenueCatalogosResponse["scian"]): ScianLookups {
  const titles = new Map<string, string>();
  const addRows = (rows: DenueCatalogosResponse["scian"][keyof DenueCatalogosResponse["scian"]]) => {
    for (const row of rows) {
      const code = String(row.codigo ?? "").trim();
      const title = typeof row.titulo === "string" ? row.titulo.trim() : "";
      if (!code || !title) continue;
      titles.set(code, title);
    }
  };
  addRows(scian.sector);
  addRows(scian.subsector);
  addRows(scian.rama);
  addRows(scian.subrama);
  addRows(scian.clase);
  return { titles };
}

function buildGeoDisplay(
  filters?: BusquedaMetaFilters,
  lookups?: GeoLookups | null,
): { label: string; tooltip?: string } {
  if (!filters) {
    return { label: "—" };
  }
  const municipios = (filters.geo_municipios ?? []).filter(Boolean);
  if (municipios.length) {
    const normalized = municipios.map((value) => {
      const [rawState, rawMun] = String(value).split("::");
      const state = rawState ? String(rawState).padStart(2, "0") : "";
      const mun = rawMun ? String(rawMun).padStart(3, "0") : "";
      const stateName = state ? lookups?.states.get(state) : undefined;
      const munName = state && mun ? lookups?.municipalities.get(`${state}::${mun}`) : undefined;
      if (stateName && munName) {
        return `${stateName} / ${munName}`;
      }
      return String(value).replace("::", "-");
    });
    const base = normalized[0] ?? "—";
    if (municipios.length <= 1) {
      return { label: base };
    }
    const maxTooltipItems = 30;
    const tooltipItems = normalized.slice(0, maxTooltipItems);
    const tooltipExtra = normalized.length > maxTooltipItems ? `\n+${normalized.length - maxTooltipItems} más…` : "";
    return {
      label: `${base} +${municipios.length - 1}`,
      tooltip: `Municipios (${normalized.length}):\n${tooltipItems.join("\n")}${tooltipExtra}`,
    };
  }
  const estados = (filters.geo_estados ?? []).filter(Boolean);
  if (estados.length) {
    const normalized = estados.map((value) => String(value).padStart(2, "0"));
    const first = normalized[0]!;
    const base = lookups?.states.get(first) ?? first;
    if (normalized.length <= 1) {
      return { label: base };
    }
    const names = normalized.map((code) => lookups?.states.get(code) ?? code);
    const maxTooltipItems = 30;
    const tooltipItems = names.slice(0, maxTooltipItems);
    const tooltipExtra = names.length > maxTooltipItems ? `\n+${names.length - maxTooltipItems} más…` : "";
    return {
      label: `${base} +${normalized.length - 1}`,
      tooltip: `Estados (${names.length}):\n${tooltipItems.join("\n")}${tooltipExtra}`,
    };
  }
  return { label: "—" };
}

function buildActividadDisplay(
  filters?: BusquedaMetaFilters,
  scian?: ScianLookups | null,
): { label: string; tooltip?: string } {
  const codes = (filters?.actividad_codigos ?? []).filter(Boolean);
  if (!codes.length) {
    return { label: "" };
  }
  if (codes.includes("0")) {
    return { label: "Todas las actividades", tooltip: "Actividades: Todas las actividades" };
  }
  const names = codes.map((code) => scian?.titles.get(code) ?? code);
  const base = names[0] ?? "";
  if (!base) {
    return { label: "" };
  }
  const maxTooltipItems = 30;
  const tooltipItems = names.slice(0, maxTooltipItems);
  const tooltipExtra = names.length > maxTooltipItems ? `\n+${names.length - maxTooltipItems} más…` : "";
  const tooltip = `Actividades (${names.length}):\n${tooltipItems.join("\n")}${tooltipExtra}`;
  if (names.length <= 1) {
    return { label: base, tooltip };
  }
  return { label: `${base} +${names.length - 1}`, tooltip };
}

export function DenueBusquedaView() {
  const { context } = usePermissions();
  const canRunBusquedas = context.es_admin || context.permisos.includes("busquedas.run");
  const canDeleteBusquedas = context.es_admin || context.permisos.includes("busquedas.delete");
  const canSaveProspectos = context.es_admin || context.permisos.includes("prospectos.create");
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
  const [debouncedFilterText, setDebouncedFilterText] = useState("");
  const [phoneFilter, setPhoneFilter] = useState<ContactFilterValue>("any");
  const [emailFilter, setEmailFilter] = useState<ContactFilterValue>("any");
  const [websiteFilter, setWebsiteFilter] = useState<ContactFilterValue>("any");
  const [estratoFilter, setEstratoFilter] = useState<EstratoFilterValue>("any");
  const [selectedActividades, setSelectedActividades] = useState<Set<string>>(new Set());
  const [actividadSearch, setActividadSearch] = useState("");
  const [actividadDrawerOpen, setActividadDrawerOpen] = useState(false);
  const [actividadOptions, setActividadOptions] = useState<string[]>([]);
  const [isLoadingActividadOptions, setIsLoadingActividadOptions] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingBusquedaId, setDeletingBusquedaId] = useState<string | null>(null);
  const [isDeletingResultados, setIsDeletingResultados] = useState(false);
  const [isSavingProspectos, setIsSavingProspectos] = useState(false);
  const [advancedModalOpen, setAdvancedModalOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<DenueAdvancedFilters | null>(null);
  const [geoLookups, setGeoLookups] = useState<GeoLookups | null>(null);
  const [scianLookups, setScianLookups] = useState<ScianLookups | null>(null);
  const [mapViewport, setMapViewport] = useState<{ bounds: { west: number; south: number; east: number; north: number }; zoom: number } | null>(
    null,
  );
  const [mapItems, setMapItems] = useState<DenueResultadosMapItem[]>([]);
  const [mapTruncated, setMapTruncated] = useState(false);
  const [mapFitBounds, setMapFitBounds] = useState<{ west: number; south: number; east: number; north: number } | null>(null);
  const busquedasRef = useRef<DenueBusquedaItem[]>([]);
  const activeBusqueda = useMemo(
    () => busquedas.find((item) => item.id === activeBusquedaId) ?? null,
    [busquedas, activeBusquedaId],
  );
  const activeModo = useMemo(() => {
    const meta = activeBusqueda?.meta;
    if (!meta || typeof meta !== "object") {
      return "radio";
    }
    const maybe = (meta as Record<string, unknown>).modo;
    return typeof maybe === "string" && maybe.trim().length ? maybe.trim() : "radio";
  }, [activeBusqueda?.meta]);
  const mapIsAdvanced = activeModo !== "radio";

  const selectedActividadesList = useMemo(
    () => Array.from(selectedActividades).sort((a, b) => a.localeCompare(b, "es")),
    [selectedActividades],
  );

  const currentResultFilters = useMemo(() => {
    const phonePresent = phoneFilter === "any" ? undefined : phoneFilter === "with";
    const emailPresent = emailFilter === "any" ? undefined : emailFilter === "with";
    const websitePresent = websiteFilter === "any" ? undefined : websiteFilter === "with";
    const estratoGroup = estratoFilter === "any" ? undefined : estratoFilter;
    const actividades = selectedActividadesList.length ? selectedActividadesList : undefined;
    const q = debouncedFilterText.trim().length ? debouncedFilterText.trim() : undefined;
    return {
      q,
      phonePresent,
      emailPresent,
      websitePresent,
      estratoGroup,
      actividades,
    };
  }, [debouncedFilterText, emailFilter, estratoFilter, phoneFilter, selectedActividadesList, websiteFilter]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedFilterText(filterText.trim());
    }, 350);
    return () => {
      window.clearTimeout(handle);
    };
  }, [filterText]);

  const updateFormValue = useCallback(<K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const loadBusquedas = useCallback(async () => {
    setIsLoadingBusquedas(true);
    try {
      const allItems: DenueBusquedaItem[] = [];
      let offset = 0;
      let total = Number.POSITIVE_INFINITY;
      while (offset < total && allItems.length < BUSQUEDAS_MAX_ITEMS) {
        const response = await listDenueBusquedas({ limit: BUSQUEDAS_PAGE_SIZE, offset });
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

  useEffect(() => {
    busquedasRef.current = busquedas;
  }, [busquedas]);

  useEffect(() => {
    if (geoLookups || isLoadingBusquedas || !busquedas.length) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await listDenueCatalogos();
        if (cancelled) return;
        setGeoLookups(buildGeoLookups(response.geo.states ?? []));
        setScianLookups(buildScianLookups(response.scian));
      } catch {
        // Sin catálogos: mostrar códigos como fallback.
        if (cancelled) return;
        setGeoLookups(null);
        setScianLookups(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [busquedas.length, geoLookups, isLoadingBusquedas]);

  useEffect(() => {
    if (!activeBusquedaId || !actividadDrawerOpen) {
      return;
    }
    let cancelled = false;
    setIsLoadingActividadOptions(true);
    void (async () => {
      try {
        const response = await listDenueActividades({
          busquedaId: activeBusquedaId,
          search: actividadSearch,
          limit: 500,
        });
        if (cancelled) return;
        setActividadOptions(response.items ?? []);
      } catch {
        if (cancelled) return;
        setActividadOptions([]);
      } finally {
        if (cancelled) return;
        setIsLoadingActividadOptions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBusquedaId, actividadDrawerOpen, actividadSearch]);

  const fetchResultadosPage = useCallback(
    async ({
      busquedaId,
      limit,
      offset,
      filters,
    }: {
      busquedaId: string;
      limit: number;
      offset: number;
      filters: {
        q?: string;
        phonePresent?: boolean;
        emailPresent?: boolean;
        websitePresent?: boolean;
        estratoGroup?: string;
        actividades?: string[];
      };
    }) => {
      setIsLoadingResultados(true);
      try {
        const response = await listDenueResultados({
          busquedaId,
          q: filters.q,
          limit,
          offset,
          order: "recientes",
          phonePresent: filters.phonePresent,
          emailPresent: filters.emailPresent,
          websitePresent: filters.websitePresent,
          estratoGroup: filters.estratoGroup,
          actividades: filters.actividades,
        });
        const rows = response.items ?? [];
        setResultados(rows);
        const totalRecords = response.total ?? rows.length;
        setResultadosTotal(totalRecords);
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
      setActividadOptions([]);
      setFilterText("");
      setDebouncedFilterText("");
      setPhoneFilter("any");
      setEmailFilter("any");
      setWebsiteFilter("any");
      setEstratoFilter("any");
      setActiveBusquedaId(busquedaId);
      setResultados([]);
      setResultadosTotal(0);
      setResultadosPagination({ limit: LIST_PAGE_SIZE, offset: 0 });
      try {
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
      } catch (error) {
        setFeedback({
          type: "error",
          message: error instanceof Error ? error.message : "No fue posible consultar los resultados.",
        });
      }
    },
    [],
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

  const effectiveTotal = resultadosTotal || 0;
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

  const paginatedResults = resultados;
  const pageStart = effectiveTotal === 0 ? 0 : pageOffset + 1;
  const pageEnd =
    effectiveTotal === 0
      ? 0
      : Math.min(pageOffset + paginatedResults.length, effectiveTotal);
  const hasPrevPage = resultadosPagination.offset > 0;
  const hasNextPage = resultadosPagination.offset < maxPageOffset;
  type MapRenderItem = GoogleResultadoItem & { kind?: "point" | "cluster"; count?: number; id?: string };
  const mapResults = useMemo<MapRenderItem[]>(() => {
    if (!activeBusquedaId) return [];
    const items: MapRenderItem[] = [];
    for (const row of mapItems) {
      if (typeof row.lat !== "number" || typeof row.lng !== "number") continue;
      if (row.kind === "cluster") {
        items.push({
          resultado_id: `cluster:${row.id}`,
          busqueda_id: activeBusquedaId,
          display_name: null,
          actividad: null,
          phone: null,
          email: null,
          website: null,
          address: null,
          lat: row.lat,
          lng: row.lng,
          rating: null,
          reviews: null,
          distancia_m: null,
          maps_url: null,
          google_primary_type: null,
          google_primary_type_display_name: null,
          google_types: null,
          kind: "cluster",
          count: typeof row.count === "number" ? row.count : undefined,
          id: row.id,
        });
        continue;
      }
      items.push({
        resultado_id: row.resultado_id ?? row.id,
        busqueda_id: activeBusquedaId,
        display_name: row.display_name,
        actividad: row.actividad,
        phone: row.phone,
        email: row.email,
        website: row.website,
        address: row.address,
        lat: row.lat,
        lng: row.lng,
        rating: null,
        reviews: null,
        distancia_m: null,
        maps_url: null,
        google_primary_type: null,
        google_primary_type_display_name: null,
        google_types: null,
        kind: "point",
        id: row.id,
      });
    }
    return items;
  }, [activeBusquedaId, mapItems]);

  const filtersKey = useMemo(() => {
    const actividadesKey = selectedActividadesList.join("\u0001");
    return [
      debouncedFilterText,
      phoneFilter,
      emailFilter,
      websiteFilter,
      estratoFilter,
      actividadesKey,
    ].join("|");
  }, [debouncedFilterText, emailFilter, estratoFilter, phoneFilter, selectedActividadesList, websiteFilter]);

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
    filtersKey,
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
      void listDenueResultadosMap({
        busquedaId: activeBusquedaId,
        bbox: mapViewport.bounds,
        zoom: mapViewport.zoom,
        q: currentResultFilters.q,
        phonePresent: currentResultFilters.phonePresent,
        emailPresent: currentResultFilters.emailPresent,
        websitePresent: currentResultFilters.websitePresent,
        estratoGroup: currentResultFilters.estratoGroup,
        actividades: currentResultFilters.actividades,
        limit: 5000,
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
    filtersKey,
    mapViewport,
  ]);

  useEffect(() => {
    if (!activeBusquedaId || !mapIsAdvanced) {
      setMapFitBounds(null);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void getDenueResultadosBounds({
        busquedaId: activeBusquedaId,
        q: currentResultFilters.q,
        phonePresent: currentResultFilters.phonePresent,
        emailPresent: currentResultFilters.emailPresent,
        websitePresent: currentResultFilters.websitePresent,
        estratoGroup: currentResultFilters.estratoGroup,
        actividades: currentResultFilters.actividades,
      })
        .then((response) => {
          if (cancelled) return;
          setMapFitBounds(response.bounds ?? null);
        })
        .catch(() => {
          if (cancelled) return;
          setMapFitBounds(null);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [
    activeBusquedaId,
    currentResultFilters,
    filtersKey,
    mapIsAdvanced,
  ]);


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

  const filteredActividadOptions = actividadOptions;

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
    setDebouncedFilterText("");
    setActividadSearch("");
    handleClearActividades();
    setResultadosPagination((prev) => ({ ...prev, limit: LIST_PAGE_SIZE, offset: 0 }));
  }, [handleClearActividades]);

  const refreshResultados = useCallback(
    async (options?: { resetOffset?: boolean }) => {
      if (!activeBusquedaId) return;
      const nextOffset = options?.resetOffset ? 0 : resultadosPagination.offset;
      try {
        await fetchResultadosPage({
          busquedaId: activeBusquedaId,
          limit: resultadosPagination.limit,
          offset: nextOffset,
          filters: currentResultFilters,
        });
      } catch (error) {
        setFeedback({
          type: "error",
          message: error instanceof Error ? error.message : "No fue posible consultar los resultados.",
        });
      }
    },
    [
      activeBusquedaId,
      currentResultFilters,
      fetchResultadosPage,
      resultadosPagination.limit,
      resultadosPagination.offset,
      setFeedback,
    ],
  );

  const handleLimitChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value) || 50;
      const limit = Math.min(500, Math.max(50, value));
      setResultadosPagination((prev) => ({ ...prev, limit, offset: 0 }));
    },
    [],
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
          refreshResultados({ resetOffset: true }),
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
  }, [activeBusquedaId, loadBusquedas, refreshResultados, selectedIds, setFeedback]);

  const goToPage = useCallback(
    (pageIndex: number) => {
      if (!activeBusquedaId) {
        return;
      }
      const clamped = Math.min(Math.max(pageIndex, 0), Math.max(0, totalPages - 1));
      const nextOffset = clamped * resultadosPagination.limit;
      setResultadosPagination((prev) => ({ ...prev, offset: nextOffset }));
    },
    [activeBusquedaId, resultadosPagination.limit, totalPages],
  );

  const handlePrevPage = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);
  const handleNextPage = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);

  const handleCenterChange = useCallback((coords: { lat: number; lng: number }) => {
    updateFormValue("lat", Number(coords.lat.toFixed(6)));
    updateFormValue("lng", Number(coords.lng.toFixed(6)));
  }, [updateFormValue]);

  const buildAdvancedQueryLabel = useCallback((filters: DenueAdvancedFilters, payload: AdvancedSearchPayload) => {
    const parts: string[] = [];
    parts.push(`Avanzada:${payload.modo}`);
    const texto = (payload.texto_busqueda ?? "").trim();
    if (texto) {
      parts.push(texto);
    }
    if (filters.allActivitiesSelected) {
      parts.push("act:todas");
    } else if (payload.actividad_codigos?.length) {
      parts.push(`act:${payload.actividad_codigos.length}`);
    }
    if (payload.estrato_ids?.length) {
      parts.push(`tam:${payload.estrato_ids.join(",")}`);
    }
    if (payload.geo_municipios?.length) {
      parts.push(`mun:${payload.geo_municipios.length}`);
    } else if (payload.geo_estados?.length) {
      parts.push(`edo:${payload.geo_estados.length}`);
    }
    const label = parts.filter(Boolean).join(" · ").trim() || "Búsqueda avanzada";
    if (label.length <= 200) {
      return label;
    }
    return `${label.slice(0, 197).trimEnd()}...`;
  }, []);

  const buildAdvancedPayload = useCallback((filters: DenueAdvancedFilters | null): AdvancedSearchPayload | undefined => {
    if (!filters) {
      return undefined;
    }
    const textParts = [
      filters.search.nombre,
      filters.search.calle,
      filters.search.colonia,
      filters.search.cp,
    ]
      .map((value) => value.trim())
      .filter(Boolean);
    const texto = textParts.join(" ").trim();
    const actividadCodes = filters.allActivitiesSelected
      ? ["0"]
      : Array.from(
        new Set(
          filters.actividad
            .map((value) => value.trim())
            .filter((value) => value.length >= 2),
        ),
      );
    const estrato = filters.estrato.filter((value) => value !== "0");
    const geoEstados = filters.geografia.estados.length ? filters.geografia.estados : undefined;
    const geoMunicipios = filters.geografia.municipios.length ? filters.geografia.municipios : undefined;
    const hasActivitySelection =
      filters.allActivitiesSelected ||
      actividadCodes.some((value) => Boolean(value) && value !== "0");
    const hasGeo = Boolean(geoEstados?.length || geoMunicipios?.length);
    const hasEstrato = Boolean(estrato.length);
    let modo: AdvancedSearchPayload["modo"] = "radio";
    if (hasActivitySelection && hasEstrato) {
      modo = "area_act_estr";
    } else if (hasActivitySelection) {
      modo = "area_act";
    } else if (hasGeo) {
      modo = "entidad";
    }
    if (modo === "radio") {
      if (!texto) {
        return undefined;
      }
      return {
        modo,
        texto_busqueda: texto,
      };
    }
    if (modo === "entidad" && !texto) {
      return undefined;
    }
    return {
      modo,
      texto_busqueda: texto || undefined,
      actividad_codigos: actividadCodes,
      estrato_ids: estrato.length ? estrato : undefined,
      geo_estados: geoEstados,
      geo_municipios: geoMunicipios,
    };
  }, []);

  const runBusqueda = useCallback(
    async (overrideFilters?: DenueAdvancedFilters | null) => {
      setFeedback(null);
      const activeAdvanced = overrideFilters ?? advancedFilters;
      const advancedPayload = buildAdvancedPayload(activeAdvanced);
      const isAdvanced = Boolean(activeAdvanced && advancedPayload);
      if (activeAdvanced && !advancedPayload) {
        setFeedback({
          type: "error",
          message: "La búsqueda avanzada requiere texto (nombre/calle/colonia/CP) o una actividad económica seleccionada.",
        });
        return;
      }
      if (!isAdvanced && !formValues.query.trim().length) {
        setFeedback({ type: "error", message: "Captura el texto o palabra clave a buscar." });
        return;
      }
      const queryValue = isAdvanced && advancedPayload && activeAdvanced
        ? buildAdvancedQueryLabel(activeAdvanced, advancedPayload)
        : formValues.query.trim();
      const payload: CreateDenueSearchPayload = {
        query: queryValue,
        lat: formValues.lat,
        lng: formValues.lng,
        radio_m: formValues.radio_m,
        meta: {
          source: "panel",
        },
        ...(advancedPayload ?? {}),
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
    },
    [formValues, loadBusquedas, loadResultadosForBusqueda, buildAdvancedPayload, advancedFilters, buildAdvancedQueryLabel],
  );

  const handleStandardSearch = useCallback(() => {
    void runBusqueda();
  }, [runBusqueda]);

  const handleAdvancedApply = useCallback(
    (filters: DenueAdvancedFilters) => {
      setAdvancedFilters(filters);
      void runBusqueda(filters);
    },
    [runBusqueda],
  );

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
              <div className="flex items-start gap-2">
                <Label htmlFor="query">Palabra clave o giro</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        aria-label="Instrucciones de búsqueda DENUE"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      align="start"
                      className="max-w-xs text-justify text-sm leading-snug"
                      id={QUERY_TOOLTIP_ID}
                    >
                      <span>
                        Palabra(s) a buscar en el nombre del establecimiento, razón social, calle, colonia, clase de la actividad económica, entidad federativa, municipio y localidad.
                      </span>
                      <span className="mt-1 block">
                        Para buscar más de una palabra se deberán separar con una coma. Para buscar todos los establecimientos se deberá ingresar la palabra &quot;todos&quot;.
                      </span>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="query"
                placeholder="Ej. cafeterías, autolavado, ferretería"
                value={formValues.query}
                onChange={(event) => updateFormValue("query", event.target.value)}
                title={QUERY_TOOLTIP_TEXT}
                aria-describedby={QUERY_TOOLTIP_ID}
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
              {canRunBusquedas ? (
                <Button onClick={handleStandardSearch} disabled={isSearching} className="flex-1 min-w-[140px]">
                  {isSearching ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  Buscar y guardar
                </Button>
              ) : null}
              {canRunBusquedas ? (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 min-w-[140px]"
                  onClick={() => setAdvancedModalOpen(true)}
                >
                  Búsqueda avanzada
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
                        : effectiveTotal
                          ? `Mostrando ${numberFormatter.format(pageStart)}-${numberFormatter.format(pageEnd)} de ${numberFormatter.format(
                              effectiveTotal,
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
                  onClick={() => void refreshResultados({ resetOffset: true })}
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
                      disabled={!activeBusquedaId}
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
                      {isLoadingActividadOptions ? (
                        <p className="text-sm text-muted-foreground">Cargando actividades…</p>
                      ) : actividadOptions.length ? (
                        <ScrollArea className="h-[60vh] rounded-lg border border-border/60">
                          <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
                            {actividadOptions.map((actividad) => {
                              const checked = selectedActividades.has(actividad);
                              return (
                                <label
                                  key={actividad}
                                  className={cn(
                                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                                    checked ? "border-primary bg-primary/5" : "border-border/60",
                                  )}
                                >
                                  <Checkbox checked={checked} onCheckedChange={(value) => handleActividadToggle(actividad, Boolean(value))} />
                                  <span className="line-clamp-2">{actividad}</span>
                                </label>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      ) : (
                        <p className="text-sm text-muted-foreground">No hay clases disponibles con ese filtro.</p>
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
                {numberFormatter.format(effectiveTotal)} registros · página {currentPage + 1} de {totalPages}
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
                {!paginatedResults.length ? (
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
	              <CardDescription>
	                {mapIsAdvanced ? "Se centra automáticamente en los resultados encontrados." : "Mueve el marcador para actualizar el centro."}
	                {mapTruncated ? <span className="mt-1 block">Demasiados puntos en esta vista: acerca el zoom.</span> : null}
	              </CardDescription>
	            </div>
	            <Button
	              type="button"
	              size="icon"
	              variant="ghost"
	              onClick={() => {
	                setFeedback({
	                  type: "info",
	                  message: mapIsAdvanced
	                    ? "El mapa se ajusta automáticamente a los resultados de la búsqueda avanzada."
	                    : "Haz clic en el mapa o arrastra el marcador azul para ajustar la búsqueda.",
	                });
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
	                onCenterChange={mapIsAdvanced ? undefined : handleCenterChange}
	                onViewportChange={setMapViewport}
	                fitBounds={mapIsAdvanced ? mapFitBounds : null}
	                fitBoundsKey={`${activeBusquedaId ?? ""}:${filtersKey}`}
	                showSearchCircle={!mapIsAdvanced}
	                enableCenterControls={!mapIsAdvanced}
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
                      <TableHead>Búsqueda / App</TableHead>
                      <TableHead className="w-36 text-right">Registros</TableHead>
                      <TableHead className="w-28 text-right">Radio</TableHead>
                      <TableHead className="w-44">Estado / Municipio</TableHead>
                      <TableHead className="w-44">Fecha</TableHead>
                      <TableHead className="w-44 text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {busquedas.map((item) => {
                      const meta = extractBusquedaMeta(item);
                      const geo = buildGeoDisplay(meta.filters, geoLookups);
                      const actividad = buildActividadDisplay(meta.filters, scianLookups);
                      const createdLabel = new Date(item.creado_en).toLocaleString("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                      });
                      const modo = meta.modo || "radio";
                      const radioLabel =
                        modo === "radio" && typeof item.radio_m === "number"
                          ? `${numberFormatter.format(item.radio_m)} m`
                          : "—";
                      const sourceLabel = meta.source ? String(meta.source) : item.fuente;
                      const textoBusqueda = meta.filters?.texto_busqueda?.trim();
                      const busquedaTitulo =
                        modo === "radio"
                          ? (item.query || "(Sin texto)")
                          : textoBusqueda
                            ? textoBusqueda
                            : actividad.label
                              ? `Avanzada · ${actividad.label}`
                              : (item.query || "Búsqueda avanzada");
                      const tooltipParts: string[] = [];
                      if (modo !== "radio") {
                        if (textoBusqueda) {
                          tooltipParts.push(`Texto:\n${textoBusqueda}`);
                        }
                        if (actividad.tooltip) {
                          tooltipParts.push(actividad.tooltip);
                        }
                      }
                      const busquedaTooltip = tooltipParts.filter(Boolean).join("\n\n") || undefined;
                      return (
                        <TableRow
                          key={item.id}
                          className={cn(
                            activeBusquedaId === item.id && "bg-primary/5",
                          )}
                        >
                          <TableCell className="max-w-[380px] whitespace-normal">
                            <div className="space-y-0.5">
                              <div className="font-medium">
                                {busquedaTooltip ? (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="cursor-help underline decoration-dotted underline-offset-2">
                                          {busquedaTitulo}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" align="start" className="max-w-sm whitespace-pre-wrap text-sm leading-snug">
                                        {busquedaTooltip}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  busquedaTitulo
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {sourceLabel} · {modo}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {typeof item.total_encontrados === "number"
                              ? numberFormatter.format(item.total_encontrados)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{radioLabel}</TableCell>
                          <TableCell className="text-xs">
                            {geo.tooltip ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help underline decoration-dotted underline-offset-2">
                                      {geo.label}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" align="start" className="max-w-sm whitespace-pre-wrap text-sm leading-snug">
                                    {geo.tooltip}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              geo.label
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{createdLabel}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                size="sm"
                                variant={activeBusquedaId === item.id ? "secondary" : "outline"}
                                onClick={() => loadResultadosForBusqueda(item.id)}
                              >
                                Ver
                              </Button>
                              {canDeleteBusquedas ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  aria-label="Eliminar búsqueda"
                                  onClick={() => handleDeleteBusqueda(item.id)}
                                  disabled={deletingBusquedaId === item.id}
                                >
                                  {deletingBusquedaId === item.id ? (
                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="mr-2 h-4 w-4" />
                                  )}
                                  Eliminar
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
      <DenueAdvancedSearchModal
        open={advancedModalOpen}
        onOpenChange={setAdvancedModalOpen}
        onApply={handleAdvancedApply}
        canApply={canRunBusquedas}
      />
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
