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

export type InboxMessage = {
  id: string;
  author: string;
  role: "contacto" | "usuario";
  timestamp: string;
  body: string[];
  tipo: string;
  datos: Record<string, unknown> | null;
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
  manualMode?: boolean;
};

export type InboxPayload = {
  summary: InboxSummary;
  threads: InboxThread[];
  totalThreads: number;
  errors: string[];
};
