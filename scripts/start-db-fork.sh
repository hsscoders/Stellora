#!/bin/bash
# Starts MariaDB detached, then exits so the daemon is orphaned to PID 1.
INSTALL="$HOME/.local/mariadb/mariadb-11.4.5-linux-systemd-x86_64"
DB="/home/z/my-project/stellora-repo/.mariadb"
SOCK="$DB/mysqld.sock"
export LD_LIBRARY_PATH="$HOME/.local/mariadb/extralibs:$INSTALL/lib"

if [ -S "$SOCK" ] && "$INSTALL/bin/mariadb-admin" --socket="$SOCK" --user=root ping >/dev/null 2>&1; then
  echo "[mariadb] already running"
  exit 0
fi
rm -f "$SOCK" "$SOCK.lock" 2>/dev/null || true

"$INSTALL/bin/mariadbd" \
  --no-defaults \
  --basedir="$INSTALL" \
  --datadir="$DB/data" \
  --socket="$SOCK" \
  --port=33061 \
  --bind-address=127.0.0.1 \
  --skip-name-resolve \
  --innodb_buffer_pool_size=192M \
  --max_connections=60 \
  --log-error="$DB/mysqld.err" \
  > "$DB/mysqld.out" 2>&1 &
disown
exit 0
