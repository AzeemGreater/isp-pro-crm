#!/usr/bin/env bash
set -euo pipefail

BASE_URL="http://localhost:4000/api"

login_json=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"superadmin","password":"Admin@12345"}')

token=$(printf "%s" "$login_json" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [[ -z "$token" ]]; then
  echo "LOGIN_FAILED"
  echo "$login_json"
  exit 1
fi

echo "AUTH_OK"

req() {
  local name="$1"
  local method="$2"
  local url="$3"
  local data="${4:-}"
  local accept="${5:-application/json}"

  local code
  if [[ "$method" == "GET" ]]; then
    code=$(curl -s -o /tmp/api_resp.txt -w "%{http_code}" \
      -H "Authorization: Bearer $token" \
      -H "Accept: $accept" \
      "$url")
  else
    code=$(curl -s -o /tmp/api_resp.txt -w "%{http_code}" -X "$method" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -H "Accept: $accept" \
      -d "$data" \
      "$url")
  fi

  local head
  head=$(head -c 120 /tmp/api_resp.txt | tr '\n' ' ')
  echo "$name|$code|$head"
}

req "health" GET "$BASE_URL/health"
req "subscribers" GET "$BASE_URL/subscribers?page=1&limit=5"
req "generate_overview" GET "$BASE_URL/billing/wasooli/generate/overview"
req "pos_queue" GET "$BASE_URL/billing/pos/queue"
req "invoices_list" GET "$BASE_URL/billing/invoices?page=1&limit=5"
req "invoice_create" POST "$BASE_URL/billing/invoices" '{"amount":777,"description":"Dummy invoice test","payment_method":"Cash","transaction_type":"Debit"}'
req "bulk_preview" POST "$BASE_URL/subscribers/bulk/preview" '{"search":"batch2_user_"}'
req "bulk_apply" POST "$BASE_URL/subscribers/bulk/apply" '{"search":"batch2_user_001","updates":{"status":"Active"}}'
req "export_csv" GET "$BASE_URL/subscribers/export.csv" '' 'text/csv'
req "import_rows" POST "$BASE_URL/subscribers/import" '{"mode":"upsert","rows":[{"pppoe_username":"batch2_user_001","full_name":"Batch2 Updated User 001","mobile":"03001230001","status":"Active"}]}'
req "online_users" GET "$BASE_URL/nas/online-users"
req "usage_report" GET "$BASE_URL/nas/usage-report?days=30"
req "clear_ghosts" POST "$BASE_URL/nas/online-users/clear-ghosts" '{}'
