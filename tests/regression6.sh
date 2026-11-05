#!/bin/bash
# =====================================================================
# Two Star CRM — Regression tests #6 (Supplier dropdowns me customers NAHI)
#   - GET /api/suppliers sirf supplier-folder walay clients deta hai
#   - Customer-folder wala client us list me NAHI aana chahiye
# Usage: bash tests/regression6.sh [BASE_URL]
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

echo "== Login =="
req POST /api/auth/login '{"username":"admin","password":"admin123"}' > /dev/null

echo "== Setup: aik customer (folder 1), aik supplier (folder 2) =="
req POST /api/clients '{"folder_id":1,"name":"TH Customer","phone":"0300-1"}' > /dev/null
req POST /api/clients '{"folder_id":2,"name":"TH Supplier","phone":"0300-2"}' > /dev/null

echo "== Checks: /api/suppliers =="
S=$(req GET /api/suppliers)
V=$(py "len([x for x in d['suppliers'] if x['name']=='TH Supplier'])" "$S"); check "asal supplier list me hai" "1" "$V"
V=$(py "len([x for x in d['suppliers'] if x['name']=='TH Customer'])" "$S"); check "customer list me NAHI hai" "0" "$V"
V=$(py "[x for x in d['suppliers'] if x['name']=='TH Supplier'][0].get('folder_id')" "$S"); check "supplier ke saath folder_id bhi aata hai (2)" "2" "$V"

echo ""
echo "================================"
echo "PASS: $PASS   FAIL: $FAIL"
echo "================================"
rm -f "$JAR"
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
