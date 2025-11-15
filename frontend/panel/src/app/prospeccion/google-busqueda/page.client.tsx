"use client"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

import { GoogleBusquedaView } from "./google-busqueda-view"

export default function GoogleBusquedaClientPage() {
  return (
    <AppViewLayout title="Prospección · Google busqueda">
      <GoogleBusquedaView />
    </AppViewLayout>
  )
}
