#!/bin/bash
# =====================================================================
# Two Star CRM — Regression tests #2
#   FIX A: Bill stock kabhi minus na hona (naam se match, warnings, atomic)
#   FIX B: Raw material stock — production use ke baad restock par purana
#          use hua stock wapas NAHI aana chahiye (delta-based recompute)
#   FIX C: KG -> Pieces conversion (save + restock pieces me)
#   FIX D: Dashboard topPending = NET due + phone (WhatsApp reminders)
# Run against a local dev server. Usage: bash tests/regression2.sh [BASE_URL]
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
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ✅ $1 (got $3)";
  else FAIL=$((FAIL+1)); echo "  ❌ $1 — expected [$2], got [$3]"; fi
}
invqty() { # name -> quantity
  local Q=$(req GET /api/inventory)
  python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in (d.get('items') or []) if x['name']==\"$1\"];print(k[0]['quantity'] if k else 'NONE')" <<< "$Q"
}
rawqty() { # id -> quantity
  local Q=$(req GET /api/raw-materials)
  python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in (d.get('items') or []) if x['id']==$1];print(k[0]['quantity'] if k else 'NONE')" <<< "$Q"
}

echo "== Login =="
req POST /api/auth/login '{"username":"admin","password":"admin123"}' > /dev/null

echo "== FIX A1: Bill item sirf NAAM se (galat case + extra spaces) — stock minus HONA chahiye =="
INV=$(req POST /api/inventory '{"name":"TA Rack","quantity":100,"rate":500,"manufacturing_cost":100}')
# Naam chhote haroof + aaghaz/akhir spaces ke saath bhejo, product_id NA bhejo (purana bug yahi tha)
BILL=$(req POST /api/bills '{"bill_no":"91001","total":1000,"paid":0,"items":[{"product_name":"  ta rack  ","quantity":4,"rate":250,"total":1000}]}')
WARN=$(py "len(d.get('stock_warnings') or [])" "$BILL")
check "warnings khaali (naam match ho gaya)" 0 "$WARN"
Q=$(invqty "TA Rack"); check "stock 100-4=96" 96 "$Q"
BILL_ID=$(py "d['id']" "$BILL")
# Bill-linked movement maujood honi chahiye aur use manually delete NAHI kar sakna chahiye
INV_ID=$(req GET /api/inventory | python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in (d.get('items') or []) if x['name']=='TA Rack'];print(k[0]['id'])")
MOVS=$(req GET "/api/inventory/movements?inventory_id=$INV_ID&limit=500")
MOV_ID=$(python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in d.get('movements',[]) if x.get('bill_id')==$BILL_ID];print(k[0]['id'] if k else 'NONE')" <<< "$MOVS")
if [ "$MOV_ID" != "NONE" ] && [ -n "$MOV_ID" ]; then PASS=$((PASS+1)); echo "  ✅ bill-linked sale movement bani (#$MOV_ID)"; else FAIL=$((FAIL+1)); echo "  ❌ bill-linked movement NAHI bani"; fi
DEL=$(req DELETE "/api/inventory/movements/$MOV_ID")
ERR=$(py "1 if d.get('error') else 0" "$DEL")
check "bill-linked movement manually delete blocked" 1 "$ERR"
Q=$(invqty "TA Rack"); check "blocked delete ke baad stock phir bhi 96" 96 "$Q"
req DELETE "/api/bills/$BILL_ID" > /dev/null
Q=$(invqty "TA Rack"); check "bill delete -> stock wapas 100" 100 "$Q"

echo "== FIX A2: Bilkul unmatched naam — bill bane lekin WARNING aaye, stock na kate =="
BILL2=$(req POST /api/bills '{"bill_no":"91002","total":500,"paid":0,"items":[{"product_name":"Ghost Product XYZ","quantity":2,"rate":250,"total":500}]}')
WARN2=$(py "len(d.get('stock_warnings') or [])" "$BILL2")
check "1 warning aayi" 1 "$WARN2"
req DELETE "/api/bills/$(py "d['id']" "$BILL2")" > /dev/null

echo "== FIX A3: Bill EDIT round trip (naam wali items) =="
BILL3=$(req POST /api/bills '{"bill_no":"91003","total":500,"paid":0,"items":[{"product_name":"TA Rack","quantity":2,"rate":250,"total":500}]}')
B3=$(py "d['id']" "$BILL3")
Q=$(invqty "TA Rack"); check "create 2 -> 98" 98 "$Q"
req PUT "/api/bills/$B3" '{"bill_no":"91003","total":1250,"paid":0,"items":[{"product_name":"TA Rack","quantity":5,"rate":250,"total":1250}]}' > /dev/null
Q=$(invqty "TA Rack"); check "edit 2->5 -> 95" 95 "$Q"
req DELETE "/api/bills/$B3" > /dev/null
Q=$(invqty "TA Rack"); check "delete -> wapas 100" 100 "$Q"

echo "== FIX B: Raw material — production use ke baad restock purana stock wapas NA laye =="
RAW=$(req POST /api/raw-materials '{"name":"TB Wire","unit":"pcs","quantity":100,"rate":2}')
RAW_ID=$(py "d['id']" "$RAW")
COMP=$(req POST /api/components '{"name":"TB Ring","default_rate":5,"ingredients":[{"raw_material_id":'$RAW_ID',"quantity_required":1}]}')
COMP_ID=$(py "d['id']" "$COMP")
EMP=$(req POST /api/employees '{"name":"TB Worker","salary_type":"per_piece"}')
EMP_ID=$(py "d['id']" "$EMP")
req POST /api/production "{\"employee_id\":$EMP_ID,\"component_id\":$COMP_ID,\"quantity\":30,\"rate\":5,\"deduct_raw\":true}" > /dev/null
Q=$(rawqty $RAW_ID); check "production use 30 -> raw stock 70" 70 "$Q"
req POST "/api/raw-materials/$RAW_ID/restock" '{"quantity":50,"rate":2}' > /dev/null
Q=$(rawqty $RAW_ID); check "restock +50 -> 120 (purana bug: 150)" 120 "$Q"
# Purchase edit delta: pehli purchase 100 thi, use 80 kar do -> stock 20 kam hona chahiye
PUR=$(req GET "/api/raw-materials/$RAW_ID")
PID=$(py "sorted(d['purchases'], key=lambda x: x['id'])[0]['id']" "$PUR")
req PUT "/api/raw-material-purchases/$PID" '{"quantity":80,"rate":2,"paid_amount":0}' > /dev/null
Q=$(rawqty $RAW_ID); check "purchase edit 100->80 -> stock 100" 100 "$Q"
req DELETE "/api/raw-material-purchases/$PID" > /dev/null
Q=$(rawqty $RAW_ID); check "purchase delete -> stock 20 (sirf restock 50 - use 30)" 20 "$Q"
# Stock correction exact set kare
req POST "/api/raw-materials/$RAW_ID/stock-correction" '{"new_quantity":44,"reason":"test count"}' > /dev/null
Q=$(rawqty $RAW_ID); check "stock correction -> bilkul 44" 44 "$Q"

echo "== FIX C: KG -> Pieces conversion =="
KG=$(req POST /api/raw-materials '{"name":"TC Screw","unit":"pcs","quantity":2500,"rate":2,"purchase_unit":"kg","pieces_per_purchase_unit":250,"input_quantity":10,"input_unit":"kg","input_rate":500}')
KG_ID=$(py "d['id']" "$KG")
ITEM=$(req GET "/api/raw-materials/$KG_ID")
PPU=$(py "d['item']['pieces_per_purchase_unit']" "$ITEM")
check "pieces_per_purchase_unit save = 250" 250 "$PPU"
PU=$(py "d['item']['purchase_unit']" "$ITEM")
checkstr "purchase_unit save = kg" "kg" "$PU"
Q=$(rawqty $KG_ID); check "stock pieces me = 2500 (10kg x 250)" 2500 "$Q"
req POST "/api/raw-materials/$KG_ID/restock" '{"quantity":1250,"rate":2,"input_quantity":5,"input_unit":"kg","input_rate":500}' > /dev/null
Q=$(rawqty $KG_ID); check "restock 5kg -> +1250 pcs = 3750" 3750 "$Q"
PUR2=$(req GET "/api/raw-materials/$KG_ID")
INQ=$(py "[p for p in d['purchases'] if p.get('input_quantity')==5][0]['input_quantity']" "$PUR2")
check "purchase par asal input 5 (kg) record hai" 5 "$INQ"
# Conversion setting PUT se badal sakna
req PUT "/api/raw-materials/$KG_ID" '{"name":"TC Screw","unit":"pcs","category":"","notes":"","purchase_unit":"kg","pieces_per_purchase_unit":200}' > /dev/null
ITEM2=$(req GET "/api/raw-materials/$KG_ID")
PPU2=$(py "d['item']['pieces_per_purchase_unit']" "$ITEM2")
check "conversion update = 200" 200 "$PPU2"

echo "== FIX D: Dashboard topPending (WhatsApp reminders) =="
CL=$(req POST /api/clients '{"folder_id":1,"name":"TD Customer","phone":"0300-1112223","opening_balance":5000}')
DASH=$(req GET /api/dashboard)
ROW=$(python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in d.get('topPending',[]) if x['name']=='TD Customer'];print(k[0]['net_due'] if k else 'NONE')" <<< "$DASH")
check "topPending me NET due 5000" 5000 "$ROW"
PH=$(python3 -c "import json,sys;d=json.load(sys.stdin);k=[x for x in d.get('topPending',[]) if x['name']=='TD Customer'];print(k[0].get('phone') or 'NONE')" <<< "$DASH")
checkstr "topPending me phone maujood" "0300-1112223" "$PH"

echo ""
echo "================================"
echo "PASS: $PASS   FAIL: $FAIL"
echo "================================"
rm -f "$JAR"
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
