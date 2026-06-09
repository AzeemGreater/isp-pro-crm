#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:4000"
LOGIN_PAYLOAD='{"username":"superadmin","password":"Admin@12345"}'

json_get() {
  local key="$1"
  sed -n "s/.*\"${key}\":\"\{0,1\}\([^\"}]*\)\"\{0,1\}.*/\1/p" | head -n1
}

TOKEN=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "$LOGIN_PAYLOAD" | json_get token)

if [[ -z "$TOKEN" ]]; then
  echo "AUTH_FAIL"
  exit 1
fi

echo "AUTH_OK"

SUBSCRIBER_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/subscribers?search=batch2_user_001&limit=1" | json_get id)
if [[ -z "$SUBSCRIBER_ID" ]]; then
  echo "SUBSCRIBER_LOOKUP_FAIL"
  exit 1
fi

echo "TARGET_SUBSCRIBER|$SUBSCRIBER_ID"

post_json() {
  local name="$1"
  local path="$2"
  local body="$3"
  local code
  code=$(curl -s -o /tmp/smoke_action_resp.txt -w "%{http_code}" -X POST "$BASE$path" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$body")
  printf "%s|%s|%s\n" "$name" "$code" "$(tr '\n' ' ' < /tmp/smoke_action_resp.txt | head -c 160)"
}

post_json "generate_selected" "/api/billing/wasooli/generate/selected" "{\"subscriber_ids\":[${SUBSCRIBER_ID}]}"
post_json "pos_collect" "/api/billing/pos/collect" "{\"subscriber_id\":${SUBSCRIBER_ID}}"

ONLINE_USER=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/nas/online-users" | json_get username)
if [[ -n "$ONLINE_USER" ]]; then
  post_json "kick_online_user" "/api/nas/online-users/kick" "{\"username\":\"${ONLINE_USER}\"}"
else
  echo "kick_online_user|SKIP|No online user found"
fi
