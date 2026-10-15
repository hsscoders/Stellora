#!/bin/bash
# Stellora dev database: portable MariaDB (MySQL drop-in) in user space.
# Idempotent. Downloads once, initializes datadir once, starts if not running.
set -e
MARIADB_VER="${MARIADB_VER:-11.4.5}"
BASE="$HOME/.local/mariadb"
INSTALL_DIR="$BASE/mariadb-$MARIADB_VER"
DB_DIR="/home/z/my-project/stellora-repo/.mariadb"
SOCK="$DB_DIR/mysqld.sock"
PORT="${MARIADB_PORT:-33061}"
LOG="$DB_DIR/mysqld.err"
mkdir -p "$DB_DIR"

if [ ! -d "$INSTALL_DIR" ]; then
  echo "[mariadb] downloading $MARIADB_VER ..."
  URL="https://archive.mariadb.org/mariadb-$MARIADB_VER/bintar-linux-systemd-x86_64/mariadb-$MARIADB_VER-linux-systemd-x86_64.tar.gz"
  curl -sSL --retry 3 -o /tmp/mariadb.tar.gz "$URL"
  echo "[mariadb] extracting ..."
  mkdir -p "$BASE"
  tar -xzf /tmp/mariadb.tar.gz -C "$BASE"
  rm -f /tmp/mariadb.tar.gz
fi

# Fix any missing shared libraries by extracting them from Debian packages into local lib dir
LIBDIR="$BASE/extralibs"
mkdir -p "$LIBDIR"
MISSING=$(ldd "$INSTALL_DIR/bin/mysqld" 2>/dev/null | grep "not found" | awk '{print $1}' | sort -u || true)
if [ -n "$MISSING" ]; then
  echo "[mariadb] missing libs: $MISSING — extracting from apt packages"
  for lib in $MISSING; do
    case "$lib" in
      libaio.so*) PKG=libaio1t64 ;;
      libncurses.so*) PKG=libncurses6 ;;
      libtinfo.so*) PKG=libtinfo6 ;;
      libsystemd.so*) PKG=libsystemd0 ;;
      lzma.so*) PKG=liblzma5 ;;
      *) PKG="" ;;
    esac
    if [ -n "$PKG" ]; then
      apt-get download "$PKG" >/dev/null 2>&1 || true
      DEB=$(ls -t ${PKG}_*.deb 2>/dev/null | head -1 || true)
      if [ -n "$DEB" ]; then dpkg-deb -x "$DEB" "$LIBDIR/pkg" && rm -f "$DEB"; fi
    fi
  done
  find "$LIBDIR/pkg" -name "*.so*" -exec cp -a {} "$LIBDIR/" \; 2>/dev/null || true
fi
export LD_LIBRARY_PATH="$LIBDIR:$INSTALL_DIR/lib:$LD_LIBRARY_PATH"

# Check running
if [ -S "$SOCK" ] && "$INSTALL_DIR/bin/mariadb-admin" --socket="$SOCK" --user=root ping >/dev/null 2>&1; then
  echo "[mariadb] already running"
  exit 0
fi
rm -f "$SOCK" "$SOCK.lock" 2>/dev/null || true

if [ ! -d "$DB_DIR/data/mysql" ]; then
  echo "[mariadb] initializing datadir ..."
  "$INSTALL_DIR/scripts/mariadb-install-db" \
    --basedir="$INSTALL_DIR" --datadir="$DB_DIR/data" --auth-root-authentication-method=normal \
    --skip-test-db >/dev/null 2>&1
fi

echo "[mariadb] starting server on port $PORT ..."
nohup "$INSTALL_DIR/bin/mariadbd" \
  --no-defaults \
  --basedir="$INSTALL_DIR" \
  --datadir="$DB_DIR/data" \
  --socket="$SOCK" \
  --port="$PORT" \
  --bind-address=127.0.0.1 \
  --skip-name-resolve \
  --innodb_buffer_pool_size=192M \
  --max_connections=60 \
  --log-error="$LOG" \
  > "$DB_DIR/mysqld.out" 2>&1 &

for i in $(seq 1 60); do
  if "$INSTALL_DIR/bin/mariadb-admin" --socket="$SOCK" --user=root ping >/dev/null 2>&1; then
    echo "[mariadb] server is up"
    break
  fi
  [ "$i" = "60" ] && { echo "[mariadb] FAILED to start"; tail -20 "$LOG" || true; exit 1; }
  sleep 1
done

# Create app database + user once
"$INSTALL_DIR/bin/mariadb" --socket="$SOCK" --user=root <<SQL 2>/dev/null || true
CREATE DATABASE IF NOT EXISTS stellora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'stellora'@'%' IDENTIFIED BY 'stellora_dev_pw';
CREATE USER IF NOT EXISTS 'stellora'@'127.0.0.1' IDENTIFIED BY 'stellora_dev_pw';
CREATE USER IF NOT EXISTS 'stellora'@'localhost' IDENTIFIED BY 'stellora_dev_pw';
GRANT ALL PRIVILEGES ON stellora.* TO 'stellora'@'%';
GRANT ALL PRIVILEGES ON stellora.* TO 'stellora'@'127.0.0.1';
GRANT ALL PRIVILEGES ON stellora.* TO 'stellora'@'localhost';
FLUSH PRIVILEGES;
SQL
echo "[mariadb] ready: mysql://stellora@127.0.0.1:$PORT/stellora"
