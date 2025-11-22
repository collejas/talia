import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { ClientDataTable } from "@/components/client-data-table";
import { loadCrmCampaigns } from "@/lib/crm/campaigns";

export const dynamic = "force-dynamic";

export default async function CrmCampaignsPage() {
  const payload = await loadCrmCampaigns();

  return (
    <AppViewLayout title="CRM · Campañas">
      {payload.errors.length > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {payload.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : (
        <ClientDataTable rows={payload.rows} />
      )}
    </AppViewLayout>
  );
}
