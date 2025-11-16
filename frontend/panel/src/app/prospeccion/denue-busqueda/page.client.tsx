"use client"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

import { DenueBusquedaView } from "./denue-busqueda-view"

export default function DenueBusquedaClientPage() {
  return (
    <AppViewLayout title="Prospección · Denue búsqueda">
      <DenueBusquedaView />
    </AppViewLayout>
  )
}
