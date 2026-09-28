"use client"

import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"
import { ProspeccionSearchWorkspace } from "@/components/prospeccion/prospeccion-search-workspace"

import { GoogleBusquedaView } from "./google-busqueda-view"

export default function GoogleBusquedaClientPage() {
  return (
    <ProspeccionViewLayout title="Prospección · Google busqueda">
      <ProspeccionSearchWorkspace activeSource="google" />
      <GoogleBusquedaView />
    </ProspeccionViewLayout>
  )
}
