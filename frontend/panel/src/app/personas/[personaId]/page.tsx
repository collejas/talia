import { PersonaDetailView } from "@/components/contactos/persona-detail-view";

type PageProps = {
  params: Promise<{ personaId: string }>;
};

export default async function PersonaDetailPage({ params }: PageProps) {
  const { personaId } = await params;
  return <PersonaDetailView personaId={personaId} />;
}
