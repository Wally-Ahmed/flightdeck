#!/usr/bin/env bash
# render-canvas.sh — Phase 2 canvas wiring.
#
# Substitutes the ${ORCH_URL} / ${CANVAS_ID} / ${OPENAI_INTEGRATION_ID} tokens in
# canvas.yaml (and console.yaml) with real values from the environment, writing
# deployable *.generated.yaml files. This is how the canvas's http nodes get
# pointed at the live orchestrator and how the canvas id + OpenAI integration UUID
# are bound — the things that can't be committed because they only exist once the
# orchestrator is deployed and the Superplane app + OpenAI integration are created.
#
# Usage:
#   ORCH_URL=https://flightdeck-orchestrator.onrender.com \
#   SUPERPLANE_CANVAS_ID=<uuid> \
#   OPENAI_INTEGRATION_ID=<uuid> \
#   ./superplane/render-canvas.sh [--push]
#
#   --push also runs `superplane apps canvas update -f canvas.generated.yaml`
#   (requires the superplane CLI on PATH + a prior `superplane connect`).
#
# Values are read from the process env; a sibling .env at repo root is sourced if
# present so you can keep them there. Nothing is hard-coded; missing values abort.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"

# Source repo-root .env if present (so SUPERPLANE_CANVAS_ID etc. can live there).
if [[ -f "$root/.env" ]]; then
  set -a; # shellcheck disable=SC1091
  source "$root/.env"; set +a
fi

# CANVAS_ID is the canvas metadata.id; accept either CANVAS_ID or SUPERPLANE_CANVAS_ID.
: "${CANVAS_ID:=${SUPERPLANE_CANVAS_ID:-}}"

missing=()
[[ -z "${ORCH_URL:-}"              ]] && missing+=("ORCH_URL")
[[ -z "${CANVAS_ID:-}"             ]] && missing+=("CANVAS_ID (or SUPERPLANE_CANVAS_ID)")
[[ -z "${OPENAI_INTEGRATION_ID:-}" ]] && missing+=("OPENAI_INTEGRATION_ID")
if (( ${#missing[@]} )); then
  echo "render-canvas.sh: missing required env: ${missing[*]}" >&2
  echo "  set them (or put them in $root/.env) and re-run." >&2
  exit 1
fi

export ORCH_URL CANVAS_ID OPENAI_INTEGRATION_ID

# Only substitute our three tokens (not arbitrary $VARS in the YAML).
vars='${ORCH_URL} ${CANVAS_ID} ${OPENAI_INTEGRATION_ID}'

gen_canvas="$here/canvas.generated.yaml"
envsubst "$vars" < "$here/canvas.yaml" > "$gen_canvas"
echo "wrote $gen_canvas"

# console.yaml also references ${ORCH_URL}/${CANVAS_ID} if you templated it; harmless if not.
if grep -q '\${' "$here/console.yaml" 2>/dev/null; then
  gen_console="$here/console.generated.yaml"
  envsubst "$vars" < "$here/console.yaml" > "$gen_console"
  echo "wrote $gen_console"
fi

# Sanity: no unsubstituted tokens left in the canvas (ignore tokens inside the
# documentation comments — only real config lines matter).
if sed 's/#.*$//' "$gen_canvas" | grep -n '\${' >/dev/null; then
  echo "WARNING: $gen_canvas still contains \${...} tokens on config lines:" >&2
  sed 's/#.*$//' "$gen_canvas" | grep -n '\${' >&2
else
  echo "ok: all tokens substituted (config lines clean)"
fi

if [[ "${1:-}" == "--push" ]]; then
  if ! command -v superplane >/dev/null 2>&1; then
    echo "superplane CLI not found on PATH; cannot --push. Generated file is ready at $gen_canvas." >&2
    exit 2
  fi
  echo "+ superplane apps canvas update -f $gen_canvas"
  superplane apps canvas update -f "$gen_canvas"
else
  echo
  echo "Next: superplane apps canvas update -f $gen_canvas"
fi
