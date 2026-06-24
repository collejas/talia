import type { CatalogPipelineRow } from "@/app/dashboard/catalog-analytics"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

type CatalogPipelineCardProps = {
  data: CatalogPipelineRow[]
  className?: string
}

type PipelineEntry = {
  name: string
  etapa: string
  monto: number
  moneda: string
  leads: number
}

export function CatalogPipelineCard({ data, className }: CatalogPipelineCardProps) {
  const rows = summarizePipeline(data).slice(0, 6)
  const empty = rows.length === 0

  return (
    <Card className={cn("@container/card", className)}>
      <CardHeader>
        <CardTitle>Embudo por producto</CardTitle>
        <CardDescription>
          Productos con leads abiertos y monto estimado (última cotización)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-sm text-muted-foreground">Aún no hay leads con cotizaciones activas.</p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead className="text-right">Monto estimado</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={`${row.name}-${row.etapa}-${index}-${row.monto}-${row.leads}`}>
                    <TableCell className="font-medium text-foreground">{row.name}</TableCell>
                    <TableCell>{row.etapa}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(row.monto, row.moneda)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{row.leads}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function summarizePipeline(rows: CatalogPipelineRow[]): PipelineEntry[] {
  return rows
    .map((row) => {
      const name = row.item_nombre?.trim() || "Sin nombre"
      const etapa = "Etapa"
      const monto = Number(row.monto_estimado ?? 0)
      const leads = Number(row.leads_con_cotizacion ?? 0)
      return {
        name,
        etapa,
        monto: Number.isFinite(monto) ? monto : 0,
        moneda: (row.moneda || "MXN").toUpperCase(),
        leads: Number.isFinite(leads) ? leads : 0,
      }
    })
    .filter((row) => row.monto > 0 || row.leads > 0)
    .sort((a, b) => b.monto - a.monto)
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(0)}`
  }
}
