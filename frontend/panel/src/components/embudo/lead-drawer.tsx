"use client";

import { useEffect, useMemo, useState } from "react";

import type { EmbudoCard } from "@/lib/embudo/data";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import type { LeadActionResult } from "@/lib/embudo/actions";

export type LeadDrawerSubmitPayload = {
  contacto: Record<string, unknown>;
  tarjeta: Record<string, unknown>;
  mergeMetadata?: boolean;
};

type LeadDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageName: string | null;
  card: EmbudoCard | null;
  onSubmit: (payload: LeadDrawerSubmitPayload) => Promise<LeadActionResult>;
};

type FormState = {
  nombre: string;
  correo: string;
  telefono: string;
  monto: string;
  moneda: string;
  probabilidad: string;
};

const EMPTY_STATE: FormState = {
  nombre: "",
  correo: "",
  telefono: "",
  monto: "",
  moneda: "MXN",
  probabilidad: "",
};

export function LeadDrawer({ open, onOpenChange, stageName, card, onSubmit }: LeadDrawerProps) {
  const initialState = useMemo<FormState>(() => {
    if (!card) return EMPTY_STATE;
    return {
      nombre: card.nombre ?? "",
      correo: card.correo ?? "",
      telefono: card.telefono ?? "",
      monto: typeof card.monto === "number" ? card.monto.toString() : "",
      moneda: card.moneda || "MXN",
      probabilidad:
        typeof card.probabilidad === "number" && !Number.isNaN(card.probabilidad)
          ? Math.round(card.probabilidad).toString()
          : "",
    };
  }, [card]);

  const [form, setForm] = useState<FormState>(initialState);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(initialState);
    setError(null);
    setPending(false);
  }, [initialState, open]);

  const handleInputChange = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!card) {
      setError("No se encontró la tarjeta seleccionada.");
      return;
    }

    const contactoUpdates: Record<string, unknown> = {};
    const tarjetaUpdates: Record<string, unknown> = {};

    if (form.nombre !== initialState.nombre) {
      contactoUpdates.nombre_completo = form.nombre.trim() === "" ? null : form.nombre.trim();
    }
    if (form.correo !== initialState.correo) {
      contactoUpdates.correo = form.correo.trim() === "" ? null : form.correo.trim();
    }
    if (form.telefono !== initialState.telefono) {
      contactoUpdates.telefono_e164 = form.telefono.trim() === "" ? null : form.telefono.trim();
    }

    const montoValue = form.monto.trim();
    if (montoValue !== initialState.monto) {
      if (montoValue === "") {
        tarjetaUpdates.monto_estimado = null;
      } else {
        const parsed = Number(montoValue);
        if (Number.isNaN(parsed)) {
          setError("El monto debe ser un número válido.");
          return;
        }
        tarjetaUpdates.monto_estimado = parsed;
      }
    }

    if (form.moneda !== initialState.moneda) {
      tarjetaUpdates.moneda = form.moneda.trim() === "" ? "MXN" : form.moneda.trim().toUpperCase();
    }

    const probValue = form.probabilidad.trim();
    if (probValue !== initialState.probabilidad) {
      if (probValue === "") {
        tarjetaUpdates.probabilidad_override = null;
      } else {
        const parsed = Number(probValue);
        if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
          setError("La probabilidad debe ser un número entre 0 y 100.");
          return;
        }
        tarjetaUpdates.probabilidad_override = parsed;
      }
    }

    if (!Object.keys(contactoUpdates).length && !Object.keys(tarjetaUpdates).length) {
      setError("No hay cambios por guardar.");
      return;
    }

    setPending(true);
    const result = await onSubmit({
      contacto: contactoUpdates,
      tarjeta: tarjetaUpdates,
      mergeMetadata: true,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error || "Ocurrió un error al guardar los cambios.");
      return;
    }

    setError(null);
    onOpenChange(false);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:max-w-md">
        <DrawerHeader className="items-start">
          <DrawerTitle>{card?.nombre ?? "Lead sin nombre"}</DrawerTitle>
          <DrawerDescription className="flex flex-col gap-1 text-left">
            <span>Etapa: {stageName ?? "Sin etapa"}</span>
            <span className="text-xs text-muted-foreground">ID: {card?.tarjetaId}</span>
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Contacto</h4>
            <div className="grid gap-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-nombre">
                Nombre
              </label>
              <Input
                id="lead-nombre"
                value={form.nombre}
                onChange={handleInputChange("nombre")}
                placeholder="Nombre del contacto"
                disabled={pending}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-correo">
                Correo
              </label>
              <Input
                id="lead-correo"
                value={form.correo}
                onChange={handleInputChange("correo")}
                placeholder="correo@ejemplo.com"
                type="email"
                disabled={pending}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-telefono">
                Teléfono (E.164)
              </label>
              <Input
                id="lead-telefono"
                value={form.telefono}
                onChange={handleInputChange("telefono")}
                placeholder="+52..."
                disabled={pending}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Lead</h4>
            <div className="grid gap-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-monto">
                Monto estimado
              </label>
              <Input
                id="lead-monto"
                value={form.monto}
                onChange={handleInputChange("monto")}
                placeholder="0"
                disabled={pending}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-moneda">
                Moneda
              </label>
              <Input
                id="lead-moneda"
                value={form.moneda}
                onChange={handleInputChange("moneda")}
                placeholder="MXN"
                maxLength={3}
                disabled={pending}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-probabilidad">
                Probabilidad (%)
              </label>
              <Input
                id="lead-probabilidad"
                value={form.probabilidad}
                onChange={handleInputChange("probabilidad")}
                placeholder="0-100"
                disabled={pending}
              />
            </div>
          </section>

          {error ? (
            <p className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
          ) : null}

          <DrawerFooter className="mt-4 space-y-2">
            <Button type="submit" disabled={pending || !card} className="w-full">
              {pending ? "Guardando..." : "Guardar cambios"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
