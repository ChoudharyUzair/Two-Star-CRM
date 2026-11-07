#!/bin/bash
# =====================================================================
# Two Star CRM — Regression tests #8 (Customer Statement Link)
#   - POST /api/clients/:id/statement-link: token banta hai, dobara
#     call par WAHI token (stable)
#   - GET /s/<token> (baghair login): customer ka ledger statement —
#     naam, entries aur net balance (opening 2000 + pending 3000
#     - received 1500 = 3500) dikhta hai
#   - Ghalat token => 404
#   - Regenerate: naya token alag, purana link 404, naya link chalta hai
# Usage: bash tests/regression8.sh [BASE_URL]
# =====================================================================
BASE="${1:-http://localhost:3000}"
JAR=$(mktemp)
PASS=0; FAIL=0
req() {
  local m="$1" p="$2" d="$3"
  if [ -n "$d" ]; then curl -s -b "$JAR" -c "$JAR" -X "$m" -H 'Content-Type: application/json' -d "$d" "$BASE$p";
  else curl -s -b "$JAR" -c "$JAR" -X "$m" "$BASE$p"; fi
}
py() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)" <<< "$2"; }
check() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ✅ $1 (got $3)";
  else FAIL=$((FAIL+1)); echo "  ❌ $1 — expected $2, got $3"; fi
}
checkhas() {
  if grep -qF "$3" <<< "$2"; then PASS=$((PASS+1)); echo "  ✅ $1";
  else FAIL=$((FAIL+1)); echo "  ❌ $1 — not found: $3"; fi
}

echo "== Login =="
req POST /api/auth/login '{"username":"admin","password":"admin123"}' > /dev/null

echo "== Setup: customer + entries =="
req POST /api/clients '{"folder_id":1,"name":"Statement Wala Customer","phone":"03007776655","opening_balance":2000}' > /dev/null
CID=$(req GET "/api/folders/1/clients" | python3 -c "import json,sys;cs=json.load(sys.stdin)['clients'];print([c['id'] for c in cs if c['name']=='Statement Wala Customer'][0])")
echo "  client id: $CID"
req POST /api/transactions "{\"client_id\":$CID,\"entry_date\":\"2026-11-01\",\"amount_pending\":3000,\"amount_received\":0,\"description\":\"Test Udhar Entry\"}" > /dev/null
req POST /api/transactions "{\"client_id\":$CID,\"entry_date\":\"2026-11-02\",\"amount_pending\":0,\"amount_received\":1500,\"description\":\"Test Wasool Entry\"}" > /dev/null

echo "== Checks: statement link =="
L1=$(req POST "/api/clients/$CID/statement-link" '{}')
TOK1=$(py "d.get('token','')" "$L1")
check "path /s/ se shuru" "True" "$(py "str(d.get('path','')).startswith('/s/')" "$L1")"
check "token chhota (16 char)" "True" "$(python3 -c "print(len('$TOK1')==16)")"
L2=$(req POST "/api/clients/$CID/statement-link" '{}')
check "dobara call par wahi token" "$TOK1" "$(py "d.get('token','')" "$L2")"

echo "== Checks: public statement page (baghair login cookie) =="
PAGE=$(curl -s "$BASE/s/$TOK1")
checkhas "page me customer naam" "$PAGE" "Statement Wala Customer"
checkhas "page me udhar entry" "$PAGE" "Test Udhar Entry"
checkhas "page me wasool entry" "$PAGE" "Test Wasool Entry"
checkhas "net balance 3,500" "$PAGE" "3,500.00"

CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/s/ghalat-token-123456")
check "ghalat token => 404" "404" "$CODE"

echo "== Checks: regenerate =="
L3=$(req POST "/api/clients/$CID/statement-link/regenerate" '{}')
TOK2=$(py "d.get('token','')" "$L3")
check "naya token purane se alag" "True" "$(python3 -c "print('$TOK2' != '$TOK1' and len('$TOK2')==16)")"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/s/$TOK1")
check "purana link band (404)" "404" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/s/$TOK2")
check "naya link chalta hai (200)" "200" "$CODE"

echo "================================"
echo "PASS: $PASS   FAIL: $FAIL"
echo "================================"
rm -f "$JAR"
[ "$FAIL" = "0" ]
