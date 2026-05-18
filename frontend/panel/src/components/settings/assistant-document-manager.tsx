"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { IconCheck, IconPlus, IconTrash, IconUpload } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AssistantDocument,
  deleteAssistantDocument,
  updateAssistantDocument,
  uploadAssistantDocument,
} from "@/app/settings/email/actions";

type Props = {
  initialDocuments: AssistantDocument[];
};

type StatusBanner =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

const CHANNEL_SCOPE_OPTIONS = [
  { value: "both", label: "Ambos canales" },
  { value: "email", label: "Solo email" },
  { value: "whatsapp", label: "Solo WhatsApp" },
] as const;

function formatSize(bytes: number | null): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssistantDocumentManager({ initialDocuments }: Props) {
  const [documents, setDocuments] = useState<AssistantDocument[]>(
    [...initialDocuments].sort((a, b) => a.sort_order - b.sort_order),
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [channelScope, setChannelScope] = useState<AssistantDocument["channel_scope"]>("both");
  const [tags, setTags] = useState("");
  const [sortOrder, setSortOrder] = useState("100");
  const [active, setActive] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<StatusBanner>(null);
  const [isPending, startTransition] = useTransition();

  const replaceDocument = (updated: AssistantDocument) => {
    setDocuments((current) => {
      const exists = current.some((item) => item.id === updated.id);
      const next = exists
        ? current.map((item) => (item.id === updated.id ? updated : item))
        : [updated, ...current];
      return [...next].sort((a, b) => a.sort_order - b.sort_order);
    });
  };

  const handleUpload = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);

    if (!selectedFile) {
      setStatus({ type: "error", message: "Selecciona un PDF para subir." });
      return;
    }
    if (selectedFile.type && selectedFile.type !== "application/pdf") {
      setStatus({ type: "error", message: "Solo se permiten archivos PDF." });
      return;
    }
    if (!title.trim()) {
      setStatus({ type: "error", message: "El título no puede estar vacío." });
      return;
    }

    const parsedSort = Number.parseInt(sortOrder, 10);
    const normalizedTags = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const formData = new FormData();
    formData.append("file", selectedFile, selectedFile.name);
    formData.append("title", title.trim());
    formData.append("description", description.trim());
    formData.append("category", category.trim());
    formData.append("channel_scope", channelScope);
    formData.append("tags", JSON.stringify(normalizedTags));
    formData.append("sort_order", Number.isNaN(parsedSort) ? "100" : String(parsedSort));
    formData.append("active", active ? "true" : "false");

    startTransition(() => {
      uploadAssistantDocument(formData)
        .then((created) => {
          replaceDocument(created);
          setTitle("");
          setDescription("");
          setCategory("general");
          setChannelScope("both");
          setTags("");
          setSortOrder("100");
          setActive(true);
          setSelectedFile(null);
          setStatus({ type: "success", message: "PDF cargado correctamente." });
        })
        .catch((error) => {
          setStatus({
            type: "error",
            message: error instanceof Error ? error.message : "No se pudo subir el PDF.",
          });
        });
    });
  };

  const handleSaveDocument = (document: AssistantDocument) => {
    setStatus(null);
    startTransition(() => {
      updateAssistantDocument(document.id, {
        title: document.title,
        description: document.description ?? "",
        channel_scope: document.channel_scope,
        category: document.category ?? "",
        tags: document.tags,
        active: document.active,
        sort_order: document.sort_order,
      })
        .then((updated) => {
          replaceDocument(updated);
          setStatus({ type: "success", message: "Documento actualizado." });
        })
        .catch((error) => {
          setStatus({
            type: "error",
            message: error instanceof Error ? error.message : "No se pudo actualizar el documento.",
          });
        });
    });
  };

  const handleDeleteDocument = (documentId: string) => {
    if (!window.confirm("¿Eliminar este PDF?")) return;
    setStatus(null);
    startTransition(() => {
      deleteAssistantDocument(documentId)
        .then(() => {
          setDocuments((current) => current.filter((item) => item.id !== documentId));
          setStatus({ type: "success", message: "Documento eliminado." });
        })
        .catch((error) => {
          setStatus({
            type: "error",
            message: error instanceof Error ? error.message : "No se pudo eliminar el documento.",
          });
        });
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>PDFs del asistente</CardTitle>
          <CardDescription>
            Sube documentos por tenant para que el asistente los pueda enviar por correo o WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-3">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Título del documento" />
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Descripción breve"
                rows={3}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="Categoría"
                />
                <Input
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value)}
                  placeholder="Orden"
                  inputMode="numeric"
                />
              </div>
              <Input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="Tags separados por coma"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Canal</label>
                  <Select value={channelScope} onValueChange={(value) => setChannelScope(value as AssistantDocument["channel_scope"])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona canal" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNEL_SCOPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                  <Checkbox checked={active} onCheckedChange={(checked) => setActive(Boolean(checked))} />
                  Documento activo
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center">
                <IconUpload className="size-6 text-muted-foreground" />
                <span className="mt-2 text-sm font-medium">
                  {selectedFile ? selectedFile.name : "Selecciona un PDF"}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  Solo archivos PDF. El asistente los usará por tenant.
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <Button type="submit" disabled={isPending} className="w-fit">
                <IconPlus className="mr-2 size-4" />
                {isPending ? "Subiendo..." : "Subir PDF"}
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-3 border-t bg-muted/40 px-6 py-4">
          {status?.type === "success" ? (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
              <IconCheck className="size-4" />
              {status.message}
            </span>
          ) : null}
          {status?.type === "error" ? (
            <span className="text-sm text-destructive">{status.message}</span>
          ) : null}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documentos cargados</CardTitle>
          <CardDescription>
            Revisa qué PDFs están disponibles por tenant y canal. Los cambios se guardan por organización.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {documents.length ? (
            documents.map((document) => (
              <div key={document.id} className="rounded-xl border p-4">
                <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
                  <div className="grid gap-3">
                    <Input
                      value={document.title}
                      onChange={(event) =>
                        replaceDocument({ ...document, title: event.target.value })
                      }
                      placeholder="Título"
                    />
                    <Textarea
                      value={document.description ?? ""}
                      onChange={(event) =>
                        replaceDocument({ ...document, description: event.target.value })
                      }
                      rows={2}
                      placeholder="Descripción"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        value={document.category ?? ""}
                        onChange={(event) =>
                          replaceDocument({ ...document, category: event.target.value })
                        }
                        placeholder="Categoría"
                      />
                      <Input
                        value={String(document.sort_order)}
                        onChange={(event) =>
                          replaceDocument({
                            ...document,
                            sort_order: Number.parseInt(event.target.value, 10) || 100,
                          })
                        }
                        placeholder="Orden"
                        inputMode="numeric"
                      />
                    </div>
                    <Input
                      value={document.tags.join(", ")}
                      onChange={(event) =>
                        replaceDocument({
                          ...document,
                          tags: event.target.value
                            .split(",")
                            .map((tag) => tag.trim())
                            .filter((tag) => tag.length > 0),
                        })
                      }
                      placeholder="Tags separados por coma"
                    />
                  </div>

                  <div className="grid gap-3">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">Canal</label>
                      <Select
                        value={document.channel_scope}
                        onValueChange={(value) =>
                          replaceDocument({
                            ...document,
                            channel_scope: value as AssistantDocument["channel_scope"],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Canal" />
                        </SelectTrigger>
                        <SelectContent>
                          {CHANNEL_SCOPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                      <Checkbox
                        checked={document.active}
                        onCheckedChange={(checked) =>
                          replaceDocument({ ...document, active: Boolean(checked) })
                        }
                      />
                      Documento activo
                    </label>
                    <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                      <p>{document.mime}</p>
                      <p>{formatSize(document.size_bytes)}</p>
                      <p>Bucket: {document.storage_bucket}</p>
                      <p>Path: {document.storage_path}</p>
                      {document.url ? (
                        <a className="mt-2 block text-primary underline" href={document.url} target="_blank" rel="noreferrer">
                          Ver documento
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" onClick={() => handleSaveDocument(document)}>
                    Guardar cambios
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => handleDeleteDocument(document.id)}>
                    <IconTrash className="mr-2 size-4" />
                    Eliminar
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Aún no hay PDFs cargados para este tenant.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
