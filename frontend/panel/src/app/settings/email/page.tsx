import { Metadata } from "next";

import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { AssistantDocumentManager } from "@/components/settings/assistant-document-manager";
import { EmailTemplateSettingsForm } from "@/components/settings/email-template-form";
import { fetchAssistantDocuments, fetchEmailTemplateSettings } from "./actions";

export const metadata: Metadata = {
  title: "Formato de correos · Settings",
};

export default async function EmailSettingsPage() {
  const [settings, assistantDocuments] = await Promise.all([
    fetchEmailTemplateSettings(),
    fetchAssistantDocuments(),
  ]);

  return (
    <AppViewLayout title="Settings">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Formato de correos
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Personaliza el mensaje que Tal-IA envía cuando el cliente prefiere
            recibir información por correo en lugar de agendar una demo.
          </p>
        </div>
        <EmailTemplateSettingsForm initialSettings={settings} />
        <AssistantDocumentManager initialDocuments={assistantDocuments} />
      </div>
    </AppViewLayout>
  );
}
