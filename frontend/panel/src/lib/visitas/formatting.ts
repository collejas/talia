const WA_LABEL_OVERRIDES: Record<string, string> = {
  "wa.me": "Wa.Me",
  whatsapp: "WhatsApp",
  wa: "WA",
  sms: "SMS",
  mms: "MMS",
};

export function formatWaLabel(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const words = lower.split(/\s+/);
  const formatted = words.map((word) => {
    if (WA_LABEL_OVERRIDES[word]) return WA_LABEL_OVERRIDES[word];
    if (word.includes(".")) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
  return formatted.join(" ");
}
