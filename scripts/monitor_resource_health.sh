#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/var/www/talia}"
LOG_DIR="${ROOT_DIR}/logs/maintenance"
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/resource_health.log"

MEM_AVAILABLE_MIN_MB="${MEM_AVAILABLE_MIN_MB:-700}"
SWAP_USED_MAX_MB="${SWAP_USED_MAX_MB:-1024}"
DISK_USED_MAX_PERCENT="${DISK_USED_MAX_PERCENT:-85}"
LOAD_PER_CPU_MAX="${LOAD_PER_CPU_MAX:-1.5}"
TOP_PROCESSES="${TOP_PROCESSES:-8}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

log_line() {
  local level="$1"
  shift
  local line
  line="$(ts) level=${level} $*"
  echo "${line}" | tee -a "${LOG_FILE}" >/dev/null
}

post_alert() {
  local summary="$1"
  if [[ -z "${ALERT_WEBHOOK_URL}" ]]; then
    return 0
  fi
  curl -sS -m 10 -X POST "${ALERT_WEBHOOK_URL}" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"Tal-IA resource alert\",\"summary\":\"${summary}\",\"timestamp\":\"$(ts)\"}" >/dev/null || true
}

read_mem_stats() {
  free -m | awk 'NR==2 {printf "%s %s %s %s", $2, $3, $7, $6}'
}

read_swap_used() {
  free -m | awk 'NR==3 {print $3}'
}

read_disk_stats() {
  df -Pm / | awk 'NR==2 {gsub("%","",$5); printf "%s %s %s", $2, $3, $5}'
}

read_load_and_cpus() {
  awk '{print $1" "$2" "$3}' /proc/loadavg
  nproc
}

top_snapshot() {
  ps -eo pid,ppid,cmd,%mem,%cpu --sort=-%mem | head -n "$((TOP_PROCESSES + 1))" | tail -n "${TOP_PROCESSES}"
}

oom_snapshot() {
  dmesg -T 2>/dev/null | rg -i "killed process|out of memory|oom|oom-killer" | tail -n 5 || true
}

main() {
  read -r mem_total mem_used mem_available mem_cache <<<"$(read_mem_stats)"
  swap_used="$(read_swap_used)"
  read -r disk_total disk_used disk_percent <<<"$(read_disk_stats)"
  load_lines="$(read_load_and_cpus)"
  load1="$(awk 'NR==1 {print $1}' <<<"${load_lines}")"
  load5="$(awk 'NR==1 {print $2}' <<<"${load_lines}")"
  load15="$(awk 'NR==1 {print $3}' <<<"${load_lines}")"
  cpu_count="$(awk 'NR==2 {print $1}' <<<"${load_lines}")"
  load_per_cpu="$(awk -v load_avg="${load5}" -v cpu="${cpu_count}" 'BEGIN { if (cpu < 1) cpu = 1; printf "%.2f", load_avg / cpu }')"

  log_line "INFO" \
    "mem_total_mb=${mem_total} mem_used_mb=${mem_used} mem_available_mb=${mem_available} mem_cache_mb=${mem_cache} swap_used_mb=${swap_used} disk_total_mb=${disk_total} disk_used_mb=${disk_used} disk_used_pct=${disk_percent} load1=${load1} load5=${load5} load15=${load15} cpu_count=${cpu_count} load5_per_cpu=${load_per_cpu}"

  issues=()
  if (( mem_available < MEM_AVAILABLE_MIN_MB )); then
    issues+=("low_mem:${mem_available}MB")
  fi
  if (( swap_used > SWAP_USED_MAX_MB )); then
    issues+=("high_swap:${swap_used}MB")
  fi
  if (( disk_percent > DISK_USED_MAX_PERCENT )); then
    issues+=("high_disk:${disk_percent}%")
  fi
  exceeds_load="$(awk -v value="${load_per_cpu}" -v max="${LOAD_PER_CPU_MAX}" 'BEGIN { print (value > max) ? 1 : 0 }')"
  if [[ "${exceeds_load}" == "1" ]]; then
    issues+=("high_load_per_cpu:${load_per_cpu}")
  fi

  if (( ${#issues[@]} > 0 )); then
    summary="$(IFS=,; echo "${issues[*]}")"
    log_line "WARN" "issues=${summary}"
    while IFS= read -r row; do
      [[ -n "${row}" ]] && log_line "WARN" "top_process=\"${row}\""
    done < <(top_snapshot)
    while IFS= read -r row; do
      [[ -n "${row}" ]] && log_line "WARN" "oom=\"${row}\""
    done < <(oom_snapshot)
    post_alert "${summary}"
  fi
}

main