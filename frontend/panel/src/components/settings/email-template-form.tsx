"use client";

import * as React from "react";
import { useTransition, useState } from "react";
import {
  IconCheck,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  EmailTemplateSettings,
  EmailTemplateResource,
  saveEmailTemplateSettings,
} from "@/app/settings/email/actions";

type EmailTemplateSettingsFormProps = {
  initialSettings: EmailTemplateSettings;
};

type StatusBanner =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

export function EmailTemplateSettingsForm({
  initialSettings,
}: EmailTemplateSettingsFormProps) {
  const [intro, setIntro] = useState(initialSettings.intro);
  const [highlights, setHighlights] = useState<string[]>(
    initialSettings.highlights.length
      ? [...initialSettings.highlights]
      : [""],
  );
  const [resources, setResources] = useState<EmailTemplateResource[]>(
    initialSettings.resources.length
      ? initialSettings.resources.map((resource) => ({ ...resource }))
      : [{ label: "", url: "" }],
  );
  const [closing, setClosing] = useState(initialSettings.closing);
  const [useSummary, setUseSummary] = useState(initialSettings.useSummary);
  const [useHighlights, setUseHighlights] = useState(initialSettings.useHighlights);
  const [useResources, setUseResources] = useState(initialSettings.useResources);
  const [signatureSalutation, setSignatureSalutation] = useState(
    initialSettings.signatureSalutation,
  );
  const [signatureText, setSignatureText] = useState(initialSettings.signature);
  const [status, setStatus] = useState<StatusBanner>(null);
  const [isPending, startTransition] = useTransition();

  const handleHighlightChange = (index: number, value: string) => {
    setHighlights((items) =>
      items.map((item, position) => (position === index ? value : item)),
    );
  };

  const handleAddHighlight = () => {
    setHighlights((items) => [...items, ""]);
  };

  const handleRemoveHighlight = (index: number) => {
    setHighlights((items) => items.filter((_, position) => position !== index));
  };

  const handleResourceChange = (
    index: number,
    field: keyof EmailTemplateResource,
    value: string,
  ) => {
    setResources((items) =>
      items.map((item, position) =>
        position === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const handleAddResource = () => {
    setResources((items) => [...items, { label: "", url: "" }]);
  };

  const handleRemoveResource = (index: number) => {
    setResources((items) => items.filter((_, position) => position !== index));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);

    const trimmedIntro = intro.trim();
    const trimmedClosing = closing.trim();
    if (!trimmedIntro.length || !trimmedClosing.length) {
      setStatus({
        type: "error",
        message: "La introducción y el cierre no pueden estar vacíos.",
      });
      return;
    }

    const sanitizedHighlights = highlights
      .map((item) => item.trim())
      .filter((item, index, array) => item.length > 0 || (array.length === 1 && index === 0));

    const sanitizedResources = resources
      .map((resource) => ({
        label: resource.label.trim(),
        url: resource.url.trim(),
      }))
      .filter((resource) => resource.label || resource.url);

    for (const resource of sanitizedResources) {
      if (!resource.label.length || !resource.url.length) {
        setStatus({
          type: "error",
          message: "Cada recurso debe incluir etiqueta y URL.",
        });
        return;
      }
      try {
        const parsedUrl = new URL(resource.url);
        void parsedUrl;
      } catch {
        setStatus({
          type: "error",
          message: `La URL "${resource.url}" no es válida.`,
        });
        return;
      }
    }

    startTransition(() => {
      saveEmailTemplateSettings({
        intro: trimmedIntro,
        highlights: sanitizedHighlights,
        resources: sanitizedResources,
        closing: trimmedClosing,
        useSummary,
        useHighlights,
        useResources,
        signatureSalutation,
        signature: signatureText,
      })
        .then((updated) => {
          setIntro(updated.intro);
          setHighlights(
            updated.highlights.length ? updated.highlights : [""],
          );
          setResources(
            updated.resources.length
              ? updated.resources
              : [{ label: "", url: "" }],
          );
          setClosing(updated.closing);
          setUseSummary(updated.useSummary);
          setUseHighlights(updated.useHighlights);
          setUseResources(updated.useResources);
          setSignatureSalutation(updated.signatureSalutation);
          setSignatureText(updated.signature);
          setStatus({
            type: "success",
            message: "Guardado correctamente.",
          });
        })
        .catch((error) => {
          console.error("[settings] save email template failed", error);
          setStatus({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "No se pudo guardar. Inténtalo nuevamente.",
          });
        });
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Introducción</CardTitle>
          <CardDescription>
            Mensaje de apertura del correo. Usa dos o tres frases máximo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={intro}
            onChange={(event) => setIntro(event.target.value)}
            rows={4}
            className="resize-y"
            placeholder="Escribe la introducción del correo…"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Puntos clave</CardTitle>
          <CardDescription>
            Beneficios o bullets que reforzarán el mensaje. Al menos uno.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex items-start gap-3 rounded-lg border border-dashed px-3 py-2 text-sm">
            <Checkbox
              checked={useHighlights}
              onCheckedChange={(checked) => setUseHighlights(Boolean(checked))}
            />
            <span>
              Incluir la sección <strong>Puntos clave</strong> en el correo.
            </span>
          </label>
          {highlights.map((item, index) => (
            <div key={`highlight-${index}`} className="flex gap-2">
              <Input
                value={item}
                onChange={(event) =>
                  handleHighlightChange(index, event.target.value)
                }
                placeholder="Ej. Automatiza la atención multicanal las 24 horas."
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveHighlight(index)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Eliminar punto"
              >
                <IconTrash className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddHighlight}
            className="flex w-fit items-center gap-2"
          >
            <IconPlus className="size-4" />
            Agregar punto
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recursos</CardTitle>
          <CardDescription>
            Enlaces opcionales para profundizar (videos, artículos, etc.).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {resources.map((resource, index) => (
            <div
              key={`resource-${index}`}
              className="flex flex-col gap-2 rounded-lg border p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:gap-3">
                  <Input
                    value={resource.label}
                    onChange={(event) =>
                      handleResourceChange(index, "label", event.target.value)
                    }
                    placeholder="Nombre del recurso"
                  />
                  <Input
                    value={resource.url}
                    onChange={(event) =>
                      handleResourceChange(index, "url", event.target.value)
                    }
                    placeholder="https://"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveResource(index)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Eliminar recurso"
                >
                  <IconX className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddResource}
            className="flex w-fit items-center gap-2"
          >
            <IconPlus className="size-4" />
            Agregar recurso
          </Button>
        </CardContent>
        <CardFooter className="border-t bg-muted/40 px-6 py-3">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={useResources}
              onCheckedChange={(checked) => setUseResources(Boolean(checked))}
            />
            <span>
              Incluir la sección <strong>Recursos</strong> en el correo.
            </span>
          </label>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cierre</CardTitle>
          <CardDescription>
            Últimas frases del correo, con invitación a demo o contacto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={closing}
            onChange={(event) => setClosing(event.target.value)}
            rows={3}
            className="resize-y"
            placeholder="Escribe el mensaje de cierre…"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Firma</CardTitle>
          <CardDescription>
            Personaliza la despedida final. Usa saltos de línea en la firma para separar nombre, cargo, etc.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground">Saludo</label>
            <Input
              value={signatureSalutation}
              onChange={(event) => setSignatureSalutation(event.target.value)}
              placeholder="Saludos,"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground">Firma</label>
            <Textarea
              value={signatureText}
              onChange={(event) => setSignatureText(event.target.value)}
              rows={3}
              className="resize-y"
              placeholder="Equipo Geoactiv · Tal-IA"
            />
          </div>
        </CardContent>
      </Card>

      <Separator />

      <CardFooter className="flex flex-col items-start gap-3 px-0">
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
          {status?.type === "success" ? (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
              <IconCheck className="size-4" />
              {status.message}
            </span>
          ) : null}
          {status?.type === "error" ? (
            <span className="text-sm text-destructive">{status.message}</span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Estos cambios se aplican al correo que Tal-IA envía cuando el cliente
          solicita información en lugar de agendar demo.
        </p>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <label className="flex items-start gap-2">
            <Checkbox
              checked={useSummary}
              onCheckedChange={(checked) => setUseSummary(Boolean(checked))}
            />
            <span>
              Incluir el resumen del lead (si está disponible) después de la introducción.
            </span>
          </label>
        </div>
      </CardFooter>
    </form>
  );
}
