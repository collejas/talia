import { PersonaDetailView } from "@/components/contactos/persona-detail-view";
import { AppViewLayout } from "@/components/layouts/app-view-layout";

type PageProps = {
  params: Promise<{ personaId: string }>;
};

export default async function PersonaDetailPage({ params }: PageProps) {
  const { personaId } = await params;
  return (
    <AppViewLayout title="Detalle de persona">
      <PersonaDetailView personaId={personaId} />
    </AppViewLayout>
  );
}
