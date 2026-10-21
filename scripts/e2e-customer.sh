#!/bin/bash
# Focused customer purchase journey on the test stack (single call).
set -u
ROOT=/home/z/my-project
B=http://127.0.0.1:4100
W=http://127.0.0.1:3100
cd "$ROOT"

curl -sf --max-time 3 $B/api/health >/dev/null 2>&1 || {
  setsid nohup bash "$ROOT/scripts/test-stack.sh" >/dev/null 2>&1 </dev/null & disown
  for i in $(seq 1 45); do curl -sf --max-time 2 $B/api/health >/dev/null 2>&1 && break; sleep 2; done
}
for i in $(seq 1 30); do curl -sf --max-time 2 $W/ >/dev/null 2>&1 && break; sleep 2; done
echo "stack ready"

# ensure the demo customer has an address
curl -s -c /tmp/e2e-cust -X POST $B/api/auth/login -H "Content-Type: application/json" -H "Origin: $B" -d '{"identifier":"customer@stellora.local","password":"Customer#2026"}' >/dev/null
curl -s -b /tmp/e2e-cust -X POST $B/api/account/addresses -H "Content-Type: application/json" -H "Origin: $B" -d '{"fullName":"Demo Customer","phone":"9876500011","line1":"12 Seed Street","city":"Rudarpur","state":"Uttarakhand","pincode":"263153","isDefault":true}' >/dev/null
echo "address ensured"

agent-browser set viewport 1440 900
# login as customer via the storefront login page
agent-browser open $W/login
agent-browser wait 5000
agent-browser find label "Mobile number or Email" fill "customer@stellora.local"
agent-browser find label "Password" fill "Customer#2026"
agent-browser find role button click --name "Sign In"
agent-browser wait 6000
echo "after login URL: $(agent-browser get url)"

# add product to cart via UI
agent-browser open $W/product/aurelia-silver-pendant-necklace
agent-browser wait 6000
agent-browser find role button click --name "Add to Cart" || echo "(add-to-cart CTA name differs — snapshotting)"
agent-browser wait 2500
agent-browser screenshot "$ROOT/download/e2e-3-cart-added.png"

# cart page
agent-browser open $W/cart
agent-browser wait 5000
agent-browser screenshot "$ROOT/download/e2e-4-cart.png"

# checkout
agent-browser open $W/checkout
agent-browser wait 6000
echo "checkout URL: $(agent-browser get url)"
agent-browser screenshot "$ROOT/download/e2e-6-checkout.png"
agent-browser snapshot -i -c > /tmp/checkout-snap.txt
head -30 /tmp/checkout-snap.txt

# place the order (PAY_ON_CONFIRMATION default)
agent-browser find text "Place order" click || agent-browser find role button click --name "Place order" || true
agent-browser wait 8000
echo "after place-order URL: $(agent-browser get url)"
agent-browser screenshot "$ROOT/download/e2e-9-order-confirmation.png"

echo "=== browser errors ==="
agent-browser errors
agent-browser close
echo DONE
