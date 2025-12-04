#!/usr/bin/env bash
python - "$@" <<'PY'
import sys
path = sys.argv[1]
with open(path) as f:
    text = f.read()
text = text.replace("pick 53d9796", "edit 53d9796", 1)
with open(path, 'w') as f:
    f.write(text)
PY
