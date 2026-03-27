import type { InboxThread } from "@/lib/inbox/data";

export type ReengageFilterOption = {
  value: string;
  label: string;
};

export const REENGAGE_FILTER_RESTART_PREFIX = "__restart_";
export const REENGAGE_FILTER_REENGAGE_ATTEMPTS = "__reengage_attempts";
export const REENGAGE_TAG_PREFIX = "tag:";

function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function buildDerivedReengageOptions(threads: InboxThread[]): ReengageFilterOption[] {
  const options: ReengageFilterOption[] = [];
  const hasReengageAttempts = threads.some((thread) => (thread.reengageAttempts ?? 0) > 0);
  if (hasReengageAttempts) {
    options.push({
      value: REENGAGE_FILTER_REENGAGE_ATTEMPTS,
      label: "Conversaciones con reenganches",
    });
  }
  const restartSequences = Array.from(
    new Set(
      threads
        .map((thread) => thread.restartSequence ?? 1)
        .filter((sequence) => sequence > 1),
    ),
  ).sort((a, b) => a - b);
  for (const sequence of restartSequences) {
    options.push({
      value: `${REENGAGE_FILTER_RESTART_PREFIX}${sequence}`,
      label: `Reinicio #${sequence}`,
    });
  }
  return options;
}

export function matchesReengageFilter(thread: InboxThread, filterValue: string): boolean {
  if (!filterValue) return true;
  if (filterValue === REENGAGE_FILTER_REENGAGE_ATTEMPTS) {
    return (thread.reengageAttempts ?? 0) > 0;
  }
  if (filterValue.startsWith(REENGAGE_FILTER_RESTART_PREFIX)) {
    const sequence = Number(filterValue.slice(REENGAGE_FILTER_RESTART_PREFIX.length));
    return sequence > 0 && (thread.restartSequence ?? 1) === sequence;
  }
  if (filterValue.startsWith(REENGAGE_TAG_PREFIX)) {
    const normalizedTarget = normalizeText(filterValue.slice(REENGAGE_TAG_PREFIX.length));
    if (!normalizedTarget.length) {
      return false;
    }
    return thread.tags.some(
      (candidate) => normalizeText(candidate) === normalizedTarget,
    );
  }
  return false;
}
