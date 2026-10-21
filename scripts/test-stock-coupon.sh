#!/bin/bash
# Deterministic stock lifecycle test: S0 → checkout → S0-1 → cancel → S0
B=http://127.0.0.1:4000/api
J=/tmp/det-test; rm -rf $J; mkdir -p $J

# login customer
curl -s -c $J/cust -X POST $B/auth/login -H "Content-Type: application/json" -H "Origin: http://localhost:3000" \
  -d '{"identifier":"customer@stellora.local","password":"Customer#2026"}' > /dev/null

# pick a real variant + product
SLUG=$(curl -s "$B/products?page=1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['products'][0]['slug'])")
PID=$(curl -s "$B/products/$SLUG" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
VID=$(curl -s "$B/products/$SLUG" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['variants'][0]['id'])")

S0=$(curl -s "$B/products/$SLUG/stock" | python3 -c "import sys,json; print([v['stock'] for v in json.load(sys.stdin)['data'] if v['id']=='$VID'][0])")
echo "S0=$S0"

# checkout 1 unit
ADDR=$(curl -s -b $J/cust $B/account/addresses | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['id'])")
curl -s -b $J/cust -X POST $B/cart -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d "{\"variantId\":\"$VID\",\"quantity\":1}" > /dev/null
KEY="det-$(date +%s%N)"
R=$(curl -s -b $J/cust -X POST $B/checkout -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d "{\"addressId\":\"$ADDR\",\"idempotencyKey\":\"$KEY\"}")
ONUM=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['orderNumber'])")
S1=$(curl -s "$B/products/$SLUG/stock" | python3 -c "import sys,json; print([v['stock'] for v in json.load(sys.stdin)['data'] if v['id']=='$VID'][0])")
echo "after checkout: S1=$S1 (expect $((S0-1)))"
[ "$S1" = "$((S0-1))" ] && echo "✓ decrement OK" || echo "✗ decrement FAIL"

# cancel (customer self-cancel on PENDING order)
R=$(curl -s -b $J/cust -X POST $B/orders/$ONUM/cancel -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{"reason":"deterministic test"}')
OK=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['ok'])")
S2=$(curl -s "$B/products/$SLUG/stock" | python3 -c "import sys,json; print([v['stock'] for v in json.load(sys.stdin)['data'] if v['id']=='$VID'][0])")
echo "after cancel: ok=$OK S2=$S2 (expect $S0)"
[ "$S2" = "$S0" ] && echo "✓ restore OK" || echo "✗ restore FAIL"

# coupon with expensive item
EXPV=$(curl -s "$B/products?minPrice=1000" | python3 -c "
import sys,json
d=json.load(sys.stdin)
vs=[v['id'] for p in d['data']['products'] for v in p['variants'] if v['stock']>0]
print(vs[0] if vs else '')")
if [ -n "$EXPV" ]; then
  curl -s -b $J/cust -X POST $B/cart -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d "{\"variantId\":\"$EXPV\",\"quantity\":1}" > /dev/null
  R=$(curl -s -b $J/cust -X POST $B/coupons/validate -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{"code":"WELCOME10"}')
  V=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['valid'])")
  D=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('discount'))")
  echo "coupon WELCOME10: valid=$V discount=$D"
  [ "$V" = "True" ] && echo "✓ coupon OK" || echo "✗ coupon FAIL"
else
  echo "(no variant >= 1000 in stock — coupon test skipped)"
fi
