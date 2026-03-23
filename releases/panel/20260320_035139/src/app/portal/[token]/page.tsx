import { loadPortalEstado } from "@/lib/portal/data";
import { PortalClientApp } from "@/components/portal/portal-client-app";

export const dynamic = "force-dynamic";

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token) {
    return <PortalError message="No se proporcionó token." />;
  }

  let data: Awaited<ReturnType<typeof loadPortalEstado>> | null = null;
  let errorMessage: string | null = null;
  try {
    data = await loadPortalEstado(token);
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "No se pudo cargar la información del portal.";
  }

  if (!data) {
    return <PortalError message={errorMessage ?? "No se pudo cargar la información del portal."} />;
  }

  return <PortalClientApp token={token} initialState={data} />;
}

function PortalError({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-16 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Tal-IA Portal</p>
        <h1 className="text-3xl font-semibold">No pudimos abrir tu portal</h1>
        <p className="text-base text-slate-300">{message}</p>
        <p className="text-sm text-slate-500">
          Confirma con tu ejecutivo que el enlace esté vigente o solicita uno nuevo.
        </p>
      </div>
    </div>
  );
}
