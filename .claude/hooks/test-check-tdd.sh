#!/usr/bin/env bash
# Tests for check-tdd.sh. Run: bash .claude/hooks/test-check-tdd.sh
set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/check-tdd.sh"
PASS=0
FAIL=0

# run <expect: allow|block> <description> <file_path> [files to pre-create...]
run() {
  local expect="$1" desc="$2" file="$3"
  shift 3

  local sandbox
  sandbox=$(mktemp -d)
  ( cd "$sandbox" && git init -q . )

  # the target file itself exists for Edit-like cases only when listed below
  for f in "$@"; do
    mkdir -p "$sandbox/$(dirname "$f")"
    : > "$sandbox/$f"
  done
  mkdir -p "$sandbox/$(dirname "$file")"

  local out actual
  out=$(cd "$sandbox" && printf '{"tool_input":{"file_path":"%s"}}' "$sandbox/$file" \
    | bash "$HOOK" 2>/dev/null)

  if [[ -z "$out" ]]; then
    actual=allow
  elif grep -q '"continue":false' <<<"$out"; then
    actual=block
  else
    actual=allow
  fi

  if [[ "$actual" == "$expect" ]]; then
    PASS=$((PASS + 1))
    printf '  ok   %s\n' "$desc"
  else
    FAIL=$((FAIL + 1))
    printf '  FAIL %s (expected %s, got %s)\n' "$desc" "$expect" "$actual"
    [[ -n "$out" ]] && printf '       output: %s\n' "$out"
  fi

  rm -rf "$sandbox"
}

echo "check-tdd.sh"

# --- gated source without a test -------------------------------------------
run block "bare .ts module with no test"          src/card/draft.ts
run block "bare .svelte component with no test"   src/ui/CardEditor.svelte
run block "bare .tsx module with no test"         src/ui/Panel.tsx

# --- test present in an accepted location ----------------------------------
run allow "sibling .test.ts"          src/card/draft.ts  src/card/draft.test.ts
run allow "sibling .spec.ts"          src/card/draft.ts  src/card/draft.spec.ts
run allow "sibling __tests__/"        src/card/draft.ts  src/card/__tests__/draft.test.ts
run allow "mirrored tests/ tree"      src/card/draft.ts  tests/card/draft.test.ts
run allow "component test"            src/ui/CardEditor.svelte  src/ui/CardEditor.test.ts
run allow "component .svelte.test.ts" src/ui/CardEditor.svelte  src/ui/CardEditor.svelte.test.ts

# a same-stem test must not satisfy a *different* module
run block "unrelated stem does not count"  src/card/draft.ts  src/card/render.test.ts

# --- the test files themselves ---------------------------------------------
run allow "the .test.ts itself"     src/card/draft.test.ts
run allow "the .spec.ts itself"     src/card/draft.spec.ts
run allow "file under tests/"       tests/integration/flow.ts
run allow "file under __tests__/"   src/card/__tests__/helpers.ts
run allow "file under __mocks__/"   src/card/__mocks__/anki.ts
run allow "fixture file"            src/card/fixtures/page.ts

# --- exempt by kind ---------------------------------------------------------
run allow "config file"       wxt.config.ts
run allow "vitest config"     vitest.config.ts
run allow "setup file"        vitest.setup.ts
run allow "ambient types"     src/globals.d.ts
run allow "types module"      src/card/types.ts
run allow "suffixed types"    src/card/draft.types.ts
run allow "barrel"            src/card/index.ts
run allow "WXT entrypoint"    entrypoints/background.ts
run allow "nested entrypoint" src/entrypoints/sidepanel/main.ts
run allow "preview harness"   preview/main.ts

# --- not gated at all -------------------------------------------------------
run allow "markdown"          docs/plans/00-plan.md
run allow "json"              package.json
run allow "css"               src/app.css
run allow "generated output"  dist/chunk.ts
run allow "dependency"        node_modules/pkg/index.ts
run allow "hook script"       .claude/hooks/check-tdd.sh

echo
printf 'passed %d, failed %d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
