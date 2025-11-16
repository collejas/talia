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
  Star,
  Target,
} from "lucide-react";

const GoogleResultsMap = dynamic(() => import("./google-results-map").then((mod) => mod.GoogleResultsMap), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full rounded-xl bg-muted" />,
});
import {
  createGoogleBusqueda,
  listGoogleBusquedas,
  listGoogleResultados,
  type CreateGoogleSearchPayload,
  type GoogleBusquedaItem,
  type GoogleResultadoItem,
  type GoogleSearchStrategy,
} from "@/lib/prospeccion/google-client";
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

const DEFAULT_CENTER = { lat: 19.432608, lng: -99.133209 };
const numberFormatter = new Intl.NumberFormat("es-MX");
const RADIUS_MIN = 100;
const RADIUS_MAX = 10_000;
const DEFAULT_TYPES = "restaurant,store";

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
  max_results: number;
  language_code: string;
  region_code: string;
};

type FeedbackState = {
  type: "success" | "error" | "info";
  message: string;
} | null;

export function GoogleBusquedaView() {
  const [formValues, setFormValues] = useState<FormValues>({
    strategy: "nearby",
    query: "",
    includedTypesText: DEFAULT_TYPES,
    radio_m: 1500,
    lat: DEFAULT_CENTER.lat,
    lng: DEFAULT_CENTER.lng,
    max_results: 40,
    language_code: "es",
    region_code: "MX",
  });
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [busquedas, setBusquedas] = useState<GoogleBusquedaItem[]>([]);
  const [isLoadingBusquedas, setIsLoadingBusquedas] = useState(true);
  const [activeBusquedaId, setActiveBusquedaId] = useState<string | null>(null);
  const [resultados, setResultados] = useState<GoogleResultadoItem[]>([]);
  const [isLoadingResultados, setIsLoadingResultados] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [minRatingFilter, setMinRatingFilter] = useState(0);
  const [onlyContactable, setOnlyContactable] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const updateFormValue = useCallback(<K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const loadBusquedas = useCallback(async () => {
    setIsLoadingBusquedas(true);
    try {
      const response = await listGoogleBusquedas({ limit: 8 });
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
      const response = await listGoogleResultados({ busquedaId, limit: 250 });
      setResultados(response.items ?? []);
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
      if (minRatingFilter > 0 && typeof item.rating === "number") {
        if (item.rating < minRatingFilter) {
          return false;
        }
      } else if (minRatingFilter > 0 && typeof item.rating !== "number") {
        return false;
      }
      if (onlyContactable && !item.phone && !item.email && !item.website) {
        return false;
      }
      return true;
    });
  }, [filterText, minRatingFilter, onlyContactable, resultados]);

  const metrics = useMemo(() => {
    if (!resultados.length) {
      return { total: 0, contactables: 0, averageRating: 0 };
    }
    const contactables = resultados.filter((item) => item.phone || item.email || item.website).length;
    const ratings = resultados
      .map((item) => (typeof item.rating === "number" ? item.rating : null))
      .filter((value): value is number => value !== null);
    const averageRating = ratings.length
      ? ratings.reduce((acc, value) => acc + value, 0) / ratings.length
      : 0;
    return { total: resultados.length, contactables, averageRating };
  }, [resultados]);

  const selectedVisibleCount = useMemo(() => {
    if (!selectedIds.size) return 0;
    let count = 0;
    for (const item of filteredResults) {
      if (selectedIds.has(item.resultado_id)) {
        count += 1;
      }
    }
    return count;
  }, [filteredResults, selectedIds]);

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
        for (const item of filteredResults) {
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
    [filteredResults],
  );

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
      max_results: formValues.max_results,
      language_code: formValues.language_code || undefined,
      region_code: formValues.region_code || undefined,
      meta: {
        source: "panel",
      },
    };

    setIsSearching(true);
    try {
      const response = await createGoogleBusqueda(payload);
      setFeedback({
        type: "success",
        message: `Se guardaron ${response.upserted} resultados desde Google Places (${response.google_results} encontrados).`,
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
          title="Promedio de rating"
          value={metrics.averageRating ? metrics.averageRating.toFixed(1) : "-"}
          description="Solo negocios con reseñas"
          icon={<Star className="h-4 w-4" />}
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
                <Label htmlFor="strategy">Estrategia</Label>
                <Select
                  value={formValues.strategy}
                  onValueChange={(value) => updateFormValue("strategy", value as GoogleSearchStrategy)}
                >
                  <SelectTrigger id="strategy">
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nearby">Nearby (por clasificación)</SelectItem>
                    <SelectItem value="text">Text Search (por frase)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="query">Texto a buscar</Label>
                <Input
                  id="query"
                  placeholder="Ej. cafeterías con terraza"
                  value={formValues.query}
                  onChange={(event) => updateFormValue("query", event.target.value)}
                  disabled={formValues.strategy !== "text"}
                />
                <p className="text-xs text-muted-foreground">
                  Solo se usa cuando seleccionas la estrategia Text Search.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="types">Clasificaciones (coma)</Label>
                <Input
                  id="types"
                  placeholder="restaurant,store"
                  value={formValues.includedTypesText}
                  onChange={(event) => updateFormValue("includedTypesText", event.target.value)}
                  disabled={formValues.strategy !== "nearby"}
                />
                <p className="text-xs text-muted-foreground">
                  Usa los valores aceptados por Google Places, p. ej. <code className="font-mono">restaurant</code>, <code className="font-mono">atm</code>, <code className="font-mono">pharmacy</code>.
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
                  Máximo permitido: {numberFormatter.format(RADIUS_MAX)} m (10 km).
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
                  <Label htmlFor="language_code">Idioma</Label>
                  <Input
                    id="language_code"
                    value={formValues.language_code}
                    onChange={(event) => updateFormValue("language_code", event.target.value)}
                    placeholder="es"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="region_code">Región</Label>
                  <Input
                    id="region_code"
                    value={formValues.region_code}
                    onChange={(event) => updateFormValue("region_code", event.target.value)}
                    placeholder="MX"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_results">Máximo de resultados</Label>
                <Input
                  id="max_results"
                  type="number"
                  min={1}
                  max={1000}
                  value={formValues.max_results}
                  onChange={(event) => updateFormValue("max_results", Number(event.target.value))}
                />
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
                    updateFormValue("includedTypesText", DEFAULT_TYPES);
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
              <GoogleResultsMap
                center={{ lat: formValues.lat, lng: formValues.lng }}
                radius={formValues.radio_m}
                results={filteredResults}
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
                  <CardDescription>
                    {isLoadingResultados
                      ? "Descargando datos…"
                      : `${filteredResults.length} de ${resultados.length} coincidencias`}
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
                <div className="space-y-1">
                  <Label className="text-xs font-normal">Rating mínimo</Label>
                  <Select value={String(minRatingFilter)} onValueChange={(value) => setMinRatingFilter(Number(value))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Todos</SelectItem>
                      <SelectItem value="3">3+</SelectItem>
                      <SelectItem value="4">4+</SelectItem>
                      <SelectItem value="4.5">4.5+</SelectItem>
                    </SelectContent>
                  </Select>
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
                    disabled={!filteredResults.length}
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
                <p>{selectedIds.size} prospectos seleccionados</p>
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
                  filteredResults.map((item) => {
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
