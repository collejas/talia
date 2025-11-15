import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

export const metadata: Metadata = {
  title: "Campañas · Prospección",
}

export default function CampanasPage() {
  return <AppViewLayout title="Prospección · Campañas" />
}
