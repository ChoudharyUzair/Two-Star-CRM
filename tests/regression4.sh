#!/bin/bash
# =====================================================================
# Two Star CRM — Regression tests #4 (Reports Center)
#   - Customer report: totals + item breakdown + date filter
#   - Employee report: pieces/payout + breakdown + date filter
#   - Supplier report: purchases + date filter
#   - Stock report: opening / in / out / closing hisaab
# Usage: bash tests/regression4.sh [BASE_URL]   (run AFTER regression2+3 data
# exists, ya standalone — ye file apna TF-prefixed data khud banati hai)
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
  local diff=$(python3 -c "print(abs(($2)-($3))<1e-6)" 2>/dev/null)
  if [ "$diff" = "True" ]; then PASS=$((PASS+1)); echo "  ✅ $1 (got $3)";
  else FAIL=$((FAIL+1)); echo "  ❌ $1 — expected $2, got $3"; fi
}
TODAY=$(date +%F)
OLD=$(date -d "40 days ago" +%F)

echo "== Login =="
req POST /api/auth/login '{"username":"admin","password":"admin123"}' > /dev/null

echo "== Setup: client + inventory + 2 bills (aik purana 40 din pehle, aik aaj) =="
CL=$(req POST /api/clients '{"folder_id":1,"name":"TF Buyer","phone":"0300-9998877"}')
CL_ID=$(py "d['id']" "$CL")
INV=$(req POST /api/inventory '{"name":"TF Mug","quantity":100,"rate":500}')
INV_ID=$(py "d['id']" "$INV")
req POST /api/inventory/movements "{\"inventory_id\":$INV_ID,\"type\":\"sale\",\"customer_name\":\"TF Buyer\",\"quantity\":5,\"entry_date\":\"$OLD\",\"notes\":\"purani manual sale\"}" > /dev/null
B1=$(req POST /api/bills "{\"bill_no\":9301,\"client_id\":$CL_ID,\"customer_name\":\"TF Buyer\",\"bill_date\":\"$OLD\",\"paid\":1000,\"items\":[{\"product_id\":$INV_ID,\"product_name\":\"TF Mug\",\"quantity\":10,\"rate\":500}]}")
B2=$(req POST /api/bills "{\"bill_no\":9302,\"client_id\":$CL_ID,\"customer_name\":\"TF Buyer\",\"bill_date\":\"$TODAY\",\"paid\":500,\"items\":[{\"product_id\":$INV_ID,\"product_name\":\"TF Mug\",\"quantity\":4,\"rate\":500}]}")

echo "== R1: Customer report — ALL TIME =="
R=$(req GET "/api/reports/customers")
V=$(py "[x for x in d['customers'] if x['customer_name']=='TF Buyer'][0]['total_amount']" "$R"); check "TF Buyer kul khareed = 7000 (10x500 + 4x500)" 7000 "$V"
V=$(py "[x for x in d['customers'] if x['customer_name']=='TF Buyer'][0]['total_qty']" "$R"); check "kul qty (bills) = 14" 14 "$V"
V=$(py "[x for x in d['customers'] if x['customer_name']=='TF Buyer'][0]['due']" "$R"); check "due = 7000 - 1500 = 5500" 5500 "$V"
V=$(py "[x for x in d['items'] if x['product_name']=='TF Mug'][0]['bills']" "$R"); check "TF Mug 2 bills me gaya" 2 "$V"
echo "== R1b: Customer report — sirf AAJ ka filter =="
R=$(req GET "/api/reports/customers?from=$TODAY&to=$TODAY")
V=$(py "[x for x in d['customers'] if x['customer_name']=='TF Buyer'][0]['total_amount']" "$R"); check "aaj ki sale = 2000" 2000 "$V"
V=$(py "[x for x in d['customers'] if x['customer_name']=='TF Buyer'][0]['total_qty']" "$R"); check "aaj ki qty = 4" 4 "$V"

echo "== R2: Employee report =="
RAW=$(req POST /api/raw-materials '{"name":"TF Wire","unit":"pcs","quantity":500,"rate":2}')
COMP=$(req POST /api/components "{\"name\":\"TF Coil\",\"default_rate\":6,\"ingredients\":[{\"raw_material_id\":$(py "d['id']" "$RAW"),\"quantity_required\":1}]}")
COMP_ID=$(py "d['id']" "$COMP")
EMP=$(req POST /api/employees '{"name":"TF Maker","salary_type":"per_piece","items":[{"item_name":"TF Coil","rate":6}]}')
EMP_ID=$(py "d['id']" "$EMP")
req POST /api/production "{\"employee_id\":$EMP_ID,\"component_id\":$COMP_ID,\"quantity\":30,\"rate\":6,\"scrap_qty\":5,\"deduct_raw\":true,\"entry_date\":\"$TODAY\"}" > /dev/null
req POST /api/production "{\"employee_id\":$EMP_ID,\"component_id\":$COMP_ID,\"quantity\":10,\"rate\":6,\"scrap_qty\":0,\"deduct_raw\":true,\"entry_date\":\"$OLD\"}" > /dev/null
R=$(req GET "/api/reports/employees")
V=$(py "[x for x in d['employees'] if x['employee_name']=='TF Maker'][0]['good_pieces']" "$R"); check "good pieces = 25 + 10 = 35" 35 "$V"
V=$(py "[x for x in d['employees'] if x['employee_name']=='TF Maker'][0]['payout']" "$R"); check "payout = 25x6 + 10x6 = 210" 210 "$V"
V=$(py "[x for x in d['employees'] if x['employee_name']=='TF Maker'][0]['scrap']" "$R"); check "scrap = 5" 5 "$V"
R=$(req GET "/api/reports/employees?from=$TODAY&to=$TODAY")
V=$(py "[x for x in d['employees'] if x['employee_name']=='TF Maker'][0]['good_pieces']" "$R"); check "aaj ke good pieces = 25 (purani entry filter bahar)" 25 "$V"

echo "== R3: Supplier report =="
SUP=$(req POST /api/clients '{"folder_id":2,"name":"TF Supplier","phone":"0300-5554433"}')
SUP_ID=$(py "d['id']" "$SUP")
req POST /api/raw-materials "{\"name\":\"TF Bolt\",\"unit\":\"pcs\",\"quantity\":100,\"rate\":10,\"supplier_id\":$SUP_ID,\"supplier_name\":\"TF Supplier\",\"supplier_whatsapp\":\"0300-5554433\",\"paid_amount\":400,\"entry_date\":\"$TODAY\"}" > /dev/null
R=$(req GET "/api/reports/suppliers")
V=$(py "[x for x in d['suppliers'] if x['supplier_name']=='TF Supplier'][0]['total_amount']" "$R"); check "supplier kul khareed = 1000" 1000 "$V"
V=$(py "[x for x in d['suppliers'] if x['supplier_name']=='TF Supplier'][0]['remaining']" "$R"); check "remaining = 600" 600 "$V"
R=$(req GET "/api/reports/suppliers?from=$OLD&to=$OLD")
V=$(py "len([x for x in d['suppliers'] if x['supplier_name']=='TF Supplier'])" "$R"); check "purani date par supplier report khaali (filter kaam karta hai)" 0 "$V"

echo "== R4: Stock report (inventory) — aaj ka din =="
# TF Mug: kal tak 100 - 5 (purani manual sale) - 10 (purana bill) = 85 opening
# aaj: bill 9302 sale 4 -> out 4, closing 81
R=$(req GET "/api/reports/stock?section=inventory&from=$TODAY&to=$TODAY")
V=$(py "[x for x in d['items'] if x['name']=='TF Mug'][0]['opening']" "$R"); check "opening (aaj shuru) = 85" 85 "$V"
V=$(py "[x for x in d['items'] if x['name']=='TF Mug'][0]['out_qty']" "$R"); check "aaj out = 4 (bill sale)" 4 "$V"
V=$(py "[x for x in d['items'] if x['name']=='TF Mug'][0]['closing']" "$R"); check "closing = 81" 81 "$V"
echo "== R4b: Stock report — purana din (legacy bill bhi ginna chahiye) =="
R=$(req GET "/api/reports/stock?section=inventory&from=$OLD&to=$OLD")
V=$(py "[x for x in d['items'] if x['name']=='TF Mug'][0]['opening']" "$R"); check "purane din opening = 100" 100 "$V"
V=$(py "[x for x in d['items'] if x['name']=='TF Mug'][0]['out_qty']" "$R"); check "purane din out = 5 manual + 10 bill = 15" 15 "$V"
V=$(py "[x for x in d['items'] if x['name']=='TF Mug'][0]['closing']" "$R"); check "purane din closing = 85" 85 "$V"

echo "== R4c: Stock report (raw) — TF Wire =="
# 500 aaya, production me 30 + 10 use -> closing 460; aaj: in 0, out 30
R=$(req GET "/api/reports/stock?section=raw&from=$TODAY&to=$TODAY")
V=$(py "[x for x in d['items'] if x['name']=='TF Wire'][0]['out_qty']" "$R"); check "aaj raw out (production use) = 30" 30 "$V"
V=$(py "[x for x in d['items'] if x['name']=='TF Wire'][0]['closing']" "$R"); check "raw closing = 460" 460 "$V"

echo ""
echo "================================"
echo "PASS: $PASS   FAIL: $FAIL"
echo "================================"
rm -f "$JAR"
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
