#!/bin/sh
set -e

OPCODE_DATA="$HOME/.local/share/opencode"
AUTH_FILE="$OPCODE_DATA/auth.json"

if [ ! -f "$AUTH_FILE" ]; then
  mkdir -p "$OPCODE_DATA"

  entries=""
  add_provider() {
    id="$1"; type="$2"; key="$3"
    if [ -n "$key" ]; then
      if [ -n "$entries" ]; then
        entries="$entries,"$'\n'
      fi
      entries="$entries  \"$id\": {\"type\": \"$type\", \"key\": \"$key\"}"
    fi
  }

  add_provider "zai-coding-plan" "api" "$ZAI_CODING_PLAN_KEY"
  add_provider "openrouter" "api" "$OPENROUTER_KEY"

  if [ -n "$entries" ]; then
    printf '{\n%s\n}\n' "$entries" > "$AUTH_FILE"
  else
    printf '{}\n' > "$AUTH_FILE"
  fi
  printf 'wrote initial opencode auth.json\n'
fi

exec opencode serve --hostname 0.0.0.0 --port 4096
