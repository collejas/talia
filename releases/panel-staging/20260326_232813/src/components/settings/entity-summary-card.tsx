"use client"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type EntitySchemaField = {
  name: string
  type: string
  required: boolean
  notes?: string
}

export type EntityRelation = {
  title: string
  detail: string
}

export type EntitySchema = {
  title: string
  description: string
  tenantField: string
  highlight?: string
  actionLabel?: string
  fields: EntitySchemaField[]
  relations: EntityRelation[]
  operations: string[]
}

export function EntitySummaryCard({ schema }: { schema: EntitySchema }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            {schema.title}{" "}
            {schema.highlight ? (
              <Badge variant="secondary" className="text-[0.6rem] font-semibold">
                {schema.highlight}
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>{schema.description}</CardDescription>
          <p className="mt-1 text-xs text-muted-foreground">
            Controla todos los registros pertenecientes a cada organización a través de{" "}
            <span className="font-semibold">{schema.tenantField}</span>.
          </p>
        </div>
        <CardAction>
          <Button size="sm" variant="outline">
            {schema.actionLabel ?? "Nuevo registro"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6 pt-2">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Columnas clave</p>
                <p className="text-xs text-muted-foreground">
                  Cada fila se valida para pertenecer a la misma organización y mantener la integridad.
                </p>
              </div>
              <Badge variant="outline" className="text-[0.6rem]">
                Multitenant
              </Badge>
            </div>
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Campo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Requerido</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schema.fields.map((field) => (
                  <TableRow key={field.name}>
                    <TableCell className="font-medium">{field.name}</TableCell>
                    <TableCell className="capitalize">{field.type}</TableCell>
                    <TableCell>{field.required ? "Sí" : "No"}</TableCell>
                    <TableCell className="text-[0.7rem] text-muted-foreground">
                      {field.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
          <aside className="space-y-5">
            <div className="rounded-2xl border border-border/70 bg-background/60 p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Relaciones
              </p>
              <ul className="mt-3 space-y-2 text-foreground">
                {schema.relations.map((relation) => (
                  <li key={relation.title} className="text-[0.8rem]">
                    <span className="font-semibold">{relation.title}:</span>{" "}
                    <span className="text-muted-foreground">{relation.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div
              className={cn(
                "rounded-2xl border border-border/60 bg-background/60 p-4 text-sm",
                schema.operations.length ? "space-y-3" : "flex items-center justify-center"
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Operaciones
              </p>
              <div className="flex flex-wrap gap-2">
                {schema.operations.map((operation) => (
                  <Badge key={operation} variant="outline">
                    {operation}
                  </Badge>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </CardContent>
    </Card>
  )
}
