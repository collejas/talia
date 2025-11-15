import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

export const metadata: Metadata = {
  title: "Google busqueda · Prospección",
}

export default function GoogleBusquedaPage() {
  return <AppViewLayout title="Prospección · Google busqueda" />
}
