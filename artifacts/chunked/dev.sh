#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LARAVEL_DIR="$APP_DIR/laravel"
DB_DIR="$(mktemp -d /tmp/chunked-mariadb.XXXXXX)"
DB_SOCKET="$DB_DIR/mysql.sock"
DB_PID="$DB_DIR/mysql.pid"
APP_PID=""

cleanup() {
  if [[ -n "$APP_PID" ]]; then
    kill "$APP_PID" 2>/dev/null || true
  fi
  if [[ -f "$DB_PID" ]]; then
    kill "$(cat "$DB_PID")" 2>/dev/null || true
  fi
  rm -rf "$DB_DIR"
}
trap cleanup EXIT INT TERM

export DB_CONNECTION=mysql
export DB_HOST=127.0.0.1
export DB_PORT=3306
export DB_DATABASE=chunked
export DB_USERNAME=root
export DB_PASSWORD=
export SESSION_DRIVER=file
export CACHE_STORE=file
export QUEUE_CONNECTION=sync
export APP_ENV=local
export APP_DEBUG=true
export APP_URL="http://127.0.0.1:${PORT:-25067}"
export APP_FORCE_HTTPS=true

if [[ ! -f "$LARAVEL_DIR/.env" ]]; then
  cp "$LARAVEL_DIR/.env.example" "$LARAVEL_DIR/.env"
fi
if grep -q '^APP_KEY=$' "$LARAVEL_DIR/.env"; then
  (cd "$LARAVEL_DIR" && php artisan key:generate --force >/dev/null)
fi

pnpm --filter @workspace/chunked run build

mariadb-install-db --no-defaults \
  --datadir="$DB_DIR" \
  --auth-root-authentication-method=normal \
  --skip-test-db >/dev/null

mariadbd --no-defaults \
  --datadir="$DB_DIR" \
  --socket="$DB_SOCKET" \
  --pid-file="$DB_PID" \
  --port=3306 \
  --bind-address=127.0.0.1 \
  --user="$(id -un)" \
  --skip-log-error \
  >"$DB_DIR/server.log" 2>&1 &

for attempt in $(seq 1 40); do
  if mysql --no-defaults --protocol=socket --socket="$DB_SOCKET" -uroot -e 'SELECT 1' >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == 40 ]]; then
    cat "$DB_DIR/server.log"
    echo "MariaDB did not become ready." >&2
    exit 1
  fi
  sleep 1
done

mysql --no-defaults --protocol=socket --socket="$DB_SOCKET" -uroot \
  -e "CREATE DATABASE IF NOT EXISTS chunked CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

cd "$LARAVEL_DIR"
php artisan config:clear >/dev/null
php artisan migrate --force
php artisan db:seed --class='Database\Seeders\FocusMediaAssetSeeder' --force
# Laravel filters child-process environment variables unless --no-reload is set.
php artisan serve --no-reload --host=0.0.0.0 --port="${PORT:-25067}" &
APP_PID=$!
wait "$APP_PID"
