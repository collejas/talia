"use client";

import { useMemo, useState } from "react";

import { usePermissions } from "@/hooks/use-permissions";
import { fetchGoogleTrends, type GoogleTrendsResponse } from "@/lib/prospeccion/google-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export function GoogleTrendsView() {
  const { context, loading } = usePermissions();
  const [keywordsText, setKeywordsText] = useState(DEFAULT_KEYWORDS.join("\n"));
  const [timeframe, setTimeframe] = useState("today 12-m");
  const [geo, setGeo] = useState("MX");
  const [includeRegion, setIncludeRegion] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GoogleTrendsResponse | null>(null);

  const isOwnerOrAdmin = context.es_owner || context.es_admin;
  const isAllowedTenant = context.organizacion_id === ALLOWED_TENANT_ID;
  const canUseModule = isOwnerOrAdmin && isAllowedTenant;

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
