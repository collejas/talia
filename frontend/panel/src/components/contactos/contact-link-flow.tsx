"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  IconBuilding,
  IconLink,
  IconMail,
  IconPhone,
  IconSearch,
  IconUser,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { RELATION_ROLE_OPTIONS } from "@/components/contactos/relation-role-options";

type ContactSearchItem = {
  id: string;
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
  empresa: string | null;
};

type AccountOption = {
  id: string;
  nombre: string;
  alias?: string | null;
  tipo?: string | null;
  correo?: string | null;
  telefono?: string | null;
};

type InitialContact = {
  id: string;
  label: string;
  company?: string | null;
  correo?: string | null;
  telefono?: string | null;
};

type ContactLinkFlowProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked?: () => void;
  initialContact?: InitialContact | null;
};

type LinkedSummary = {
  contacto: string;
  empresa: string;
  rol: string;
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background p-3 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div> : null}
    </div>
  );
}

export function ContactLinkFlow({
  open,
  onOpenChange,
  onLinked,
  initialContact,
}: ContactLinkFlowProps) {
  const [contactQuery, setContactQuery] = React.useState("");
  const [contactResults, setContactResults] = React.useState<ContactSearchItem[]>([]);
  const [contactLoading, setContactLoading] = React.useState(false);
  const [contactError, setContactError] = React.useState<string | null>(null);
  const [selectedContact, setSelectedContact] = React.useState<ContactSearchItem | null>(null);

  const [companyQuery, setCompanyQuery] = React.useState("");
  const [companyResults, setCompanyResults] = React.useState<AccountOption[]>([]);
  const [companyLoading, setCompanyLoading] = React.useState(false);
  const [companyError, setCompanyError] = React.useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = React.useState<AccountOption | null>(null);

  const [rolEnCuenta, setRolEnCuenta] = React.useState("contacto_principal");
  const [esContactoPrincipal, setEsContactoPrincipal] = React.useState(true);
  const [esContactoFacturacion, setEsContactoFacturacion] = React.useState(false);
  const [esRepresentanteLegal, setEsRepresentanteLegal] = React.useState(false);
  const [activo, setActivo] = React.useState(true);
  const [notas, setNotas] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const deferredContactQuery = React.useDeferredValue(contactQuery);
  const deferredCompanyQuery = React.useDeferredValue(companyQuery);

  React.useEffect(() => {
    if (!open) {
      setContactQuery("");
      setContactResults([]);
      setContactLoading(false);
      setContactError(null);
      setSelectedContact(null);
      setCompanyQuery("");
      setCompanyResults([]);
      setCompanyLoading(false);
      setCompanyError(null);
      setSelectedCompany(null);
      setRolEnCuenta("contacto_principal");
      setEsContactoPrincipal(true);
      setEsContactoFacturacion(false);
      setEsRepresentanteLegal(false);
      setActivo(true);
      setNotas("");
      setSaving(false);
      setError(null);
      return;
    }

    if (initialContact) {
      setSelectedContact({
        id: initialContact.id,
        nombre: initialContact.label,
        correo: initialContact.correo ?? null,
        telefono: initialContact.telefono ?? null,
        empresa: initialContact.company ?? null,
      });
      setContactQuery(initialContact.label);
    }
  }, [open, initialContact]);

  React.useEffect(() => {
    const query = deferredContactQuery.trim();
    if (!open) return;
    if (selectedContact?.nombre === query && query.length > 0) {
      return;
    }
    if (query.length < 2) {
      setContactResults([]);
      setContactLoading(false);
      setContactError(null);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      setContactLoading(true);
      setContactError(null);
      try {
        const response = await fetch(`/api/agenda/contacts/search?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => ({}))) as {
          items?: ContactSearchItem[];
          error?: string;
        };
        if (!response.ok) {
          setContactError(body.error || "No se pudieron buscar contactos.");
          setContactResults([]);
          return;
        }
        setContactResults(Array.isArray(body.items) ? body.items : []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setContactError("No se pudieron buscar contactos.");
          setContactResults([]);
        }
      } finally {
        setContactLoading(false);
      }
    };

    void run();
    return () => controller.abort();
  }, [deferredContactQuery, open, selectedContact?.nombre]);

  React.useEffect(() => {
    const query = deferredCompanyQuery.trim();
    if (!open) return;
    if (selectedCompany?.nombre === query && query.length > 0) {
      return;
    }
    if (query.length < 2) {
      setCompanyResults([]);
      setCompanyLoading(false);
      setCompanyError(null);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      setCompanyLoading(true);
      setCompanyError(null);
      try {
        const response = await fetch(`/api/personas/cuentas?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => ({}))) as {
          items?: AccountOption[];
          error?: string;
        };
        if (!response.ok) {
          setCompanyError(body.error || "No se pudieron buscar empresas.");
          setCompanyResults([]);
          return;
        }
        setCompanyResults(Array.isArray(body.items) ? body.items : []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setCompanyError("No se pudieron buscar empresas.");
          setCompanyResults([]);
        }
      } finally {
        setCompanyLoading(false);
      }
    };

    void run();
    return () => controller.abort();
  }, [deferredCompanyQuery, open, selectedCompany?.nombre]);

  const summary: LinkedSummary = {
    contacto: selectedContact?.nombre?.trim() || "Pendiente",
    empresa: selectedCompany?.nombre?.trim() || "Pendiente",
    rol: rolEnCuenta.trim() || "contacto_principal",
  };

  const handleSubmit = async () => {
    if (!selectedContact?.id) {
      toast.error("Selecciona un contacto.");
      return;
    }
    if (!selectedCompany?.id) {
      toast.error("Selecciona una empresa.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/personas/${encodeURIComponent(selectedContact.id)}/relaciones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cuenta_id: selectedCompany.id,
            rol_en_cuenta: rolEnCuenta.trim() || "contacto_principal",
            es_contacto_principal: esContactoPrincipal,
            es_contacto_facturacion: esContactoFacturacion,
            es_representante_legal: esRepresentanteLegal,
            activo,
            notas: notas.trim() || null,
          }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || `Error ${response.status}`);
      }
      toast.success("Vinculación guardada.");
      onOpenChange(false);
      onLinked?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo guardar la vinculación.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader className="space-y-2">
          <DialogTitle>Vincular contacto a empresa</DialogTitle>
          <DialogDescription>
            Relaciona un contacto ya creado con una empresa existente y define el rol dentro de esa empresa.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <section className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4 shadow-sm">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold leading-none">Contacto</h3>
                <p className="text-xs text-muted-foreground">Busca el contacto que quieres vincular.</p>
              </div>

              <Field label="Buscar contacto" hint="Escribe nombre, correo o teléfono.">
                <div className="relative">
                  <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={contactQuery}
                    onChange={(e) => {
                      setContactQuery(e.target.value);
                      setSelectedContact(null);
                    }}
                    placeholder="Nombre del contacto"
                    className="pl-9"
                  />
                </div>
              </Field>

              {contactLoading ? <p className="text-xs text-muted-foreground">Buscando contactos...</p> : null}
              {contactError ? <p className="text-xs text-destructive">{contactError}</p> : null}

              {selectedContact ? (
                <div className="rounded-xl border border-foreground/20 bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <IconUser className="size-4 text-muted-foreground" />
                        {selectedContact.nombre || "Contacto"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {selectedContact.empresa || "Sin empresa asociada"}
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedContact(null)}>
                      Cambiar
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {selectedContact.correo ? (
                      <span className="inline-flex items-center gap-1">
                        <IconMail className="size-3.5" />
                        {selectedContact.correo}
                      </span>
                    ) : null}
                    {selectedContact.telefono ? (
                      <span className="inline-flex items-center gap-1">
                        <IconPhone className="size-3.5" />
                        {selectedContact.telefono}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {!selectedContact && contactResults.length ? (
                <div className="space-y-2">
                  {contactResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-left transition-colors hover:border-foreground/40"
                      onClick={() => setSelectedContact(item)}
                    >
                      <div className="text-sm font-medium">{item.nombre || "Sin nombre"}</div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {item.correo ? (
                          <span className="inline-flex items-center gap-1">
                            <IconMail className="size-3.5" />
                            {item.correo}
                          </span>
                        ) : null}
                        {item.telefono ? (
                          <span className="inline-flex items-center gap-1">
                            <IconPhone className="size-3.5" />
                            {item.telefono}
                          </span>
                        ) : null}
                        {item.empresa ? (
                          <span className="inline-flex items-center gap-1">
                            <IconBuilding className="size-3.5" />
                            {item.empresa}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4 shadow-sm">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold leading-none">Empresa</h3>
                <p className="text-xs text-muted-foreground">Busca la empresa a la que se va a vincular el contacto.</p>
              </div>

              <Field label="Buscar empresa" hint="Busca por nombre, RFC, correo o teléfono.">
                <div className="relative">
                  <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={companyQuery}
                    onChange={(e) => {
                      setCompanyQuery(e.target.value);
                      setSelectedCompany(null);
                    }}
                    placeholder="Nombre de la empresa"
                    className="pl-9"
                  />
                </div>
              </Field>

              {companyLoading ? <p className="text-xs text-muted-foreground">Buscando empresas...</p> : null}
              {companyError ? <p className="text-xs text-destructive">{companyError}</p> : null}

              {selectedCompany ? (
                <div className="rounded-xl border border-foreground/20 bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <IconBuilding className="size-4 text-muted-foreground" />
                        {selectedCompany.nombre}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {[selectedCompany.alias, selectedCompany.tipo].filter(Boolean).join(" · ") || "Empresa seleccionada"}
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedCompany(null)}>
                      Cambiar
                    </Button>
                  </div>
                </div>
              ) : null}

              {!selectedCompany && companyResults.length ? (
                <div className="space-y-2">
                  {companyResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-left transition-colors hover:border-foreground/40"
                      onClick={() => setSelectedCompany(item)}
                    >
                      <div className="text-sm font-medium">{item.nombre}</div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {item.alias ? <span>{item.alias}</span> : null}
                        {item.correo ? (
                          <span className="inline-flex items-center gap-1">
                            <IconMail className="size-3.5" />
                            {item.correo}
                          </span>
                        ) : null}
                        {item.telefono ? (
                          <span className="inline-flex items-center gap-1">
                            <IconPhone className="size-3.5" />
                            {item.telefono}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4 shadow-sm">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold leading-none">Vinculación</h3>
                <p className="text-xs text-muted-foreground">Define cómo se relaciona el contacto con la empresa.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Rol de la relación" hint="El rol se elige aparte de las banderas de principal, facturación y representante legal.">
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                    value={rolEnCuenta}
                    onChange={(e) => setRolEnCuenta(e.target.value)}
                  >
                    <option value="">Selecciona un rol</option>
                    {RELATION_ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                  <Checkbox checked={esContactoPrincipal} onCheckedChange={(v) => setEsContactoPrincipal(Boolean(v))} />
                  <span className="text-sm">Contacto principal</span>
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                  <Checkbox checked={esContactoFacturacion} onCheckedChange={(v) => setEsContactoFacturacion(Boolean(v))} />
                  <span className="text-sm">Contacto de facturación</span>
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                  <Checkbox checked={esRepresentanteLegal} onCheckedChange={(v) => setEsRepresentanteLegal(Boolean(v))} />
                  <span className="text-sm">Representante legal</span>
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                  <Checkbox checked={activo} onCheckedChange={(v) => setActivo(Boolean(v))} />
                  <span className="text-sm">Vínculo activo</span>
                </label>
              </div>

              <Field label="Notas">
                <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas de la vinculación" />
              </Field>
            </section>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={saving} onClick={() => void handleSubmit()}>
                {saving ? "Vinculando..." : "Vincular"}
              </Button>
              <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-2xl border border-border/60 bg-gradient-to-b from-muted/40 to-background p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <IconLink className="size-4 text-muted-foreground" />
                Resumen
              </div>
              <div className="mt-4 space-y-3">
                <SummaryCard title="Contacto" value={summary.contacto} subtitle={selectedContact?.empresa || "Sin empresa actual"} />
                <SummaryCard title="Empresa" value={summary.empresa} subtitle={selectedCompany?.alias || selectedCompany?.tipo || "Pendiente"} />
                <SummaryCard title="Rol" value={summary.rol} subtitle={esContactoPrincipal ? "Contacto principal" : "Vínculo secundario"} />
              </div>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
