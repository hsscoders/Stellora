#!/bin/bash
# Admin login golden-path E2E test for Stellora.
set -u
ROOT=/home/z/my-project
cd "$ROOT"

rm -f "$ROOT/dev.log"
setsid nohup bash "$ROOT/.zscripts/dev.sh" >/dev/null 2>&1 </dev/null &
disown

for i in $(seq 1 40); do
  curl -sf --max-time 2 http://127.0.0.1:4000/api/health >/dev/null 2>&1 && break
  sleep 2
done
curl -s --max-time 5 http://127.0.0.1:4000/api/health; echo

# warm routes
curl -s -o /dev/null --max-time 90 -w "login warm: %{http_code}\n" http://127.0.0.1:3000/admin/login

agent-browser set viewport 1440 900
agent-browser open http://127.0.0.1:3000/admin/login
agent-browser wait 4000

# fill credentials and submit
agent-browser find label "Mobile number or Email" fill "admin@stellora.local"
agent-browser find label "Password" fill "Admin@12345"
agent-browser find role button click --name "Sign In"
agent-browser wait 8000
agent-browser get url
agent-browser screenshot "$ROOT/download/verify-5-admin-dashboard.png"

# check errors
echo "=== browser errors ==="
agent-browser errors
agent-browser close

echo "=== dev.log errors ==="
grep -iE "error|fail" "$ROOT/dev.log" | grep -viE "Attention|error\.tsx" | head -10
echo "=== ADMIN LOGIN TEST DONE ==="
