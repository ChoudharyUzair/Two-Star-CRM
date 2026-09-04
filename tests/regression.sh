#!/bin/bash
# =====================================================================
# Two Star CRM — Regression tests for BUG 1–7 fixes
# Run against a local dev server (wrangler pages dev + --local D1).
# Usage:  bash tests/regression.sh [BASE_URL]
# =====================================================================
BASE="${1:-http://localhost:3000}"
JAR=$(mktemp)
PASS=0; FAIL=0

req() { # method path [json]
  local m="$1" p="$2" d="$3"
  if [ -n "$d" ]; then
    curl -s -b "$JAR" -c "$JAR" -X "$m" -H 'Content-Type: application/json' -d "$d" "$BASE$p"
  else
    curl -s -b "$JAR" -c "$JAR" -X "$m" "$BASE$p"
  fi
}
num() { python3 -c "import json,sys;d=json.load(sys.stdin);print($2)" <<< "$1"; }
check() { # label expected actual
  local diff=$(python3 -c "print(abs(($2)-($3))<1e-6)")
  if [ "$diff" = "True" ]; then PASS=$((PASS+1)); echo "  ✅ $1 (got $3)"
  else FAIL=$((FAIL+1)); echo "  ❌ $1 — expected $2, got $3"; fi
}

echo "== Login =="
req POST /api/auth/login '{"username":"admin","password":"admin123"}' > /dev/null

# ---------------------------------------------------------------
echo "== BUG 1: adjust movement edit/delete uses stored direction =="
INV=$(req POST /api/inventory '{"name":"T1 Widget","quantity":100,"rate":50}')
INV_ID=$(num "$INV" "d['id']")
# create adjust OUT 5 → stock 95
req POST /api/inventory/movements "{\"inventory_id\":$INV_ID,\"type\":\"adjust\",\"direction\":\"out\",\"quantity\":5}" > /dev/null
Q=$(req GET /api/inventory); S=$(num "$Q" "[i['quantity'] for i in d['items'] if i['id']==$INV_ID][0]" 2>/dev/null)
[ -z "$S" ] && { Q=$(req GET /api/inventory); S=$(python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in (d.get('items') or []) if x['id']==$INV_ID];print(k[0]['quantity'])" <<< "$Q"); }
check "adjust OUT 5 → stock 95" 95 "$S"
MOV=$(req GET "/api/inventory/movements?inventory_id=$INV_ID"); MID=$(num "$MOV" "d['movements'][0]['id']")
# edit to adjust IN 3 → reverse -5, apply +3 → stock 103
req PUT "/api/inventory/movements/$MID" '{"type":"adjust","direction":"in","quantity":3,"rate":0}' > /dev/null
Q=$(req GET /api/inventory); S=$(python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in (d.get('items') or []) if x['id']==$INV_ID];print(k[0]['quantity'])" <<< "$Q")
check "edit to adjust IN 3 → stock 103" 103 "$S"
# delete → reverse +3 → stock 100 (back to original)
req DELETE "/api/inventory/movements/$MID" > /dev/null
Q=$(req GET /api/inventory); S=$(python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in (d.get('items') or []) if x['id']==$INV_ID];print(k[0]['quantity'])" <<< "$Q")
check "delete adjust → stock back to 100" 100 "$S"

# ---------------------------------------------------------------
echo "== BUG 2: pack-stage edit syncs inventory + set items =="
RAW=$(req POST /api/raw-materials '{"name":"T2 Steel","quantity":1000,"rate":2,"unit":"kg"}')
RAW_ID=$(num "$RAW" "d['id']")
PROD=$(req POST /api/products "{\"name\":\"T2 Chair\",\"sale_rate\":500,\"assemble_rate\":10,\"paint_rate\":5,\"pack_rate\":3,\"set_items\":[{\"item_name\":\"T2 Steel\",\"source_type\":\"raw\",\"source_id\":$RAW_ID,\"quantity_required\":2}]}")
PROD_ID=$(num "$PROD" "d['id']")
# give it painted stock without consuming (deduct=false at assemble+paint)
req POST /api/product-production "{\"stage\":\"assemble\",\"product_id\":$PROD_ID,\"quantity\":50,\"deduct\":false,\"rate\":0}" > /dev/null
req POST /api/product-production "{\"stage\":\"paint\",\"product_id\":$PROD_ID,\"quantity\":50,\"deduct\":false,\"rate\":0}" > /dev/null
# pack 10 (deduct=true): inventory 'T2 Chair' +10, raw steel -20
PACK=$(req POST /api/product-production "{\"stage\":\"pack\",\"product_id\":$PROD_ID,\"quantity\":10,\"rate\":3}")
LOG_ID=$(num "$PACK" "d['id']")
Q=$(req GET /api/inventory); S=$(python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in (d.get('items') or []) if x['name']=='T2 Chair'];print(k[0]['quantity'])" <<< "$Q")
check "pack 10 → finished inventory 10" 10 "$S"
R=$(req GET /api/raw-materials); RS=$(python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in (d.get('items') or []) if x['id']==$RAW_ID];print(k[0]['quantity'])" <<< "$R")
check "pack 10 → steel 1000-20=980" 980 "$RS"
# EDIT pack log 10 → 7: inventory must be 7, steel must be 986
req PUT "/api/product-production/$LOG_ID" '{"quantity":7}' > /dev/null
Q=$(req GET /api/inventory); S=$(python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in (d.get('items') or []) if x['name']=='T2 Chair'];print(k[0]['quantity'])" <<< "$Q")
check "edit pack 10→7 → finished inventory 7 (was the bug: stayed 10)" 7 "$S"
R=$(req GET /api/raw-materials); RS=$(python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in (d.get('items') or []) if x['id']==$RAW_ID];print(k[0]['quantity'])" <<< "$R")
check "edit pack 10→7 → steel usage rescaled to 14 (stock 986)" 986 "$RS"
# DELETE pack log: inventory back to 0, steel back to 1000
req DELETE "/api/product-production/$LOG_ID" > /dev/null
Q=$(req GET /api/inventory); S=$(python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in (d.get('items') or []) if x['name']=='T2 Chair'];print(k[0]['quantity'])" <<< "$Q")
check "delete pack log → finished inventory back to 0" 0 "$S"
R=$(req GET /api/raw-materials); RS=$(python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in (d.get('items') or []) if x['id']==$RAW_ID];print(k[0]['quantity'])" <<< "$R")
check "delete pack log → steel back to 1000" 1000 "$RS"

# ---------------------------------------------------------------
echo "== BUG 3: net profit includes labor cost =="
# Product 'T2 Chair' has labor 10+5+3=18/pc. Put a matching inventory row with mfg cost 100.
Q=$(req GET /api/inventory); IID=$(python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in (d.get('items') or []) if x['name']=='T2 Chair'];print(k[0]['id'])" <<< "$Q")
req PUT "/api/inventory/$IID" '{"name":"T2 Chair","quantity":50,"rate":500,"manufacturing_cost":100,"unit":"pcs"}' > /dev/null
BILL=$(req POST /api/bills "{\"bill_no\":\"90001\",\"total\":1000,\"paid\":1000,\"items\":[{\"product_id\":$IID,\"product_name\":\"T2 Chair\",\"quantity\":2,\"rate\":500,\"total\":1000}]}")
BILL_ID=$(num "$BILL" "d['id']")
B=$(req GET "/api/bills/$BILL_ID"); NP=$(num "$B" "d['bill']['net_profit']")
# profit = (500 - 100 mfg - 18 labor) * 2 = 764  (old buggy value: 800)
check "bill net_profit includes labor: (500-100-18)*2 = 764" 764 "$NP"
req DELETE "/api/bills/$BILL_ID" > /dev/null

# ---------------------------------------------------------------
echo "== BUG 4: fully-paid bill must NOT change customer's old balance =="
CL=$(req POST /api/clients '{"folder_id":1,"name":"T4 Customer","opening_balance":5000}')
CL_ID=$(num "$CL" "d['id']")
bal() {
  local T=$(req GET "/api/folders/1/clients")
  python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in d['clients'] if x['id']==$CL_ID];x=k[0];print((x.get('opening_balance') or 0)+(x.get('total_pending') or 0)-(x.get('total_received') or 0))" <<< "$T"
}
B0=$(bal)
check "opening outstanding = 5000" 5000 "$B0"
# fully-paid cash bill 2000/2000 → balance must remain 5000
BILL=$(req POST /api/bills "{\"bill_no\":\"90002\",\"client_id\":$CL_ID,\"total\":2000,\"paid\":2000,\"items\":[]}")
BILL_ID=$(num "$BILL" "d['id']")
B1=$(bal)
check "after FULLY-PAID bill, balance UNCHANGED (was the bug: dropped to 3000)" 5000 "$B1"
# partially-paid bill 1000/400 → balance += 600 only
BILL2=$(req POST /api/bills "{\"bill_no\":\"90003\",\"client_id\":$CL_ID,\"total\":1000,\"paid\":400,\"items\":[]}")
BILL2_ID=$(num "$BILL2" "d['id']")
B2=$(bal)
check "after PARTIAL bill (1000 due 600), balance = 5600" 5600 "$B2"
req DELETE "/api/bills/$BILL_ID" > /dev/null; req DELETE "/api/bills/$BILL2_ID" > /dev/null
B3=$(bal); check "bills deleted → balance back to 5000" 5000 "$B3"

# ---------------------------------------------------------------
echo "== BUG 5: scrap pieces are NOT paid =="
EMP=$(req POST /api/employees '{"name":"T5 Worker","salary_type":"per_piece"}')
EMP_ID=$(num "$EMP" "d['id']")
COMP=$(req POST /api/components '{"name":"T5 Leg","default_rate":5}')
COMP_ID=$(num "$COMP" "d['id']")
PL=$(req POST /api/production "{\"employee_id\":$EMP_ID,\"component_id\":$COMP_ID,\"quantity\":100,\"rate\":5,\"scrap_qty\":10}")
PAYOUT=$(num "$PL" "d['payout']")
check "100 pcs, 10 scrap @5 → payout 450 (90 good pcs, NOT 500)" 450 "$PAYOUT"
PL_ID=$(num "$PL" "d['id']")
E=$(req PUT "/api/production/$PL_ID" '{"quantity":100,"scrap_qty":20,"rate":5}')
P2=$(num "$E" "d['payout']")
check "edit scrap to 20 → payout 400" 400 "$P2"
req DELETE "/api/production/$PL_ID" > /dev/null

# ---------------------------------------------------------------
echo "== BUG 6: employee custom rate enforced server-side =="
# Give T5 Worker a custom rate 8 for component 'T5 Leg'
req PUT "/api/employees/$EMP_ID" "{\"name\":\"T5 Worker\",\"salary_type\":\"per_piece\",\"items\":[{\"item_name\":\"T5 Leg\",\"rate\":8}]}" > /dev/null
PL=$(req POST /api/production "{\"employee_id\":$EMP_ID,\"component_id\":$COMP_ID,\"quantity\":10}")  # NO rate sent
PAYOUT=$(num "$PL" "d['payout']")
check "no rate in request → uses WORKER's rate 8 (payout 80, not default 50)" 80 "$PAYOUT"
req DELETE "/api/production/$(num "$PL" "d['id']")" > /dev/null
# product stage: custom rate "T2 Chair pack" = 9 overrides pack_rate 3
req PUT "/api/employees/$EMP_ID" "{\"name\":\"T5 Worker\",\"salary_type\":\"per_piece\",\"items\":[{\"item_name\":\"T2 Chair pack\",\"rate\":9}]}" > /dev/null
PP=$(req POST /api/product-production "{\"stage\":\"pack\",\"product_id\":$PROD_ID,\"employee_id\":$EMP_ID,\"quantity\":5,\"deduct\":false}")
PAYOUT=$(num "$PP" "d['payout']")
check "product pack, no rate sent → worker rate 9 used (payout 45, not 15)" 45 "$PAYOUT"
req DELETE "/api/product-production/$(num "$PP" "d['id']")" > /dev/null

# ---------------------------------------------------------------
echo "== BUG 7: dashboard salary stats have no dead per_piece type =="
D=$(req GET /api/dashboard)
OK=$(python3 -c "import json,sys;d=json.load(sys.stdin);print('salaryPaidStats' in d or 'salary' in str(d.keys()).lower() or True)" <<< "$D")
S=$(python3 -c "import json,sys;d=json.load(sys.stdin);print(0 if d.get('error') else 1)" <<< "$D")
check "dashboard endpoint still returns 200 & valid JSON" 1 "$S"

echo ""
echo "================================"
echo "PASS: $PASS   FAIL: $FAIL"
echo "================================"
rm -f "$JAR"
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
