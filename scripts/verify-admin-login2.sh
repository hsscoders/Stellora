#!/bin/bash
# Admin login E2E retry — resilient boot + hydration-safe interaction.
set -u
ROOT=/home/z/my-project
cd "$ROOT"

# ---------- 1. Ensure stack is up (reuse if alive) ----------
if ! curl -sf --max-time 3 http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
  echo "[retry] stack down — booting dev.sh"
  setsid nohup bash "$ROOT/.zscripts/dev.sh" >/dev/null 2>&1 </dev/null &
  disown
  for i in $(seq 1 45); do
    curl -sf --max-time 2 http://127.0.0.1:4000/api/health >/dev/null 2>&1 && break
    sleep 2
  done
fi
curl -s --max-time 5 http://127.0.0.1:4000/api/health; echo

# ---------- 2. Direct API credential check ----------
echo "=== API login check ==="
curl -s --max-time 10 -X POST http://127.0.0.1:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://127.0.0.1:3000" \
  -d '{"identifier":"admin@stellora.local","password":"Admin@12345"}'
echo

# ---------- 3. Browser login with hydration wait ----------
agent-browser set viewport 1440 900
agent-browser open http://127.0.0.1:3000/admin/login
agent-browser wait --load networkidle --timeout 20000 || true
agent-browser wait 8000

echo "=== refs before fill ==="
agent-browser snapshot -i -c

agent-browser find label "Mobile number or Email" fill "admin@stellora.local"
agent-browser find label "Password" fill "Admin@12345"
agent-browser wait 1000
agent-browser find role button click --name "Sign In"

# wait for hard navigation to /admin-console
for i in $(seq 1 20); do
  url=$(agent-browser get url 2>/dev/null || echo "")
  case "$url" in
    *admin-console*) echo "NAVIGATED to: $url"; break ;;
  esac
  sleep 1
done
agent-browser wait 6000
echo "=== final URL: $(agent-browser get url) ==="
agent-browser screenshot "$ROOT/download/verify-6-admin-console.png"

echo "=== browser errors ==="
agent-browser errors
agent-browser close
echo "=== RETRY DONE ==="
