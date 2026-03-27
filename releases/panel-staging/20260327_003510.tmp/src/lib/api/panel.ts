const PANEL_API_ENV_KEYS = [
  "PANEL_API_URL",
  "TALIA_PANEL_API_URL",
  "NEXT_PUBLIC_PANEL_API_URL",
  "TALIA_PANEL_BACKEND_URL",
] as const;

export function getPanelApiBaseUrl(): string {
  for (const key of PANEL_API_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.trim().length) {
      return value.trim().replace(/\/+$/, "");
    }
  }
  throw new Error(
    "Configura PANEL_API_URL (o TALIA_PANEL_API_URL) en las variables de entorno para contactar el backend.",
  );
}
