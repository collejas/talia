import type { Metadata } from "next"

import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"

export const metadata: Metadata = {
  title: "Pipeline · Prospección",
}

export default function PipelinePage() {
  return (
    <ProspeccionViewLayout title="Prospección · Pipeline">
      <p className="text-sm text-muted-foreground">
        Próximamente podrás visualizar aquí el avance de los prospectos promovidos a pipeline.
      </p>
    </ProspeccionViewLayout>
  )
}
