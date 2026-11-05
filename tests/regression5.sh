#!/bin/bash
# =====================================================================
# Two Star CRM — Regression tests #5 (Ledger me Bill View button)
#   - Bill se auto-linked ledger transaction ke saath bill_id aana chahiye
#     (frontend usi par print/view button dikhata hai)
#   - Manual transaction par bill_id NAHI hona chahiye (button nahi lagega)
#   - GET /api/bills/:id (jo printBill use karta hai) bill + items deta hai
# Usage: bash tests/regression5.sh [BASE_URL]
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
TODAY=$(date +%F)

echo "== Login =="
req POST /api/auth/login '{"username":"admin","password":"admin123"}' > /dev/null

echo "== Setup: customer + inventory + bill (client ke saath) =="
CL=$(req POST /api/clients '{"folder_id":1,"name":"TG Buyer","phone":"0300-7776655"}')
CL_ID=$(py "d['id']" "$CL")
INV=$(req POST /api/inventory '{"name":"TG Chair","quantity":50,"rate":1000}')
INV_ID=$(py "d['id']" "$INV")
BILL=$(req POST /api/bills "{\"bill_no\":\"9501\",\"client_id\":$CL_ID,\"customer_name\":\"TG Buyer\",\"bill_date\":\"$TODAY\",\"paid\":2000,\"items\":[{\"product_id\":$INV_ID,\"product_name\":\"TG Chair\",\"quantity\":5,\"rate\":1000}]}")
BILL_ID=$(py "d['id']" "$BILL")

echo "== TG: manual transaction add karo (Cash received) =="
req POST /api/transactions "{\"client_id\":$CL_ID,\"entry_date\":\"$TODAY\",\"bill_no\":\"\",\"amount_received\":1000,\"amount_pending\":0,\"status\":\"Received\",\"description\":\"Cash\"}" > /dev/null

echo "== Checks =="
TXS=$(req GET "/api/clients/$CL_ID/transactions")
V=$(py "[t for t in d['transactions'] if t.get('auto_generated')==1][0]['bill_id']" "$TXS"); check "bill-linked transaction ka bill_id = asal bill id" "$BILL_ID" "$V"
V=$(py "[t for t in d['transactions'] if t.get('auto_generated')==1][0]['bill_no']" "$TXS"); check "bill-linked row ka bill_no = 9501" "9501" "$V"
V=$(py "str([t for t in d['transactions'] if (t.get('description') or '')=='Cash'][0].get('bill_id'))" "$TXS"); check "manual (Cash) row par bill_id None" "None" "$V"
BD=$(req GET "/api/bills/$BILL_ID")
V=$(py "d['bill']['bill_no']" "$BD"); check "bill detail API: bill_no 9501" "9501" "$V"
V=$(py "len(d['items'])" "$BD"); check "bill detail API: 1 item (print view ke liye)" "1" "$V"
V=$(py "d['items'][0]['product_name']" "$BD"); check "bill item naam = TG Chair" "TG Chair" "$V"

echo ""
echo "================================"
echo "PASS: $PASS   FAIL: $FAIL"
echo "================================"
rm -f "$JAR"
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
