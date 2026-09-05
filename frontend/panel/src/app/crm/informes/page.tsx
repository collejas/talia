import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { RecoveryReport } from "@/components/crm/recovery-report"

export const dynamic = "force-dynamic"

export default function CrmReportsPage() {
  return (
    <AppViewLayout title="CRM · Informes">
      <RecoveryReport />
    </AppViewLayout>
  )
}
