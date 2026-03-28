"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { usePermissions } from "@/hooks/use-permissions";
import { fetchGoogleTrends, type GoogleTrendsResponse } from "@/lib/prospeccion/google-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const ALLOWED_TENANT_ID = "00000000-0000-0000-0000-000000000001";

const DEFAULT_KEYWORDS = [
  "IA de WhatsApp",
  "IA para WhatsApp",
  "IA para ventas",
  "asistente de IA",
  "CRM IA",
];

const PRESET_STORAGE_PREFIX = "google-trends-presets";
const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

type TrendsPreset = {
  id: string;
  name: string;
  keywordsText: string;
  timeframe: string;
  geo: string;
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

export function GoogleTrendsView() {
  const { context, loading } = usePermissions();
  const [keywordsText, setKeywordsText] = useState(DEFAULT_KEYWORDS.join("\n"));
  const [timeframe, setTimeframe] = useState("today 12-m");
  const [geo, setGeo] = useState("MX");
  const [includeRegion, setIncludeRegion] = useState(true);
  const [presets, setPresets] = useState<TrendsPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GoogleTrendsResponse | null>(null);

  const isOwnerOrAdmin = context.es_owner || context.es_admin;
  const isAllowedTenant = context.organizacion_id === ALLOWED_TENANT_ID;
  const canUseModule = isOwnerOrAdmin && isAllowedTenant;
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

  const timelineChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    for (let index = 0; index < (result?.keywords.length ?? 0); index += 1) {
      const keyword = result?.keywords[index];
      if (!keyword) continue;
      config[keyword] = {
        label: keyword,
        color: CHART_COLORS[index % CHART_COLORS.length],
      };
    }
    return config;
  }, [result?.keywords]);

  const regionBarData = useMemo(() => {
    if (!result?.by_region.length || !result.keywords.length) return [];
    const firstKeyword = result.keywords[0];
    return result.by_region
      .map((row) => {
        const rawValue = row[firstKeyword];
        const numeric = typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0);
        return {
          region: String(row.region ?? "—"),
          value: Number.isFinite(numeric) ? numeric : 0,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [result]);

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

  function persistPresets(nextPresets: TrendsPreset[]) {
    setPresets(nextPresets);
    window.localStorage.setItem(storageKey, JSON.stringify(nextPresets));
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
      geo: geo.trim().toUpperCase() || "MX",
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
    if (!result?.by_region.length) return;
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
        geo: geo.trim().toUpperCase() || "MX",
        include_region: includeRegion,
      });
      setResult(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo consultar Google Trends.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Consulta Google Trends</CardTitle>
          <CardDescription>
            Módulo restringido a owner/admin del tenant maestro. Escribe frases de búsqueda y ejecuta la consulta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="keywords">Frases de búsqueda</Label>
            <Textarea
              id="keywords"
              rows={5}
              value={keywordsText}
              onChange={(event) => setKeywordsText(event.target.value)}
              placeholder="Una frase por línea (máximo 5)"
            />
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
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="timeframe">Timeframe</Label>
              <Input
                id="timeframe"
                value={timeframe}
                onChange={(event) => setTimeframe(event.target.value)}
                placeholder="today 12-m"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="geo">País/Región</Label>
              <Input id="geo" value={geo} onChange={(event) => setGeo(event.target.value)} placeholder="MX" />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Checkbox
                id="include-region"
                checked={includeRegion}
                onCheckedChange={(checked) => setIncludeRegion(Boolean(checked))}
              />
              <Label htmlFor="include-region">Incluir interés por región</Label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSearch} disabled={isLoading || loading}>
              {isLoading ? "Consultando..." : "Consultar tendencias"}
            </Button>
            <Badge variant={canUseModule ? "default" : "destructive"}>
              {canUseModule ? "Acceso autorizado" : "Acceso restringido"}
            </Badge>
            {context.organizacion_id ? (
              <Badge variant="outline">tenant: {context.organizacion_id}</Badge>
            ) : null}
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      {result ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Gráficas</CardTitle>
              <CardDescription>Visualización rápida de tendencia temporal y top de regiones.</CardDescription>
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
                  disabled={!result.by_region.length}
                >
                  Exportar regiones CSV
                </Button>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartContainer config={timelineChartConfig} className="h-[320px] w-full">
                  <LineChart data={result.points}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    {result.keywords.map((keyword, index) => (
                      <Line
                        key={keyword}
                        type="monotone"
                        dataKey={keyword}
                        stroke={CHART_COLORS[index % CHART_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
                <ChartContainer config={{ value: { label: "Interés", color: "hsl(var(--chart-1))" } }} className="h-[320px] w-full">
                  <BarChart data={regionBarData} layout="vertical" margin={{ left: 12, right: 12 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis type="number" tickLine={false} axisLine={false} />
                    <YAxis dataKey="region" type="category" width={120} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" fill="var(--color-value)" radius={4} />
                  </BarChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Últimos valores</CardTitle>
              <CardDescription>
                Consulta generada: {new Date(result.generated_at).toLocaleString("es-MX")} | {result.geo} |{" "}
                {result.timeframe}
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

          <Card>
            <CardHeader>
              <CardTitle>Serie temporal</CardTitle>
              <CardDescription>{result.points.length} registros</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[420px] overflow-auto rounded-md border">
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

          {result.by_region.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Interés por región</CardTitle>
                <CardDescription>{result.by_region.length} filas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[360px] overflow-auto rounded-md border">
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
        </>
      ) : null}
    </div>
  );
}
