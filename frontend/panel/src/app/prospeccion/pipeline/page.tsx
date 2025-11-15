import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

export const metadata: Metadata = {
  title: "Pipeline · Prospección",
}

export default function PipelinePage() {
  return <AppViewLayout title="Prospección · Pipeline" />
}
