type UrlLike = string;

export function extractConversationIdFromPath(url: UrlLike): string | null {
  try {
    const { pathname } = new URL(url);
    const segments = pathname.split("/").filter(Boolean);
    if (!segments.length) {
      return null;
    }

    const replyIndex = segments.lastIndexOf("reply");
    if (replyIndex > 0) {
      const candidate = segments[replyIndex - 1];
      const trimmed = candidate?.trim();
      if (trimmed && trimmed !== "inbox" && trimmed !== "api") {
        return trimmed;
      }
    }

    const manualIndex = segments.lastIndexOf("manual");
    if (manualIndex > 0) {
      const candidate = segments[manualIndex - 1];
      const trimmed = candidate?.trim();
      if (trimmed && trimmed !== "inbox" && trimmed !== "api") {
        return trimmed;
      }
    }

    const inboxIndex = segments.indexOf("inbox");
    if (inboxIndex >= 0 && inboxIndex + 1 < segments.length) {
      const candidate = segments[inboxIndex + 1];
      const trimmed = candidate?.trim();
      if (trimmed && trimmed !== "reply" && trimmed !== "manual" && trimmed !== "api") {
        return trimmed;
      }
    }
  } catch {
    // Si falla el parseo, devolvemos null y dejamos que el flujo principal maneje el error.
  }
  return null;
}

export function looksLikeHtml(text: string): boolean {
  const sample = text.trim().slice(0, 128).toLowerCase();
  if (!sample.length) return false;
  return sample.startsWith("<!doctype html") || sample.startsWith("<html") || sample.includes("<body");
}

export function fallbackErrorFromText(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed || looksLikeHtml(trimmed)) {
    return undefined;
  }
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
}

export function buildBackendTargets(baseUrl: string, conversationId: string, endpoint: "responder" | "manual"): string[] {
  const trimmed = baseUrl.replace(/\/+$/, "");
  const targets = new Set<string>();

  if (trimmed.length) {
    targets.add(`${trimmed}/conversaciones/${conversationId}/${endpoint}`);
  }

  const lowerTrimmed = trimmed.toLowerCase();
  const hasPanelSuffix = lowerTrimmed.endsWith("/panel") || lowerTrimmed.endsWith("/panel-react");
  let isLocalHost = false;

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();
    isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    // Si no se puede parsear como URL absoluta, asumimos que no es host local explícito.
  }

  if (!hasPanelSuffix && !isLocalHost) {
    if (lowerTrimmed.endsWith("/api")) {
      targets.add(`${trimmed}/panel/conversaciones/${conversationId}/${endpoint}`);
    } else if (/^https?:\/\/[^/]+$/i.test(trimmed)) {
      targets.add(`${trimmed}/api/panel/conversaciones/${conversationId}/${endpoint}`);
    } else if (!lowerTrimmed.includes("/panel/")) {
      targets.add(`${trimmed}/panel/conversaciones/${conversationId}/${endpoint}`);
    }
  }

  return Array.from(targets);
}
