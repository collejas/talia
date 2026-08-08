"use client";

import * as React from "react";
import Image from "next/image";
import {
  IconCircleFilled,
  IconFile,
  IconFileDescription,
  IconFileMusic,
  IconFileTypePdf,
  IconMovie,
  IconRobot,
  IconRobotOff,
  IconTargetArrow,
} from "@tabler/icons-react";

import type { InboxThread, InboxMessage } from "@/lib/inbox/data";
import type { InboxAttachment } from "@/lib/inbox/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InboxComposer } from "@/components/inbox/composer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { DateFilterOption } from "@/components/inbox/toolbar";
import { matchesReengageFilter } from "@/lib/inbox/reengage-filter";

const THREADS_REFRESH_INTERVAL_MS = 12000;
const MESSAGES_POLL_INITIAL_MS = 3500;
const MESSAGES_POLL_MAX_MS = 15000;
const THREADS_PAGE_SIZE = 40;
const THREADS_LIST_MESSAGE_LIMIT = 1;
const INBOX_STREAM_REFRESH_DEBOUNCE_MS = 400;

const CHANNEL_BADGE_STYLES: Record<string, string> = {
  whatsapp: "bg-emerald-500/10 text-emerald-700 border-emerald-500/40",
  correo: "bg-amber-500/10 text-amber-700 border-amber-500/40",
  messenger: "bg-sky-500/10 text-sky-700 border-sky-500/40",
  webchat: "bg-violet-500/10 text-violet-700 border-violet-500/40",
  default: "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/30",
};

function getChannelBadgeClass(channel: string | null | undefined): string {
  const key = (channel ?? "").toLowerCase();
  return CHANNEL_BADGE_STYLES[key] ?? CHANNEL_BADGE_STYLES.default;
}

function isProspeccionSource(source: string | null | undefined): boolean {
  const normalized = (source ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes("prospeccion");
}

function getSourceBadge(
  source: string | null | undefined,
  channel: string | null | undefined,
): { label: string; variant: "secondary" | "outline" } | null {
  const normalized = (source ?? "").trim().toLowerCase();
  if (normalized === "publicidad_whatsapp") {
    return { label: "CTA de WhatsApp", variant: "secondary" };
  }
  if (isProspeccionSource(normalized)) {
    return { label: "Prospección", variant: "secondary" };
  }
  if ((channel ?? "").trim().toLowerCase() === "correo") {
    return { label: "Correo general", variant: "outline" };
  }
  return null;
}

function isImageAttachment(attachment: InboxAttachment): boolean {
  const mime = attachment.mime?.toLowerCase() ?? "";
  if (mime.startsWith("image/")) return true;
  const source = `${attachment.url} ${attachment.path ?? ""} ${attachment.name ?? ""}`.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(source);
}

function isVideoAttachment(attachment: InboxAttachment): boolean {
  const mime = attachment.mime?.toLowerCase() ?? "";
  if (mime.startsWith("video/")) return true;
  const source = `${attachment.url} ${attachment.path ?? ""} ${attachment.name ?? ""}`.toLowerCase();
  return /\.(mp4|mov|webm|m4v|3gp)$/i.test(source);
}

function isAudioAttachment(attachment: InboxAttachment): boolean {
  const mime = attachment.mime?.toLowerCase() ?? "";
  if (mime.startsWith("audio/")) return true;
  const source = `${attachment.url} ${attachment.path ?? ""} ${attachment.name ?? ""}`.toLowerCase();
  return /\.(mp3|wav|m4a|aac|ogg|oga|opus)$/i.test(source);
}

function isDocumentAttachment(attachment: InboxAttachment): boolean {
  const mime = attachment.mime?.toLowerCase() ?? "";
  if (
    mime === "application/pdf" ||
    mime.includes("officedocument") ||
    mime.includes("msword") ||
    mime.startsWith("text/")
  ) {
    return true;
  }
  const source = `${attachment.url} ${attachment.path ?? ""} ${attachment.name ?? ""}`.toLowerCase();
  return /\.(pdf|docx?|xlsx?|pptx?|txt|csv)$/i.test(source);
}

function getAttachmentKind(attachment: InboxAttachment): "image" | "video" | "audio" | "document" | "file" {
  if (isImageAttachment(attachment)) return "image";
  if (isVideoAttachment(attachment)) return "video";
  if (isAudioAttachment(attachment)) return "audio";
  if (isDocumentAttachment(attachment)) return "document";
  return "file";
}

function getAttachmentIcon(attachment: InboxAttachment): React.ReactNode {
  const kind = getAttachmentKind(attachment);
  const className = "h-4 w-4";
  if (kind === "document") {
    const mime = attachment.mime?.toLowerCase() ?? "";
    if (mime === "application/pdf" || /\.(pdf)$/i.test(`${attachment.url} ${attachment.path ?? ""} ${attachment.name ?? ""}`)) {
      return <IconFileTypePdf className={className} />;
    }
    return <IconFileDescription className={className} />;
  }
  if (kind === "audio") return <IconFileMusic className={className} />;
  if (kind === "video") return <IconMovie className={className} />;
  return <IconFile className={className} />;
}

function getSourceDetailText(
  thread: InboxThread,
): { reglaNombre: string | null; canalPublicitario: string | null; campanaPublicitaria: string | null } {
  const detail =
    thread.sourceDetail && typeof thread.sourceDetail === "object" && !Array.isArray(thread.sourceDetail)
      ? (thread.sourceDetail as Record<string, unknown>)
      : null;
  if (!detail) {
    return { reglaNombre: null, canalPublicitario: null, campanaPublicitaria: null };
  }
  const reglaNombreRaw = detail["regla_nombre"];
  const canalRaw = detail["canal_publicitario"];
  const campanaRaw = detail["campana_publicitaria"];
  return {
    reglaNombre:
      typeof reglaNombreRaw === "string" && reglaNombreRaw.trim().length ? reglaNombreRaw.trim() : null,
    canalPublicitario: typeof canalRaw === "string" && canalRaw.trim().length ? canalRaw.trim() : null,
    campanaPublicitaria:
      typeof campanaRaw === "string" && campanaRaw.trim().length ? campanaRaw.trim() : null,
  };
}

function getAttributionBadgeClass(kind: "regla" | "canal" | "campana"): string {
  if (kind === "regla") {
    return "border-sky-300 bg-sky-50 text-sky-800";
  }
  if (kind === "canal") {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }
  return "border-amber-300 bg-amber-50 text-amber-800";
}

const SERVER_SHORT_TIME_FORMAT = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const SERVER_FULL_TIME_FORMAT = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const CLIENT_SHORT_TIME_FORMAT = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
});
const CLIENT_FULL_TIME_FORMAT = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

type ReplyMetadata = {
  manual_mode?: boolean;
  [key: string]: unknown;
};

type InboxReplyPayload = {
  ok?: boolean;
  reply?: string | null;
  metadata?: ReplyMetadata;
  messages?: unknown;
  attachments?: InboxAttachment[];
  error?: string;
  detail?: string;
  message?: string;
};

type ManualToggleResponse = {
  ok?: boolean;
  manual?: boolean;
  error?: string;
  detail?: string;
  message?: string;
};

type PromoteOpportunityResponse = {
  ok?: boolean;
  created?: boolean;
  oportunidad_id?: string | null;
  titulo?: string | null;
  estado?: string | null;
  error?: string;
  detail?: string;
  message?: string;
};

type InboxPromoteFormState = {
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  nombre_completo: string;
  correo: string;
  telefono_e164: string;
  company_name: string;
  proyecto_nombre: string;
  necesidad: string;
  monto_estimado: string;
};

function emptyPromoteFormState(): InboxPromoteFormState {
  return {
    nombre: "",
    apellido_paterno: "",
    apellido_materno: "",
    nombre_completo: "",
    correo: "",
    telefono_e164: "",
    company_name: "",
    proyecto_nombre: "",
    necesidad: "",
    monto_estimado: "",
  };
}

type PendingAttachment = InboxAttachment & { id: string };

function formatShortTimeLabel(timestamp: string | null | undefined, hydrated: boolean): string {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  const formatter = hydrated ? CLIENT_SHORT_TIME_FORMAT : SERVER_SHORT_TIME_FORMAT;
  return formatter.format(date);
}

function formatFullTimeLabel(timestamp: string | null | undefined, hydrated: boolean): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const formatter = hydrated ? CLIENT_FULL_TIME_FORMAT : SERVER_FULL_TIME_FORMAT;
  return formatter.format(date);
}

function fingerprintMessages(items: InboxMessage[]): string {
  if (!items.length) {
    return "";
  }
  return items
    .map((item) => `${item.id ?? ""}|${item.timestamp ?? ""}|${item.body?.[0] ?? ""}`)
    .join("::");
}

function combineMessageHistories(histories: InboxMessage[][]): InboxMessage[] {
  const byId = new Map<string, InboxMessage>();
  histories.flat().forEach((message) => {
    const key = message.id ?? `${message.timestamp ?? ""}|${message.body?.[0] ?? ""}`;
    if (!byId.has(key)) {
      byId.set(key, message);
    }
  });
  return Array.from(byId.values()).sort((left, right) => {
    const leftTime = Date.parse(left.timestamp ?? "");
    const rightTime = Date.parse(right.timestamp ?? "");
    return (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
  });
}

function parseReplyPayload(raw: string): InboxReplyPayload {
  if (!raw) return {};
  try {
    const json = JSON.parse(raw);
    if (typeof json !== "object" || json === null) {
      return {};
    }
    const record = json as Record<string, unknown>;
    const metadata =
      typeof record.metadata === "object" && record.metadata !== null
        ? (record.metadata as ReplyMetadata)
        : undefined;
    const attachments = Array.isArray(record.attachments)
      ? (record.attachments as InboxAttachment[])
      : undefined;
    return {
      ok: typeof record.ok === "boolean" ? record.ok : undefined,
      reply:
        typeof record.reply === "string" || record.reply === null
          ? (record.reply as string | null)
          : undefined,
      metadata,
      messages: record.messages,
      attachments,
      error: typeof record.error === "string" ? record.error : undefined,
      detail: typeof record.detail === "string" ? record.detail : undefined,
      message: typeof record.message === "string" ? record.message : undefined,
    };
  } catch {
    return {};
  }
}

function extractMessages(payload: InboxReplyPayload): InboxMessage[] {
  if (!Array.isArray(payload.messages)) {
    return [];
  }
  return payload.messages as InboxMessage[];
}

function extractError(payload: InboxReplyPayload): string | undefined {
  if (payload.error && typeof payload.error === "string" && payload.error.trim().length) {
    return payload.error;
  }
  if (payload.detail && typeof payload.detail === "string" && payload.detail.trim().length) {
    return payload.detail;
  }
  if (payload.message && typeof payload.message === "string" && payload.message.trim().length) {
    return payload.message;
  }
  return undefined;
}

function parseManualToggleResponse(raw: string): ManualToggleResponse {
  if (!raw) return {};
  try {
    const json = JSON.parse(raw);
    if (typeof json !== "object" || json === null) {
      return {};
    }
    const record = json as Record<string, unknown>;
    return {
      ok: typeof record.ok === "boolean" ? record.ok : undefined,
      manual: typeof record.manual === "boolean" ? record.manual : undefined,
      error: typeof record.error === "string" ? record.error : undefined,
      detail: typeof record.detail === "string" ? record.detail : undefined,
      message: typeof record.message === "string" ? record.message : undefined,
    };
  } catch {
    return {};
  }
}

function extractManualToggleError(payload: ManualToggleResponse): string | undefined {
  if (payload.error && payload.error.trim().length) {
    return payload.error;
  }
  if (payload.detail && payload.detail.trim().length) {
    return payload.detail;
  }
  if (payload.message && payload.message.trim().length) {
    return payload.message;
  }
  return undefined;
}

function parsePromotePayload(raw: string): PromoteOpportunityResponse {
  if (!raw) return {};
  try {
    const json = JSON.parse(raw);
    if (typeof json !== "object" || json === null) {
      return {};
    }
    const record = json as Record<string, unknown>;
    return {
      ok: typeof record.ok === "boolean" ? record.ok : undefined,
      created: typeof record.created === "boolean" ? record.created : undefined,
      oportunidad_id:
        typeof record.oportunidad_id === "string" || record.oportunidad_id === null
          ? (record.oportunidad_id as string | null)
          : undefined,
      titulo:
        typeof record.titulo === "string" || record.titulo === null
          ? (record.titulo as string | null)
          : undefined,
      estado:
        typeof record.estado === "string" || record.estado === null
          ? (record.estado as string | null)
          : undefined,
      error: typeof record.error === "string" ? record.error : undefined,
      detail: typeof record.detail === "string" ? record.detail : undefined,
      message: typeof record.message === "string" ? record.message : undefined,
    };
  } catch {
    return {};
  }
}

function normaliseSenderType(value: unknown): "assistant" | "human" | "user" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.length) {
    return undefined;
  }
  if (trimmed.startsWith("human")) return "human";
  if (trimmed.startsWith("assistant")) return "assistant";
  if (trimmed.startsWith("user")) return "user";
  return undefined;
}

function extractNameCandidate(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length) {
      return trimmed;
    }
  }
  return null;
}

function formatCountryLabel(
  code: string | null | undefined,
  name: string | null | undefined,
  city?: string | null,
  state?: string | null,
  lada?: string | null,
) {
  const normalizedCode = (code || "").trim().toUpperCase();
  const normalizedName = (name || "").trim();
  const normalizedCity = (city || "").trim();
  const normalizedState = (state || "").trim();
  const normalizedLada = (lada || "").trim();
  if (normalizedCode === "MX" || normalizedName.toLowerCase() === "méxico" || normalizedName.toLowerCase() === "mexico") {
    if (normalizedCity && normalizedState) {
      return `${normalizedCity}, ${normalizedState}`;
    }
    if (normalizedCity) {
      return normalizedCity;
    }
    if (normalizedState) {
      return normalizedState;
    }
    if (normalizedLada) {
      return `LADA ${normalizedLada}`;
    }
    return null;
  }
  if (normalizedName && normalizedCode) {
    return `${normalizedName} (${normalizedCode})`;
  }
  if (normalizedName) {
    return normalizedName;
  }
  if (normalizedCode) {
    return normalizedCode;
  }
  return null;
}

function buildPromoteFormState(thread: InboxThread): InboxPromoteFormState {
  const baseName = thread.contactoNombre?.trim();
  const nameParts = baseName && baseName !== "Contacto sin nombre" ? baseName.split(/\s+/) : [];
  const nombre = nameParts.shift() ?? "";
  const apellidoPaterno = nameParts.shift() ?? "";
  return {
    nombre,
    apellido_paterno: apellidoPaterno,
    apellido_materno: nameParts.join(" "),
    nombre_completo: baseName && baseName !== "Contacto sin nombre" ? baseName : "",
    correo: thread.contactoCorreo?.trim() ?? "",
    telefono_e164: thread.contactoTelefono?.trim() ?? "",
    company_name: "",
    proyecto_nombre: "",
    necesidad: "",
    monto_estimado: "",
  };
}

function extractAgentSenderType(metadata: Record<string, unknown> | null | undefined): "assistant" | "human" | "user" | undefined {
  if (!metadata) {
    return undefined;
  }
  const record = metadata as Record<string, unknown>;
  const directCandidates: unknown[] = [
    record["sender_type"],
    record["senderType"],
    record["sender"],
    record["author_type"],
    record["agent_type"],
  ];

  const sender = record["sender"];
  if (sender && typeof sender === "object") {
    const senderRecord = sender as Record<string, unknown>;
    directCandidates.push(senderRecord["type"], senderRecord["sender_type"], senderRecord["senderType"]);
  }

  const agent = record["agent"];
  if (agent && typeof agent === "object") {
    const agentRecord = agent as Record<string, unknown>;
    directCandidates.push(agentRecord["type"], agentRecord["sender_type"], agentRecord["senderType"]);
  }

  let extra = record["extra"];
  if (typeof extra === "string") {
    try {
      extra = JSON.parse(extra);
    } catch {
      extra = undefined;
    }
  }
  if (extra && typeof extra === "object") {
    const extraRecord = extra as Record<string, unknown>;
    directCandidates.push(
      extraRecord["sender_type"],
      extraRecord["senderType"],
      extraRecord["sender"],
      extraRecord["author_type"],
      extraRecord["agent_type"],
    );
    const extraSender = extraRecord["sender"];
    if (extraSender && typeof extraSender === "object") {
      const senderRecord = extraSender as Record<string, unknown>;
      directCandidates.push(senderRecord["type"], senderRecord["sender_type"], senderRecord["senderType"]);
    }
    const extraAgent = extraRecord["agent"];
    if (extraAgent && typeof extraAgent === "object") {
      const agentRecord = extraAgent as Record<string, unknown>;
      directCandidates.push(agentRecord["type"], agentRecord["sender_type"], agentRecord["senderType"]);
    }
  }

  for (const candidate of directCandidates) {
    const normalized = normaliseSenderType(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const manualFlag =
    record["manual_override"] ??
    record["manualOverride"] ??
    record["manual_mode"] ??
    record["manualMode"];
  if (typeof manualFlag === "boolean" && manualFlag) {
    return "human";
  }
  if (extra && typeof extra === "object") {
    const extraRecord = extra as Record<string, unknown>;
    const extraManual =
      extraRecord["manual_override"] ??
      extraRecord["manualOverride"] ??
      extraRecord["manual_mode"] ??
      extraRecord["manualMode"];
    if (typeof extraManual === "boolean" && extraManual) {
      return "human";
    }
  }

  return undefined;
}

function isHumanAgentMessage(message: InboxMessage): boolean {
  if (message.role !== "usuario") {
    return false;
  }
  const metadata =
    message.datos && typeof message.datos === "object"
      ? (message.datos as Record<string, unknown>)
      : null;
  const senderType = extractAgentSenderType(metadata);
  if (senderType === "human") {
    return true;
  }
  if (senderType === "assistant" || senderType === "user") {
    return false;
  }

  const origin = metadata?.origin;
  if (typeof origin === "string" && origin.toLowerCase().includes("manual")) {
    return true;
  }
  const source = metadata?.source;
  if (typeof source === "string" && source.toLowerCase().includes("manual")) {
    return true;
  }
  const manualFlag =
    metadata?.manual_override ??
    metadata?.manualOverride ??
    metadata?.manual_mode ??
    metadata?.manualMode;
  if (typeof manualFlag === "boolean" && manualFlag) {
    return true;
  }
  let extra = metadata?.extra;
  if (typeof extra === "string") {
    try {
      extra = JSON.parse(extra);
    } catch {
      extra = undefined;
    }
  }
  if (extra && typeof extra === "object") {
    const extraRecord = extra as Record<string, unknown>;
    const extraOrigin = extraRecord["origin"];
    if (typeof extraOrigin === "string" && extraOrigin.toLowerCase().includes("manual")) {
      return true;
    }
    const extraSource = extraRecord["source"];
    if (typeof extraSource === "string" && extraSource.toLowerCase().includes("manual")) {
      return true;
    }
    const extraManual =
      extraRecord["manual_override"] ??
      extraRecord["manualOverride"] ??
      extraRecord["manual_mode"] ??
      extraRecord["manualMode"];
    if (typeof extraManual === "boolean" && extraManual) {
      return true;
    }
  }
  return false;
}

function resolveHumanAuthorName(
  metadata: Record<string, unknown> | null | undefined,
  fallback: string | null | undefined,
): string {
  const pickName = (source: Record<string, unknown> | null | undefined): string | null => {
    if (!source) return null;
    const keys = [
      "manual_author",
      "manualAuthor",
      "agent_name",
      "agentName",
      "author",
      "author_name",
      "authorName",
    ];
    for (const key of keys) {
      const extracted = extractNameCandidate((source as Record<string, unknown>)[key]);
      if (extracted) {
        return extracted;
      }
    }
    return null;
  };

  const pickEmail = (source: Record<string, unknown> | null | undefined): string | null => {
    if (!source) return null;
    const keys = ["agent_email", "agentEmail", "manual_email", "manualEmail"];
    for (const key of keys) {
      const extracted = extractNameCandidate((source as Record<string, unknown>)[key]);
      if (extracted) {
        return extracted;
      }
    }
    return null;
  };

  const parseExtra = (raw: unknown): Record<string, unknown> | null => {
    if (!raw) return null;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
      return null;
    }
    if (typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return null;
  };

  let candidate = pickName(metadata);
  const extra = parseExtra(metadata?.["extra"]);
  if (!candidate) {
    candidate = pickName(extra);
  }

  let emailCandidate = pickEmail(metadata);
  if (!emailCandidate) {
    emailCandidate = pickEmail(extra);
  }

  if (!candidate && emailCandidate) {
    candidate = emailCandidate;
  }

  if (!candidate && typeof fallback === "string" && fallback.trim().length) {
    candidate = fallback.trim();
  }

  if (!candidate || !candidate.trim().length) {
    candidate = "Miembro del equipo";
  }

  const normalized = candidate.trim().toLowerCase();
  if (normalized === "agent" || normalized === "agente") {
    return emailCandidate ?? "Miembro del equipo";
  }

  return candidate;
}

function isMessageSetRicher(candidate: InboxMessage[], current: InboxMessage[]): boolean {
  if (!candidate.length) return false;
  if (!current.length) return true;
  if (candidate.length !== current.length) {
    return candidate.length > current.length;
  }
  const candidateFingerprint = fingerprintMessages(candidate);
  const currentFingerprint = fingerprintMessages(current);
  if (candidateFingerprint === currentFingerprint) {
    return false;
  }
  const candidateLast = candidate[candidate.length - 1]?.timestamp ?? "";
  const currentLast = current[current.length - 1]?.timestamp ?? "";
  if (!candidateLast || !currentLast) {
    return true;
  }
  return Date.parse(candidateLast) >= Date.parse(currentLast);
}

function mergeMessageHistory(candidate: InboxMessage[], current: InboxMessage[]): InboxMessage[] {
  if (isMessageSetRicher(candidate, current)) {
    return candidate;
  }
  return current;
}

const InboxMessageRow = React.memo(function InboxMessageRow({
  message,
  isHydrated,
}: {
  message: InboxMessage;
  isHydrated: boolean;
}) {
  const isAgent = message.role === "usuario";
  const isHumanAgent = isHumanAgentMessage(message);
  const metadata = message.datos && typeof message.datos === "object"
    ? (message.datos as Record<string, unknown>)
    : null;
  const humanAuthor = isHumanAgent
    ? resolveHumanAuthorName(metadata, message.author)
    : null;
  const displayAuthor =
    isAgent && !isHumanAgent ? "Tal-IA" : isHumanAgent ? humanAuthor ?? message.author : message.author;
  const timestampLabel = formatFullTimeLabel(message.timestamp, isHydrated);

  return (
    <div className={`flex flex-col ${isAgent ? "items-end" : "items-start"}`}>
      <div className={`flex flex-wrap items-center gap-2 text-xs text-muted-foreground ${isAgent ? "justify-end" : ""}`}>
        {isAgent && isHumanAgent ? (
          <Badge variant="secondary" className="border-amber-500/60 bg-amber-500/15 text-amber-700 shadow-sm">
            Humano: {humanAuthor ?? message.author}
          </Badge>
        ) : (
          <span className="font-medium text-foreground">{displayAuthor}</span>
        )}
        <span>{timestampLabel || "—"}</span>
      </div>
      <div
        className={`max-w-xl whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm ${isAgent ? "bg-primary text-primary-foreground" : "bg-muted"}`}
      >
        {message.body.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {message.attachments.length ? (
        <div className="mt-2 flex w-full max-w-xl flex-col gap-2 text-xs">
          {message.attachments.map((attachment) => (
            <div
              key={attachment.id ?? attachment.url}
              className="overflow-hidden rounded-2xl border border-muted bg-background/90 shadow-sm ring-1 ring-black/5"
            >
              {isImageAttachment(attachment) ? (
                <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block">
                  <div className="relative h-72 w-full bg-black/5">
                    <Image
                      src={attachment.url}
                      alt={attachment.name ?? "Imagen adjunta"}
                      fill
                      unoptimized
                      className="object-contain"
                      sizes="(max-width: 768px) 100vw, 480px"
                    />
                  </div>
                </a>
              ) : isVideoAttachment(attachment) ? (
                <div className="bg-black/5 p-2">
                  <video controls preload="metadata" className="max-h-72 w-full rounded-xl bg-black" src={attachment.url} />
                </div>
              ) : isAudioAttachment(attachment) ? (
                <div className="px-3 py-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                    {getAttachmentIcon(attachment)}
                    <span className="truncate">{attachment.name ?? "Audio adjunto"}</span>
                  </div>
                  <audio controls preload="metadata" className="w-full" src={attachment.url} />
                </div>
              ) : (
                <div className="flex items-start gap-3 px-3 py-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    {getAttachmentIcon(attachment)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">{attachment.name ?? "Archivo adjunto"}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {attachment.mime ?? "application/octet-stream"}
                      {attachment.size ? ` • ${(attachment.size / 1024).toFixed(1)} KB` : ""}
                    </div>
                  </div>
                </div>
              )}
              <a
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 border-t border-muted bg-background/70 px-3 py-2 text-muted-foreground hover:text-foreground"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {isImageAttachment(attachment) ? <IconFile className="h-3.5 w-3.5" /> : null}
                  <span className="truncate">
                    {attachment.name ??
                      (isImageAttachment(attachment)
                        ? "Imagen adjunta"
                        : isVideoAttachment(attachment)
                          ? "Video adjunto"
                          : isAudioAttachment(attachment)
                            ? "Audio adjunto"
                            : "Archivo adjunto")}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] font-medium text-foreground/80">
                  Abrir{attachment.size ? ` • ${(attachment.size / 1024).toFixed(1)} KB` : ""}
                </span>
              </a>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});

type InboxSplitViewProps = {
  threads: InboxThread[];
  batchOptions?: Array<{ value: string; label: string }>;
  campanaOptions?: Array<{ value: string; label: string }>;
  sourceFilter?: string | null;
  channelFilter?: string | null;
  estadoFilter?: string | null;
  batchFilter?: string | null;
  campanaFilter?: string | null;
  dateFilter: DateFilterOption;
  reengageFilter: string;
  onVisibleThreadsCountChange?: (count: number) => void;
};

export function InboxSplitView({
  threads,
  batchOptions,
  campanaOptions,
  sourceFilter,
  channelFilter,
  estadoFilter,
  batchFilter,
  campanaFilter,
  dateFilter,
  reengageFilter,
  onVisibleThreadsCountChange,
}: InboxSplitViewProps) {
  const compactKpiTagClass = "text-[8px] leading-none";
  const [threadItems, setThreadItems] = React.useState<InboxThread[]>(threads);
  const [totalThreads, setTotalThreads] = React.useState<number>(threads.length);
  const [threadsRefreshIntervalMs, setThreadsRefreshIntervalMs] = React.useState<number>(
    THREADS_REFRESH_INTERVAL_MS,
  );
  const [loadingMoreThreads, setLoadingMoreThreads] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [manualToggling, setManualToggling] = React.useState(false);
  const [manualToggleError, setManualToggleError] = React.useState<string | null>(null);
  const [promotingOpportunity, setPromotingOpportunity] = React.useState(false);
  const [promoteError, setPromoteError] = React.useState<string | null>(null);
  const [promoteDialogOpen, setPromoteDialogOpen] = React.useState(false);
  const [promoteForm, setPromoteForm] = React.useState<InboxPromoteFormState | null>(null);
  const [promoteFormError, setPromoteFormError] = React.useState<string | null>(null);
  const [currentMessages, setCurrentMessages] = React.useState<InboxMessage[]>([]);
  const [pendingAttachments, setPendingAttachments] = React.useState<PendingAttachment[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = React.useState(false);
  const [attachmentError, setAttachmentError] = React.useState<string | null>(null);
  const [autoScrollLocked, setAutoScrollLocked] = React.useState(false);
  const [isHydrated, setIsHydrated] = React.useState(false);
  const currentMessagesRef = React.useRef(currentMessages);
  const threadItemsRef = React.useRef(threadItems);
  currentMessagesRef.current = currentMessages;
  threadItemsRef.current = threadItems;
  const threadsRefreshingRef = React.useRef(false);
  const skipInitialThreadsRefreshRef = React.useRef(threads.length > 0);
  const threadEnrichmentRef = React.useRef(false);
  const threadEnrichedOnceRef = React.useRef<Set<string>>(new Set());
  const hasExplicitThreadSelectionRef = React.useRef(false);
  const messagesRefreshingRef = React.useRef<string | null>(null);
  const messagesContainerRef = React.useRef<HTMLDivElement | null>(null);
  const messagesPollingTimeoutRef = React.useRef<number | null>(null);
  const messagesPollingDelayRef = React.useRef<number>(MESSAGES_POLL_INITIAL_MS);
  const lastMessagesFingerprintRef = React.useRef<string>("");
  const previousSelectedIdRef = React.useRef<string | null>(null);
  const inboxStreamRef = React.useRef<EventSource | null>(null);
  const inboxStreamConnectedRef = React.useRef(false);
  const inboxStreamRefreshTimeoutRef = React.useRef<number | null>(null);
  const { user: currentUser } = useCurrentUser();
  const batchLabelMap = React.useMemo(
    () => new Map((batchOptions ?? []).map((item) => [item.value, item.label?.trim() || "Lote"])),
    [batchOptions],
  );
  const campanaLabelMap = React.useMemo(
    () => new Map((campanaOptions ?? []).map((item) => [item.value, item.label?.trim() || "Campaña"])),
    [campanaOptions],
  );

  const manualAgentMetadata = React.useMemo(() => {
    if (!currentUser) {
      return null;
    }

    const pickString = (value: unknown): string | null => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.length) {
          return trimmed;
        }
      }
      return null;
    };

    const userMetadata =
      currentUser.user_metadata &&
      typeof currentUser.user_metadata === "object" &&
      !Array.isArray(currentUser.user_metadata)
        ? (currentUser.user_metadata as Record<string, unknown>)
        : null;

    const nameCandidates: string[] = [];
    if (userMetadata) {
      const metadataKeys = [
        "full_name",
        "fullName",
        "nombre_completo",
        "nombreCompleto",
        "display_name",
        "displayName",
        "name",
      ];
      for (const key of metadataKeys) {
        const candidate = pickString(userMetadata[key]);
        if (candidate) {
          nameCandidates.push(candidate);
        }
      }
    }

    const currentUserRecord = currentUser as Record<string, unknown>;
    const directNameCandidates = [
      pickString(currentUserRecord["name"]),
      pickString(currentUserRecord["full_name"]),
      pickString(currentUserRecord["fullName"]),
    ];
    for (const candidate of directNameCandidates) {
      if (candidate) {
        nameCandidates.push(candidate);
      }
    }

    let resolvedName: string | null = null;
    for (const candidate of nameCandidates) {
      if (candidate) {
        resolvedName = candidate;
        break;
      }
    }

    let email: string | null = null;
    if (typeof currentUser.email === "string" && currentUser.email.trim().length) {
      email = currentUser.email.trim();
    } else {
      const fallbackEmail = pickString(currentUserRecord["email"]);
      if (fallbackEmail) {
        email = fallbackEmail;
      }
    }

    if (!resolvedName && email) {
      const localPart = email.split("@")[0] ?? "";
      const trimmedLocalPart = localPart.trim();
      resolvedName = trimmedLocalPart.length ? trimmedLocalPart : email;
    }

    const userId =
      typeof currentUser.id === "string" && currentUser.id.trim().length
        ? currentUser.id.trim()
        : null;

    const manualMetadata: Record<string, unknown> = {};

    if (resolvedName) {
      manualMetadata.manual_author = resolvedName;
      manualMetadata.manualAuthor = resolvedName;
      manualMetadata.agent_name = resolvedName;
      manualMetadata.agentName = resolvedName;
    }

    if (email) {
      manualMetadata.manual_email = email;
      manualMetadata.manualEmail = email;
      manualMetadata.agent_email = email;
      manualMetadata.agentEmail = email;
    }

    if (userId) {
      manualMetadata.user_id = userId;
      manualMetadata.userId = userId;
      manualMetadata.agent_id = userId;
      manualMetadata.agentId = userId;
    }

    if (resolvedName || email || userId) {
      const userPayload: Record<string, unknown> = {};
      if (userId) {
        userPayload.id = userId;
      }
      if (resolvedName) {
        userPayload.name = resolvedName;
      }
      if (email) {
        userPayload.email = email;
      }
      userPayload.type = "human";
      manualMetadata.user = userPayload;
    }

    return Object.keys(manualMetadata).length ? manualMetadata : null;
  }, [currentUser]);

  React.useEffect(() => {
    setThreadItems(threads);
    setTotalThreads(threads.length);
  }, [threads]);

  const filteredThreads = React.useMemo(() => {
    const normalizedSourceFilter = sourceFilter ? sourceFilter.toLowerCase() : null;
    const normalizedChannelFilter = channelFilter ? channelFilter.toLowerCase() : null;
    const normalizedEstadoFilter = estadoFilter ? estadoFilter.toLowerCase() : null;
    const normalizedBatchFilter = batchFilter ? batchFilter.toLowerCase() : null;
    const normalizedCampanaFilter = campanaFilter ? campanaFilter.toLowerCase() : null;
    return threadItems
      .filter((thread) => {
        if (!normalizedSourceFilter || normalizedSourceFilter === "all") return true;
        if (normalizedSourceFilter === "correo_general") {
          const threadChannel = (thread.canal ?? "").toLowerCase();
          const threadSource = (thread.source ?? "").toLowerCase();
          return threadChannel === "correo" && !isProspeccionSource(threadSource);
        }
        if (normalizedSourceFilter === "operativo") {
          return !isProspeccionSource(thread.source);
        }
        return (thread.source ?? "").toLowerCase() === normalizedSourceFilter;
      })
      .filter((thread) => {
        if (!normalizedChannelFilter || normalizedChannelFilter === "all") return true;
        return (thread.canal ?? "").toLowerCase() === normalizedChannelFilter;
      })
      .filter((thread) => {
        if (!normalizedEstadoFilter || normalizedEstadoFilter === "all") return true;
        return (thread.estado ?? "").toLowerCase() === normalizedEstadoFilter;
      })
      .filter((thread) => {
        if (!normalizedBatchFilter) return true;
        return (thread.batchId ?? "").toLowerCase() === normalizedBatchFilter;
      })
      .filter((thread) => {
        if (!normalizedCampanaFilter) return true;
        return (thread.campanaId ?? "").toLowerCase() === normalizedCampanaFilter;
      })
      .filter((thread) => matchesReengageFilter(thread, reengageFilter));
  }, [
    threadItems,
    sourceFilter,
    channelFilter,
    estadoFilter,
    batchFilter,
    campanaFilter,
    reengageFilter,
  ]);

  React.useEffect(() => {
    onVisibleThreadsCountChange?.(filteredThreads.length);
  }, [filteredThreads.length, onVisibleThreadsCountChange]);

  const selectedThread = React.useMemo(() => {
    if (!selectedId) {
      return null;
    }
    const withinFiltered = filteredThreads.find((thread) => thread.id === selectedId);
    if (withinFiltered) {
      return withinFiltered;
    }
    const inAll = threadItems.find((thread) => thread.id === selectedId);
    return inAll ?? null;
  }, [selectedId, filteredThreads, threadItems]);
  const selectedSourceBadge = selectedThread
    ? getSourceBadge(selectedThread.source, selectedThread.canal)
    : null;
  const selectedSourceDetail = selectedThread
    ? getSourceDetailText(selectedThread)
    : { reglaNombre: null, canalPublicitario: null, campanaPublicitaria: null };

  React.useEffect(() => {
    const initialMessages = selectedThread?.messages ?? [];
    setManualToggleError(null);
    setManualToggling(false);
    const currentId = selectedThread?.id ?? null;
    if (previousSelectedIdRef.current !== currentId) {
      setCurrentMessages(initialMessages);
      lastMessagesFingerprintRef.current = fingerprintMessages(initialMessages);
      setAutoScrollLocked(false);
    } else if (isMessageSetRicher(initialMessages, currentMessagesRef.current)) {
      setCurrentMessages(initialMessages);
      lastMessagesFingerprintRef.current = fingerprintMessages(initialMessages);
    }
    previousSelectedIdRef.current = currentId;
  }, [selectedThread?.id, selectedThread?.messages]);

  React.useEffect(() => {
    setPendingAttachments([]);
    setAttachmentError(null);
  }, [selectedThread?.id]);

  React.useEffect(() => {
    setIsHydrated(true);
  }, []);

  React.useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const SCROLL_THRESHOLD_PX = 72;
    const handleScroll = () => {
      const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      setAutoScrollLocked(distanceToBottom > SCROLL_THRESHOLD_PX);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [selectedThread?.id]);

  React.useEffect(() => {
    if (autoScrollLocked) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    const scrollToBottom = () => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    };
    if ("requestAnimationFrame" in window) {
      requestAnimationFrame(scrollToBottom);
    } else {
      scrollToBottom();
    }
  }, [currentMessages, selectedThread?.id, autoScrollLocked]);

  const buildThreadsParams = React.useCallback(
    ({ offset, enrich }: { offset: number; enrich: boolean }) => {
      const params = new URLSearchParams({
        limit: String(THREADS_PAGE_SIZE),
        offset: String(Math.max(0, offset)),
        message_limit: String(THREADS_LIST_MESSAGE_LIMIT),
        enrich: enrich ? "true" : "false",
      });
      const normalizedSource = sourceFilter ? sourceFilter.toLowerCase() : "";
      if (normalizedSource && normalizedSource !== "all" && normalizedSource !== "correo_general") {
        params.set("source", normalizedSource);
      }
      if (normalizedSource === "correo_general") {
        params.set("channel", "correo");
      }
      if (channelFilter && channelFilter !== "all") {
        params.set("channel", channelFilter);
      }
      if (estadoFilter) {
        params.set("estado", estadoFilter);
      }
      if (batchFilter) {
        params.set("batch_id", batchFilter);
      }
      if (campanaFilter) {
        params.set("campana_id", campanaFilter);
      }
      if (dateFilter && dateFilter !== "all") {
        params.set("date", dateFilter);
      }
      return params;
    },
    [sourceFilter, channelFilter, estadoFilter, batchFilter, campanaFilter, dateFilter],
  );

  const shouldEnrichThreads = React.useMemo(() => {
    return (sourceFilter ?? "").trim().toLowerCase() === "publicidad_whatsapp";
  }, [sourceFilter]);

  const buildThreadDetailParams = React.useCallback(
    ({ threadOffset }: { threadOffset: number }) => {
      const params = new URLSearchParams({
        message_limit: "20",
        thread_offset: String(Math.max(0, threadOffset)),
      });
      const normalizedSource = sourceFilter ? sourceFilter.toLowerCase() : "";
      if (normalizedSource && normalizedSource !== "all" && normalizedSource !== "correo_general") {
        params.set("source", normalizedSource);
      }
      if (normalizedSource === "correo_general") {
        params.set("channel", "correo");
      }
      if (channelFilter && channelFilter !== "all") {
        params.set("channel", channelFilter);
      }
      if (estadoFilter) {
        params.set("estado", estadoFilter);
      }
      if (batchFilter) {
        params.set("batch_id", batchFilter);
      }
      if (campanaFilter) {
        params.set("campana_id", campanaFilter);
      }
      if (dateFilter && dateFilter !== "all") {
        params.set("date", dateFilter);
      }
      return params;
    },
    [sourceFilter, channelFilter, estadoFilter, batchFilter, campanaFilter, dateFilter],
  );

  const needsThreadEnrichment = React.useCallback((thread: InboxThread | null | undefined): boolean => {
    if (!thread) return false;
    const normalizedSource = (thread.source ?? "").toLowerCase();
    if (normalizedSource === "publicidad_whatsapp") {
      const detail =
        thread.sourceDetail && typeof thread.sourceDetail === "object" && !Array.isArray(thread.sourceDetail)
          ? (thread.sourceDetail as Record<string, unknown>)
          : {};
      const reglaNombre =
        typeof detail.regla_nombre === "string" ? detail.regla_nombre.trim() : "";
      const canalPublicitario =
        typeof detail.canal_publicitario === "string" ? detail.canal_publicitario.trim() : "";
      const campanaPublicitaria =
        typeof detail.campana_publicitaria === "string" ? detail.campana_publicitaria.trim() : "";
      const missingProspeccion =
        !(thread.templateLabel || thread.batchLabel || thread.campanaLabel);
      return !(reglaNombre || canalPublicitario || campanaPublicitaria) || missingProspeccion;
    }
    if (!normalizedSource && (thread.canal ?? "").toLowerCase() === "whatsapp") {
      return true;
    }
    if (isProspeccionSource(normalizedSource)) {
      return !(thread.templateLabel || thread.batchLabel || thread.campanaLabel);
    }
    return false;
  }, []);

  const refreshThreads = React.useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    if (threadsRefreshingRef.current) return;
    threadsRefreshingRef.current = true;
    try {
      const params = buildThreadsParams({ offset: 0, enrich: shouldEnrichThreads });
      params.set("include_summary", "false");
      params.set("include_filter_options", "false");
      const response = await fetch(`/api/inbox/bootstrap?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as {
        threads?: InboxThread[];
        total_threads?: number;
        runtime_profile?: { recommended_threads_poll_seconds?: number };
      };
      const incoming = Array.isArray(data?.threads) ? (data.threads as InboxThread[]) : [];
      if (typeof data?.total_threads === "number") {
        setTotalThreads(Math.max(0, data.total_threads));
      }
      const recommendedSeconds = Number(data?.runtime_profile?.recommended_threads_poll_seconds);
      if (Number.isFinite(recommendedSeconds) && recommendedSeconds > 0) {
        const nextIntervalMs = Math.max(5000, Math.trunc(recommendedSeconds * 1000));
        setThreadsRefreshIntervalMs((current) =>
          current === nextIntervalMs ? current : nextIntervalMs,
        );
      }
      setThreadItems((current) => {
        if (!incoming.length) {
          return [];
        }
        return mergeThreadLists(current, incoming);
      });
    } catch (error) {
      console.error("[inbox] refresh threads failed", error);
    } finally {
      threadsRefreshingRef.current = false;
    }
  }, [buildThreadsParams, shouldEnrichThreads]);

  React.useEffect(() => {
    if (skipInitialThreadsRefreshRef.current) {
      skipInitialThreadsRefreshRef.current = false;
      return;
    }
    void refreshThreads();
  }, [refreshThreads]);

  React.useEffect(() => {
    let cancelled = false;
    const interval = setInterval(() => {
      if (cancelled || inboxStreamConnectedRef.current) {
        return;
      }
      void refreshThreads();
    }, threadsRefreshIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
      threadsRefreshingRef.current = false;
    };
  }, [refreshThreads, threadsRefreshIntervalMs]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    let closed = false;
    const stream = new EventSource("/api/inbox/stream");
    inboxStreamRef.current = stream;
    const scheduleRefresh = () => {
      if (closed) return;
      if (inboxStreamRefreshTimeoutRef.current !== null) {
        window.clearTimeout(inboxStreamRefreshTimeoutRef.current);
      }
      inboxStreamRefreshTimeoutRef.current = window.setTimeout(() => {
        inboxStreamRefreshTimeoutRef.current = null;
        void refreshThreads();
      }, INBOX_STREAM_REFRESH_DEBOUNCE_MS);
    };

    stream.onopen = () => {
      inboxStreamConnectedRef.current = true;
    };
    stream.onerror = () => {
      inboxStreamConnectedRef.current = false;
    };
    stream.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type?: string };
        const eventType = (data?.type ?? "").toLowerCase();
        if (!eventType || eventType === "ping" || eventType === "connected") {
          return;
        }
      } catch {
        // si no parsea, de todos modos refresca para no perder invalidaciones
      }
      scheduleRefresh();
    };

    return () => {
      closed = true;
      inboxStreamConnectedRef.current = false;
      if (inboxStreamRefreshTimeoutRef.current !== null) {
        window.clearTimeout(inboxStreamRefreshTimeoutRef.current);
        inboxStreamRefreshTimeoutRef.current = null;
      }
      stream.close();
      if (inboxStreamRef.current === stream) {
        inboxStreamRef.current = null;
      }
    };
  }, [refreshThreads]);

  const handleLoadMoreThreads = React.useCallback(async () => {
    if (loadingMoreThreads) return;
    if (threadItems.length >= totalThreads) return;
    setLoadingMoreThreads(true);
    try {
      const params = buildThreadsParams({
        offset: Math.max(0, threadItems.length),
        enrich: shouldEnrichThreads,
      });
      const response = await fetch(`/api/inbox/threads?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { threads?: InboxThread[]; total_threads?: number };
      if (typeof data?.total_threads === "number") {
        setTotalThreads(Math.max(0, data.total_threads));
      }
      const incoming = Array.isArray(data?.threads) ? (data.threads as InboxThread[]) : [];
      if (!incoming.length) return;
      setThreadItems((current) => appendThreadPage(current, incoming));
    } catch (error) {
      console.error("[inbox] load more threads failed", error);
    } finally {
      setLoadingMoreThreads(false);
    }
  }, [
    loadingMoreThreads,
    threadItems.length,
    totalThreads,
    buildThreadsParams,
    shouldEnrichThreads,
  ]);

  React.useEffect(() => {
    let cancelled = false;
    if (!hasExplicitThreadSelectionRef.current) {
      return undefined;
    }
    const selectedId = selectedThread?.id ?? null;
    if (!selectedId) {
      return undefined;
    }
    const targetThreadId = selectedId;
    const selected = threadItems.find((thread) => thread.id === selectedId);
    if (!selected || !needsThreadEnrichment(selected)) {
      return undefined;
    }
    if (threadEnrichedOnceRef.current.has(selectedId)) {
      return undefined;
    }
    if (threadEnrichmentRef.current) {
      return undefined;
    }
    const selectedIndex = threadItems.findIndex((thread) => thread.id === targetThreadId);
    const threadOffset = selectedIndex >= 0 ? selectedIndex : 0;

    async function hydrateSelectedThread() {
      threadEnrichmentRef.current = true;
      try {
        const params = buildThreadDetailParams({ threadOffset });
        const response = await fetch(`/api/inbox/${targetThreadId}/detail?${params.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { thread?: InboxThread | null };
        const detailThread = data?.thread ?? null;
        if (!detailThread || cancelled) {
          return;
        }
        setThreadItems((current) => mergeThreadLists(current, [detailThread]));
        threadEnrichedOnceRef.current.add(targetThreadId);
        if (threadEnrichedOnceRef.current.size > 512) {
          const oldestKey = threadEnrichedOnceRef.current.values().next().value;
          if (typeof oldestKey === "string") {
            threadEnrichedOnceRef.current.delete(oldestKey);
          }
        }
      } catch (error) {
        console.error("[inbox] selected thread enrichment failed", error);
      } finally {
        threadEnrichmentRef.current = false;
      }
    }

    hydrateSelectedThread();
    return () => {
      cancelled = true;
    };
  }, [selectedThread?.id, threadItems, needsThreadEnrichment, buildThreadDetailParams]);

  const handleSelectThread = React.useCallback((threadId: string) => {
    hasExplicitThreadSelectionRef.current = true;
    setSelectedId(threadId);
  }, []);

  const refreshMessages = React.useCallback(
    async (conversationId: string, options: { force?: boolean } = {}) => {
      if (!conversationId) return;
      if (messagesRefreshingRef.current === conversationId) {
        return;
      }
      if (!options.force && (uploadingAttachments || pendingAttachments.length > 0 || sending)) {
        return;
      }

      messagesRefreshingRef.current = conversationId;
      try {
        if (typeof document !== "undefined" && document.hidden) {
          messagesPollingDelayRef.current = Math.min(
            MESSAGES_POLL_MAX_MS,
            Math.trunc(messagesPollingDelayRef.current * 1.5),
          );
          return;
        }
        // Historical conversations are loaded by the detail endpoint once. The
        // live poll only needs the canonical conversation; querying every
        // restart here creates one request per historical conversation.
        const conversationIds = [conversationId];
        const histories = await Promise.all(
          conversationIds.map(async (id) => {
            const response = await fetch(`/api/inbox/${id}/messages?limit=100`, {
              cache: "no-store",
            });
            if (!response.ok) return [];
            const payload = (await response.json()) as { messages?: InboxMessage[] };
            return Array.isArray(payload?.messages) ? (payload.messages as InboxMessage[]) : [];
          }),
        );
        const fetchedMessages = combineMessageHistories(histories);
        // Conserva las mismas referencias para mensajes ya renderizados; solo
        // los mensajes nuevos llegan como filas nuevas al árbol de React.
        const messages = combineMessageHistories([currentMessagesRef.current, fetchedMessages]);
        const fingerprint = fingerprintMessages(messages);
        if (!options.force && fingerprint === lastMessagesFingerprintRef.current) {
          messagesPollingDelayRef.current = Math.min(
            MESSAGES_POLL_MAX_MS,
            Math.trunc(messagesPollingDelayRef.current * 1.35),
          );
          return;
        }
        messagesPollingDelayRef.current = MESSAGES_POLL_INITIAL_MS;
        lastMessagesFingerprintRef.current = fingerprint;
        setCurrentMessages(messages);
        setThreadItems((current) =>
          current.map((thread) => {
            if (thread.id !== conversationId) {
              return thread;
            }
            const lastMessage = messages[messages.length - 1] ?? null;
            return {
              ...thread,
              messages,
              preview: lastMessage?.body?.[0] ?? thread.preview,
              previewAt: lastMessage?.timestamp ?? thread.previewAt,
              ultimoMensajeEn: lastMessage?.timestamp ?? thread.ultimoMensajeEn,
              noLeidos: thread.noLeidos,
            };
          }),
        );
      } catch (error) {
        console.error("[inbox] refresh messages failed", error);
      } finally {
        messagesRefreshingRef.current = null;
      }
    },
    [pendingAttachments.length, uploadingAttachments, sending],
  );

  const handleAttachmentUpload = React.useCallback(
    async (files: FileList | null) => {
      if (!files || !selectedThread || !selectedThread.manualMode) {
        return;
      }
      setAttachmentError(null);
      setUploadingAttachments(true);
      try {
        const candidates = Array.from(files);
        for (const file of candidates) {
          const formData = new FormData();
          formData.append("file", file, file.name);
          formData.append("conversationId", selectedThread.id);

          const response = await fetch(`/api/inbox/uploads`, {
            method: "POST",
            body: formData,
            cache: "no-store",
          });

          const text = await response.text();
          let payload: Record<string, unknown> = {};
          try {
            payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
          } catch (error) {
            console.error("[inbox] attach upload parse fail", error);
            throw new Error("upload_failed");
          }

          if (!response.ok) {
            const message = typeof payload.error === "string" ? payload.error : "upload_failed";
            throw new Error(message);
          }

          const urlField = payload.url;
          const url = typeof urlField === "string" && urlField.length ? urlField : null;
          if (!url) {
            throw new Error("upload_missing_url");
          }

          const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const sizeValue = payload.size;
          let size: number | undefined = undefined;
          if (typeof sizeValue === "number") {
            size = Math.trunc(sizeValue);
          } else if (typeof sizeValue === "string") {
            const parsed = Number(sizeValue);
            if (!Number.isNaN(parsed)) {
              size = Math.trunc(parsed);
            }
          } else if (typeof file.size === "number") {
            size = file.size;
          }

          const newAttachment: PendingAttachment = {
            id,
            url,
            name: typeof payload.name === "string" && payload.name.length ? payload.name : file.name,
            mime: typeof payload.mime === "string" && payload.mime.length ? payload.mime : file.type,
            size,
            provider_id: typeof payload.provider_id === "string" ? payload.provider_id : undefined,
            path: typeof payload.path === "string" ? payload.path : undefined,
          };

          setPendingAttachments((current) => [...current, newAttachment]);
        }
      } catch (error) {
        console.error("[inbox] attachment upload failed", error);
        const message =
          error instanceof Error && error.message && !error.message.startsWith("upload_")
            ? error.message
            : "No se pudo cargar uno o más archivos. Inténtalo nuevamente.";
        setAttachmentError(message);
      } finally {
        setUploadingAttachments(false);
      }
    },
    [selectedThread],
  );

  const handleAttachmentRemove = React.useCallback((id: string) => {
    setPendingAttachments((current) => current.filter((attachment) => attachment.id !== id));
    setAttachmentError((prev) => (prev ? null : prev));
  }, []);

  const selectedConversationId = selectedThread?.id ?? null;

  React.useEffect(() => {
    if (!selectedConversationId) {
      messagesRefreshingRef.current = null;
      setAutoScrollLocked(false);
      if (messagesPollingTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(messagesPollingTimeoutRef.current);
        messagesPollingTimeoutRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled || typeof window === "undefined") {
        return;
      }
      const nextDelayMs = Math.max(
        MESSAGES_POLL_INITIAL_MS,
        Math.min(MESSAGES_POLL_MAX_MS, messagesPollingDelayRef.current),
      );
      messagesPollingTimeoutRef.current = window.setTimeout(() => {
        void refreshMessages(selectedConversationId, { force: false }).finally(() => {
          if (!cancelled) {
            scheduleNext();
          }
        });
      }, nextDelayMs);
    };

    messagesPollingDelayRef.current = MESSAGES_POLL_INITIAL_MS;
    void refreshMessages(selectedConversationId, { force: true }).finally(() => {
      if (!cancelled) {
        scheduleNext();
      }
    });

    return () => {
      cancelled = true;
      if (messagesPollingTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(messagesPollingTimeoutRef.current);
        messagesPollingTimeoutRef.current = null;
      }
      if (messagesRefreshingRef.current === selectedConversationId) {
        messagesRefreshingRef.current = null;
      }
    };
  }, [selectedConversationId, refreshMessages]);

  const handleSendMessage = React.useCallback(
    async (content: string, outgoingAttachments: PendingAttachment[]) => {
      const targetThread = threadItems.find((thread) => thread.id === selectedId);
      if (!targetThread) {
        return false;
      }
      if (!targetThread.manualMode) {
        setSendError('Activa "Pausar asistente" para responder manualmente.');
        return false;
      }

      setSendError(null);
      setSending(true);
      try {
        const manualControls =
          targetThread.manualMode
            ? {
                manual_mode: true,
                manualMode: true,
                manual_override: true,
                manualOverride: true,
                sender_type: "human",
                senderType: "human",
                author_type: "human",
                authorType: "human",
                origin: "panel_manual",
                source: "panel_manual",
                ...(manualAgentMetadata ?? {}),
              }
            : null;

        const requestBody: Record<string, unknown> = {
          content,
          attachments: outgoingAttachments.map((attachment) => ({
            url: attachment.url,
            name: attachment.name,
            mime: attachment.mime,
            size: attachment.size,
            provider_id: attachment.provider_id ?? attachment.path ?? null,
            path: attachment.path ?? null,
          })),
        };

        if (manualControls) {
          requestBody.metadata = manualControls;
        }

        const response = await fetch(`/api/inbox/${targetThread.id}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        const text = await response.text();
        const payload = parseReplyPayload(text);

        if (!response.ok) {
          const message = extractError(payload) ?? "No se pudo enviar el mensaje. Inténtalo de nuevo.";
          setSendError(message);
          return false;
        }

        const messages = extractMessages(payload);
        setPendingAttachments([]);
        setAttachmentError(null);
        const mergedMessages = messages.length
          ? combineMessageHistories([currentMessages, messages])
          : currentMessages;
        if (messages.length) {
          setCurrentMessages(mergedMessages);
          lastMessagesFingerprintRef.current = fingerprintMessages(mergedMessages);
        }
        setThreadItems((current) =>
          current.map((thread) => {
            if (thread.id !== targetThread.id) {
              return thread;
            }
            const lastMessage = messages.length ? messages[messages.length - 1]! : null;
            const manualModeValue =
              typeof payload.metadata?.manual_mode === "boolean"
                ? payload.metadata.manual_mode
                : thread.manualMode;
            return {
              ...thread,
              messages: messages.length ? combineMessageHistories([thread.messages, messages]) : thread.messages,
              preview: lastMessage?.body?.[0] ?? thread.preview,
              previewAt: lastMessage?.timestamp ?? thread.previewAt,
              ultimoMensajeEn: lastMessage?.timestamp ?? thread.ultimoMensajeEn,
              noLeidos: 0,
              manualMode: manualModeValue,
            };
          }),
        );
        setSendError(null);
        return true;
      } catch (error) {
        console.error("[inbox] send message failed", error);
        setSendError("Ocurrió un error inesperado al enviar el mensaje.");
        return false;
      } finally {
        setSending(false);
      }
    },
    [currentMessages, selectedId, threadItems, manualAgentMetadata],
  );

  const handleToggleManualMode = React.useCallback(async () => {
    if (!selectedThread) {
      return false;
    }

    const targetId = selectedThread.id;
    const nextManualValue = !selectedThread.manualMode;

    setManualToggleError(null);
    setManualToggling(true);
    try {
      const response = await fetch(`/api/inbox/${targetId}/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manual: nextManualValue }),
      });

      const text = await response.text();
      const payload = parseManualToggleResponse(text);

      if (!response.ok) {
        const message =
          extractManualToggleError(payload) ?? "No se pudo actualizar el modo manual. Inténtalo nuevamente.";
        setManualToggleError(message);
        return false;
      }

      const manual = typeof payload.manual === "boolean" ? payload.manual : nextManualValue;
      setThreadItems((current) =>
        current.map((thread) => {
          if (thread.id !== targetId) {
            return thread;
          }
          return {
            ...thread,
            manualMode: manual,
          };
        }),
      );
      setManualToggleError(null);
      return true;
    } catch (error) {
      console.error("[inbox] manual toggle failed", error);
      setManualToggleError("Ocurrió un error inesperado al actualizar el modo manual.");
      return false;
    } finally {
      setManualToggling(false);
    }
  }, [selectedThread]);

  const openPromoteDialog = React.useCallback(() => {
    if (!selectedThread || selectedThread.opportunityId) {
      return;
    }
    setPromoteError(null);
    setPromoteFormError(null);
    setPromoteForm(buildPromoteFormState(selectedThread));
    setPromoteDialogOpen(true);
  }, [selectedThread]);

  const handlePromoteOpportunity = React.useCallback(async () => {
    if (!selectedThread || selectedThread.opportunityId) {
      return false;
    }
    if (!promoteForm) {
      setPromoteFormError("Completa el formulario para crear la oportunidad.");
      return false;
    }
    const nombre = promoteForm.nombre.trim();
    const apellidoPaterno = promoteForm.apellido_paterno.trim();
    const apellidoMaterno = promoteForm.apellido_materno.trim();
    const nombreCompleto = [nombre, apellidoPaterno, apellidoMaterno].filter(Boolean).join(" ");
    const correo = promoteForm.correo.trim();
    const telefono = promoteForm.telefono_e164.trim();
    const empresa = promoteForm.company_name.trim();
    const proyecto = promoteForm.proyecto_nombre.trim();
    const necesidad = promoteForm.necesidad.trim();
    const montoRaw = promoteForm.monto_estimado.trim();

    if (!nombre || !apellidoPaterno || !correo || !telefono || !empresa || !proyecto || !necesidad || !montoRaw) {
      setPromoteFormError("Completa todos los campos para crear la oportunidad.");
      return false;
    }
    const monto = Number(montoRaw.replace(/,/g, ""));
    if (!Number.isFinite(monto) || monto < 0) {
      setPromoteFormError("Monto estimado inválido.");
      return false;
    }

    const targetId = selectedThread.id;
    setPromoteFormError(null);
    setPromoteError(null);
    setPromotingOpportunity(true);
    try {
      const response = await fetch(`/api/inbox/${targetId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          apellido_paterno: apellidoPaterno,
          apellido_materno: apellidoMaterno,
          nombre_completo: nombreCompleto,
          correo,
          telefono_e164: telefono,
          company_name: empresa,
          proyecto_nombre: proyecto,
          necesidad,
          monto_estimado: monto,
        }),
      });
      const text = await response.text();
      const payload = parsePromotePayload(text);
      if (!response.ok) {
        const message =
          payload.error ??
          payload.detail ??
          payload.message ??
          "No se pudo crear la oportunidad desde esta conversación.";
        setPromoteError(message);
        return false;
      }
      const opportunityId =
        typeof payload.oportunidad_id === "string" && payload.oportunidad_id.trim().length
          ? payload.oportunidad_id
          : null;
      if (!opportunityId) {
        setPromoteError("No se recibió un ID de oportunidad válido.");
        return false;
      }
      setThreadItems((current) =>
        current.map((thread) =>
          thread.id === targetId
            ? {
                ...thread,
                opportunityId,
                contactoNombre: nombreCompleto || thread.contactoNombre,
                contactoCorreo: correo || thread.contactoCorreo,
                contactoTelefono: telefono || thread.contactoTelefono,
              }
            : thread,
        ),
      );
      setPromoteError(null);
      setPromoteDialogOpen(false);
      return true;
    } catch (error) {
      console.error("[inbox] promote opportunity failed", error);
      setPromoteError("Ocurrió un error inesperado al crear la oportunidad.");
      return false;
    } finally {
      setPromotingOpportunity(false);
    }
  }, [selectedThread, promoteForm]);

  return (
    <div className="flex gap-4">
      <aside className="flex h-[calc(100vh-13rem)] min-h-[320px] w-[320px] flex-col overflow-hidden rounded-lg border bg-card">
        <div className="flex-1 overflow-y-auto">
          {filteredThreads.length ? (
            <>
              <ul className="divide-y">
                {filteredThreads.map((thread) => {
                const isActive = thread.id === selectedId;
                const displayTime = thread.previewAt || thread.ultimoMensajeEn || thread.iniciadoEn || null;
                const unread = thread.noLeidos > 0;
                const formattedTime = formatShortTimeLabel(displayTime, isHydrated);
                const restartSequence = Math.max(1, thread.restartSequence ?? 1);
                const isRestart = restartSequence > 1;
                const channelBadgeClass = getChannelBadgeClass(thread.canal);
                const sourceBadge = getSourceBadge(thread.source, thread.canal);
                const sourceDetailText = getSourceDetailText(thread);
                return (
                  <li key={thread.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectThread(thread.id)}
                      className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition ${isActive ? "bg-primary/10" : "hover:bg-muted"}`}
                    >
                      <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium" title={thread.contactoTelefono || undefined}>
                    {thread.contactoNombre}
                  </span>
                  {isRestart ? (
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-tight">
                      {`Reinicio #${restartSequence}`}
                    </Badge>
                  ) : null}
                  {thread.reengageAttempts > 0 ? (
                    <Badge variant="destructive" className="text-[10px] uppercase tracking-tight">
                      {`${thread.reengageAttempts} reenganche${thread.reengageAttempts === 1 ? "" : "s"}`}
                    </Badge>
                  ) : null}
                  {unread ? <IconCircleFilled className="size-2 fill-primary" /> : null}
                </div>
                        <span className="text-xs text-muted-foreground">{formattedTime}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className={`uppercase ${channelBadgeClass} ${compactKpiTagClass}`}>
                          {thread.canal}
                        </Badge>
                        {formatCountryLabel(
                          thread.contactoCountryCode,
                          thread.contactoCountryName,
                          thread.contactoCityName,
                          thread.contactoStateName,
                          thread.contactoLada,
                        ) ? (
                          <Badge variant="outline" className={compactKpiTagClass}>
                            {formatCountryLabel(
                              thread.contactoCountryCode,
                              thread.contactoCountryName,
                              thread.contactoCityName,
                              thread.contactoStateName,
                              thread.contactoLada,
                            )}
                          </Badge>
                        ) : null}
                        {sourceBadge ? (
                          <Badge
                            variant={sourceBadge.variant}
                            className={`uppercase ${compactKpiTagClass}`}
                          >
                            {sourceBadge.label}
                          </Badge>
                        ) : null}
                        {sourceBadge?.label === "CTA de WhatsApp" && sourceDetailText.reglaNombre ? (
                          <Badge
                            variant="outline"
                            className={`max-w-[200px] truncate ${compactKpiTagClass} ${getAttributionBadgeClass("regla")}`}
                          >
                            {sourceDetailText.reglaNombre}
                          </Badge>
                        ) : null}
                        {sourceBadge?.label === "CTA de WhatsApp" && sourceDetailText.canalPublicitario ? (
                          <Badge
                            variant="outline"
                            className={`max-w-[180px] truncate ${compactKpiTagClass} ${getAttributionBadgeClass("canal")}`}
                          >
                            {sourceDetailText.canalPublicitario}
                          </Badge>
                        ) : null}
                        {sourceBadge?.label === "CTA de WhatsApp" && sourceDetailText.campanaPublicitaria ? (
                          <Badge
                            variant="outline"
                            className={`max-w-[180px] truncate ${compactKpiTagClass} ${getAttributionBadgeClass("campana")}`}
                          >
                            {sourceDetailText.campanaPublicitaria}
                          </Badge>
                        ) : null}
                        {thread.campanaId ? (
                          <Badge variant="outline" className={`max-w-[160px] truncate ${compactKpiTagClass}`}>
                            {thread.campanaLabel ??
                              campanaLabelMap.get(thread.campanaId) ??
                              "Campaña"}
                          </Badge>
                        ) : null}
                        {thread.templateLabel ? (
                          <Badge variant="outline" className={`max-w-[160px] truncate ${compactKpiTagClass}`}>
                            {thread.templateLabel}
                          </Badge>
                        ) : null}
                        {thread.batchId ? (
                          <Badge variant="outline" className={`max-w-[160px] truncate ${compactKpiTagClass}`}>
                            {thread.batchLabel ??
                              batchLabelMap.get(thread.batchId) ??
                              "Lote"}
                          </Badge>
                        ) : null}
                        {thread.asignadoNombre ? <span>Asignado a {thread.asignadoNombre}</span> : null}
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {thread.preview?.length ? thread.preview : "Sin vista previa disponible"}
                      </p>
                      {thread.tags.length ? (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {thread.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px] uppercase">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </button>
                  </li>
                );
                })}
              </ul>
              {threadItems.length < totalThreads ? (
                <div className="border-t px-3 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => void handleLoadMoreThreads()}
                    disabled={loadingMoreThreads}
                  >
                    {loadingMoreThreads
                      ? "Cargando..."
                      : `Cargar más (${threadItems.length}/${totalThreads})`}
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-6 py-12 text-center text-sm text-muted-foreground">
              No hay conversaciones que coincidan con la búsqueda.
            </div>
          )}
        </div>
      </aside>

      <section className="flex h-[calc(100vh-13rem)] min-h-[320px] flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        {selectedThread ? (
          <>
            <header className="flex items-center justify-between gap-4 border-b px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold" title={selectedThread.contactoTelefono || undefined}>
                  {selectedThread.contactoNombre}
                </h3>
                <span
                  className={`text-[6px] uppercase tracking-[0.3em] rounded-full border px-3 py-1 ${getChannelBadgeClass(
                    selectedThread.canal,
                  )}`}
                >
                  {selectedThread.canal}
                </span>
                {selectedSourceBadge ? (
                  <Badge
                    variant={selectedSourceBadge.variant}
                    className={`uppercase ${compactKpiTagClass}`}
                  >
                    {selectedSourceBadge.label}
                  </Badge>
                ) : null}
                {selectedSourceBadge?.label === "CTA de WhatsApp" && selectedSourceDetail.reglaNombre ? (
                  <Badge
                    variant="outline"
                    className={`max-w-[220px] truncate ${compactKpiTagClass} ${getAttributionBadgeClass("regla")}`}
                  >
                    {selectedSourceDetail.reglaNombre}
                  </Badge>
                ) : null}
                {selectedSourceBadge?.label === "CTA de WhatsApp" && selectedSourceDetail.canalPublicitario ? (
                  <Badge
                    variant="outline"
                    className={`max-w-[220px] truncate ${compactKpiTagClass} ${getAttributionBadgeClass("canal")}`}
                  >
                    {selectedSourceDetail.canalPublicitario}
                  </Badge>
                ) : null}
                {selectedSourceBadge?.label === "CTA de WhatsApp" && selectedSourceDetail.campanaPublicitaria ? (
                  <Badge
                    variant="outline"
                    className={`max-w-[220px] truncate ${compactKpiTagClass} ${getAttributionBadgeClass("campana")}`}
                  >
                    {selectedSourceDetail.campanaPublicitaria}
                  </Badge>
                ) : null}
                {selectedThread.campanaId ? (
                  <Badge variant="outline" className={`max-w-[220px] truncate ${compactKpiTagClass}`}>
                    {selectedThread.campanaLabel ??
                      campanaLabelMap.get(selectedThread.campanaId) ??
                      "Campaña"}
                  </Badge>
                ) : null}
                {selectedThread.templateLabel ? (
                  <Badge variant="outline" className={`max-w-[220px] truncate ${compactKpiTagClass}`}>
                    {selectedThread.templateLabel}
                  </Badge>
                ) : null}
                {selectedThread.batchId ? (
                  <Badge variant="outline" className={`max-w-[220px] truncate ${compactKpiTagClass}`}>
                    {selectedThread.batchLabel ??
                      batchLabelMap.get(selectedThread.batchId) ??
                      "Lote"}
                  </Badge>
                ) : null}
                {formatCountryLabel(
                  selectedThread.contactoCountryCode,
                  selectedThread.contactoCountryName,
                  selectedThread.contactoCityName,
                  selectedThread.contactoStateName,
                  selectedThread.contactoLada,
                ) ? (
                  <Badge variant="outline" className={compactKpiTagClass}>
                    {formatCountryLabel(
                      selectedThread.contactoCountryCode,
                      selectedThread.contactoCountryName,
                      selectedThread.contactoCityName,
                      selectedThread.contactoStateName,
                      selectedThread.contactoLada,
                    )}
                  </Badge>
                ) : null}
                {selectedThread.contactoTelefono ? (
                  <span className="text-xs text-muted-foreground">{selectedThread.contactoTelefono}</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {selectedThread.canal.toLowerCase() === "correo" && selectedThread.opportunityId ? (
                  <Badge variant="outline" className="uppercase">
                    Oportunidad creada
                  </Badge>
                ) : selectedThread.canal.toLowerCase() === "correo" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={openPromoteDialog}
                    disabled={promotingOpportunity}
                  >
                    <IconTargetArrow className="size-4" />
                    {promotingOpportunity ? "Creando..." : "Crear oportunidad"}
                  </Button>
                ) : null}
                <Button
                  variant={selectedThread.manualMode ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={handleToggleManualMode}
                  disabled={manualToggling}
                  aria-pressed={selectedThread.manualMode}
                >
                  {selectedThread.manualMode ? (
                    <>
                      <IconRobot className="size-4" />
                      {manualToggling ? "Reactivando…" : "Volver al asistente"}
                    </>
                  ) : (
                    <>
                      <IconRobotOff className="size-4" />
                      {manualToggling ? "Pausando…" : "Pausar asistente"}
                    </>
                  )}
                </Button>
              </div>
            </header>

            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-5 py-4">
              {manualToggleError ? (
                <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {manualToggleError}
                </div>
              ) : null}
              {promoteError ? (
                <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {promoteError}
                </div>
              ) : null}
              {selectedThread.manualMode ? (
                <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                  Modo manual activado: el asistente no enviará respuestas automáticas.
                </div>
              ) : null}
              <div className="flex flex-col gap-4">
              {currentMessages.length ? (
                currentMessages.map((message) => (
                  <InboxMessageRow key={message.id} message={message} isHydrated={isHydrated} />
                ))
                ) : (
                  <p className="text-sm text-muted-foreground">Aún no hay mensajes en esta conversación.</p>
                )}
              </div>
            </div>

            <InboxComposer
              placeholder={
                selectedThread.manualMode
                  ? `Responder a ${selectedThread.contactoNombre || "este contacto"}`
                  : 'Activa "Pausar asistente" para responder manualmente'
              }
              pending={sending}
              uploadingAttachments={uploadingAttachments}
              attachments={pendingAttachments}
              attachmentError={attachmentError}
              error={sendError}
              onSend={handleSendMessage}
              onAttachmentAdd={handleAttachmentUpload}
              onAttachmentRemove={handleAttachmentRemove}
              disabled={!selectedThread.manualMode}
              disabledMessage='Activa "Pausar asistente" para escribir manualmente.'
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <h3 className="text-lg font-semibold">Selecciona una conversación</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              El detalle de la conversación se mostrará aquí. Puedes filtrar por etiquetas, asignados o prioridad para encontrarla rápidamente.
            </p>
          </div>
        )}
      </section>

      <Dialog open={promoteDialogOpen} onOpenChange={(open) => (!promotingOpportunity ? setPromoteDialogOpen(open) : null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Crear oportunidad desde Inbox</DialogTitle>
            <DialogDescription>
              Completa los datos del contacto y de la oportunidad para registrar correctamente el lead.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="promote-nombre">Nombre</Label>
                <Input
                  id="promote-nombre"
                  value={promoteForm?.nombre ?? ""}
                  onChange={(event) =>
                    setPromoteForm((prev) => ({
                      ...(prev ?? emptyPromoteFormState()),
                      nombre: event.target.value,
                    }))
                  }
                  disabled={promotingOpportunity}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="promote-apellido-paterno">Apellido paterno</Label>
                <Input
                  id="promote-apellido-paterno"
                  value={promoteForm?.apellido_paterno ?? ""}
                  onChange={(event) =>
                    setPromoteForm((prev) => ({
                      ...(prev ?? emptyPromoteFormState()),
                      apellido_paterno: event.target.value,
                    }))
                  }
                  disabled={promotingOpportunity}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="promote-apellido-materno">Apellido materno</Label>
                <Input
                  id="promote-apellido-materno"
                  value={promoteForm?.apellido_materno ?? ""}
                  onChange={(event) =>
                    setPromoteForm((prev) => ({
                      ...(prev ?? emptyPromoteFormState()),
                      apellido_materno: event.target.value,
                    }))
                  }
                  disabled={promotingOpportunity}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="promote-correo">Correo</Label>
                <Input
                  id="promote-correo"
                  type="email"
                  value={promoteForm?.correo ?? ""}
                  onChange={(event) =>
                    setPromoteForm((prev) => ({
                      ...(prev ?? {
                        nombre: "",
                        apellido_paterno: "",
                        apellido_materno: "",
                        nombre_completo: "",
                        correo: "",
                        telefono_e164: "",
                        company_name: "",
                        proyecto_nombre: "",
                        necesidad: "",
                        monto_estimado: "",
                      }),
                      correo: event.target.value,
                    }))
                  }
                  disabled={promotingOpportunity}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="promote-telefono">Teléfono</Label>
                <Input
                  id="promote-telefono"
                  value={promoteForm?.telefono_e164 ?? ""}
                  onChange={(event) =>
                    setPromoteForm((prev) => ({
                      ...(prev ?? {
                        nombre: "",
                        apellido_paterno: "",
                        apellido_materno: "",
                        nombre_completo: "",
                        correo: "",
                        telefono_e164: "",
                        company_name: "",
                        proyecto_nombre: "",
                        necesidad: "",
                        monto_estimado: "",
                      }),
                      telefono_e164: event.target.value,
                    }))
                  }
                  disabled={promotingOpportunity}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="promote-empresa">Empresa</Label>
              <Input
                id="promote-empresa"
                value={promoteForm?.company_name ?? ""}
                onChange={(event) =>
                  setPromoteForm((prev) => ({
                    ...(prev ?? {
                      nombre: "",
                      apellido_paterno: "",
                      apellido_materno: "",
                      nombre_completo: "",
                      correo: "",
                      telefono_e164: "",
                      company_name: "",
                      proyecto_nombre: "",
                      necesidad: "",
                      monto_estimado: "",
                    }),
                    company_name: event.target.value,
                  }))
                }
                disabled={promotingOpportunity}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="promote-proyecto">Nombre del proyecto</Label>
              <Input
                id="promote-proyecto"
                value={promoteForm?.proyecto_nombre ?? ""}
                onChange={(event) =>
                  setPromoteForm((prev) => ({
                    ...(prev ?? {
                      nombre: "",
                      apellido_paterno: "",
                      apellido_materno: "",
                      nombre_completo: "",
                      correo: "",
                      telefono_e164: "",
                      company_name: "",
                      proyecto_nombre: "",
                      necesidad: "",
                      monto_estimado: "",
                    }),
                    proyecto_nombre: event.target.value,
                  }))
                }
                disabled={promotingOpportunity}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="promote-necesidad">Necesidad</Label>
              <Textarea
                id="promote-necesidad"
                rows={3}
                value={promoteForm?.necesidad ?? ""}
                onChange={(event) =>
                  setPromoteForm((prev) => ({
                    ...(prev ?? {
                      nombre: "",
                      apellido_paterno: "",
                      apellido_materno: "",
                      nombre_completo: "",
                      correo: "",
                      telefono_e164: "",
                      company_name: "",
                      proyecto_nombre: "",
                      necesidad: "",
                      monto_estimado: "",
                    }),
                    necesidad: event.target.value,
                  }))
                }
                disabled={promotingOpportunity}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="promote-monto">Monto estimado</Label>
              <Input
                id="promote-monto"
                type="number"
                min="0"
                step="0.01"
                value={promoteForm?.monto_estimado ?? ""}
                onChange={(event) =>
                  setPromoteForm((prev) => ({
                    ...(prev ?? {
                      nombre: "",
                      apellido_paterno: "",
                      apellido_materno: "",
                      nombre_completo: "",
                      correo: "",
                      telefono_e164: "",
                      company_name: "",
                      proyecto_nombre: "",
                      necesidad: "",
                      monto_estimado: "",
                    }),
                    monto_estimado: event.target.value,
                  }))
                }
                disabled={promotingOpportunity}
              />
            </div>

            {promoteFormError ? (
              <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {promoteFormError}
              </div>
            ) : null}
            {promoteError ? (
              <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {promoteError}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPromoteDialogOpen(false)}
              disabled={promotingOpportunity}
            >
              Cancelar
            </Button>
            <Button onClick={() => void handlePromoteOpportunity()} disabled={promotingOpportunity}>
              {promotingOpportunity ? "Creando..." : "Crear oportunidad"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function mergeThreadLists(current: InboxThread[], incoming: InboxThread[]): InboxThread[] {
  if (!incoming.length) {
    return current;
  }
  const currentMap = new Map(current.map((item) => [item.id, item]));
  const isGenericContactName = (value: string | null | undefined): boolean => {
    const normalized = (value ?? "").trim().toLowerCase();
    return normalized === "contacto sin nombre";
  };
  const preferIncomingString = (
    incomingValue: string | null | undefined,
    currentValue: string | null | undefined,
  ): string | null => {
    if (typeof incomingValue === "string" && incomingValue.trim().length) {
      return incomingValue;
    }
    if (typeof currentValue === "string" && currentValue.trim().length) {
      return currentValue;
    }
    return incomingValue ?? currentValue ?? null;
  };
  const preferIncomingSource = (incomingValue: string | null, currentValue: string | null): string | null => {
    const normalizedIncoming = (incomingValue ?? "").trim().toLowerCase();
    const normalizedCurrent = (currentValue ?? "").trim().toLowerCase();
    if (normalizedIncoming === "whatsapp" && (normalizedCurrent === "publicidad_whatsapp" || isProspeccionSource(normalizedCurrent))) {
      return currentValue;
    }
    if (!normalizedIncoming && normalizedCurrent) {
      return currentValue;
    }
    return incomingValue ?? currentValue ?? null;
  };
  const preferIncomingContactName = (incomingValue: string | null, currentValue: string | null): string | null => {
    if (typeof incomingValue === "string" && incomingValue.trim().length && !isGenericContactName(incomingValue)) {
      return incomingValue;
    }
    if (typeof currentValue === "string" && currentValue.trim().length && !isGenericContactName(currentValue)) {
      return currentValue;
    }
    if (typeof incomingValue === "string" && incomingValue.trim().length) {
      return incomingValue;
    }
    return incomingValue ?? currentValue ?? null;
  };
  const merged: InboxThread[] = incoming.map((thread) => {
    const existing = currentMap.get(thread.id);
    if (!existing) {
      return thread;
    }
    const messages = mergeMessageHistory(thread.messages, existing.messages);
    const lastMessage = messages.length ? messages[messages.length - 1]! : null;
    const incomingSourceDetail =
      thread.sourceDetail && Object.keys(thread.sourceDetail).length > 0 ? thread.sourceDetail : null;
    const resolvedSourceDetail =
      incomingSourceDetail ??
      (existing.sourceDetail && Object.keys(existing.sourceDetail).length > 0 ? existing.sourceDetail : null);
    const resolvedPersonaId =
      preferIncomingString(thread.personaId, existing.personaId) ??
      preferIncomingString(thread.contactoId, existing.contactoId) ??
      existing.personaId ??
      existing.contactoId;
    const resolvedContactoId =
      preferIncomingString(thread.contactoId, existing.contactoId) ??
      preferIncomingString(thread.personaId, existing.contactoId) ??
      existing.contactoId ??
      existing.personaId;
    return {
      ...thread,
      personaId: resolvedPersonaId,
      contactoId: resolvedContactoId,
      contactoNombre: preferIncomingContactName(thread.contactoNombre, existing.contactoNombre) ?? "",
      contactoProfileName: preferIncomingString(thread.contactoProfileName, existing.contactoProfileName),
      contactoCorreo: preferIncomingString(thread.contactoCorreo, existing.contactoCorreo),
      contactoTelefono: preferIncomingString(thread.contactoTelefono, existing.contactoTelefono),
      contactoCountryCode: preferIncomingString(thread.contactoCountryCode, existing.contactoCountryCode),
      contactoCountryName: preferIncomingString(thread.contactoCountryName, existing.contactoCountryName),
      contactoStateName: preferIncomingString(thread.contactoStateName, existing.contactoStateName),
      contactoCityName: preferIncomingString(thread.contactoCityName, existing.contactoCityName),
      contactoLada: preferIncomingString(thread.contactoLada, existing.contactoLada),
      canal: preferIncomingString(thread.canal, existing.canal) ?? existing.canal,
      source: preferIncomingSource(thread.source, existing.source),
      sourceDetail: resolvedSourceDetail,
      batchId: preferIncomingString(thread.batchId, existing.batchId),
      batchLabel: preferIncomingString(thread.batchLabel, existing.batchLabel),
      campanaId: preferIncomingString(thread.campanaId, existing.campanaId),
      campanaLabel: preferIncomingString(thread.campanaLabel, existing.campanaLabel),
      templateId: preferIncomingString(thread.templateId, existing.templateId),
      templateLabel: preferIncomingString(thread.templateLabel, existing.templateLabel),
      templateSlug: preferIncomingString(thread.templateSlug, existing.templateSlug),
      asignadoId: preferIncomingString(thread.asignadoId, existing.asignadoId),
      asignadoNombre: preferIncomingString(thread.asignadoNombre, existing.asignadoNombre),
      tags: thread.tags.length ? thread.tags : existing.tags,
      messages,
      preview: thread.preview ?? lastMessage?.body?.[0] ?? existing.preview,
      previewAt: thread.previewAt ?? lastMessage?.timestamp ?? existing.previewAt,
      ultimoMensajeEn: thread.ultimoMensajeEn ?? lastMessage?.timestamp ?? existing.ultimoMensajeEn,
    };
  });

  for (const thread of current) {
    if (!incoming.find((candidate) => candidate.id === thread.id)) {
      merged.push(thread);
    }
  }
  return merged;
}

function appendThreadPage(current: InboxThread[], incoming: InboxThread[]): InboxThread[] {
  if (!incoming.length) return current;
  const seen = new Set(current.map((item) => item.id));
  const next = [...current];
  for (const thread of incoming) {
    if (!seen.has(thread.id)) {
      next.push(thread);
      seen.add(thread.id);
    }
  }
  return next;
}
