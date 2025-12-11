import type { Metadata } from "next"

import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"

import { CampanasMetricsClient } from "./page.client"

export const metadata: Metadata = {
  title: "Campañas · Prospección",
}

export default function CampanasPage() {
  return (
    <ProspeccionViewLayout title="Prospección · Campañas">
      <CampanasMetricsClient />
    </ProspeccionViewLayout>
  )
}
