#!/bin/bash
# Full battery: astro, raw-html, next, react — sequential, self-contained.
set -u
export PATH="$HOME/.asdf/shims:/opt/homebrew/bin:/Users/charlessmart/.asdf/installs/nodejs/24.11.0/bin:$PATH"
REPO=/Users/charlessmart/_personal/design-tool
TOOLS=$REPO/docs/qa/tools
RC=0

wait_for() { # url timeout_s
  local i=0
  while [ $i -lt "$2" ]; do
    curl -s -o /dev/null "$1" 2>/dev/null && return 0
    sleep 1; i=$((i+1))
  done
  return 1
}

echo "=== ASTRO ==="
cd "$REPO/examples/sandbox-astro"
pnpm dev --port 4322 --strictPort > /tmp/astro-dev.log 2>&1 &
PID=$!
wait_for http://localhost:4322/ 60 || echo "WARN astro not ready"
(cd "$TOOLS" && node run-astro.mjs) || RC=1
kill $PID 2>/dev/null; wait $PID 2>/dev/null

echo "=== RAW HTML ==="
rm -rf /tmp/design-tool-standalone-e2e-qa
mkdir -p /tmp/design-tool-standalone-e2e-qa
cp -R "$REPO/examples/standalone-html/prototype/" /tmp/design-tool-standalone-e2e-qa/
cd "$REPO"
node packages/standalone/dist/design-tool.mjs serve /tmp/design-tool-standalone-e2e-qa --host 127.0.0.1 --port 4180 > /tmp/standalone-serve.log 2>&1 &
PID=$!
wait_for http://127.0.0.1:4180/ 30 || echo "WARN standalone not ready"
(cd "$TOOLS" && node run-standalone.mjs) || RC=1
kill $PID 2>/dev/null; wait $PID 2>/dev/null

echo "=== NEXT ==="
cd "$REPO/examples/sandbox-next"
pnpm dev --port 5177 > /tmp/next-dev.log 2>&1 &
PID=$!
wait_for http://localhost:5177/second 240 || echo "WARN next not ready"
(cd "$TOOLS" && node run-next.mjs) || RC=1
kill $PID 2>/dev/null; wait $PID 2>/dev/null

echo "=== REACT ==="
cd "$REPO/examples/sandbox"
pnpm dev --port 5173 --strictPort > /tmp/vite-dev.log 2>&1 &
PID=$!
wait_for http://localhost:5173/ 60 || echo "WARN vite not ready"
(cd "$TOOLS" && node run-sandbox.mjs) || RC=1
kill $PID 2>/dev/null; wait $PID 2>/dev/null

echo "=== ALL DONE (rc=$RC) ==="
exit $RC
