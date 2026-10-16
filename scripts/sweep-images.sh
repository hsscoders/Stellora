#!/bin/bash
# Stellora integration sweep — broken images + JS page errors on every page.
# Usage: sweep-images.sh <session-json> <mode: admin|client>
SESSION="$1"; MODE="$2"
check() {
  local url="$1" label="$2"
  agent-browser open "$url" >/dev/null 2>&1
  agent-browser wait --load networkidle >/dev/null 2>&1
  sleep 0.6
  local res
  res=$(agent-browser eval "var imgs=[...document.querySelectorAll('img')];var broken=imgs.filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src.slice(-70));JSON.stringify({b:broken.length,list:broken.slice(0,3),t:imgs.length})" 2>/dev/null)
  local errs
  errs=$(agent-browser errors 2>/dev/null | rg -v "^✗\s*$|^$" | head -1)
  echo "$label => $res ${errs:+PAGE_ERROR: $errs}"
}

if [ "$MODE" = "admin" ]; then
  while read -r p; do
    check "http://127.0.0.1:3000/admin-console/$p" "$p"
  done < /tmp/admin-pages.txt
else
  for u in "/" "/shop" "/category/jewellery" "/product/noor-evening-clutch" "/product/wren-card-holder" "/cart" "/wishlist" "/search?q=noor" "/about" "/contact" "/login" "/register" "/track-order" "/faq"; do
    check "http://127.0.0.1:3000$u" "$u"
  done
fi
