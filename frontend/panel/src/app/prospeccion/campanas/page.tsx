import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

import { CampanasMetricsClient } from "./page.client"

export const metadata: Metadata = {
  title: "Campañas · Prospección",
}

export default function CampanasPage() {
  return (
    <AppViewLayout title="Prospección · Campañas">
      <div className="px-4 pb-10 pt-4 md:px-6 lg:px-8">
        <CampanasMetricsClient />
      </div>
    </AppViewLayout>
  )
}
