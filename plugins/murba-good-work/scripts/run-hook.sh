#!/bin/sh
# murba-good-work hook wrapper. Usage: run-hook.sh <router|guard|stop-gate>
# - No .murba/ in the project, or MURBA_DISABLE=1 set by the human at launch: exit 0 silently.
# - node missing: guard denies (fail-closed), others pass.
name="$1"
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
proj="${CLAUDE_PROJECT_DIR:-$PWD}"

if [ "${MURBA_DISABLE:-}" = "1" ] || [ ! -d "$proj/.murba" ]; then
  cat >/dev/null 2>&1
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  cat >/dev/null 2>&1
  if [ "$name" = "guard" ]; then
    printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"[murba guard] node가 없어 검사할 수 없어 차단(fail-closed). node를 설치하세요."}}'
  fi
  exit 0
fi

case "$name" in
  router|guard|stop-gate) exec node "$here/$name.mjs" ;;
  *) cat >/dev/null 2>&1; exit 0 ;;
esac
