"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

import { TenantScopedSettings } from "@/app/settings/variables/components/tenant-variables-panel"

export function TenantVariablesDetailsPanel({ data }: { data: TenantScopedSettings | null }) {
  const config = data?.config ?? {}
  const detailKeys = Object.keys(config).filter((key) => key !== "features")

  if (!detailKeys.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Detalles adicionales</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No hay variables adicionales configuradas.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detalles de configuración</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue={detailKeys[0]} className="space-y-4">
          <TabsList className="grid w-fit grid-cols-2 gap-2">
            {detailKeys.map((key) => (
              <TabsTrigger key={key} value={key} className="data-[state=active]:bg-card">
                {key}
              </TabsTrigger>
            ))}
          </TabsList>
          {detailKeys.map((key) => (
            <TabsContent key={key} value={key}>
              <Textarea
                value={JSON.stringify(config[key], null, 2)}
                readOnly
                className="font-mono text-xs"
                rows={6}
              />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}
