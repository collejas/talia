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
