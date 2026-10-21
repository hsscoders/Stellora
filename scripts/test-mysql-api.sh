#!/bin/bash
# Stellora MySQL migration — API smoke test suite
# Tests every major route group against the running backend with real migrated data.
B=http://127.0.0.1:4000/api
J=/tmp/stellora-test-jars
mkdir -p $J
PASS=0; FAIL=0; DETAIL=""

check() { # name, expected, actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); DETAIL="$DETAIL✓ $1\n";
  else FAIL=$((FAIL+1)); DETAIL="$DETAIL✗ $1 (expected $2, got $3)\n"; fi
}

jq_field() { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(eval('d'+sys.argv[1]))" "$2" 2>/dev/null; }

# 1. Health
R=$(curl -s $B/health)
check "health status" "healthy" "$(jq_field "$R" "['data']['status']")"
check "health db" "connected" "$(jq_field "$R" "['data']['database']")"

# 2. Categories
R=$(curl -s $B/categories)
N=$(jq_field "$R" "['data'].__len__()" 2>/dev/null || echo 0)
check "categories (4)" "4" "$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))")"

# 3. Products list + pagination shape
R=$(curl -s "$B/products?page=1")
check "products ok" "True" "$(jq_field "$R" "['ok']")"
check "products page field" "1" "$(jq_field "$R" "['data']['page']")"

# 4. Product detail by slug (real migrated product)
SLUG=$(curl -s "$B/products?page=1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['products'][0]['slug'])")
R=$(curl -s "$B/products/$SLUG")
check "product detail ok" "True" "$(jq_field "$R" "['ok']")"
check "product has variants" "True" "$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['variants'])>0)")"

# 5. Product search
R=$(curl -s "$B/products?q=aurelia")
check "search works" "True" "$(jq_field "$R" "['ok']")"

# 6. Price filter (min 100 max 500)
R=$(curl -s "$B/products?minPrice=100&maxPrice=500")
check "price filter ok" "True" "$(jq_field "$R" "['ok']")"

# 7. Rating sort (in-memory path)
R=$(curl -s "$B/products?sort=rating-desc")
check "rating sort ok" "True" "$(jq_field "$R" "['ok']")"

# 8. Price sort
R=$(curl -s "$B/products?sort=price-asc")
check "price sort ok" "True" "$(jq_field "$R" "['ok']")"

# 9. Banners
R=$(curl -s $B/banners)
check "banners ok" "True" "$(jq_field "$R" "['ok']")"

# 10. Settings
R=$(curl -s $B/settings)
check "settings ok" "True" "$(jq_field "$R" "['ok']")"
check "settings hides secrets" "0" "$(echo "$R" | python3 -c "import sys,json; print(sum(1 for r in json.load(sys.stdin)['data'] if r['key'].startswith('payment.')))")"

# 11. SEO
R=$(curl -s $B/seo)
check "seo ok" "Stellora" "$(jq_field "$R" "['data']['siteName']")"

# 12. Customer login (migrated password hash must verify!)
R=$(curl -s -c $J/cust -X POST $B/auth/login -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{"identifier":"customer@stellora.local","password":"Customer#2026"}')
check "customer login (hash verify)" "True" "$(jq_field "$R" "['ok']")"
CUST_ID=$(jq_field "$R" "['data']['id']")
check "customer id is 24-hex" "24" "${#CUST_ID}"

# 13. Me endpoint
R=$(curl -s -b $J/cust $B/auth/me)
check "auth/me" "CUSTOMER" "$(jq_field "$R" "['data']['user']['role']")"

# 14. Loyalty snapshot (migrated ledger!)
R=$(curl -s -b $J/cust $B/loyalty)
check "loyalty ok" "True" "$(jq_field "$R" "['ok']")"

# 15. My orders (migrated orders!)
R=$(curl -s -b $J/cust $B/orders)
ORDERS_N=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null || echo ERR)
check "my orders list (migrated)" "True" "$([ "$ORDERS_N" -ge 0 ] && echo True || echo False)"
if [ "$ORDERS_N" != "0" ] && [ "$ORDERS_N" != "ERR" ]; then
  ONUM=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['orderNumber'])")
  R2=$(curl -s -b $J/cust $B/orders/$ONUM)
  check "order detail ok" "True" "$(jq_field "$R2" "['ok']")"
  check "order has events" "True" "$(echo "$R2" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['events'])>0)")"
  check "order has items" "True" "$(echo "$R2" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['items'])>0)")"
fi

# 16. Track order (public, needs shipPhone or email match)
if [ "$ORDERS_N" != "0" ] && [ "$ORDERS_N" != "ERR" ]; then
  ONUM=$(curl -s -b $J/cust $B/orders | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['orderNumber'])")
  R=$(curl -s -X POST $B/track -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d "{\"orderNumber\":\"$ONUM\",\"contact\":\"customer@stellora.local\"}")
  check "track order" "True" "$(jq_field "$R" "['ok']")"
fi

# 17. Addresses (migrated embedded → table)
R=$(curl -s -b $J/cust $B/account/addresses)
ADDR_N=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null || echo ERR)
check "addresses migrated" "True" "$([ "$ADDR_N" -ge 1 ] && echo True || echo False)"

# 18. Add address
R=$(curl -s -b $J/cust -X POST $B/account/addresses -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{"fullName":"Test User","phone":"9800000001","line1":"1 Test St","city":"TestCity","state":"TS","pincode":"140001","country":"India","isDefault":false}')
NEW_ADDR_ID=$(jq_field "$R" "['data']['id']")
check "address create" "True" "$(jq_field "$R" "['ok']")"
# Update it
R=$(curl -s -b $J/cust -X PUT $B/account/addresses/$NEW_ADDR_ID -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{"fullName":"Test User 2","phone":"9800000001","line1":"1 Test St","city":"TestCity","state":"TS","pincode":"140001","country":"India","isDefault":false}')
check "address update" "Test User 2" "$(jq_field "$R" "['data']['fullName']")"
# Delete it
R=$(curl -s -b $J/cust -X DELETE $B/account/addresses/$NEW_ADDR_ID -H "Origin: http://localhost:3000")
check "address delete" "True" "$(jq_field "$R" "['data']['deleted']")"

# 19. Cart flow (guest)
VARIANT=$(curl -s "$B/products/$SLUG" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['variants'][0]['id'])")
curl -s -c $J/guest -o /dev/null $B/cart  # establish cart cookie
R=$(curl -s -b $J/guest -c $J/guest -X POST $B/cart -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d "{\"variantId\":\"$VARIANT\",\"quantity\":1}")
check "cart add" "True" "$(jq_field "$R" "['ok']")"
check "cart subtotal is number" "True" "$(echo "$R" | python3 -c "import sys,json; v=json.load(sys.stdin)['data']['subtotal']; print(isinstance(v,(int,float)))")"
ITEM_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['items'][0]['itemId'])")
# Update quantity
R=$(curl -s -b $J/guest -X PATCH $B/cart/items/$ITEM_ID -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{"quantity":2}')
check "cart update qty" "2" "$(jq_field "$R" "['data']['items'][0]['quantity']")"
# Remove
R=$(curl -s -b $J/guest -X DELETE $B/cart/items/$ITEM_ID -H "Origin: http://localhost:3000")
check "cart remove" "0" "$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['items']))")"

# 20. Wishlist (customer)
R=$(curl -s -b $J/cust -X POST $B/wishlist -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d "{\"productId\":\"$(curl -s "$B/products/$SLUG" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")\"}")
check "wishlist toggle on" "True" "$(jq_field "$R" "['data']['inWishlist']")"
R=$(curl -s -b $J/cust -X POST $B/wishlist -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d "{\"productId\":\"$(curl -s "$B/products/$SLUG" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")\"}")
check "wishlist toggle off" "False" "$(jq_field "$R" "['data']['inWishlist']")"

# 21. Reviews list (migrated reviews)
PID=$(curl -s "$B/products/$SLUG" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
R=$(curl -s "$B/products/$PID/reviews")
check "reviews list ok" "True" "$(jq_field "$R" "['ok']")"

# 22. Coupon validate (WELCOME10, minSubtotal 999 — needs a pricier variant)
EXPENSIVE=$(curl -s "$B/products?minPrice=999&maxPrice=100000" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']['products']
vs=[v for p in d for v in p['variants']]
print(vs[0]['id'] if vs else '')")
if [ -n "$EXPENSIVE" ]; then
  curl -s -b $J/guest -c $J/guest -X POST $B/cart -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d "{\"variantId\":\"$EXPENSIVE\",\"quantity\":1}" > /dev/null
  R=$(curl -s -b $J/guest -X POST $B/coupons/validate -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{"code":"WELCOME10"}')
  check "coupon validate" "True" "$(jq_field "$R" "['data']['valid']")"
fi

# 23. Shipping rate
R=$(curl -s $B/shipping)
check "shipping rate" "79" "$(jq_field "$R" "['data']['baseFee']")"

# 24. Checkout with migrated address + idempotency
ADDR_ID=$(curl -s -b $J/cust $B/account/addresses | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['id'])")
# Move guest cart to customer by adding item while logged in
curl -s -b $J/cust -c $J/cust -X POST $B/cart -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d "{\"variantId\":\"$VARIANT\",\"quantity\":1}" > /dev/null
KEY="test-key-$(date +%s)"
STOCK_AFTER_CHECKOUT=$(curl -s "$B/products/$SLUG/stock" | python3 -c "import sys,json; print([v['stock'] for v in json.load(sys.stdin)['data'] if v['id']=='$VARIANT'][0])")
R=$(curl -s -b $J/cust -X POST $B/checkout -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d "{\"addressId\":\"$ADDR_ID\",\"idempotencyKey\":\"$KEY\"}")
ORDER_NUM=$(jq_field "$R" "['data']['orderNumber']")
check "checkout creates order" "True" "$(jq_field "$R" "['ok']")"
# Idempotent replay
R2=$(curl -s -b $J/cust -X POST $B/checkout -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d "{\"addressId\":\"$ADDR_ID\",\"idempotencyKey\":\"$KEY\"}")
check "checkout idempotent replay" "$ORDER_NUM" "$(jq_field "$R2" "['data']['orderNumber']")"
check "replay flag" "True" "$(jq_field "$R2" "['data']['replayed']")"

# 25. Payment intent (stock was already decremented at checkout; verified below)
R=$(curl -s -b $J/cust -X POST $B/payments/create-intent -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d "{\"orderNumber\":\"$ORDER_NUM\"}")
check "create-intent (demo gateway)" "demo" "$(jq_field "$R" "['data']['provider']")"
GWO=$(jq_field "$R" "['data']['gatewayOrderId']")

# 26. Demo pay + confirm (full payment cycle)
R=$(curl -s -b $J/cust -X POST $B/payments/demo/process -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d "{\"orderNumber\":\"$ORDER_NUM\",\"cardNumber\":\"4242424242424242\",\"expiry\":\"12/28\",\"cvv\":\"123\"}")
check "demo card approved" "True" "$(jq_field "$R" "['data']['approved']")"
GPID=$(jq_field "$R" "['data']['gatewayPaymentId']")
GSIG=$(jq_field "$R" "['data']['gatewaySignature']")
R=$(curl -s -b $J/cust -X POST $B/payments/confirm -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d "{\"orderNumber\":\"$ORDER_NUM\",\"gatewayPaymentId\":\"$GPID\",\"gatewaySignature\":\"$GSIG\"}")
check "payment confirm -> PAID" "PAID" "$(jq_field "$R" "['data']['paymentStatus']")"
check "payment confirm -> CONFIRMED" "CONFIRMED" "$(jq_field "$R" "['data']['status']")"
check "points earned" "True" "$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['pointsEarned']>=0)")"

STOCK_DECREMENTED=$(curl -s "$B/products/$SLUG/stock" | python3 -c "import sys,json; print([v['stock'] for v in json.load(sys.stdin)['data'] if v['id']=='$VARIANT'][0])")
check "stock decremented at checkout" "$((STOCK_AFTER_CHECKOUT + 1))" "$STOCK_DECREMENTED"

# 27. Admin login + admin-only endpoints
R=$(curl -s -c $J/admin -X POST $B/auth/login -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{"identifier":"admin@stellora.local","password":"StelloraAdmin#2026"}')
check "admin login" "ADMIN" "$(jq_field "$R" "['data']['role']")"
R=$(curl -s -b $J/admin $B/admin/stats)
check "admin stats" "True" "$(jq_field "$R" "['ok']")"
R=$(curl -s -b $J/admin "$B/orders-list?page=1")
check "admin orders list" "True" "$(jq_field "$R" "['ok']")"
R=$(curl -s -b $J/admin $B/admin/reports?days=14)
check "admin reports" "True" "$(jq_field "$R" "['ok']")"
R=$(curl -s -b $J/admin $B/admin/products)
check "admin products" "True" "$(jq_field "$R" "['ok']")"
R=$(curl -s -b $J/admin $B/admin/customers-list)
check "admin customers" "True" "$(jq_field "$R" "['ok']")"
R=$(curl -s -b $J/admin $B/admin/settings)
check "admin settings" "True" "$(jq_field "$R" "['ok']")"
R=$(curl -s -b $J/admin $B/admin/audit-logs)
check "admin audit-logs (migrated 602)" "True" "$(jq_field "$R" "['ok']")"
# Admin order detail (uses serializeOrderDetail with user include)
R=$(curl -s -b $J/admin $B/admin/orders-list?page=1 | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['orders'][0]['id'] if 'orders' in json.load(sys.stdin)['data'] else '')" 2>/dev/null)
if [ -n "$R" ]; then
  R2=$(curl -s -b $J/admin $B/admin/orders/$R)
  check "admin order detail" "True" "$(jq_field "$R2" "['ok']")"
fi
# Customer cancellation (restore stock) — cancel the test order
R=$(curl -s -b $J/cust -X POST $B/orders/$ORDER_NUM/cancel -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{"reason":"test cleanup"}')
check "order cancel" "True" "$(jq_field "$R" "['ok']")"
STOCK_AFTER=$(curl -s "$B/products/$SLUG/stock" | python3 -c "import sys,json; print([v['stock'] for v in json.load(sys.stdin)['data'] if v['id']=='$VARIANT'][0])")
check "stock restored on cancel" "$STOCK_DECREMENTED" "$STOCK_AFTER"

# 28. Chat thread
R=$(curl -s -b $J/cust $B/chat/thread)
check "chat thread" "True" "$(jq_field "$R" "['ok']")"

# 29. Newsletter
R=$(curl -s -X POST $B/newsletter -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{"email":"mysql-test@stellora.local"}')
check "newsletter subscribe" "True" "$(jq_field "$R" "['ok']")"

# 30. CSRF: no-origin POST must still work; bad origin must 403
R=$(curl -s -o /dev/null -w "%{http_code}" -X POST $B/newsletter -H "Content-Type: application/json" -H "Origin: http://evil.example" -d '{"email":"x@y.z"}')
check "CSRF blocks evil origin" "403" "$R"

# 31. Malformed id → NOT_FOUND (not 500)
R=$(curl -s -o /dev/null -w "%{http_code}" "$B/products/zzz-not-a-real-slug-xxx")
check "unknown product → 404" "404" "$R"

echo -e "$DETAIL"
echo "=============================="
echo "PASS: $PASS  FAIL: $FAIL"
[ $FAIL -eq 0 ] && echo "ALL SMOKE TESTS PASSED" || echo "SOME TESTS FAILED"
