import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { AccountsDataTable } from "@/components/cuentas/accounts-data-table";
import { loadCrmAccounts } from "@/lib/crm/accounts";

export const dynamic = "force-dynamic";

export default async function CrmAccountsPage() {
  const payload = await loadCrmAccounts();

  return (
    <AppViewLayout title="CRM · Cuentas">
      {payload.errors.length > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {payload.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : (
        <AccountsDataTable rows={payload.rows} />
      )}
    </AppViewLayout>
  );
}
