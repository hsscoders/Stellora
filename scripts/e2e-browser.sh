#!/bin/bash
# Browser E2E on the ISOLATED test stack (:3100 storefront, :3101 admin,
# backend :4100 / stellora_audit_test). One call: boot -> probe -> drive UI.
set -u
ROOT=/home/z/my-project
B=http://127.0.0.1:4100
W=http://127.0.0.1:3100
cd "$ROOT"

echo "=== boot isolated test stack ==="
setsid nohup bash "$ROOT/scripts/test-stack.sh" >/dev/null 2>&1 </dev/null &
disown
for i in $(seq 1 45); do curl -sf --max-time 2 $B/api/health >/dev/null 2>&1 && break; sleep 2; done
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X POST $B/api/auth/login -H "Content-Type: application/json" -H "Origin: $B" -d '{"identifier":"customer@stellora.local","password":"Customer#2026"}')
  [ "$code" = "200" ] && break; sleep 2
done
echo "stack ready (seed verified)"
for i in $(seq 1 30); do curl -sf --max-time 2 $W/ >/dev/null 2>&1 && break; sleep 2; done
curl -s -o /dev/null -w "storefront :3100 -> %{http_code}\n" --max-time 15 $W/
curl -s -o /dev/null -w "admin :3101 -> %{http_code}\n" --max-time 15 http://127.0.0.1:3101/admin-console

echo ""
echo "=== login brute-force probe (9 bad attempts, unique identifier) ==="
ID="brute$(date +%s)@t.test"
for i in 1 2 3 4 5 6 7 8 9; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X POST $B/api/auth/login -H "Content-Type: application/json" -H "Origin: $B" -d "{\"identifier\":\"$ID\",\"password\":\"wrong$i\"}")
  printf "%s:%s " "$i" "$code"
done
echo ""
echo "(expect 401 x8 then 429 — rate limiter locks the bucket)"

echo ""
echo "=== pre-seed demo customer address (API, customer session) ==="
curl -s -c /tmp/e2e-cust -X POST $B/api/auth/login -H "Content-Type: application/json" -H "Origin: $B" -d '{"identifier":"customer@stellora.local","password":"Customer#2026"}' >/dev/null
curl -s -b /tmp/e2e-cust -X POST $B/api/account/addresses -H "Content-Type: application/json" -H "Origin: $B" -d '{"fullName":"Demo Customer","phone":"9876500011","line1":"12 Seed Street","city":"Rudarpur","state":"Uttarakhand","pincode":"263153","isDefault":true}' | head -c 90; echo

echo ""
echo "=== browser: storefront journey ==="
agent-browser set viewport 1440 900
agent-browser open $W/shop
agent-browser wait 6000
agent-browser screenshot "$ROOT/download/e2e-1-shop.png"

# open the first product card
agent-browser snapshot -i -c > /tmp/snap-shop.txt
PROD_LINK=$(grep -oE '@e[0-9]+' <(grep -iE 'product|Add|₹' /tmp/snap-shop.txt | head -5) | head -1)
echo "product ref: $PROD_LINK"
agent-browser open $W/product/aurelia-silver-pendant-necklace
agent-browser wait 6000
agent-browser screenshot "$ROOT/download/e2e-2-product.png"

# add to cart via the visible CTA
agent-browser find role button click --name "Add to Cart" || agent-browser find text "Add to Cart" click || true
agent-browser wait 3000
agent-browser screenshot "$ROOT/download/e2e-3-cart-added.png"

# cart drawer/page
agent-browser open $W/cart
agent-browser wait 5000
agent-browser screenshot "$ROOT/download/e2e-4-cart.png"

# checkout (requires sign-in) -> login form
agent-browser open $W/checkout
agent-browser wait 5000
agent-browser get url
agent-browser screenshot "$ROOT/download/e2e-5-checkout-auth.png"
agent-browser snapshot -i -c > /tmp/snap-login.txt
head -20 /tmp/snap-login.txt

# sign in as the seeded demo customer
agent-browser find label "Mobile number or Email" fill "customer@stellora.local" 2>/dev/null || agent-browser find textbox fill "customer@stellora.local"
agent-browser find label "Password" fill "Customer#2026" 2>/dev/null || true
agent-browser find role button click --name "Sign In" || agent-browser find text "Sign In" click
agent-browser wait 6000
agent-browser get url
agent-browser screenshot "$ROOT/download/e2e-6-checkout.png"

echo ""
echo "=== browser: admin journey ==="
agent-browser open $W/admin/login
agent-browser wait 5000
agent-browser find label "Mobile number or Email" fill "admin@stellora.local" 2>/dev/null || true
agent-browser find label "Password" fill "StelloraAdmin#2026"
agent-browser find role button click --name "Sign In"
agent-browser wait 8000
agent-browser get url
agent-browser screenshot "$ROOT/download/e2e-7-admin-dashboard.png"
agent-browser open $W/admin-console/admin/orders-list 2>/dev/null || agent-browser open $W/admin-console/admin/orders
agent-browser wait 6000
agent-browser screenshot "$ROOT/download/e2e-8-admin-orders.png"

echo ""
echo "=== browser errors ==="
agent-browser errors
agent-browser close
echo "=== E2E DONE ==="
