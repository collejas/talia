#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/var/www/talia}"
KEEP_PROD_RELEASES="${KEEP_PROD_RELEASES:-2}"
KEEP_STG_RELEASES="${KEEP_STG_RELEASES:-2}"
KEEP_BACKUPS="${KEEP_BACKUPS:-2}"
JOURNAL_VACUUM_TIME="${JOURNAL_VACUUM_TIME:-14d}"
DRY_RUN="${DRY_RUN:-0}"

LOG_DIR="${ROOT_DIR}/logs/maintenance"
mkdir -p "${LOG_DIR}" 2>/dev/null || true
LOG_FILE="${LOG_DIR}/disk_cleanup.log"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() {
  local line
  line="$(ts) $*"
  echo "${line}"
  if [[ -n "${LOG_FILE}" ]]; then
    touch "${LOG_FILE}" 2>/dev/null || true
    if [[ -w "${LOG_FILE}" ]]; then
      echo "${line}" >> "${LOG_FILE}"
    fi
  fi
}

run_rm_rf() {
  local target="$1"
  [[ -e "$target" ]] || return 0
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY_RUN rm -rf $target"
  else
    rm -rf -- "$target"
    log "removed $target"
  fi
}

cleanup_release_dir() {
  local releases_dir="$1"
  local current_link="$2"
  local keep="$3"
  [[ -d "$releases_dir" ]] || return 0

  local current_target=""
  if [[ -L "$current_link" ]]; then
    current_target="$(readlink -f "$current_link" || true)"
  fi

  shopt -s nullglob
  for tmp in "$releases_dir"/*.tmp; do
    run_rm_rf "$tmp"
  done
  shopt -u nullglob

  mapfile -t releases < <(ls -1dt "$releases_dir"/* 2>/dev/null || true)
  (( ${#releases[@]} > 0 )) || return 0

  declare -A preserve=()
  local count=0
  for rel in "${releases[@]}"; do
    if [[ "$count" -lt "$keep" ]]; then
      preserve["$rel"]=1
      count=$((count + 1))
    fi
  done
  if [[ -n "$current_target" ]]; then
    preserve["$current_target"]=1
  fi

  for rel in "${releases[@]}"; do
    if [[ -n "${preserve[$rel]:-}" ]]; then
      log "keep $rel"
      continue
    fi
    run_rm_rf "$rel"
  done
}

cleanup_backups() {
  local backups_dir="${ROOT_DIR}/backups"
  [[ -d "$backups_dir" ]] || return 0
  mapfile -t bks < <(ls -1dt "$backups_dir"/postgres_* 2>/dev/null || true)
  (( ${#bks[@]} > 0 )) || return 0

  local idx=0
  for b in "${bks[@]}"; do
    idx=$((idx + 1))
    if [[ "$idx" -le "$KEEP_BACKUPS" ]]; then
      log "keep backup $b"
      continue
    fi
    run_rm_rf "$b"
  done
}

cleanup_system_logs() {
  if command -v journalctl >/dev/null 2>&1; then
    if [[ "$DRY_RUN" == "1" ]]; then
      log "DRY_RUN journalctl --vacuum-time=${JOURNAL_VACUUM_TIME}"
    else
      journalctl --vacuum-time="${JOURNAL_VACUUM_TIME}" >/dev/null 2>&1 || true
      log "journal vacuum ${JOURNAL_VACUUM_TIME}"
    fi
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY_RUN apt-get clean"
  else
    apt-get clean >/dev/null 2>&1 || true
    log "apt cache cleaned"
  fi
}

main() {
  log "start cleanup root=${ROOT_DIR} keep_prod=${KEEP_PROD_RELEASES} keep_stg=${KEEP_STG_RELEASES} keep_backups=${KEEP_BACKUPS} dry_run=${DRY_RUN}"
  cleanup_release_dir "${ROOT_DIR}/releases/panel" "${ROOT_DIR}/current/panel" "${KEEP_PROD_RELEASES}"
  cleanup_release_dir "${ROOT_DIR}/releases/panel-staging" "${ROOT_DIR}/current/panel-staging" "${KEEP_STG_RELEASES}"
  cleanup_backups
  cleanup_system_logs
  local usage
  usage="$(df -h / | awk 'NR==2 {print $5 " used, " $4 " free"}')"
  log "done disk=${usage}"
}

main
