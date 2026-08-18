import type { Metadata } from "next"
import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"
import { TemplateEditorPage } from "../template-editor-page"

export const metadata: Metadata = { title: "Nueva plantilla · Prospección" }

export default async function NuevaPlantillaPage({ searchParams }: { searchParams: Promise<{ campana_id?: string }> }) {
  const params = await searchParams
  return <ProspeccionViewLayout title="Prospección · Nueva plantilla"><TemplateEditorPage initialCampaignId={params.campana_id} /></ProspeccionViewLayout>
}
