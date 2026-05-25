export function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D+/g, "");
}

export function sanitizePhoneInput(value: string | null | undefined): string {
  return onlyDigits(value);
}

export function sanitizeRfcInput(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[^0-9A-Za-z]+/g, "")
    .toUpperCase()
    .slice(0, 13);
}
