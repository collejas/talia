import type { Metadata } from "next"

import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"

import ProspeccionMetricasPageClient from "./page.client"

export const metadata: Metadata = {
  title: "Métricas · Prospección",
}

export default function ProspeccionMetricasPage() {
  return (
    <ProspeccionViewLayout title="Prospección · Métricas">
      <ProspeccionMetricasPageClient />
    </ProspeccionViewLayout>
  )
}
