#!/bin/bash
# Boot an ISOLATED Stellora TEST stack on MySQL:
#   backend :4100 -> MySQL database "StelloraTest"
# Safe: the live "Stellora" DB is never touched by this stack.
set -u
ROOT=/home/z/my-project/Stellora
LOG=$ROOT/logs/test-stack-mysql.log

for p in 4100; do
  pid=$(ss -tlnp 2>/dev/null | grep ":$p " | grep -oE "pid=[0-9]+" | head -1 | cut -d= -f2)
  [ -n "$pid" ] && kill -9 "$pid" 2>/dev/null
done
sleep 1

# 1. Boot backend on :4100 with the test database
(
  cd "$ROOT/backend" || exit 1
  export DB_NAME="StelloraTest"
  export DATABASE_URL="mysql://Stellora:Stellora@127.0.0.1:3306/StelloraTest"
  export PORT=4100
  export NODE_ENV=development
  export PAYMENT_WEBHOOK_SECRET="audit_test_webhook_secret"
  exec npx tsx src/server.ts
) > "$LOG" 2>&1 &
echo $! > "$ROOT/logs/test-stack-mysql.pid"
echo "test backend booting on :4100 (pid $(cat "$ROOT/logs/test-stack-mysql.log" >/dev/null; echo ok))"
