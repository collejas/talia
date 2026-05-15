import { PersonaDetailView } from "@/components/contactos/persona-detail-view";

type PageProps = {
  params: Promise<{ contactoId: string }>;
};

export default async function PersonaDetailPage({ params }: PageProps) {
  const { contactoId } = await params;
  return <PersonaDetailView contactoId={contactoId} />;
}
