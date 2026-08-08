#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/var/www/talia}"

KEEP_PROD_RELEASES="${KEEP_PROD_RELEASES:-1}"
KEEP_STG_RELEASES="${KEEP_STG_RELEASES:-1}"
KEEP_BACKUPS="${KEEP_BACKUPS:-2}"
JOURNAL_VACUUM_TIME="${JOURNAL_VACUUM_TIME:-2d}"
KEEP_LOG_DAYS="${KEEP_LOG_DAYS:-2}"
TRUNCATE_LOGS_OVER_MB="${TRUNCATE_LOGS_OVER_MB:-5}"

DRY_RUN="${DRY_RUN:-0}"
RUN_LOGS_PURGE="${RUN_LOGS_PURGE:-0}"
KEEP_CURRENT_LOGS="${KEEP_CURRENT_LOGS:-1}"

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
RUN_USER_LOG_CLEAN="${RUN_USER_LOG_CLEAN:-1}"
RUN_USER_NPM_CACHE_CLEAN="${RUN_USER_NPM_CACHE_CLEAN:-1}"
RUN_USER_PLAYWRIGHT_CACHE_CLEAN="${RUN_USER_PLAYWRIGHT_CACHE_CLEAN:-1}"
RUN_USER_GO_CACHE_CLEAN="${RUN_USER_GO_CACHE_CLEAN:-1}"
RUN_USER_GH_CACHE_CLEAN="${RUN_USER_GH_CACHE_CLEAN:-1}"
RUN_USER_GO_MOD_CACHE_CLEAN="${RUN_USER_GO_MOD_CACHE_CLEAN:-0}"
RUN_CODEX_SESSION_CLEAN="${RUN_CODEX_SESSION_CLEAN:-0}"
CODEX_SESSION_KEEP_DAYS="${CODEX_SESSION_KEEP_DAYS:-30}"
RUN_CODEX_TMP_CLEAN="${RUN_CODEX_TMP_CLEAN:-0}"
RUN_VSCODE_SERVER_CLI_CLEAN="${RUN_VSCODE_SERVER_CLI_CLEAN:-0}"
RUN_GIT_GC_AGGRESSIVE="${RUN_GIT_GC_AGGRESSIVE:-0}"
RUN_VSCODE_SERVER_PRUNE="${RUN_VSCODE_SERVER_PRUNE:-1}"
VSCODE_SERVER_KEEP_VERSIONS="${VSCODE_SERVER_KEEP_VERSIONS:-1}"

# Extra projects living in same droplet that may accumulate logs/caches/backups.
EXTRA_PROJECT_DIRS="${EXTRA_PROJECT_DIRS:-/var/www/PUI /var/www/maria_imlux /opt/richard /home/devuser/richard /home/devuser/talia}"

# User-level log locations.
USER_HOME_DIRS="${USER_HOME_DIRS:-/home/jorge}"

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

cleanup_git_objects_in_dir() {
  local repo_dir="$1"
  [[ -d "${repo_dir}/.git" ]] || return 0
  command -v git >/dev/null 2>&1 || return 0

  local repo_owner
  repo_owner="$(resolve_path_owner "${repo_dir}/.git" || resolve_path_owner "${repo_dir}" || true)"

  if [[ "${DRY_RUN}" == "1" ]]; then
    if [[ "${RUN_GIT_GC_AGGRESSIVE}" == "1" ]]; then
      log "DRY_RUN git -C ${repo_dir} reflog expire --expire=now --all && git gc --prune=now --aggressive (owner=${repo_owner:-unknown})"
    else
      log "DRY_RUN git -C ${repo_dir} gc --prune=now (owner=${repo_owner:-unknown})"
    fi
    return 0
  fi

  if [[ "$(id -u)" -eq 0 && -n "${repo_owner}" && "${repo_owner}" != "root" ]]; then
    if command -v sudo >/dev/null 2>&1; then
      if [[ "${RUN_GIT_GC_AGGRESSIVE}" == "1" ]]; then
        sudo -u "${repo_owner}" git -C "${repo_dir}" reflog expire --expire=now --all >/dev/null 2>&1 || true
        sudo -u "${repo_owner}" git -C "${repo_dir}" gc --prune=now --aggressive >/dev/null 2>&1 || true
      else
        sudo -u "${repo_owner}" git -C "${repo_dir}" gc --prune=now >/dev/null 2>&1 || true
      fi
    elif command -v runuser >/dev/null 2>&1; then
      if [[ "${RUN_GIT_GC_AGGRESSIVE}" == "1" ]]; then
        runuser -u "${repo_owner}" -- git -C "${repo_dir}" reflog expire --expire=now --all >/dev/null 2>&1 || true
        runuser -u "${repo_owner}" -- git -C "${repo_dir}" gc --prune=now --aggressive >/dev/null 2>&1 || true
      else
        runuser -u "${repo_owner}" -- git -C "${repo_dir}" gc --prune=now >/dev/null 2>&1 || true
      fi
    else
      if [[ "${RUN_GIT_GC_AGGRESSIVE}" == "1" ]]; then
        su -s /bin/bash - "${repo_owner}" -c "git -C '${repo_dir}' reflog expire --expire=now --all && git -C '${repo_dir}' gc --prune=now --aggressive" >/dev/null 2>&1 || true
      else
        su -s /bin/bash - "${repo_owner}" -c "git -C '${repo_dir}' gc --prune=now" >/dev/null 2>&1 || true
      fi
    fi
    if [[ "${RUN_GIT_GC_AGGRESSIVE}" == "1" ]]; then
      log "git gc aggressive completed in ${repo_dir} as ${repo_owner}"
    else
      log "git gc completed in ${repo_dir} as ${repo_owner}"
    fi
  else
    if [[ "${RUN_GIT_GC_AGGRESSIVE}" == "1" ]]; then
      git -C "${repo_dir}" reflog expire --expire=now --all >/dev/null 2>&1 || true
      git -C "${repo_dir}" gc --prune=now --aggressive >/dev/null 2>&1 || true
      log "git gc aggressive completed in ${repo_dir}"
    else
      git -C "${repo_dir}" gc --prune=now >/dev/null 2>&1 || true
      log "git gc completed in ${repo_dir}"
    fi
  fi

  cleanup_git_pack_tmp_files_in_dir "${repo_dir}"
}

cleanup_git_pack_tmp_files_in_dir() {
  local repo_dir="$1"
  local pack_dir="${repo_dir}/.git/objects/pack"
  [[ -d "${pack_dir}" ]] || return 0

  # Delete orphaned temporary pack files left behind by interrupted repacks.
  # These can consume gigabytes even after a successful git gc.
  if pgrep -x pack-objects >/dev/null 2>&1; then
    log "skip stale git pack cleanup in ${repo_dir} because pack-objects is running"
    return 0
  fi

  local tmp_files=()
  shopt -s nullglob
  tmp_files=( "${pack_dir}"/tmp_pack_* )
  shopt -u nullglob
  (( ${#tmp_files[@]} > 0 )) || return 0

  local removed_bytes=0
  local file=""
  for file in "${tmp_files[@]}"; do
    if [[ -f "${file}" ]]; then
      removed_bytes=$((removed_bytes + $(stat -c '%s' "${file}" 2>/dev/null || echo 0)))
      run_delete_file "${file}"
    fi
  done

  log "stale git pack temporaries removed in ${repo_dir} count=${#tmp_files[@]} bytes=${removed_bytes}"
}

cleanup_logs_in_dir() {
  local logs_dir="$1"
  [[ -d "${logs_dir}" ]] || return 0

  if [[ "${RUN_LOGS_PURGE}" == "1" ]]; then
    if [[ "${DRY_RUN}" == "1" ]]; then
      log "DRY_RUN purge logs in ${logs_dir} keep_current=${KEEP_CURRENT_LOGS}"
      return 0
    fi

    find "${logs_dir}" -type f -name "*.log.*" -delete 2>/dev/null || true
    find "${logs_dir}" -type f -name "*.out" -delete 2>/dev/null || true
    find "${logs_dir}" -type f -name "*.err" -delete 2>/dev/null || true
    if [[ "${KEEP_CURRENT_LOGS}" != "1" ]]; then
      find "${logs_dir}" -type f -name "*.log" -delete 2>/dev/null || true
      log "logs purged in ${logs_dir} keep_current=0"
    else
      log "rotated logs purged in ${logs_dir} keep_current=1"
    fi
    return 0
  fi

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

  if [[ "${RUN_LOGS_PURGE}" == "1" ]]; then
    if [[ "${DRY_RUN}" == "1" ]]; then
      log "DRY_RUN purge top-level logs in ${base_dir} keep_current=${KEEP_CURRENT_LOGS}"
      return 0
    fi

    find "${base_dir}" -maxdepth 1 -type f -name "*.log.*" -delete 2>/dev/null || true
    find "${base_dir}" -maxdepth 1 -type f -name "*.out" -delete 2>/dev/null || true
    find "${base_dir}" -maxdepth 1 -type f -name "*.err" -delete 2>/dev/null || true
    if [[ "${KEEP_CURRENT_LOGS}" != "1" ]]; then
      find "${base_dir}" -maxdepth 1 -type f -name "*.log" -delete 2>/dev/null || true
      log "top-level logs purged in ${base_dir} keep_current=0"
    else
      log "top-level rotated logs purged in ${base_dir} keep_current=1"
    fi
    return 0
  fi

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
  cleanup_logs_in_dir "${ROOT_DIR}/logs"
  cleanup_top_level_logs_in_dir "${ROOT_DIR}"
  cleanup_top_level_logs_in_dir "${ROOT_DIR}/frontend/panel"
  cleanup_logs_in_dir "${ROOT_DIR}/frontend/panel/.next/dev/logs"
  truncate_large_logs_in_dir "${ROOT_DIR}/logs"
  truncate_large_logs_in_dir "${ROOT_DIR}"
  truncate_large_logs_in_dir "${ROOT_DIR}/frontend/panel"
  truncate_large_logs_in_dir "${ROOT_DIR}/frontend/panel/.next/dev/logs"
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

  cleanup_git_objects_in_dir "${ROOT_DIR}"
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

cleanup_vscode_server_versions_in_dir() {
  local home_dir="$1"
  [[ -d "${home_dir}/.vscode-server/cli/servers" ]] || return 0
  [[ "${RUN_VSCODE_SERVER_PRUNE}" == "1" ]] || return 0
  [[ "${VSCODE_SERVER_KEEP_VERSIONS}" =~ ^[0-9]+$ ]] || return 0

  local base_dir="${home_dir}/.vscode-server/cli/servers"
  mapfile -t versions < <(ls -1dt "${base_dir}"/Stable-* 2>/dev/null || true)
  (( ${#versions[@]} > ${VSCODE_SERVER_KEEP_VERSIONS} )) || return 0

  local idx=0
  local version_path=""
  for version_path in "${versions[@]}"; do
    idx=$((idx + 1))
    if [[ "${idx}" -le "${VSCODE_SERVER_KEEP_VERSIONS}" ]]; then
      log "keep vscode server version ${version_path}"
      continue
    fi
    run_rm_rf "${version_path}"
  done
}

cleanup_user_logs_in_dir() {
  local home_dir="$1"
  [[ -d "${home_dir}" ]] || return 0

  log "user log cleanup start dir=${home_dir}"

  cleanup_logs_in_dir "${home_dir}/.npm/_logs"
  cleanup_top_level_logs_in_dir "${home_dir}/.vscode-server"
  cleanup_logs_in_dir "${home_dir}/.codex/log"
  cleanup_top_level_logs_in_dir "${home_dir}/.twilio-cli"

  truncate_large_logs_in_dir "${home_dir}/.npm/_logs"
  truncate_large_logs_in_dir "${home_dir}/.vscode-server"
  truncate_large_logs_in_dir "${home_dir}/.codex/log"
  truncate_large_logs_in_dir "${home_dir}/.twilio-cli"

  log "user log cleanup done dir=${home_dir}"
}

cleanup_user_caches_in_dir() {
  local home_dir="$1"
  [[ -d "${home_dir}" ]] || return 0

  log "user cache cleanup start dir=${home_dir}"

  if [[ "${RUN_USER_NPM_CACHE_CLEAN}" == "1" ]]; then
    run_rm_rf "${home_dir}/.npm/_cacache"
    run_rm_rf "${home_dir}/.npm/_npx"
  fi

  if [[ "${RUN_USER_PLAYWRIGHT_CACHE_CLEAN}" == "1" ]]; then
    run_rm_rf "${home_dir}/.cache/ms-playwright"
  fi

  if [[ "${RUN_USER_GO_CACHE_CLEAN}" == "1" ]]; then
    run_rm_rf "${home_dir}/go/pkg/mod/cache"
    run_rm_rf "${home_dir}/go/pkg/sumdb"
  fi

  if [[ "${RUN_USER_GO_MOD_CACHE_CLEAN}" == "1" ]]; then
    run_rm_rf "${home_dir}/go/pkg/mod"
  fi

  if [[ "${RUN_USER_GH_CACHE_CLEAN}" == "1" ]]; then
    run_rm_rf "${home_dir}/.cache/gh"
  fi

  if [[ "${RUN_CODEX_TMP_CLEAN}" == "1" ]]; then
    run_rm_rf "${home_dir}/.codex/.tmp"
  fi

  if [[ "${RUN_CODEX_SESSION_CLEAN}" == "1" ]]; then
    if [[ -d "${home_dir}/.codex/sessions" ]]; then
      if [[ "${DRY_RUN}" == "1" ]]; then
        log "DRY_RUN prune codex sessions in ${home_dir}/.codex/sessions keep_days=${CODEX_SESSION_KEEP_DAYS}"
      else
        find "${home_dir}/.codex/sessions" -type f -mtime +"${CODEX_SESSION_KEEP_DAYS}" -delete 2>/dev/null || true
        find "${home_dir}/.codex/sessions" -type d -empty -delete 2>/dev/null || true
        log "codex sessions pruned in ${home_dir}/.codex/sessions keep_days=${CODEX_SESSION_KEEP_DAYS}"
      fi
    fi
  fi

  cleanup_vscode_server_versions_in_dir "${home_dir}"

  if [[ "${RUN_VSCODE_SERVER_CLI_CLEAN}" == "1" ]]; then
    run_rm_rf "${home_dir}/.vscode-server/cli"
  fi

  log "user cache cleanup done dir=${home_dir}"
}

cleanup_user_logs() {
  if [[ "${RUN_USER_LOG_CLEAN}" != "1" ]]; then
    return 0
  fi

  local home_dir=""
  for home_dir in ${USER_HOME_DIRS}; do
    cleanup_user_logs_in_dir "${home_dir}"
  done
}

cleanup_user_caches() {
  local home_dir=""
  for home_dir in ${USER_HOME_DIRS}; do
    cleanup_user_caches_in_dir "${home_dir}"
  done
}

cleanup_extra_project_dir() {
  local project_dir="$1"
  [[ -d "${project_dir}" ]] || return 0

  log "extra project cleanup start dir=${project_dir}"

  cleanup_logs_in_dir "${project_dir}/logs"
  cleanup_top_level_logs_in_dir "${project_dir}"
  cleanup_logs_in_dir "${project_dir}/frontend/.next/dev/logs"
  truncate_large_logs_in_dir "${project_dir}/logs"
  truncate_large_logs_in_dir "${project_dir}"
  truncate_large_logs_in_dir "${project_dir}/frontend/.next/dev/logs"

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
    cleanup_git_objects_in_dir "${project_dir}"
  done
}

log_disk_state() {
  local usage_root usage_rootdir
  usage_root="$(df -h / | awk 'NR==2 {print $5 " used, " $4 " free"}')"
  usage_rootdir="$(du -sh "${ROOT_DIR}" 2>/dev/null | awk '{print $1}')"
  log "disk_state rootfs=${usage_root} rootdir=${usage_rootdir:-unknown}"
}

main() {
  log "start cleanup root=${ROOT_DIR} keep_prod=${KEEP_PROD_RELEASES} keep_stg=${KEEP_STG_RELEASES} keep_backups=${KEEP_BACKUPS} keep_log_days=${KEEP_LOG_DAYS} logs_purge=${RUN_LOGS_PURGE} keep_current_logs=${KEEP_CURRENT_LOGS} truncate_over_mb=${TRUNCATE_LOGS_OVER_MB} dry_run=${DRY_RUN}"

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
  cleanup_user_logs
  cleanup_user_caches
  cleanup_git_objects
  cleanup_system_logs

  log_disk_state
  log "done"
}

main
