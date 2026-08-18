import type { Metadata } from "next"
import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"
import { TemplateEditorPage } from "../../template-editor-page"

export const metadata: Metadata = { title: "Editar plantilla · Prospección" }

export default async function EditarPlantillaPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>
  searchParams: Promise<{ campana_id?: string }>
}) {
  const routeParams = await params
  const queryParams = await searchParams
  return (
    <ProspeccionViewLayout title="Prospección · Editar plantilla">
      <TemplateEditorPage templateId={routeParams.templateId} initialCampaignId={queryParams.campana_id} />
    </ProspeccionViewLayout>
  )
}
