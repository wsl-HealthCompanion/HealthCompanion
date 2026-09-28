#!/usr/bin/env bash
set -euo pipefail

PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://127.0.0.1}"
BACKEND_BASE_URL="${BACKEND_BASE_URL:-http://127.0.0.1:4000}"

assert_status() {
  local label="$1"
  local allowed="$2"
  local url="$3"
  local status
  status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$url")"
  case " $allowed " in
    *" $status "*) printf '%s HTTP %s (expected)\n' "$label" "$status" ;;
    *)
      printf '%s HTTP %s; expected one of: %s\n' "$label" "$status" "$allowed" >&2
      return 1
      ;;
  esac
}

echo "== nginx syntax (read-only) =="
nginx -t

echo "== local backend health =="
assert_status "backend health" "200" "$BACKEND_BASE_URL/api/v1/health"

echo "== unauthenticated random dynamic stream must be denied =="
assert_status \
  "dynamic FLV" \
  "401 403 404" \
  "$PUBLIC_BASE_URL/live/dh_00000000000000000000000000000000.flv"

echo "== internal control path must not be public =="
assert_status \
  "internal API" \
  "404" \
  "$PUBLIC_BASE_URL/dh/api/internal/digital-human/sessions"

echo "== listening ports (read-only; exposure must still be checked at the firewall) =="
ss -ltnp | grep -E ':(80|4000|8010|8080|8180|1935)\b' || true

echo "All isolation assertions passed."
