import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

export const metadata: Metadata = {
  title: "Campañas · Prospección",
}

export default function CampanasPage() {
  return (
    <AppViewLayout title="Prospección · Campañas" contentClassName="px-4 lg:px-6">
      <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        Esta sección se llenará con las campañas y automatizaciones próximamente.
      </div>
    </AppViewLayout>
  )
}
