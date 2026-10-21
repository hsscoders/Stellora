#!/bin/bash
# One-call integration test runner: boots the isolated test stack, waits for
# health, runs unit + API integration suites, prints a summary. All inside a
# single tool call because the sandbox reaps background processes.
set -u
ROOT=/home/z/my-project
cd "$ROOT"

echo "=== booting isolated test stack (:4100, db=stellora_audit_test) ==="
setsid nohup bash "$ROOT/scripts/test-stack.sh" >/dev/null 2>&1 </dev/null &
disown

up=0
for i in $(seq 1 60); do
  curl -sf --max-time 2 http://127.0.0.1:4100/api/health >/dev/null 2>&1 && { up=1; break; }
  sleep 2
done
if [ "$up" != "1" ]; then
  echo "FATAL: test backend did not become healthy"; tail -20 "$ROOT/test-stack.log"; exit 1
fi
curl -s --max-time 5 http://127.0.0.1:4100/api/health; echo

# extra warm-up: wait until the SEED has finished (admin can log in) —
# the seed runs concurrently with the server boot and takes ~10-30s on Atlas
seeded=0
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X POST http://127.0.0.1:4100/api/auth/login \
    -H "Content-Type: application/json" -H "Origin: http://127.0.0.1:4100" \
    -d '{"identifier":"admin@stellora.local","password":"StelloraAdmin#2026"}')
  if [ "$code" = "200" ]; then seeded=1; break; fi
  sleep 2
done
if [ "$seeded" != "1" ]; then
  echo "FATAL: seed never completed (admin login never succeeded)"; tail -20 "$ROOT/test-stack.log"; exit 1
fi
echo "seed verified: admin login OK"

echo ""
echo "=================== UNIT TESTS ==================="
cd "$ROOT/backend"
npx tsx --test "$ROOT/scripts/tests/unit.test.ts" 2>&1 | grep -E "^ℹ (tests|pass|fail|suites)"

echo ""
echo "================= INTEGRATION TESTS ================="
npx tsx --test "$ROOT/scripts/tests/api.integration.test.ts" 2>&1 | tee /tmp/integration-out.log | grep -E "^✖|tests |pass |fail " | head -50

echo ""
echo "=============== FAILED TEST DETAILS ==============="
grep -A10 "failing tests" /tmp/integration-out.log | head -60 || true
