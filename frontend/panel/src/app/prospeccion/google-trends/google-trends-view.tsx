"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPinIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, XAxis, YAxis } from "recharts";

import { usePermissions } from "@/hooks/use-permissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { MASTER_TENANT_ID } from "@/lib/auth/master-tenant";
import {
  fetchGoogleTrendCountries,
  fetchGoogleTrends,
  type GoogleTrendsCountryItem,
  type GoogleTrendsResponse,
} from "@/lib/prospeccion/google-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const DEFAULT_KEYWORDS = [
  "IA de WhatsApp",
  "IA para WhatsApp",
  "IA para ventas",
  "asistente de IA",
  "CRM IA",
];

const PRESET_STORAGE_PREFIX = "google-trends-presets";
const CUSTOM_TIMEFRAME_VALUE = "__custom__";
const TIMEFRAME_OPTIONS = [
  { value: "now 1-H", label: "Última hora" },
  { value: "now 4-H", label: "Últimas 4 horas" },
  { value: "now 1-d", label: "Últimas 24 horas" },
  { value: "now 7-d", label: "Últimos 7 días" },
  { value: "today 1-m", label: "Últimos 30 días" },
  { value: "today 3-m", label: "Últimos 90 días" },
  { value: "today 4-m", label: "Últimos 4 meses" },
  { value: "today 6-m", label: "Últimos 6 meses" },
  { value: "today 12-m", label: "Últimos 12 meses" },
  { value: "today 5-y", label: "Últimos 5 años" },
  { value: "all", label: "Desde 2004 - presente" },
];
const SOURCE_OPTIONS = [
  { value: "", label: "Búsqueda web de Google" },
  { value: "images", label: "Búsqueda de imágenes" },
  { value: "news", label: "Búsqueda de noticias" },
  { value: "froogle", label: "Google Shopping" },
  { value: "youtube", label: "Búsqueda de YouTube" },
] as const;
const WEB_SOURCE_VALUE = "__web__";
const GLOBAL_LOCATION_LABEL = "GLOBAL - Todo el mundo";
const TERM_STYLES = [
  { color: "#4285F4", tone: "rgba(66,133,244,0.12)", shape: "circle" as const },
  { color: "#DB4437", tone: "rgba(219,68,55,0.12)", shape: "square" as const },
  { color: "#F4B400", tone: "rgba(244,180,0,0.18)", shape: "diamond" as const },
  { color: "#0F9D58", tone: "rgba(15,157,88,0.14)", shape: "triangle" as const },
  { color: "#A142F4", tone: "rgba(161,66,244,0.14)", shape: "pill" as const },
  { color: "#F09300", tone: "rgba(240,147,0,0.18)", shape: "circle" as const },
];

type TrendsPreset = {
  id: string;
  name: string;
  keywordsText: string;
  timeframe: string;
  geo: string;
  source: "" | "images" | "news" | "froogle" | "youtube";
  includeRegion: boolean;
  createdAt: string;
};

function escapeCsvValue(value: unknown): string {
  const text = String(value ?? "");
  if (!text.includes(",") && !text.includes('"') && !text.includes("\n")) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

function buildCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const headerRow = headers.map(escapeCsvValue).join(",");
  const bodyRows = rows.map((row) => row.map(escapeCsvValue).join(","));
  return [headerRow, ...bodyRows].join("\n");
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function termStyle(index: number) {
  return TERM_STYLES[index % TERM_STYLES.length];
}

function markerClass(shape: "circle" | "square" | "diamond" | "triangle" | "pill"): string {
  if (shape === "circle") return "size-2.5 rounded-full";
  if (shape === "square") return "size-2.5 rounded-[3px]";
  if (shape === "diamond") return "size-2.5 rotate-45 rounded-[2px]";
  if (shape === "triangle") return "size-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent";
  return "h-2.5 w-4 rounded-full";
}

function renderSvgMarker(
  shape: "circle" | "square" | "diamond" | "triangle" | "pill",
  color: string,
  x: number,
  y: number,
) {
  if (shape === "circle") return <circle cx={x} cy={y} r={4} fill={color} />;
  if (shape === "square") return <rect x={x - 4} y={y - 4} width={8} height={8} rx={1.5} fill={color} />;
  if (shape === "diamond") return <rect x={x - 4} y={y - 4} width={8} height={8} transform={`rotate(45 ${x} ${y})`} fill={color} />;
  if (shape === "triangle") return <path d={`M ${x} ${y - 5} L ${x - 5} ${y + 4} L ${x + 5} ${y + 4} Z`} fill={color} />;
  return <rect x={x - 6} y={y - 3} width={12} height={6} rx={3} fill={color} />;
}

export function GoogleTrendsView() {
  const { context, loading } = usePermissions();
  const isMobile = useIsMobile();
  const [keywordsText, setKeywordsText] = useState(DEFAULT_KEYWORDS.join("\n"));
  const [keywordDraft, setKeywordDraft] = useState("");
  const [editingKeywordIndex, setEditingKeywordIndex] = useState<number | null>(null);
  const [timeframe, setTimeframe] = useState("today 12-m");
  const [geo, setGeo] = useState("MX");
  const [source, setSource] = useState<"" | "images" | "news" | "froogle" | "youtube">("");
  const [geoInput, setGeoInput] = useState("MX");
  const [countryOptions, setCountryOptions] = useState<GoogleTrendsCountryItem[]>([]);
  const [isLoadingCountries, setIsLoadingCountries] = useState(false);
  const [includeRegion, setIncludeRegion] = useState(true);
  const [presets, setPresets] = useState<TrendsPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [selectedKeyword, setSelectedKeyword] = useState("");
  const [compactMode, setCompactMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GoogleTrendsResponse | null>(null);

  const isOwnerOrAdmin = context.es_owner || context.es_admin;
  const isAllowedTenant = context.organizacion_id === MASTER_TENANT_ID;
  const canUseModule = isOwnerOrAdmin && isAllowedTenant;
  const chartHeight = isMobile ? 240 : 320;
  const storageKey = useMemo(() => {
    const userId = context.usuario_id?.trim() || "anonymous";
    const orgId = context.organizacion_id?.trim() || "unknown-org";
    return `${PRESET_STORAGE_PREFIX}:${userId}:${orgId}`;
  }, [context.usuario_id, context.organizacion_id]);

  const parsedKeywords = useMemo(() => {
    const parts = keywordsText
      .split(/\n|,/g)
      .map((value) => value.trim())
      .filter(Boolean);
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const item of parts) {
      const key = item.toLocaleLowerCase("es-MX");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(item);
    }
    return unique;
  }, [keywordsText]);
  const selectedTimeframeValue = useMemo(() => {
    const hasOption = TIMEFRAME_OPTIONS.some((option) => option.value === timeframe);
    return hasOption ? timeframe : CUSTOM_TIMEFRAME_VALUE;
  }, [timeframe]);
  const selectedSourceValue = source === "" ? WEB_SOURCE_VALUE : source;
  const selectedSourceLabel = SOURCE_OPTIONS.find((item) => item.value === source)?.label ?? "Búsqueda web de Google";
  const timelineChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    for (let index = 0; index < (result?.keywords.length ?? 0); index += 1) {
      const keyword = result?.keywords[index];
      if (!keyword) continue;
      config[keyword] = {
        label: keyword,
        color: termStyle(index).color,
      };
    }
    return config;
  }, [result?.keywords]);

  const timelineData = useMemo(() => {
    if (!result) return [];
    return result.points.map((row) => {
      const item: Record<string, string | number | boolean> = {
        date: String(row.date ?? ""),
        dateShort: String(row.date ?? "").slice(0, 10),
      };
      for (const keyword of result.keywords) {
        const value = row[keyword];
        item[keyword] = typeof value === "number" ? value : Number(value ?? 0);
      }
      item.isPartial = Boolean(row.isPartial);
      return item;
    });
  }, [result]);

  const regionBarData = useMemo(() => {
    if (!result?.by_region.length || !result.keywords.length) return [];
    const targetKeyword = selectedKeyword || result.keywords[0];
    return result.by_region
      .map((row) => {
        const rawValue = row[targetKeyword];
        const numeric = typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0);
        return {
          region: String(row.region ?? "—"),
          value: Number.isFinite(numeric) ? numeric : 0,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [result, selectedKeyword]);

  const averageByKeyword = useMemo(() => {
    if (!result) return [];
    return result.keywords.map((keyword, index) => {
      const values = result.points
        .map((row) => {
          const value = row[keyword];
          return typeof value === "number" ? value : Number(value ?? 0);
        })
        .filter((value) => Number.isFinite(value));
      const avg = values.length ? Math.round(values.reduce((acc, val) => acc + val, 0) / values.length) : 0;
      return { keyword, avg, color: termStyle(index).color, shape: termStyle(index).shape };
    });
  }, [result]);

  const selectedRelated = useMemo(() => {
    if (!result?.related_queries || !selectedKeyword) {
      return { top: [], rising: [] } as {
        top: Array<{ query?: string; value?: number | string }>;
        rising: Array<{ query?: string; value?: number | string }>;
      };
    }
    const data = result.related_queries[selectedKeyword] ?? {};
    return {
      top: Array.isArray(data.top) ? data.top : [],
      rising: Array.isArray(data.rising) ? data.rising : [],
    };
  }, [result, selectedKeyword]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setPresets([]);
        return;
      }
      const parsed = JSON.parse(raw) as TrendsPreset[];
      if (!Array.isArray(parsed)) {
        setPresets([]);
        return;
      }
      setPresets(
        parsed.filter((preset) => {
          return (
            typeof preset?.id === "string" &&
            typeof preset?.name === "string" &&
            typeof preset?.keywordsText === "string"
          );
        }),
      );
    } catch {
      setPresets([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!result?.keywords.length) return;
    if (!selectedKeyword || !result.keywords.includes(selectedKeyword)) {
      setSelectedKeyword(result.keywords[0]);
    }
  }, [result?.keywords, selectedKeyword]);

  useEffect(() => {
    setCompactMode(isMobile);
  }, [isMobile]);

  useEffect(() => {
    if (!canUseModule) return;
    let active = true;
    setIsLoadingCountries(true);
    fetchGoogleTrendCountries()
      .then((response) => {
        if (!active) return;
        setCountryOptions(Array.isArray(response.items) ? response.items : []);
      })
      .catch(() => {
        if (!active) return;
        setCountryOptions([]);
      })
      .finally(() => {
        if (!active) return;
        setIsLoadingCountries(false);
      });
    return () => {
      active = false;
    };
  }, [canUseModule]);

  useEffect(() => {
    const code = geo.trim().toUpperCase();
    if (!code) {
      setGeoInput(GLOBAL_LOCATION_LABEL);
      return;
    }
    const country = countryOptions.find((item) => item.code === code);
    if (country) {
      setGeoInput(`${country.code} - ${country.name}`);
      return;
    }
    setGeoInput(code);
  }, [geo, countryOptions]);

  function persistPresets(nextPresets: TrendsPreset[]) {
    setPresets(nextPresets);
    window.localStorage.setItem(storageKey, JSON.stringify(nextPresets));
  }

  function overwriteKeywords(next: string[]) {
    setKeywordsText(next.join("\n"));
  }

  function addKeywordFromDraft() {
    const value = keywordDraft.trim();
    if (!value) return;
    if (parsedKeywords.length >= 5) {
      setError("Google Trends permite comparar hasta 5 frases por consulta.");
      return;
    }
    const exists = parsedKeywords.some((item) => item.toLocaleLowerCase("es-MX") === value.toLocaleLowerCase("es-MX"));
    if (exists) {
      setError("Esa frase ya está agregada.");
      return;
    }
    overwriteKeywords([...parsedKeywords, value]);
    setKeywordDraft("");
    setError(null);
  }

  function removeKeyword(index: number) {
    overwriteKeywords(parsedKeywords.filter((_, idx) => idx !== index));
    if (editingKeywordIndex === index) {
      setEditingKeywordIndex(null);
      setKeywordDraft("");
    }
  }

  function startEditKeyword(index: number) {
    setEditingKeywordIndex(index);
    setKeywordDraft(parsedKeywords[index] ?? "");
    setError(null);
  }

  function applyEditKeyword() {
    if (editingKeywordIndex === null) {
      addKeywordFromDraft();
      return;
    }
    const value = keywordDraft.trim();
    if (!value) {
      setError("La frase no puede estar vacía.");
      return;
    }
    const exists = parsedKeywords.some(
      (item, idx) => idx !== editingKeywordIndex && item.toLocaleLowerCase("es-MX") === value.toLocaleLowerCase("es-MX"),
    );
    if (exists) {
      setError("Esa frase ya está agregada.");
      return;
    }
    const next = [...parsedKeywords];
    next[editingKeywordIndex] = value;
    overwriteKeywords(next);
    setEditingKeywordIndex(null);
    setKeywordDraft("");
    setError(null);
  }

  function savePreset() {
    const name = presetName.trim();
    if (!name) {
      setError("Escribe un nombre para guardar el preset.");
      return;
    }
    const nextPreset: TrendsPreset = {
      id: crypto.randomUUID(),
      name,
      keywordsText,
      timeframe: timeframe.trim() || "today 12-m",
      geo: geo.trim().toUpperCase(),
      source,
      includeRegion,
      createdAt: new Date().toISOString(),
    };
    persistPresets([nextPreset, ...presets].slice(0, 20));
    setPresetName("");
    setSelectedPresetId(nextPreset.id);
    setError(null);
  }

  function applyPreset(presetId: string) {
    setSelectedPresetId(presetId);
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    setKeywordsText(preset.keywordsText);
    setTimeframe(preset.timeframe);
    setGeo(preset.geo);
    setSource(preset.source ?? "");
    setIncludeRegion(Boolean(preset.includeRegion));
    setError(null);
  }

  function deletePreset() {
    if (!selectedPresetId) return;
    const next = presets.filter((item) => item.id !== selectedPresetId);
    persistPresets(next);
    setSelectedPresetId("");
  }

  function exportTimelineCsv() {
    if (!result) return;
    const headers = ["date", ...result.keywords, "isPartial"];
    const rows = result.points.map((row) => [
      row.date ?? "",
      ...result.keywords.map((keyword) => row[keyword] ?? ""),
      row.isPartial ? "true" : "false",
    ]);
    const csv = buildCsv(headers, rows);
    downloadCsv(`google_trends_timeline_${Date.now()}.csv`, csv);
  }

  function exportRegionCsv() {
    if (!result) return;
    if (!result.by_region.length) {
      setError("Esta consulta no devolvió datos regionales. Prueba con un periodo menor o desactiva Incluir región.");
      return;
    }
    const headers = ["region", ...result.keywords];
    const rows = result.by_region.map((row) => [
      row.region ?? "",
      ...result.keywords.map((keyword) => row[keyword] ?? ""),
    ]);
    const csv = buildCsv(headers, rows);
    downloadCsv(`google_trends_region_${Date.now()}.csv`, csv);
  }

  async function handleSearch() {
    setError(null);
    if (!canUseModule) {
      setError("No tienes acceso a este módulo.");
      return;
    }
    if (!parsedKeywords.length) {
      setError("Ingresa al menos una frase de búsqueda.");
      return;
    }
    if (parsedKeywords.length > 5) {
      setError("Google Trends permite comparar hasta 5 frases por consulta.");
      return;
    }

    setIsLoading(true);
    try {
      const data = await fetchGoogleTrends({
        keywords: parsedKeywords,
        timeframe: timeframe.trim() || "today 12-m",
        geo: geo.trim().toUpperCase(),
        ...(source ? { source } : {}),
        include_region: includeRegion,
      });
      setResult(data);
    } catch (requestError) {
      const rawMessage = requestError instanceof Error ? requestError.message : "No se pudo consultar Google Trends.";
      if (rawMessage.includes("google_trends_rate_limited") || rawMessage.includes("429") || rawMessage.toLowerCase().includes("too many requests")) {
        setError("Google Trends está limitando consultas desde este servidor. Espera unos minutos y vuelve a intentar.");
        return;
      }
      if (rawMessage.includes("google_trends_empty_response") || rawMessage.includes("404")) {
        if (source === "news") {
          setError("No hay datos en Noticias para esas frases y periodo. Prueba frases más amplias o un periodo más corto.");
        } else {
          setError("No se encontraron datos para esta combinación de frases, ubicación, periodo y fuente.");
        }
      } else {
        setError(rawMessage);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6 [font-family:'Google_Sans',Roboto,Arial,sans-serif]">
      <Card className="rounded-2xl border-slate-200 bg-white shadow-none">
        <CardHeader>
          <CardTitle>Consulta Google Trends</CardTitle>
          <CardDescription>
            Módulo restringido a owner/admin del tenant maestro. Escribe frases de búsqueda y ejecuta la consulta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="keywords">Frases de búsqueda</Label>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-3 flex flex-wrap gap-2">
                {parsedKeywords.map((keyword, index) => {
                  const style = termStyle(index);
                  return (
                    <div
                      key={`${keyword}-${index}`}
                      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
                      style={{ borderColor: style.color, backgroundColor: style.tone }}
                    >
                      <span
                        className={`inline-block ${markerClass(style.shape)}`}
                        style={{
                          backgroundColor: style.shape === "triangle" ? "transparent" : style.color,
                          borderBottomColor: style.shape === "triangle" ? style.color : undefined,
                        }}
                      />
                      <span className="max-w-[180px] truncate">{keyword}</span>
                      <button
                        type="button"
                        className="text-slate-600 hover:text-slate-900"
                        onClick={() => startEditKeyword(index)}
                        aria-label={`Editar ${keyword}`}
                      >
                        <PencilIcon className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="text-slate-600 hover:text-red-600"
                        onClick={() => removeKeyword(index)}
                        aria-label={`Quitar ${keyword}`}
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="keywords"
                  className="min-w-[220px] flex-1"
                  value={keywordDraft}
                  onChange={(event) => setKeywordDraft(event.target.value)}
                  placeholder={editingKeywordIndex === null ? "Escribe frase y presiona Enter" : "Editando frase"}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      applyEditKeyword();
                    }
                    if (event.key === "Escape") {
                      setEditingKeywordIndex(null);
                      setKeywordDraft("");
                    }
                  }}
                />
                <Button type="button" variant="outline" size="icon" onClick={applyEditKeyword} aria-label="Agregar o guardar frase">
                  {editingKeywordIndex === null ? <PlusIcon className="size-4" /> : <PencilIcon className="size-4" />}
                </Button>
                {editingKeywordIndex !== null ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingKeywordIndex(null);
                      setKeywordDraft("");
                    }}
                  >
                    Cancelar edición
                  </Button>
                ) : null}
                <Badge variant="outline">{parsedKeywords.length}/5</Badge>
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
            <div className="space-y-2">
              <Label htmlFor="preset-name">Preset (guardado local por usuario)</Label>
              <Input
                id="preset-name"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder="Ej: Frases inmobiliarias MX"
              />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="secondary" onClick={savePreset}>
                Guardar preset
              </Button>
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={deletePreset} disabled={!selectedPresetId}>
                Eliminar preset
              </Button>
            </div>
          </div>
          {presets.length ? (
            <div className="space-y-2">
              <Label htmlFor="saved-preset">Presets guardados</Label>
              <select
                id="saved-preset"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={selectedPresetId}
                onChange={(event) => applyPreset(event.target.value)}
              >
                <option value="">Selecciona un preset</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[120px] space-y-1">
                <Label className="text-[11px] text-slate-500" htmlFor="geo">Ubicación</Label>
                <div className="relative">
                  <MapPinIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id="geo"
                    className="pl-8"
                    list="google-trends-country-options"
                    value={geoInput}
                    onChange={(event) => {
                      const raw = event.target.value;
                      setGeoInput(raw);
                      if (raw.trim().toLocaleLowerCase("es-MX") === GLOBAL_LOCATION_LABEL.toLocaleLowerCase("es-MX")) {
                        setGeo("");
                        return;
                      }
                      const exact = countryOptions.find(
                        (item) => `${item.code} - ${item.name}`.toLocaleLowerCase("es-MX") === raw.trim().toLocaleLowerCase("es-MX"),
                      );
                      if (exact) {
                        setGeo(exact.code);
                        return;
                      }
                      const byName = countryOptions.find(
                        (item) => item.name.toLocaleLowerCase("es-MX") === raw.trim().toLocaleLowerCase("es-MX"),
                      );
                      if (byName) {
                        setGeo(byName.code);
                        return;
                      }
                      const codeMatch = raw.trim().match(/^([A-Za-z]{2})\b/);
                      if (codeMatch) {
                        setGeo(codeMatch[1].toUpperCase());
                        return;
                      }
                      if (!raw.trim()) {
                        setGeo("");
                      }
                    }}
                    placeholder={isLoadingCountries ? "Cargando países..." : "MX - México"}
                  />
                </div>
                <datalist id="google-trends-country-options">
                  <option value={GLOBAL_LOCATION_LABEL} />
                  {countryOptions.map((item) => (
                    <option key={item.code} value={`${item.code} - ${item.name}`} />
                  ))}
                </datalist>
              </div>
              <div className="min-w-[150px] space-y-1">
                <Label className="text-[11px] text-slate-500" htmlFor="timeframe">Periodo</Label>
                <Select
                  value={selectedTimeframeValue}
                  onValueChange={(value) => {
                    if (value === CUSTOM_TIMEFRAME_VALUE) return;
                    setTimeframe(value);
                  }}
                >
                  <SelectTrigger id="timeframe" className="w-full">
                    <SelectValue placeholder="Selecciona periodo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEFRAME_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_TIMEFRAME_VALUE}>Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                {selectedTimeframeValue === CUSTOM_TIMEFRAME_VALUE ? (
                  <Input
                    value={timeframe}
                    onChange={(event) => setTimeframe(event.target.value)}
                    placeholder="Ej: today 12-m"
                  />
                ) : null}
              </div>
              <div className="min-w-[180px] space-y-1">
                <Label className="text-[11px] text-slate-500" htmlFor="trend-source">Fuente</Label>
                <Select
                  value={selectedSourceValue}
                  onValueChange={(value) => {
                    setSource(value === WEB_SOURCE_VALUE ? "" : (value as "images" | "news" | "froogle" | "youtube"));
                  }}
                >
                  <SelectTrigger id="trend-source" className="w-full">
                    <SelectValue placeholder="Selecciona fuente" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value || WEB_SOURCE_VALUE} value={option.value || WEB_SOURCE_VALUE}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Checkbox
                  id="include-region"
                  checked={includeRegion}
                  onCheckedChange={(checked) => setIncludeRegion(Boolean(checked))}
                />
                <Label className="text-xs text-slate-600" htmlFor="include-region">Incluir región</Label>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button onClick={handleSearch} disabled={isLoading || loading}>
              {isLoading ? "Consultando..." : "Consultar tendencias"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setCompactMode((prev) => !prev)}>
              {compactMode ? "Modo completo" : "Modo compacto"}
            </Button>
            <Badge variant={canUseModule ? "default" : "destructive"}>
              {canUseModule ? "Acceso autorizado" : "Acceso restringido"}
            </Badge>
            {isLoading && result ? <Badge variant="secondary">Actualizando…</Badge> : null}
            {context.organizacion_id ? (
              <Badge variant="outline">tenant: {context.organizacion_id}</Badge>
            ) : null}
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      {isLoading && !result ? (
        <Card className="rounded-2xl border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle>Cargando resultados</CardTitle>
            <CardDescription>Generando gráficas y tablas…</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-14 animate-pulse rounded-xl bg-slate-200/70" />
            <div className="grid gap-4 lg:[grid-template-columns:minmax(0,6fr)_minmax(0,1fr)]">
              <div className={`animate-pulse rounded-xl bg-slate-200/70`} style={{ height: chartHeight }} />
              <div className={`animate-pulse rounded-xl bg-slate-200/70`} style={{ height: chartHeight }} />
            </div>
            <div className="h-52 animate-pulse rounded-xl bg-slate-200/70" />
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <>
          <Card className="rounded-2xl border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle>Explora las tendencias de búsqueda</CardTitle>
              <CardDescription>Formato comparativo al estilo Google Trends para tus frases activas.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {result.keywords.map((keyword, index) => {
                  const value = result.latest[keyword];
                  const style = termStyle(index);
                  return (
                    <button
                      key={keyword}
                      type="button"
                      onClick={() => setSelectedKeyword(keyword)}
                      className="rounded-xl border p-4 text-left shadow-none transition"
                      style={{
                        backgroundColor: style.tone,
                        borderColor: selectedKeyword === keyword ? style.color : "rgba(148,163,184,0.25)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block ${markerClass(style.shape)}`}
                            style={{
                              backgroundColor: style.shape === "triangle" ? "transparent" : style.color,
                              borderBottomColor: style.shape === "triangle" ? style.color : undefined,
                            }}
                          />
                          <p className="font-medium">{keyword}</p>
                        </div>
                        <Badge variant="secondary">{value ?? "N/D"}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Término de búsqueda</p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle>Comparativo de interés</CardTitle>
              <CardDescription>{result.geo || "GLOBAL"} · {result.timeframe} · {selectedSourceLabel}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={exportTimelineCsv}>
                  Exportar serie CSV
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={exportRegionCsv}
                  disabled={!result}
                >
                  Exportar regiones CSV
                </Button>
                <Badge variant={result.by_region.length ? "secondary" : "outline"}>
                  {result.by_region.length ? `${result.by_region.length} regiones` : "Sin datos regionales"}
                </Badge>
              </div>
              <div className="grid gap-4 lg:[grid-template-columns:minmax(0,6fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-slate-700">Interés a lo largo del tiempo</p>
                  <ChartContainer config={timelineChartConfig} className="!aspect-auto w-full" style={{ height: chartHeight }}>
                    <LineChart data={timelineData}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="dateShort" tickLine={false} axisLine={false} minTickGap={20} />
                      <YAxis tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      {result.keywords.map((keyword, index) => (
                        <Line
                          key={keyword}
                          type="monotone"
                          dataKey={keyword}
                          stroke={termStyle(index).color}
                          strokeWidth={2.6}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      ))}
                    </LineChart>
                  </ChartContainer>
                </div>
                <div className="min-w-0 overflow-hidden space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-slate-700">Interés promedio</p>
                  <ChartContainer
                    config={{ avg: { label: "Interés promedio", color: "#4285F4" } }}
                    className="!aspect-auto w-full"
                    style={{ height: chartHeight }}
                  >
                    <BarChart
                      data={averageByKeyword}
                      barCategoryGap="0%"
                      barGap={0}
                      margin={{ left: 0, right: 8, top: 2, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="keyword"
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        height={28}
                        tick={(props) => {
                          const { x, y, payload } = props;
                          const item = averageByKeyword.find((entry) => entry.keyword === payload?.value);
                          if (!item) return <g />;
                          return <g>{renderSvgMarker(item.shape, item.color, Number(x), Number(y) + 8)}</g>;
                        }}
                      />
                      <YAxis tickLine={false} axisLine={false} width={20} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="avg" radius={6} barSize={26}>
                        {averageByKeyword.map((entry, idx) => (
                          <Cell key={`avg-cell-${idx}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle>Últimos valores</CardTitle>
              <CardDescription>
                Consulta generada: {new Date(result.generated_at).toLocaleString("es-MX")} | {result.geo || "GLOBAL"} |{" "}
                {result.timeframe} | {selectedSourceLabel}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {result.keywords.map((keyword) => (
                  <Badge key={keyword} variant="secondary">
                    {keyword}: {result.latest[keyword] ?? "N/D"}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {!compactMode ? (
          <Card className="rounded-2xl border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle>Serie temporal</CardTitle>
              <CardDescription>{result.points.length} registros</CardDescription>
            </CardHeader>
            <CardContent>
              <div className={`${isMobile ? "max-h-[260px]" : "max-h-[420px]"} overflow-auto rounded-md border border-slate-200 bg-white`}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      {result.keywords.map((keyword) => (
                        <TableHead key={keyword}>{keyword}</TableHead>
                      ))}
                      <TableHead>Parcial</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.points.map((row, index) => (
                      <TableRow key={`${row.date}-${index}`}>
                        <TableCell>{row.date}</TableCell>
                        {result.keywords.map((keyword) => (
                          <TableCell key={`${row.date}-${keyword}`}>{String(row[keyword] ?? "—")}</TableCell>
                        ))}
                        <TableCell>{row.isPartial ? "Sí" : "No"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          ) : null}

          {result.by_region.length && !compactMode ? (
            <Card className="rounded-2xl border-slate-200 bg-white shadow-none">
              <CardHeader>
                <CardTitle>Interés por región</CardTitle>
                <CardDescription>{result.by_region.length} filas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`${isMobile ? "max-h-[240px]" : "max-h-[360px]"} overflow-auto rounded-md border border-slate-200 bg-white`}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Región</TableHead>
                        {result.keywords.map((keyword) => (
                          <TableHead key={keyword}>{keyword}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.by_region.map((row, index) => (
                        <TableRow key={`${row.region ?? "region"}-${index}`}>
                          <TableCell>{String(row.region ?? "—")}</TableCell>
                          {result.keywords.map((keyword) => (
                            <TableCell key={`${index}-${keyword}`}>{String(row[keyword] ?? "—")}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="rounded-2xl border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle>Búsquedas frecuentes</CardTitle>
              <CardDescription>
                {selectedKeyword ? `Relacionadas con "${selectedKeyword}"` : "Selecciona una frase"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {result.keywords.map((keyword) => (
                  <Button
                    key={keyword}
                    type="button"
                    size="sm"
                    variant={selectedKeyword === keyword ? "default" : "outline"}
                    onClick={() => setSelectedKeyword(keyword)}
                  >
                    {keyword}
                  </Button>
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="mb-2 text-sm font-medium">Búsquedas más frecuentes</p>
                  <div className="space-y-2">
                    {selectedRelated.top.length ? (
                      selectedRelated.top.map((item, index) => (
                        <div key={`${item.query}-${index}`} className="flex items-center justify-between text-sm">
                          <span>{item.query ?? "—"}</span>
                          <Badge variant="secondary">{String(item.value ?? "—")}</Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Sin datos para esta frase.</p>
                    )}
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="mb-2 text-sm font-medium">Búsquedas en aumento</p>
                  <div className="space-y-2">
                    {selectedRelated.rising.length ? (
                      selectedRelated.rising.map((item, index) => (
                        <div key={`${item.query}-${index}`} className="flex items-center justify-between text-sm">
                          <span>{item.query ?? "—"}</span>
                          <Badge variant="secondary">{String(item.value ?? "—")}</Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Sin datos para esta frase.</p>
                    )}
                  </div>
                </div>
              </div>
              {regionBarData.length ? (
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="mb-2 text-sm font-medium">Top regiones ({selectedKeyword || result.keywords[0]})</p>
                  <ChartContainer config={{ value: { label: "Interés", color: "hsl(var(--chart-1))" } }} className="h-[260px] w-full">
                    <BarChart data={regionBarData} layout="vertical" margin={{ left: 12, right: 12 }}>
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                      <XAxis type="number" tickLine={false} axisLine={false} />
                      <YAxis dataKey="region" type="category" width={120} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="value" fill="var(--color-value)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
