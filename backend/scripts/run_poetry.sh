#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
exec poetry "$@"
