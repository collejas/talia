export type AccountCards = {
  total: number;
  completas: number;
  incompletas: number;
  activas: number;
  propietarios: number;
  topPropietarioNombre: string | null;
  topPropietarioTotal: number;
  ultimo?: string | null;
};

export type AccountAdvancedFilters = {
  estado: "all" | "activo" | "inactivo";
  tipoCuenta: "all" | "empresa" | "persona_fisica_actividad_empresarial";
  tamano: string;
  clasificacion: string;
  regimenCapital: string;
  fechaCreacionFrom: string;
  fechaCreacionTo: string;
  fechaIncorporacionFrom: string;
  fechaIncorporacionTo: string;
  pais: string;
  estadoDireccion: string;
  municipio: string;
};

export type AccountFilters = {
  search: string;
  owner: string;
  createdFrom: string;
  createdTo: string;
  advanced: AccountAdvancedFilters;
};
