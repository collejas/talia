import { AppViewLayout } from '@/components/layouts/app-view-layout'
import { ChartAreaInteractive } from '@/components/chart-area-interactive'
import { DataTable } from '@/components/data-table'
import { SectionCards } from '@/components/section-cards'

import data from "./data.json"

export default function Page() {
  return (
    <AppViewLayout title="Vista 2">
      <SectionCards />
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive />
      </div>
      <DataTable data={data} />
    </AppViewLayout>
  )
}
