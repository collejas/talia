#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/var/www/talia}"

KEEP_PROD_RELEASES="${KEEP_PROD_RELEASES:-1}"
KEEP_STG_RELEASES="${KEEP_STG_RELEASES:-1}"
KEEP_BACKUPS="${KEEP_BACKUPS:-2}"
JOURNAL_VACUUM_TIME="${JOURNAL_VACUUM_TIME:-5d}"
KEEP_LOG_DAYS="${KEEP_LOG_DAYS:-2}"
TRUNCATE_LOGS_OVER_MB="${TRUNCATE_LOGS_OVER_MB:-5}"

DRY_RUN="${DRY_RUN:-0}"

RUN_NPM_CACHE_CLEAN="${RUN_NPM_CACHE_CLEAN:-1}"
RUN_GIT_GC="${RUN_GIT_GC:-1}"
RUN_TOOL_CACHE_CLEAN="${RUN_TOOL_CACHE_CLEAN:-1}"
RUN_NEXT_CACHE_CLEAN="${RUN_NEXT_CACHE_CLEAN:-1}"
RUN_RELEASE_ARTIFACT_CLEAN="${RUN_RELEASE_ARTIFACT_CLEAN:-1}"
RUN_LOCAL_PACKAGE_CACHE_CLEAN="${RUN_LOCAL_PACKAGE_CACHE_CLEAN:-1}"
RUN_PYTHON_BYTECODE_CLEAN="${RUN_PYTHON_BYTECODE_CLEAN:-1}"
RUN_VSCODE_CACHE_CLEAN="${RUN_VSCODE_CACHE_CLEAN:-0}"
RUN_SOURCE_BUILD_CACHE_CLEAN="${RUN_SOURCE_BUILD_CACHE_CLEAN:-0}"
RUN_EXTRA_PROJECTS_CLEAN="${RUN_EXTRA_PROJECTS_CLEAN:-1}"
RUN_APT_AUTOREMOVE="${RUN_APT_AUTOREMOVE:-0}"

# Extra projects living in same droplet that may accumulate logs/caches/backups.
EXTRA_PROJECT_DIRS="${EXTRA_PROJECT_DIRS:-/var/www/maria_imlux /opt/richard}"

# VS Code remote
VSCODE_SERVER_DIR="${VSCODE_SERVER_DIR:-/home/jorge/.vscode-server}"

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
    log "DRY_RUN rm -rf ${target}"
  else
    rm -rf -- "${target}"
    log "removed ${target}"
  fi
}

run_delete_file() {
  local target="$1"
  [[ -e "$target" ]] || return 0
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY_RUN rm -f ${target}"
  else
    rm -f -- "${target}"
    log "removed ${target}"
  fi
}

run_cmd() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY_RUN $*"
  else
    "$@" >/dev/null 2>&1 || true
    log "ran $*"
  fi
}

resolve_path_owner() {
  local target="$1"
  if [[ ! -e "$target" ]]; then
    return 1
  fi
  stat -c '%U' "$target" 2>/dev/null || return 1
}

cleanup_release_dir() {
  local releases_dir="$1"
  local current_link="$2"
  local keep="$3"
  [[ -d "${releases_dir}" ]] || return 0

  local current_target=""
  if [[ -L "${current_link}" ]]; then
    current_target="$(readlink -f "${current_link}" || true)"
  fi

  shopt -s nullglob
  for tmp in "${releases_dir}"/*.tmp; do
    run_rm_rf "${tmp}"
  done
  for packed in "${releases_dir}"/*.standalone; do
    run_rm_rf "${packed}"
  done
  shopt -u nullglob

  mapfile -t releases < <(ls -1dt "${releases_dir}"/* 2>/dev/null | grep -Ev '\.(tmp|standalone)$' || true)
  (( ${#releases[@]} > 0 )) || return 0

  declare -A preserve=()
  local count=0
  local rel
  for rel in "${releases[@]}"; do
    if [[ "${count}" -lt "${keep}" ]]; then
      preserve["${rel}"]=1
      count=$((count + 1))
    fi
  done

  if [[ -n "${current_target}" ]]; then
    preserve["${current_target}"]=1
  fi

  for rel in "${releases[@]}"; do
    if [[ -n "${preserve[$rel]:-}" ]]; then
      log "keep release ${rel}"
      continue
    fi
    run_rm_rf "${rel}"
  done
}

cleanup_backups() {
  local backups_dir="${ROOT_DIR}/backups"
  [[ -d "${backups_dir}" ]] || return 0

  mapfile -t bks < <(ls -1dt "${backups_dir}"/postgres_* 2>/dev/null || true)
  (( ${#bks[@]} > 0 )) || return 0

  local idx=0
  local b
  for b in "${bks[@]}"; do
    idx=$((idx + 1))
    if [[ "${idx}" -le "${KEEP_BACKUPS}" ]]; then
      log "keep backup ${b}"
      continue
    fi
    run_rm_rf "${b}"
  done
}

cleanup_old_logs_in_dir() {
  local logs_dir="$1"
  [[ -d "${logs_dir}" ]] || return 0

  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY_RUN prune old logs in ${logs_dir} keep_days=${KEEP_LOG_DAYS}"
    return 0
  fi

  find "${logs_dir}" -type f -name "*.log" -mtime +"${KEEP_LOG_DAYS}" -delete 2>/dev/null || true
  find "${logs_dir}" -type f -name "*.log.*" -mtime +"${KEEP_LOG_DAYS}" -delete 2>/dev/null || true
  find "${logs_dir}" -type f -name "*.out" -mtime +"${KEEP_LOG_DAYS}" -delete 2>/dev/null || true
  find "${logs_dir}" -type f -name "*.err" -mtime +"${KEEP_LOG_DAYS}" -delete 2>/dev/null || true
  log "old logs pruned in ${logs_dir} keep_days=${KEEP_LOG_DAYS}"
}

cleanup_top_level_logs_in_dir() {
  local base_dir="$1"
  [[ -d "${base_dir}" ]] || return 0

  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY_RUN prune top-level logs in ${base_dir} keep_days=${KEEP_LOG_DAYS}"
    return 0
  fi

  find "${base_dir}" -maxdepth 1 -type f -name "*.log" -mtime +"${KEEP_LOG_DAYS}" -delete 2>/dev/null || true
  find "${base_dir}" -maxdepth 1 -type f -name "*.log.*" -mtime +"${KEEP_LOG_DAYS}" -delete 2>/dev/null || true
  find "${base_dir}" -maxdepth 1 -type f -name "*.out" -mtime +"${KEEP_LOG_DAYS}" -delete 2>/dev/null || true
  find "${base_dir}" -maxdepth 1 -type f -name "*.err" -mtime +"${KEEP_LOG_DAYS}" -delete 2>/dev/null || true
  log "top-level logs pruned in ${base_dir} keep_days=${KEEP_LOG_DAYS}"
}

truncate_large_logs_in_dir() {
  local logs_dir="$1"
  [[ -d "${logs_dir}" ]] || return 0
  [[ "${TRUNCATE_LOGS_OVER_MB}" =~ ^[0-9]+$ ]] || return 0

  while IFS= read -r file; do
    if [[ "${DRY_RUN}" == "1" ]]; then
      log "DRY_RUN truncate -s 0 ${file}"
    else
      truncate -s 0 "${file}" 2>/dev/null || true
      log "truncated ${file}"
    fi
  done < <(find "${logs_dir}" -type f \( -name "*.log" -o -name "*.log.*" -o -name "*.out" -o -name "*.err" \) -size +"${TRUNCATE_LOGS_OVER_MB}"M 2>/dev/null)
}

cleanup_old_logs() {
  cleanup_old_logs_in_dir "${ROOT_DIR}/logs"
  cleanup_top_level_logs_in_dir "${ROOT_DIR}"
  cleanup_top_level_logs_in_dir "${ROOT_DIR}/frontend/panel"
  truncate_large_logs_in_dir "${ROOT_DIR}/logs"
  truncate_large_logs_in_dir "${ROOT_DIR}"
  truncate_large_logs_in_dir "${ROOT_DIR}/frontend/panel"
}

cleanup_tool_caches() {
  if [[ "${RUN_TOOL_CACHE_CLEAN}" != "1" ]]; then
    return 0
  fi

  run_rm_rf "${ROOT_DIR}/backend/.pytest_cache"
  run_rm_rf "${ROOT_DIR}/backend/.ruff_cache"
  run_rm_rf "${ROOT_DIR}/backend/.mypy_cache"

  run_rm_rf "${ROOT_DIR}/frontend/panel/.next/cache"
  run_rm_rf "${ROOT_DIR}/frontend/panel/node_modules/.cache"
  run_rm_rf "${ROOT_DIR}/frontend/panel/.turbo"

  run_rm_rf "${ROOT_DIR}/.mypy_cache"
  run_rm_rf "${ROOT_DIR}/.pytest_cache"
  run_rm_rf "${ROOT_DIR}/.ruff_cache"
  run_rm_rf "${ROOT_DIR}/.turbo"
}

cleanup_next_cache_in_releases() {
  if [[ "${RUN_NEXT_CACHE_CLEAN}" != "1" ]]; then
    return 0
  fi

  local rel
  for rel in "${ROOT_DIR}/releases/panel" "${ROOT_DIR}/releases/panel-staging"; do
    [[ -d "${rel}" ]] || continue
    if [[ "${DRY_RUN}" == "1" ]]; then
      log "DRY_RUN clean .next/cache in ${rel}"
      continue
    fi
    find "${rel}" -type d -path "*/.next/cache" -prune -exec rm -rf {} + 2>/dev/null || true
    log "next cache cleaned in ${rel}"
  done
}

cleanup_release_artifacts() {
  if [[ "${RUN_RELEASE_ARTIFACT_CLEAN}" != "1" ]]; then
    return 0
  fi

  local rel
  for rel in "${ROOT_DIR}/releases/panel" "${ROOT_DIR}/releases/panel-staging"; do
    [[ -d "${rel}" ]] || continue
    if [[ "${DRY_RUN}" == "1" ]]; then
      log "DRY_RUN clean coverage/.pytest_cache/.ruff_cache/.turbo/node_modules/.cache in ${rel}"
      continue
    fi
    find "${rel}" -type d \
      \( -name coverage -o -name .pytest_cache -o -name .ruff_cache -o -name .turbo -o -path "*/node_modules/.cache" \) \
      -prune -exec rm -rf {} + 2>/dev/null || true
    log "release artifacts cleaned in ${rel}"
  done
}

cleanup_local_package_caches() {
  if [[ "${RUN_LOCAL_PACKAGE_CACHE_CLEAN}" != "1" ]]; then
    return 0
  fi

  run_rm_rf "${ROOT_DIR}/.npm-cache/_logs"
  run_rm_rf "${ROOT_DIR}/.npm-cache/_npx"
  run_rm_rf "${ROOT_DIR}/frontend/panel/.npm-cache"
}

cleanup_npm_cache() {
  if [[ "${RUN_NPM_CACHE_CLEAN}" != "1" ]]; then
    return 0
  fi

  if command -v npm >/dev/null 2>&1; then
    run_cmd npm cache clean --force
  fi
}

cleanup_python_bytecode_in_dir() {
  local base="$1"
  [[ -d "${base}" ]] || return 0

  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY_RUN clean python bytecode in ${base}"
    return 0
  fi

  find "${base}" -path "*/venv/*" -prune -o -path "*/.venv/*" -prune -o -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
  find "${base}" -path "*/venv/*" -prune -o -path "*/.venv/*" -prune -o -type f -name "*.pyc" -delete 2>/dev/null || true
  log "python bytecode cleaned in ${base}"
}

cleanup_python_bytecode() {
  if [[ "${RUN_PYTHON_BYTECODE_CLEAN}" != "1" ]]; then
    return 0
  fi
  cleanup_python_bytecode_in_dir "${ROOT_DIR}"
}

cleanup_vscode_caches() {
  if [[ "${RUN_VSCODE_CACHE_CLEAN}" != "1" ]]; then
    return 0
  fi

  run_rm_rf "${VSCODE_SERVER_DIR}/cli.bak"
  run_rm_rf "${VSCODE_SERVER_DIR}/data/CachedData"
  run_rm_rf "${VSCODE_SERVER_DIR}/data/CachedExtensionVSIXs"
  run_rm_rf "${VSCODE_SERVER_DIR}/data/logs"

  # Keep active CLI and server install intact by default.
  log "vscode cache cleanup completed (non-destructive)"
}

cleanup_source_build_caches() {
  if [[ "${RUN_SOURCE_BUILD_CACHE_CLEAN}" != "1" ]]; then
    return 0
  fi

  # Opt-in only: useful when not actively developing panel on server.
  run_rm_rf "${ROOT_DIR}/frontend/panel/node_modules"
  run_rm_rf "${ROOT_DIR}/frontend/panel/.next"
  run_rm_rf "${ROOT_DIR}/frontend/panel/.turbo"
}

cleanup_git_objects() {
  if [[ "${RUN_GIT_GC}" != "1" ]]; then
    return 0
  fi

  if [[ -d "${ROOT_DIR}/.git" ]] && command -v git >/dev/null 2>&1; then
    local repo_owner
    repo_owner="$(resolve_path_owner "${ROOT_DIR}/.git" || resolve_path_owner "${ROOT_DIR}" || true)"

    if [[ "${DRY_RUN}" == "1" ]]; then
      log "DRY_RUN git -C ${ROOT_DIR} gc --prune=now (owner=${repo_owner:-unknown})"
    else
      if [[ "$(id -u)" -eq 0 && -n "${repo_owner}" && "${repo_owner}" != "root" ]]; then
        if command -v sudo >/dev/null 2>&1; then
          sudo -u "${repo_owner}" git -C "${ROOT_DIR}" gc --prune=now >/dev/null 2>&1 || true
        elif command -v runuser >/dev/null 2>&1; then
          runuser -u "${repo_owner}" -- git -C "${ROOT_DIR}" gc --prune=now >/dev/null 2>&1 || true
        else
          su -s /bin/bash - "${repo_owner}" -c "git -C '${ROOT_DIR}' gc --prune=now" >/dev/null 2>&1 || true
        fi
        log "git gc completed as ${repo_owner}"
      else
        git -C "${ROOT_DIR}" gc --prune=now >/dev/null 2>&1 || true
        log "git gc completed"
      fi
    fi
  fi
}

cleanup_system_logs() {
  if command -v journalctl >/dev/null 2>&1; then
    if [[ "${DRY_RUN}" == "1" ]]; then
      log "DRY_RUN journalctl --vacuum-time=${JOURNAL_VACUUM_TIME}"
    else
      journalctl --vacuum-time="${JOURNAL_VACUUM_TIME}" >/dev/null 2>&1 || true
      log "journal vacuum ${JOURNAL_VACUUM_TIME}"
    fi
  fi

  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY_RUN apt-get clean"
  else
    apt-get clean >/dev/null 2>&1 || true
    log "apt cache cleaned"
  fi

  if [[ "${RUN_APT_AUTOREMOVE}" == "1" ]]; then
    if [[ "${DRY_RUN}" == "1" ]]; then
      log "DRY_RUN apt-get autoremove -y"
    else
      apt-get autoremove -y >/dev/null 2>&1 || true
      log "apt autoremove completed"
    fi
  fi
}

cleanup_extra_project_dir() {
  local project_dir="$1"
  [[ -d "${project_dir}" ]] || return 0

  log "extra project cleanup start dir=${project_dir}"

  cleanup_old_logs_in_dir "${project_dir}/logs"
  cleanup_top_level_logs_in_dir "${project_dir}"
  truncate_large_logs_in_dir "${project_dir}/logs"
  truncate_large_logs_in_dir "${project_dir}"

  # Common local backups directories used in side projects.
  local backups_dir=""
  for backups_dir in "${project_dir}/backups" "${project_dir}/Respaldos"; do
    [[ -d "${backups_dir}" ]] || continue

    if [[ "${DRY_RUN}" == "1" ]]; then
      log "DRY_RUN keep newest ${KEEP_BACKUPS} entries in ${backups_dir}"
      continue
    fi

    mapfile -t extra_bks < <(ls -1dt "${backups_dir}"/* 2>/dev/null || true)
    local idx=0
    local b=""
    for b in "${extra_bks[@]}"; do
      idx=$((idx + 1))
      if [[ "${idx}" -le "${KEEP_BACKUPS}" ]]; then
        log "keep extra backup ${b}"
        continue
      fi
      rm -rf -- "${b}" 2>/dev/null || true
      log "removed extra backup ${b}"
    done
  done

  cleanup_python_bytecode_in_dir "${project_dir}"

  # Common harmless caches.
  run_rm_rf "${project_dir}/.pytest_cache"
  run_rm_rf "${project_dir}/.ruff_cache"
  run_rm_rf "${project_dir}/.mypy_cache"
  run_rm_rf "${project_dir}/.turbo"

  # Node/Next caches only, not full node_modules by default.
  run_rm_rf "${project_dir}/.next/cache"
  run_rm_rf "${project_dir}/node_modules/.cache"

  log "extra project cleanup done dir=${project_dir}"
}

cleanup_extra_projects() {
  if [[ "${RUN_EXTRA_PROJECTS_CLEAN}" != "1" ]]; then
    return 0
  fi

  local project_dir=""
  for project_dir in ${EXTRA_PROJECT_DIRS}; do
    cleanup_extra_project_dir "${project_dir}"
  done
}

log_disk_state() {
  local usage_root usage_rootdir
  usage_root="$(df -h / | awk 'NR==2 {print $5 " used, " $4 " free"}')"
  usage_rootdir="$(du -sh "${ROOT_DIR}" 2>/dev/null | awk '{print $1}')"
  log "disk_state rootfs=${usage_root} rootdir=${usage_rootdir:-unknown}"
}

main() {
  log "start cleanup root=${ROOT_DIR} keep_prod=${KEEP_PROD_RELEASES} keep_stg=${KEEP_STG_RELEASES} keep_backups=${KEEP_BACKUPS} keep_log_days=${KEEP_LOG_DAYS} truncate_over_mb=${TRUNCATE_LOGS_OVER_MB} dry_run=${DRY_RUN}"

  log_disk_state

  cleanup_release_dir "${ROOT_DIR}/releases/panel" "${ROOT_DIR}/current/panel" "${KEEP_PROD_RELEASES}"
  cleanup_release_dir "${ROOT_DIR}/releases/panel-staging" "${ROOT_DIR}/current/panel-staging" "${KEEP_STG_RELEASES}"
  cleanup_backups
  cleanup_old_logs
  cleanup_tool_caches
  cleanup_next_cache_in_releases
  cleanup_release_artifacts
  cleanup_local_package_caches
  cleanup_npm_cache
  cleanup_python_bytecode
  cleanup_vscode_caches
  cleanup_source_build_caches
  cleanup_extra_projects
  cleanup_git_objects
  cleanup_system_logs

  log_disk_state
  log "done"
}

main
