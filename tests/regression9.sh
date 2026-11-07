#!/bin/bash
# =====================================================================
# Two Star CRM — Regression tests #9 (Bulk Entry — dono production modules)
#   Bulk Entry peeche se wahi single POSTs hain jo single-entry form
#   bhejta hai. Ye suite bulk sequence (aik worker + aik date par kai
#   rows, beech me aik fail wali row) ko verify karta hai:
#   - Components: stock (good pieces), raw deduction, salary — fail
#     wali row ke BAAD wali row bhi save hoti hai
#   - Products: assemble/paint/pack stage flow, fail wali paint row
#     (stock se zyada) error deti hai, agli rows chalti hain
# Usage: bash tests/regression9.sh [BASE_URL]
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
checkstr() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ✅ $1";
  else FAIL=$((FAIL+1)); echo "  ❌ $1 — expected [$2], got [$3]"; fi
}
compqty() { req GET /api/components | python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in d.get('components',[]) if x['name']==\"$1\"];print(k[0]['quantity'] if k else 'NONE')"; }
rawqty() { req GET /api/raw-materials | python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in d.get('items',[]) if x['name']==\"$1\"];print(k[0]['quantity'] if k else 'NONE')"; }
prodfield() { req GET /api/products | python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in d.get('products',[]) if x['name']==\"BK Chair\"];print(k[0]['$1'] if k else 'NONE')"; }
empsalary() { req GET "/api/employees/$1" | python3 -c "import json,sys;d=json.load(sys.stdin);print(sum((t['amount'] or 0) for t in d.get('transactions',[]) if t['type']=='salary'))"; }

echo "== Login =="
req POST /api/auth/login '{"username":"admin","password":"admin123"}' > /dev/null

echo "== Setup: raw, 2 components, product, worker (worker rates: Frame 7, 'BK Chair Assemble' 11) =="
RAW=$(req POST /api/raw-materials '{"name":"BK Steel","unit":"pcs","quantity":1000,"rate":2}')
RAW_ID=$(py "d['id']" "$RAW")
COMP=$(req POST /api/components "{\"name\":\"BK Frame\",\"default_rate\":5,\"ingredients\":[{\"raw_material_id\":$RAW_ID,\"quantity_required\":1}]}")
FRAME_ID=$(py "d['id']" "$COMP")
COMP2=$(req POST /api/components '{"name":"BK Leg","default_rate":3}')
LEG_ID=$(py "d['id']" "$COMP2")
PROD=$(req POST /api/products "{\"name\":\"BK Chair\",\"assemble_rate\":9,\"paint_rate\":4,\"pack_rate\":3,\"components\":[{\"component_id\":$FRAME_ID,\"quantity_required\":1}]}")
PROD_ID=$(py "d['id']" "$PROD")
EMP=$(req POST /api/employees '{"name":"BK Worker","salary_type":"per_piece","items":[{"item_name":"BK Frame","rate":7},{"item_name":"BK Chair Assemble","rate":11}]}')
EMP_ID=$(py "d['id']" "$EMP")
D='"entry_date":"2026-11-07"'

echo "== Bulk COMPONENTS: 3 valid rows + beech me 1 invalid (worker + date same) =="
R1=$(req POST /api/production "{$D,\"employee_id\":$EMP_ID,\"component_id\":$FRAME_ID,\"quantity\":100,\"rate\":7,\"scrap_qty\":10,\"deduct_raw\":true,\"notes\":\"\"}")
check "row1 payout = (100-10) x 7 = 630" 630 "$(py "d.get('payout',-1)" "$R1")"
R2=$(req POST /api/production "{$D,\"employee_id\":$EMP_ID,\"component_id\":$LEG_ID,\"quantity\":40,\"rate\":3,\"scrap_qty\":0,\"deduct_raw\":true,\"notes\":\"\"}")
check "row2 payout = 40 x 3 = 120" 120 "$(py "d.get('payout',-1)" "$R2")"
RBAD=$(req POST /api/production "{$D,\"employee_id\":$EMP_ID,\"component_id\":999999,\"quantity\":10,\"rate\":3,\"scrap_qty\":0,\"deduct_raw\":true,\"notes\":\"\"}")
checkstr "invalid component row -> error" "True" "$(py "bool(d.get('error'))" "$RBAD")"
R3=$(req POST /api/production "{$D,\"employee_id\":$EMP_ID,\"component_id\":$FRAME_ID,\"quantity\":10,\"rate\":7,\"scrap_qty\":0,\"deduct_raw\":true,\"notes\":\"\"}")
check "fail ke BAAD wali row bhi save (payout 70)" 70 "$(py "d.get('payout',-1)" "$R3")"
check "Frame stock = 90 + 10 = 100 good pcs" 100 "$(compqty "BK Frame")"
check "Leg stock = 40" 40 "$(compqty "BK Leg")"
check "raw = 1000 - 100 - 10 = 890" 890 "$(rawqty "BK Steel")"
check "salary total = 630 + 120 + 70 = 820" 820 "$(empsalary $EMP_ID)"

echo "== Bulk PRODUCTS: assemble ok -> paint zyada (error) -> paint ok -> pack ok =="
A1=$(req POST /api/product-production "{$D,\"stage\":\"assemble\",\"employee_id\":$EMP_ID,\"product_id\":$PROD_ID,\"quantity\":30,\"rate\":11,\"deduct\":true,\"notes\":\"\",\"generate_barcodes\":false}")
check "assemble payout = 30 x 11 = 330" 330 "$(py "d.get('payout',-1)" "$A1")"
PBAD=$(req POST /api/product-production "{$D,\"stage\":\"paint\",\"employee_id\":$EMP_ID,\"product_id\":$PROD_ID,\"quantity\":999,\"rate\":4,\"deduct\":true,\"notes\":\"\",\"generate_barcodes\":false}")
checkstr "paint 999 (assembled sirf 30) -> error" "True" "$(py "bool(d.get('error'))" "$PBAD")"
P1=$(req POST /api/product-production "{$D,\"stage\":\"paint\",\"employee_id\":$EMP_ID,\"product_id\":$PROD_ID,\"quantity\":20,\"rate\":4,\"deduct\":true,\"notes\":\"\",\"generate_barcodes\":false}")
check "paint payout = 20 x 4 = 80 (error ke baad bhi chali)" 80 "$(py "d.get('payout',-1)" "$P1")"
K1=$(req POST /api/product-production "{$D,\"stage\":\"pack\",\"employee_id\":$EMP_ID,\"product_id\":$PROD_ID,\"quantity\":8,\"rate\":3,\"deduct\":true,\"notes\":\"\",\"generate_barcodes\":false}")
check "pack payout = 8 x 3 = 24" 24 "$(py "d.get('payout',-1)" "$K1")"
check "assembled = 30 - 20 = 10" 10 "$(prodfield assembled_qty)"
check "painted = 20 - 8 = 12" 12 "$(prodfield painted_qty)"
check "packed = 8" 8 "$(prodfield packed_qty)"
check "Frame stock = 100 - 30 (assemble) = 70" 70 "$(compqty "BK Frame")"
check "salary total = 820 + 330 + 80 + 24 = 1254" 1254 "$(empsalary $EMP_ID)"

echo ""
echo "======================================"
echo "PASS: $PASS   FAIL: $FAIL"
[ "$FAIL" = "0" ]
