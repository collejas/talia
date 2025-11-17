"use client"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

import { DenueBusquedaView } from "./denue-busqueda-view"

export default function DenueBusquedaClientPage() {
  return (
    <AppViewLayout title="Prospección · Denue búsqueda">
      <div className="px-4 pb-8 pt-4 md:px-6 lg:px-8">
        <DenueBusquedaView />
      </div>
    </AppViewLayout>
  )
}
