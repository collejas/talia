import { Metadata } from "next";

import { ReminderSettingsForm } from "@/components/settings/reminder-settings-form";
import { fetchReminderSettings } from "./actions";

export const metadata: Metadata = {
  title: "Recordatorios de demos · Settings",
};

export default async function ReminderSettingsPage() {
  const settings = await fetchReminderSettings();

  return (
    <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Recordatorios de demos</h1>
        <p className="max-w-2xl text-muted-foreground">
          Define si Tal-IA debe enviar recordatorios automáticos antes de cada demo y con cuánta
          anticipación lo hará.
        </p>
      </div>
      <ReminderSettingsForm initialSettings={settings} />
    </div>
  );
}
