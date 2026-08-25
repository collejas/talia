"use client"

import { IconDownload, IconFileSpreadsheet } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

export function CatalogDownloadActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" size="sm" asChild>
        <a href="/api/settings/productos/template.csv" download>
          <IconFileSpreadsheet className="mr-2 h-4 w-4" />
          Descargar plantilla
        </a>
      </Button>
      <Button variant="secondary" size="sm" asChild>
        <a href="/api/settings/productos/export.csv" download>
          <IconDownload className="mr-2 h-4 w-4" />
          Descargar productos
        </a>
      </Button>
    </div>
  )
}
