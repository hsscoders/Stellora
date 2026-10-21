#!/bin/bash
# Final E2E: admin login with correct credentials -> console dashboard.
set -u
ROOT=/home/z/my-project
cd "$ROOT"

if ! curl -sf --max-time 3 http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
  echo "[final] stack down — booting dev.sh"
  setsid nohup bash "$ROOT/.zscripts/dev.sh" >/dev/null 2>&1 </dev/null &
  disown
  for i in $(seq 1 45); do
    curl -sf --max-time 2 http://127.0.0.1:4000/api/health >/dev/null 2>&1 && break
    sleep 2
  done
fi
curl -s --max-time 5 http://127.0.0.1:4000/api/health; echo

agent-browser set viewport 1440 900
agent-browser open http://127.0.0.1:3000/admin/login
agent-browser wait --load networkidle --timeout 20000 || true
agent-browser wait 8000

agent-browser find label "Mobile number or Email" fill "admin@stellora.local"
agent-browser find label "Password" fill "StelloraAdmin#2026"
agent-browser wait 1000
agent-browser find role button click --name "Sign In"

for i in $(seq 1 25); do
  url=$(agent-browser get url 2>/dev/null || echo "")
  case "$url" in
    */admin-console*) echo "NAVIGATED: $url"; break ;;
  esac
  sleep 1
done
agent-browser wait 8000
echo "final URL: $(agent-browser get url)"
agent-browser screenshot "$ROOT/download/verify-7-admin-dashboard.png"

# also grab an admin data page (products) to prove Atlas-backed admin reads work
agent-browser open "http://127.0.0.1:3000/admin-console/admin/products"
agent-browser wait 8000
agent-browser screenshot "$ROOT/download/verify-8-admin-products.png"

echo "=== browser errors ==="
agent-browser errors
agent-browser close
echo "=== FINAL E2E DONE ==="
