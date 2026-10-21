#!/bin/bash
# One-shot E2E verification for the Stellora stack.
# Boots the stack via .zscripts/dev.sh, drives agent-browser through the
# golden paths, saves screenshots to download/. All in one call because the
# sandbox reaps background processes when the call ends.
set -u
ROOT=/home/z/my-project
cd "$ROOT"

# ---------- 1. Boot the stack ----------
rm -f "$ROOT/dev.log"
setsid nohup bash "$ROOT/.zscripts/dev.sh" >/dev/null 2>&1 </dev/null &
disown

for i in $(seq 1 40); do
  curl -sf --max-time 2 http://127.0.0.1:4000/api/health >/dev/null 2>&1 && break
  sleep 2
done
curl -s --max-time 5 http://127.0.0.1:4000/api/health; echo

curl -s -o /dev/null --max-time 90 -w "storefront warm: %{http_code}\n" http://127.0.0.1:3000/
curl -s -o /dev/null --max-time 90 -w "admin warm: %{http_code} redirect->%{redirect_url}\n" http://127.0.0.1:3000/admin-console/admin

# ---------- 2. Browser: storefront home ----------
agent-browser set viewport 1440 900
agent-browser open http://127.0.0.1:3000/
agent-browser wait 5000
agent-browser screenshot "$ROOT/download/verify-1-home.png"
agent-browser get title

# ---------- 3. Browser: shop page (products from Atlas) ----------
agent-browser open http://127.0.0.1:3000/shop
agent-browser wait 5000
agent-browser screenshot "$ROOT/download/verify-2-shop.png"

# ---------- 4. Browser: product detail ----------
agent-browser open http://127.0.0.1:3000/product/aurelia-silver-pendant-necklace
agent-browser wait 5000
agent-browser screenshot "$ROOT/download/verify-3-product.png"

# ---------- 5. Browser: admin login page ----------
agent-browser open http://127.0.0.1:3000/admin/login
agent-browser wait 5000
agent-browser screenshot "$ROOT/download/verify-4-admin-login.png"

# ---------- 6. Report ----------
echo "=== screenshots ==="
ls -la "$ROOT/download/" | grep verify
echo "=== page errors (browser) ==="
agent-browser errors
echo "=== dev.log errors ==="
grep -iE "error|fail" "$ROOT/dev.log" | grep -viE "Attention|error\.tsx|error boundary" | head -15
agent-browser close
echo "=== E2E DONE ==="
