"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

function getErrorMessage(value) {
  const messages = {
    property_unit_not_available: "La unidad ya no está disponible.",
    property_opportunity_contact_mismatch: "La oportunidad no pertenece al comprador seleccionado.",
    property_price_required: "La unidad no tiene un precio establecido válido.",
    external_partner_not_found: "El socio comercial no existe o está inactivo.",
    external_agent_not_found: "El agente no existe, está inactivo o no pertenece al socio.",
    property_opportunity_required: "Selecciona una oportunidad inmobiliaria.",
  };
  return messages[String(value || "")] || "No se pudo registrar la operación externa.";
}

function optionLabel(item) {
  const contact = item?.contacto_profile_name || item?.contacto_nombre || item?.persona_nombre || "Contacto";
  const opportunity = item?.oportunidad_titulo || item?.oportunidad_nombre || item?.oportunidad_id || "Oportunidad";
  return `${contact} · ${opportunity}${item?.oportunidad_codigo ? ` · ${item.oportunidad_codigo}` : ""}`;
}

export function ExternalOperationDialog({ open, onOpenChange, unidadId, unitProps, onSuccess }) {
  const [partners, setPartners] = useState([]);
  const [agents, setAgents] = useState([]);
  const [partnerId, setPartnerId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [state, setState] = useState("reservada");
  const [hours, setHours] = useState("48");
  const [reference, setReference] = useState("");
  const [commission, setCommission] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    Promise.all([
      fetch("/api/crm/inmobiliaria/socios-comerciales", { signal: controller.signal }).then((response) => response.json()),
    ])
      .then(([payload]) => setPartners(Array.isArray(payload?.items) ? payload.items : []))
      .catch(() => {
        if (!controller.signal.aborted) setPartners([]);
      });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    setAgentId("");
    if (!partnerId) {
      setAgents([]);
      return undefined;
    }
    const controller = new AbortController();
    fetch(`/api/crm/inmobiliaria/socios-comerciales/${partnerId}/agentes`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        if (!controller.signal.aborted) setAgents(Array.isArray(payload?.items) ? payload.items : []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAgents([]);
      });
    return () => controller.abort();
  }, [partnerId]);

  useEffect(() => {
    const query = clientQuery.trim();
    if (!open || query.length < 2) {
      setClients([]);
      return undefined;
    }
    const controller = new AbortController();
    fetch(`/api/personas/search?q=${encodeURIComponent(query)}&limit=8&solo_con_oportunidad=true&dominio_comercial=propiedades`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        if (!controller.signal.aborted) setClients(Array.isArray(payload?.items) ? payload.items : []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setClients([]);
      });
    return () => controller.abort();
  }, [clientQuery, open]);

  const establishedPrice = useMemo(() => {
    const priceType = String(unitProps?.precio_tipo || "manual").toLowerCase();
    if (priceType === "m2") {
      const area = Number(unitProps?.area_m2);
      const priceM2 = Number(unitProps?.precio_m2);
      if (area > 0 && priceM2 > 0) return area * priceM2;
    }
    const price = Number(unitProps?.precio);
    return price > 0 ? price : null;
  }, [unitProps]);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!selectedClient?.id || !selectedClient?.oportunidad_id || !partnerId || !agentId) {
      setError("Selecciona comprador con oportunidad, socio comercial y agente externo.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/crm/inmobiliaria/operaciones-externas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unidad_id: unidadId,
          cliente_principal_id: selectedClient.id,
          oportunidad_id: selectedClient.oportunidad_id,
          socio_comercial_externo_id: partnerId,
          agente_externo_id: agentId,
          estado: state,
          apartado_horas: Number(hours),
          referencia_externa: reference.trim() || null,
          comision_porcentaje: commission ? Number(commission) : null,
          forma_adquisicion: "por_definir",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getErrorMessage(payload?.detail || payload?.error));
      onSuccess?.(payload?.operacion);
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo registrar la operación externa.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Registrar operación externa</DialogTitle>
          <DialogDescription>
            {unitProps?.desarrollo_nombre || unitProps?.desarrollo?.nombre || "Unidad"} · {unitProps?.unidad || unitProps?.nombre || unidadId}
            {establishedPrice ? ` · Precio establecido: $${establishedPrice.toLocaleString("es-MX")}` : " · Precio pendiente de ficha"}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="text-sm font-medium">Comprador con oportunidad</label>
            <Input value={clientQuery} onChange={(event) => setClientQuery(event.target.value)} placeholder="Buscar contacto u oportunidad" />
            {clients.length > 0 && (
              <div className="mt-1 max-h-32 overflow-auto rounded border bg-background p-1">
                {clients.map((client) => (
                  <button key={`${client.id}-${client.oportunidad_id}`} type="button" className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted" onClick={() => { setSelectedClient(client); setClientQuery(optionLabel(client)); setClients([]); }}>
                    {optionLabel(client)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Socio comercial
              <select className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm" value={partnerId} onChange={(event) => setPartnerId(event.target.value)}>
                <option value="">Seleccionar</option>
                {partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.nombre}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Agente externo
              <select className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm" value={agentId} onChange={(event) => setAgentId(event.target.value)} disabled={!partnerId}>
                <option value="">Seleccionar</option>
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.nombre}</option>)}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium">Estado
              <select className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm" value={state} onChange={(event) => setState(event.target.value)}><option value="reservada">Reservada</option><option value="apartada">Apartada</option></select>
            </label>
            <label className="text-sm font-medium">Horas
              <select className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm" value={hours} onChange={(event) => setHours(event.target.value)}><option value="24">24</option><option value="48">48</option><option value="72">72</option></select>
            </label>
            <label className="text-sm font-medium">Comisión %<Input type="number" min="0" max="100" step="0.01" value={commission} onChange={(event) => setCommission(event.target.value)} /></label>
          </div>
          <label className="text-sm font-medium">Referencia externa<Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Folio del broker (opcional)" /></label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={loading}>{loading ? "Registrando..." : "Registrar operación"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
