export type ClienteDocumentoEstado = "pendiente" | "recibido" | "validado" | "rechazado";
export type ClienteDocumentoTipo =
  | "constancia_fiscal"
  | "comprobante_domicilio"
  | "identificacion_oficial"
  | "contrato_servicio"
  | "nda"
  | "otro";

export type ClienteDocumento = {
  id: string;
  tipo: ClienteDocumentoTipo;
  estado: ClienteDocumentoEstado;
  descripcion: string | null;
  storage_url: string | null;
  storage_path: string | null;
  metadatos: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
};

export type ClienteResponsable = {
  id: string;
  nombre: string;
  correo: string | null;
  telefono_e164: string | null;
  rol: string | null;
  es_responsable_principal: boolean;
  metadatos: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
};

export type ClienteContacto = {
  id: string;
  nombre_completo: string | null;
  correo: string | null;
  telefono_e164: string | null;
  company_name: string | null;
};

export type ClienteRecord = {
  id: string;
  organizacion_id: string;
  contacto_id: string;
  cuenta_id: string;
  oportunidad_id: string | null;
  legacy_lead_id: string | null;
  estado_onboarding: "pendiente" | "en_progreso" | "completado";
  rfc: string | null;
  razon_social: string | null;
  domicilio_fiscal: string | null;
  domicilio_fisico: string | null;
  regimen_fiscal: string | null;
  datos_facturacion: Record<string, unknown> | null;
  fuente: string | null;
  monto_estimado: number | null;
  moneda: string | null;
  metadatos: Record<string, unknown> | null;
  ganado_en: string | null;
  creado_en: string;
  actualizado_en: string;
  contacto: ClienteContacto | null;
  documentos: ClienteDocumento[];
  responsables: ClienteResponsable[];
};

export type ClientePortalSession = {
  id: string;
  cliente_id: string;
  expira_en: string | null;
  revocado: boolean;
  usos: number;
  nota: string | null;
  metadata: Record<string, unknown> | null;
  ultimo_acceso_en: string | null;
  ultimo_acceso_ip: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type PortalDocumentRequirement = {
  tipo: ClienteDocumentoTipo;
  titulo: string;
  descripcion: string;
};

export type PortalEstadoResponse = {
  ok: boolean;
  portal: ClientePortalSession;
  cliente: ClienteRecord;
  documentos_requeridos: PortalDocumentRequirement[];
};
