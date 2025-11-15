import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

export const metadata: Metadata = {
  title: "Pipeline · Prospección",
}

export default function PipelinePage() {
  return (
    <AppViewLayout title="Prospección · Pipeline" contentClassName="px-4 lg:px-6">
      <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        Esta vista todavía no tiene contenido. Aquí podrás construir el pipeline de prospección.
      </div>
    </AppViewLayout>
  )
}
