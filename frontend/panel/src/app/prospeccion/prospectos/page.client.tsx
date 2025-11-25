"use client"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

import { ProspectosView } from "./prospectos-view"

/**
 * Client entrypoint for the prospect management view inside Prospección.
 */
export default function ProspectosClientPage() {
  return (
    <AppViewLayout title="Prospección · Prospectos">
      <div className="px-4 pb-8 pt-4 md:px-6 lg:px-8">
        <ProspectosView />
      </div>
    </AppViewLayout>
  )
}

