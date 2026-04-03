type SearchParams = Record<string, string | string[] | undefined>;

export type DashboardRange = {
  rango: string | null;
  desde: string | null;
  hasta: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  days: number;
};

const PRESET_DAYS: Record<string, number> = {
  hoy: 1,
  ayer: 1,
  semana: 7,
  quincena: 15,
  "15d": 15,
  mes: 30,
  "30d": 30,
  bimestre: 60,
  trimestre: 90,
  semestre: 180,
  ano: 365,
};

export function resolveDashboardRange(searchParams: SearchParams = {}): DashboardRange {
  const rangoRaw = getParam(searchParams, "rango");
  const desdeRaw = getParam(searchParams, "desde");
  const hastaRaw = getParam(searchParams, "hasta");
  const rango = rangoRaw ? rangoRaw.trim().toLowerCase() : null;
  const desde = desdeRaw?.trim() || null;
  const hasta = hastaRaw?.trim() || null;

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  const effectiveRango = rango || (desde || hasta ? "fechas" : "30d");

  if (effectiveRango && effectiveRango !== "fechas" && PRESET_DAYS[effectiveRango]) {
    const preset = effectiveRango;
    if (preset === "hoy") {
      dateFrom = formatDate(today);
      dateTo = formatDate(today);
    } else if (preset === "ayer") {
      const yesterday = addDays(today, -1);
      dateFrom = formatDate(yesterday);
      dateTo = formatDate(yesterday);
    } else {
      const days = PRESET_DAYS[preset];
      const start = addDays(today, -(days - 1));
      dateFrom = formatDate(start);
      dateTo = formatDate(today);
    }
  } else if (desde || hasta) {
    dateFrom = desde;
    dateTo = hasta;
  }

  const rawDays = computeDays(dateFrom, dateTo);
  const days = clampDays(rawDays);

  return {
    rango: effectiveRango || null,
    desde,
    hasta,
    dateFrom,
    dateTo,
    days,
  };
}

function getParam(params: SearchParams, key: string): string | null {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === "string") return value;
  return null;
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function computeDays(dateFrom: string | null, dateTo: string | null): number {
  if (!dateFrom || !dateTo) return 30;
  const from = Date.parse(dateFrom);
  const to = Date.parse(dateTo);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 30;
  const diff = Math.floor((to - from) / (24 * 60 * 60 * 1000)) + 1;
  return diff > 0 ? diff : 30;
}

function clampDays(value: number): number {
  if (!Number.isFinite(value)) return 30;
  if (value < 7) return 7;
  if (value > 90) return 90;
  return Math.round(value);
}
