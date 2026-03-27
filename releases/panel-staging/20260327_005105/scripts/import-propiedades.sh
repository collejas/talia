#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <csv-file>"
  echo "Environment variables that can be set:"
  echo "  API_URL (default: https://talia.mx/api/crm/propiedades/importar/csv)"
  echo "  ACCESS_TOKEN (required): JWT used to authenticate against the panel."
  exit 1
fi

CSV_FILE="$1"
if [[ ! -f "$CSV_FILE" ]]; then
  echo "CSV file not found: $CSV_FILE"
  exit 1
fi

API_URL="${API_URL:-https://talia.mx/api/crm/propiedades/importar/csv}"
ACCESS_TOKEN="${ACCESS_TOKEN:-}"
if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "Set ACCESS_TOKEN environment variable before running this script."
  exit 1
fi

echo "Importando $CSV_FILE -> $API_URL"
curl --fail-with-body \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@${CSV_FILE}" \
  -v \
  "$API_URL"
echo
