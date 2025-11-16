"use client"

import dynamic from "next/dynamic"
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Globe,
  ListChecks,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Target,
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
  listDenueBusquedas,
  listDenueResultados,
  type CreateDenueSearchPayload,
  type CreateDenueSearchResponse,
  type DenueBusquedaItem,
  type DenueResultadoItem,
} from "@/lib/prospeccion/denue-client";
import type { GoogleResultadoItem } from "@/lib/prospeccion/google-client";
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
import { cn } from "@/lib/utils";

const DEFAULT_CENTER = { lat: 19.432608, lng: -99.133209 };
const numberFormatter = new Intl.NumberFormat("es-MX");
const RADIUS_MIN = 100;
const RADIUS_MAX = 5_000;
const LIST_PAGE_SIZE = 250;
const MAP_RESULTS_LIMIT = 5000;

const ACTIONS = [
  { key: "email", label: "Enviar correo", icon: <Mail className="h-4 w-4" /> },
  { key: "whatsapp", label: "WhatsApp", icon: <Phone className="h-4 w-4" /> },
  { key: "letter", label: "Carta", icon: <ListChecks className="h-4 w-4" /> },
] as const;

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
  const [filterText, setFilterText] = useState("");
  const [onlyContactable, setOnlyContactable] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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

  const loadResultadosForBusqueda = useCallback(async (busquedaId: string) => {
      setIsLoadingResultados(true);
      try {
        const response = await listDenueResultados({
          busquedaId,
          limit: MAP_RESULTS_LIMIT,
          offset: 0,
        });
        setResultados(response.items ?? []);
        setResultadosPagination({ limit: LIST_PAGE_SIZE, offset: 0 });
        setSelectedIds(new Set());
        setActiveBusquedaId(busquedaId);
      } catch (error) {
        setFeedback({
          type: "error",
          message: error instanceof Error ? error.message : "No fue posible consultar los resultados.",
        });
      } finally {
        setIsLoadingResultados(false);
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
  const busquedaRadio = activeBusqueda?.radio_m ?? formValues.radio_m;

  const filteredResults = useMemo(() => {
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
      if (onlyContactable && !item.phone && !item.email && !item.website) {
        return false;
      }
      return true;
    });
  }, [filterText, onlyContactable, resultados]);

  const totalFiltered = filteredResults.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / resultadosPagination.limit));
  const currentPage = Math.min(
    totalPages - 1,
    Math.floor(resultadosPagination.offset / resultadosPagination.limit),
  );
  const pageOffset = currentPage * resultadosPagination.limit;

  useEffect(() => {
    const maxOffset = Math.max(0, (totalPages - 1) * resultadosPagination.limit);
    if (resultadosPagination.offset > maxOffset) {
      setResultadosPagination((prev) => ({ ...prev, offset: maxOffset }));
    }
  }, [resultadosPagination.offset, resultadosPagination.limit, totalPages]);

  const paginatedResults = useMemo(() => {
    const end = pageOffset + resultadosPagination.limit;
    return filteredResults.slice(pageOffset, end);
  }, [filteredResults, pageOffset, resultadosPagination.limit]);
  const pageStart = totalFiltered === 0 ? 0 : pageOffset + 1;
  const pageEnd =
    totalFiltered === 0 ? 0 : Math.min(pageOffset + resultadosPagination.limit, totalFiltered);
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

  const metrics = useMemo(() => {
    const total = resultados.length;
    const contactables = resultados.filter((item) => item.phone || item.email || item.website).length;
    return { total, contactables };
  }, [resultados]);

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

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Resultados" value={metrics.total} description="Registros almacenados" icon={<Search className="h-4 w-4" />} />
        <MetricCard
          title="Contactables"
          value={metrics.contactables}
          description="Con teléfono, correo o sitio"
          icon={<Phone className="h-4 w-4" />}
        />
        <MetricCard
          title="Radio aplicado"
          value={`${numberFormatter.format(busquedaRadio)} m`}
          description="Distancia desde el centro"
          icon={<MapPin className="h-4 w-4" />}
        />
      </div>

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

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-4 w-4" />
                Parámetros de búsqueda
              </CardTitle>
              <CardDescription>Define el centro, el radio y la estrategia antes de consultar Google.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="radius">Radio (m)</Label>
                  <span className="text-xs text-muted-foreground">{numberFormatter.format(formValues.radio_m)} m</span>
                </div>
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
                <Input
                  type="number"
                  min={RADIUS_MIN}
                  max={RADIUS_MAX}
                  value={formValues.radio_m}
                  onChange={(event) => updateFormValue("radio_m", Number(event.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Máximo permitido: {numberFormatter.format(RADIUS_MAX)} m ({numberFormatter.format(RADIUS_MAX / 1000)} km).
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
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
              </div>
              <div className="grid grid-cols-2 gap-4">
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
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button onClick={runBusqueda} disabled={isSearching}>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Búsquedas recientes</CardTitle>
              <CardDescription>Vuelve a cargar resultados anteriores o reutiliza sus parámetros.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoadingBusquedas ? (
                <p className="text-sm text-muted-foreground">Cargando historial…</p>
              ) : busquedas.length ? (
                busquedas.map((item) => (
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
                      <Button
                        size="sm"
                        variant={activeBusquedaId === item.id ? "secondary" : "outline"}
                        onClick={() => loadResultadosForBusqueda(item.id)}
                      >
                        Ver
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Radio {typeof item.radio_m === "number" ? numberFormatter.format(item.radio_m) : "-"} m · {item.total_encontrados ?? 0} registros
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Aún no hay capturas registradas.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="overflow-hidden">
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
              <CardContent className="p-0">
              <ProspeccionResultsMap
                center={{ lat: formValues.lat, lng: formValues.lng }}
                radius={formValues.radio_m}
                results={mapResults}
                highlightIds={selectedIds}
                onCenterChange={handleCenterChange}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Resultados almacenados</CardTitle>
                  <CardDescription className="space-y-0.5">
                    <span>
                      {isLoadingResultados
                        ? "Descargando datos…"
                        : `${numberFormatter.format(totalFiltered)} de ${numberFormatter.format(resultados.length)} coincidencias`}
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
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs font-normal">Filtrar texto</Label>
                  <Input
                    value={filterText}
                    onChange={(event) => setFilterText(event.target.value)}
                    placeholder="Nombre, actividad…"
                  />
                </div>
                <div className="flex items-center gap-2 rounded-lg border px-3">
                  <Checkbox
                    id="contactables"
                    checked={onlyContactable}
                    onCheckedChange={(value) => setOnlyContactable(Boolean(value))}
                  />
                  <Label htmlFor="contactables" className="text-xs">
                    Solo contactables
                  </Label>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectAllVisible(true)}
                    disabled={!paginatedResults.length}
                  >
                    Seleccionar visibles ({selectedVisibleCount})
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectAllVisible(false)}
                    disabled={!selectedIds.size}
                  >
                    Limpiar selección
                  </Button>
                </div>
                <p>
                  {numberFormatter.format(totalFiltered)} registros · página {currentPage + 1} de {totalPages}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
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
                              <p className="text-xs text-muted-foreground">Estrato: {item.estrato}</p>
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
        </div>
      </div>
    </div>
  );
}

type MetricCardProps = {
  title: string;
  value: string | number;
  description: string;
  icon: ReactNode;
};

function MetricCard({ title, value, description, icon }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold">{value}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-full border border-border/70 p-3 text-muted-foreground">{icon}</div>
      </CardContent>
    </Card>
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
