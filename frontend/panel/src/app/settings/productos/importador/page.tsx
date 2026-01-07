import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { ProductMetadataSchemesManager } from "@/components/settings/productos/importador-schemes-manager"
import { ProductMetadataImporterUploader } from "@/components/settings/productos/importador-importer"
import { fetchProductMetadataSchemes } from "@/app/settings/productos/importador/actions"

export const dynamic = "force-dynamic"

export default async function ImportadorPage() {
  const schemes = await fetchProductMetadataSchemes()
  return (
    <AppViewLayout title="Settings · Importador de productos">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Productos y servicios
          </p>
          <h1 className="text-2xl font-semibold">Importador guiado</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Configura esquemas personalizables para tus fraccionamientos y descarga plantillas CSV que
            luego podrás subir con los datos reales.
          </p>
        </header>
        <div className="space-y-6">
          <ProductMetadataSchemesManager initialSchemes={schemes} />
          <ProductMetadataImporterUploader initialSchemes={schemes} />
        </div>
      </div>
    </AppViewLayout>
  )
}
