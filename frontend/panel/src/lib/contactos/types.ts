export type ContactCards = {
  total: number;
  completos: number;
  incompletos: number;
  activos: number;
  leads: number;
  propietarios: number;
  topPropietarioNombre: string | null;
  topPropietarioTotal: number;
  ultimo?: string | null;
};

export type ContactAdvancedFilters = {
  origen: string;
  puesto: string;
  rolDecision: string;
  estadoContacto: string;
  captura: "all" | "si" | "no";
  ligado: "all" | "si" | "no";
  tipoCuenta: string;
  tamano: string;
  clasificacion: string;
  fechaCreacionCuentaFrom: string;
  fechaCreacionCuentaTo: string;
  fechaIncorporacionFrom: string;
  fechaIncorporacionTo: string;
  fusionada: "all" | "si" | "no";
  pais: string;
  estadoDireccion: string;
  municipio: string;
};

export type ContactTableRow = {
  id: number;
  header: string;
  type: string;
  status: string;
  target: string;
  limit: string;
  reviewer: string;
  raw?: Record<string, unknown>;
  personaId?: string | null;
};

export type ContactFilters = {
  search: string;
  owner: string;
  createdFrom: string;
  createdTo: string;
  advanced: ContactAdvancedFilters;
};
