#!/bin/bash
# =====================================================================
# Two Star CRM — Regression tests #3 (Production + Salary fixes)
#   FIX P1: Component stock me sirf GOOD pieces (qty - scrap); scrap par
#           alag raw double-deduction NAHI
#   FIX P2: Production EDIT par raw usage bhi scale hota hai (pehle raw
#           kabhi update nahi hota tha — hisaab bigarta tha)
#   FIX P3: Rate 0 bhejne par bhi worker ka saved rate lagta hai — salary
#           entry banti hai (pehle payout 0 -> salary ghayab)
#   FIX P4: Assemble usage SNAPSHOT — recipe badal jane ke baad bhi
#           edit/delete ka reversal asal consumption se hota hai
# Usage: bash tests/regression3.sh [BASE_URL]
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
compqty() { req GET /api/components | python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in d.get('components',[]) if x['name']==\"$1\"];print(k[0]['quantity'] if k else 'NONE')"; }
rawqty() { req GET /api/raw-materials | python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in d.get('items',[]) if x['name']==\"$1\"];print(k[0]['quantity'] if k else 'NONE')"; }
empsalary() { # emp id -> total salary amount
  req GET "/api/employees/$1" | python3 -c "import json,sys;d=json.load(sys.stdin);print(sum((t['amount'] or 0) for t in d.get('transactions',[]) if t['type']=='salary'))"
}
empweekly_pieces() { req GET "/api/production/weekly?employee_id=$1&weeks=52" | python3 -c "import json,sys;d=json.load(sys.stdin);print(sum((w['total_pieces'] or 0) for w in d.get('weeks',[])))"; }

echo "== Login =="
req POST /api/auth/login '{"username":"admin","password":"admin123"}' > /dev/null

echo "== Setup: raw 200 (recipe 2/pc), per-piece worker (saved rate 8) =="
RAW=$(req POST /api/raw-materials '{"name":"TE Steel","unit":"pcs","quantity":200,"rate":3}')
COMP=$(req POST /api/components '{"name":"TE Bracket","default_rate":5,"ingredients":[{"raw_material_id":'$(py "d['id']" "$RAW")',"quantity_required":2}]}')
COMP_ID=$(py "d['id']" "$COMP")
EMP=$(req POST /api/employees '{"name":"TE Worker","salary_type":"per_piece","items":[{"item_name":"TE Bracket","rate":8}]}')
EMP_ID=$(py "d['id']" "$EMP")

echo "== P1+P3: Log 50 pcs, scrap 10, rate 0 bhejo (frontend jaisa) — worker rate 8 lagna chahiye =="
LOG=$(req POST /api/production "{\"employee_id\":$EMP_ID,\"component_id\":$COMP_ID,\"quantity\":50,\"rate\":0,\"scrap_qty\":10,\"deduct_raw\":true}")
PAY=$(py "d['payout']" "$LOG"); check "payout = (50-10) x 8 = 320 (rate 0 par bhi salary bani)" 320 "$PAY"
Q=$(compqty "TE Bracket"); check "component stock = GOOD pieces 40 (scrap stock me nahi)" 40 "$Q"
Q=$(rawqty "TE Steel"); check "raw = 200 - 2x50 = 100 (scrap par double deduction NAHI)" 100 "$Q"
SAL=$(empsalary $EMP_ID); check "employee salary total = 320 (foran update)" 320 "$SAL"
WK=$(empweekly_pieces $EMP_ID); check "weekly pieces = 40 good pcs" 40 "$WK"
LOG_ID=$(py "d['id']" "$LOG")

echo "== P2: EDIT qty 50 -> 60 (scrap 10) — raw bhi scale hona chahiye =="
req PUT "/api/production/$LOG_ID" '{"quantity":60,"rate":8,"scrap_qty":10}' > /dev/null
Q=$(rawqty "TE Steel"); check "raw = 200 - 2x60 = 80 (pehle bug: 100 hi rehta tha)" 80 "$Q"
Q=$(compqty "TE Bracket"); check "component stock = 50 good pcs" 50 "$Q"
SAL=$(empsalary $EMP_ID); check "salary = 50 x 8 = 400" 400 "$SAL"

echo "== P2b: EDIT scrap 10 -> 20 (qty 60) — stock/payout ghate, raw na badle =="
req PUT "/api/production/$LOG_ID" '{"quantity":60,"rate":8,"scrap_qty":20}' > /dev/null
Q=$(compqty "TE Bracket"); check "component stock = 40 good pcs" 40 "$Q"
Q=$(rawqty "TE Steel"); check "raw wahi 80" 80 "$Q"
SAL=$(empsalary $EMP_ID); check "salary = 40 x 8 = 320" 320 "$SAL"

echo "== P1b: DELETE — sab kuch asal halat par wapas =="
req DELETE "/api/production/$LOG_ID" > /dev/null
Q=$(rawqty "TE Steel"); check "raw wapas 200" 200 "$Q"
Q=$(compqty "TE Bracket"); check "component stock wapas 0" 0 "$Q"
SAL=$(empsalary $EMP_ID); check "salary wapas 0" 0 "$SAL"

echo "== P4: Assemble SNAPSHOT — recipe badal jaye to bhi reversal sahi =="
PROD=$(req POST /api/products "{\"name\":\"TE Rack\",\"assemble_rate\":10,\"components\":[{\"component_id\":$COMP_ID,\"quantity_required\":2}]}")
PROD_ID=$(py "d['id']" "$PROD")
# pehle component stock 100 banao (bina worker, bina raw recipe asar ke liye naya component use karte hain — TE Bracket ka apna stock)
req POST /api/inventory/movements '{}' > /dev/null # noop
# Component stock seedha barhao: ek aur component bana kar usi ko use karte hain taake hisaab saaf rahe
COMP2=$(req POST /api/components '{"name":"TE Leg","default_rate":5}')
COMP2_ID=$(py "d['id']" "$COMP2")
EMP2=$(req POST /api/employees '{"name":"TE Helper","salary_type":"per_piece","items":[{"item_name":"TE Leg","rate":1}]}')
EMP2_ID=$(py "d['id']" "$EMP2")
req POST /api/production "{\"employee_id\":$EMP2_ID,\"component_id\":$COMP2_ID,\"quantity\":100,\"rate\":1,\"deduct_raw\":false}" > /dev/null
Q=$(compqty "TE Leg"); check "TE Leg stock = 100" 100 "$Q"
PROD2=$(req POST /api/products "{\"name\":\"TE Table\",\"assemble_rate\":10,\"components\":[{\"component_id\":$COMP2_ID,\"quantity_required\":2}]}")
PROD2_ID=$(py "d['id']" "$PROD2")
ALOG=$(req POST /api/product-production "{\"stage\":\"assemble\",\"product_id\":$PROD2_ID,\"quantity\":10,\"rate\":10,\"deduct\":true}")
Q=$(compqty "TE Leg"); check "assemble 10 x 2 = 20 use -> stock 80" 80 "$Q"
ALOG_ID=$(py "d['id']" "$ALOG")
# AB RECIPE BADAL DO: 2 ki jagah 5 per pc
req PUT "/api/products/$PROD2_ID" "{\"name\":\"TE Table\",\"components\":[{\"component_id\":$COMP2_ID,\"quantity_required\":5}]}" > /dev/null
req DELETE "/api/product-production/$ALOG_ID" > /dev/null
Q=$(compqty "TE Leg"); check "delete par SNAPSHOT se +20 wapas -> 100 (recipe 5 hoti to 130 ghalat hota)" 100 "$Q"
# Edit path: dobara assemble 10, recipe phir badlo, qty edit 10->20
ALOG2=$(req POST /api/product-production "{\"stage\":\"assemble\",\"product_id\":$PROD2_ID,\"quantity\":10,\"rate\":10,\"deduct\":true}")
ALOG2_ID=$(py "d['id']" "$ALOG2")
Q=$(compqty "TE Leg"); check "assemble 10 x 5 (nayi recipe) -> stock 50" 50 "$Q"
req PUT "/api/products/$PROD2_ID" "{\"name\":\"TE Table\",\"components\":[{\"component_id\":$COMP2_ID,\"quantity_required\":9}]}" > /dev/null
req PUT "/api/product-production/$ALOG2_ID" '{"quantity":20,"rate":10}' > /dev/null
Q=$(compqty "TE Leg"); check "edit 10->20 snapshot scale: extra 10 x 5 = 50 -> stock 0 (recipe 9 hoti to negative ghalat)" 0 "$Q"
req DELETE "/api/product-production/$ALOG2_ID" > /dev/null
Q=$(compqty "TE Leg"); check "delete -> snapshot 20 x 5 = 100 wapas -> 100" 100 "$Q"

echo ""
echo "================================"
echo "PASS: $PASS   FAIL: $FAIL"
echo "================================"
rm -f "$JAR"
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
