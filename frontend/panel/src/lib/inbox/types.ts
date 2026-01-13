export type InboxFolder = {
  id: string;
  label: string;
  count: number;
};

export type InboxSummary = {
  total: number;
  unread: number;
  awaiting: number;
  folders: InboxFolder[];
};

export type InboxThreadRow = {
  conversacion_id: string;
  contacto_id: string;
  contacto_nombre: string | null;
  contacto_correo: string | null;
  contacto_telefono: string | null;
  canal: string | null;
  estado: string | null;
  prioridad: number | null;
  iniciada_en: string | null;
  ultimo_mensaje_en: string | null;
  no_leidos: number | null;
  asignado_id: string | null;
  asignado_nombre: string | null;
  tags: string[] | null;
  manual_override: boolean | null;
  oportunidad_id: string | null;
  parent_opportunity_id: string | null;
  restart_sequence: number | null;
  conversation_history: string[] | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  messages: unknown;
  total_rows: number;
  reengage_attempts?: number | null;
};

export type InboxAttachment = {
  id?: string;
  url: string;
  mime?: string | null;
  size?: number | null;
  name?: string | null;
  provider_id?: string | null;
  path?: string | null;
};

export type InboxMessage = {
  id: string;
  author: string;
  role: "contacto" | "usuario";
  timestamp: string;
  body: string[];
  tipo: string;
  datos: Record<string, unknown> | null;
  attachments: InboxAttachment[];
};

export type InboxMessageRow = {
  message_id: string;
  conversacion_id?: string | null;
  author: string | null;
  role: "contacto" | "usuario" | null;
  body: string[] | null;
  tipo_contenido: string | null;
  datos: Record<string, unknown> | null;
  creado_en: string | null;
  attachments?: InboxAttachment[] | null;
};

export type InboxThread = {
  id: string;
  contactoId: string;
  contactoNombre: string;
  contactoCorreo: string | null;
  contactoTelefono: string | null;
  canal: string;
  estado: string;
  prioridad: number;
  iniciadoEn: string | null;
  ultimoMensajeEn: string | null;
  noLeidos: number;
  asignadoId: string | null;
  asignadoNombre: string | null;
  tags: string[];
  preview: string;
  previewAt: string | null;
  messages: InboxMessage[];
  manualMode: boolean;
  opportunityId: string | null;
  parentOpportunityId: string | null;
  restartSequence: number;
  conversationHistory: string[];
  reengageAttempts: number;
};

export type InboxPayload = {
  summary: InboxSummary;
  threads: InboxThread[];
  totalThreads: number;
  errors: string[];
};
