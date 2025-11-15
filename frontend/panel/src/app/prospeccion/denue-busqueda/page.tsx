import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

export const metadata: Metadata = {
  title: "Denue busqueda · Prospección",
}

export default function DenueBusquedaPage() {
  return <AppViewLayout title="Prospección · Denue busqueda" />
}
