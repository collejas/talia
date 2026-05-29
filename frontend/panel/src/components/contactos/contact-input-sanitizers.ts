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

function normalizeRfcAccountType(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function getExpectedRfcLength(accountType: string | null | undefined): number | null {
  const normalized = normalizeRfcAccountType(accountType);
  if (!normalized) return null;
  if (normalized === "persona_fisica_actividad_empresarial" || normalized === "pfae" || normalized === "fisica") {
    return 13;
  }
  if (normalized === "empresa" || normalized === "empresa_nueva" || normalized === "moral") {
    return 12;
  }
  return null;
}

export function getRfcLengthMessage(accountType: string | null | undefined): string {
  const expected = getExpectedRfcLength(accountType);
  if (expected === 13) {
    return "Personas Físicas: Consta de 13 caracteres";
  }
  if (expected === 12) {
    return "Personas Morales (Empresas): Consta de 12 caracteres";
  }
  return "RFC";
}

export function isValidRfcLength(rfc: string | null | undefined, accountType: string | null | undefined): boolean {
  const normalized = sanitizeRfcInput(rfc);
  const expected = getExpectedRfcLength(accountType);
  if (!normalized) return true;
  if (!expected) return normalized.length === 12 || normalized.length === 13;
  return normalized.length === expected;
}
