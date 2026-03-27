#!/usr/bin/env bash
set -euo pipefail

# Healthcheck minimo por ambiente para Tal-IA.
# Uso:
#   bash scripts/monitor_env_health.sh production
#   bash scripts/monitor_env_health.sh staging

ENVIRONMENT="${1:-}"
if [[ -z "${ENVIRONMENT}" ]]; then
  echo "Uso: $0 <production|staging>" >&2
  exit 2
fi

case "${ENVIRONMENT}" in
  production)
    PUBLIC_BASE="https://talia.mx"
    LOCAL_API="http://127.0.0.1:8004"
    ;;
  staging)
    PUBLIC_BASE="https://staging.talia.mx"
    LOCAL_API="http://127.0.0.1:8104"
    ;;
  *)
    echo "Ambiente invalido: ${ENVIRONMENT}. Usa production o staging." >&2
    exit 2
    ;;
esac

LOG_DIR="/var/www/talia/logs/observability"
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/${ENVIRONMENT}-health.log"

ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
ALERT_EMAIL="${ALERT_EMAIL:-}"

# Umbrales base alineados al plan.
API_HEALTH_MAX_MS="${API_HEALTH_MAX_MS:-300}"
AUTH_LOGIN_MAX_MS="${AUTH_LOGIN_MAX_MS:-1200}"
DASHBOARD_MAX_MS="${DASHBOARD_MAX_MS:-2500}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-2}"
RETRY_SLEEP_SECONDS="${RETRY_SLEEP_SECONDS:-1}"

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log_line() {
  local level="$1"
  local message="$2"
  local line
  line="$(timestamp) env=${ENVIRONMENT} level=${level} ${message}"
  echo "${line}" | tee -a "${LOG_FILE}"
}

notify_alert() {
  local title="$1"
  local details="$2"

  log_line "ERROR" "alert_title=${title} details=\"${details}\""

  if [[ -n "${ALERT_WEBHOOK_URL}" ]]; then
    curl -sS -m 10 -X POST "${ALERT_WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d "{\"title\":\"${title}\",\"environment\":\"${ENVIRONMENT}\",\"details\":\"${details}\",\"timestamp\":\"$(timestamp)\"}" >/dev/null || true
  fi

  if [[ -n "${ALERT_EMAIL}" ]]; then
    printf '%s\n\n%s\n' "${title}" "${details}" | mail -s "[Tal-IA ${ENVIRONMENT}] Health alert" "${ALERT_EMAIL}" || true
  fi
}

probe_get() {
  local check_name="$1"
  local url="$2"
  local max_ms="$3"
  local attempt=1
  local status=""
  local ms=0

  while (( attempt <= MAX_ATTEMPTS )); do
    local response
    response="$(curl -k -sS -o /tmp/talia_probe_body.$$ -w '%{http_code} %{time_total}' --max-time 15 "${url}" || true)"
    status="$(awk '{print $1}' <<<"${response}")"
    local seconds
    seconds="$(awk '{print $2}' <<<"${response}")"
    ms=0
    if [[ -n "${seconds}" ]]; then
      ms="$(awk -v s="${seconds}" 'BEGIN { printf "%.0f", s*1000 }')"
    fi

    rm -f /tmp/talia_probe_body.$$ || true

    if [[ "${status}" =~ ^(2|3) ]] && (( ms <= max_ms )); then
      log_line "INFO" "check=${check_name} status=${status} ms=${ms} max_ms=${max_ms} attempt=${attempt}/${MAX_ATTEMPTS}"
      return 0
    fi

    if (( attempt < MAX_ATTEMPTS )); then
      sleep "${RETRY_SLEEP_SECONDS}"
    fi
    attempt=$((attempt + 1))
  done

  if [[ ! "${status}" =~ ^(2|3) ]]; then
    notify_alert "${check_name} status" "url=${url} status=${status:-none} max_ms=${max_ms} attempts=${MAX_ATTEMPTS}"
    return 1
  fi

  notify_alert "${check_name} latency" "url=${url} ms=${ms} max_ms=${max_ms} status=${status} attempts=${MAX_ATTEMPTS}"
  return 1
}

probe_auth_login() {
  local check_name="auth_login"
  local url="${PUBLIC_BASE}/api/auth/login"
  local max_ms="${AUTH_LOGIN_MAX_MS}"

  local payload='{"email":"monitor@talia.invalid","password":"invalid"}'
  local attempt=1
  local status=""
  local ms=0

  while (( attempt <= MAX_ATTEMPTS )); do
    local response
    response="$(curl -k -sS -o /tmp/talia_probe_auth_body.$$ -w '%{http_code} %{time_total}' \
      --max-time 20 \
      -H 'Content-Type: application/json' \
      -X POST "${url}" \
      -d "${payload}" || true)"

    status="$(awk '{print $1}' <<<"${response}")"
    local seconds
    seconds="$(awk '{print $2}' <<<"${response}")"
    ms=0
    if [[ -n "${seconds}" ]]; then
      ms="$(awk -v s="${seconds}" 'BEGIN { printf "%.0f", s*1000 }')"
    fi

    rm -f /tmp/talia_probe_auth_body.$$ || true

    # Esperamos respuesta controlada; 200/400/401/422 son validas para este probe sintético.
    if [[ "${status}" =~ ^(200|400|401|422)$ ]] && (( ms <= max_ms )); then
      log_line "INFO" "check=${check_name} status=${status} ms=${ms} max_ms=${max_ms} attempt=${attempt}/${MAX_ATTEMPTS}"
      return 0
    fi

    if (( attempt < MAX_ATTEMPTS )); then
      sleep "${RETRY_SLEEP_SECONDS}"
    fi
    attempt=$((attempt + 1))
  done

  if [[ ! "${status}" =~ ^(200|400|401|422)$ ]]; then
    notify_alert "${check_name} status" "url=${url} status=${status:-none} max_ms=${max_ms} attempts=${MAX_ATTEMPTS}"
    return 1
  fi

  notify_alert "${check_name} latency" "url=${url} ms=${ms} max_ms=${max_ms} status=${status} attempts=${MAX_ATTEMPTS}"
  return 1
}

main() {
  local failures=0

  probe_get "api_health" "${LOCAL_API}/api/health" "${API_HEALTH_MAX_MS}" || failures=$((failures + 1))
  probe_get "panel_dashboard" "${PUBLIC_BASE}/dashboard" "${DASHBOARD_MAX_MS}" || failures=$((failures + 1))
  probe_auth_login || failures=$((failures + 1))

  if (( failures > 0 )); then
    log_line "ERROR" "result=failed failures=${failures}"
    exit 1
  fi

  log_line "INFO" "result=ok failures=0"
}

main
