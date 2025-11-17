"use client"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

import { GoogleBusquedaView } from "./google-busqueda-view"

export default function GoogleBusquedaClientPage() {
  return (
    <AppViewLayout title="Prospección · Google busqueda">
      <div className="px-4 pb-8 pt-4 md:px-6 lg:px-8">
        <GoogleBusquedaView />
      </div>
    </AppViewLayout>
  )
}
