#!/bin/bash
# =====================================================================
# Two Star CRM — Regression tests #7 (Weekly Payment Reminders)
#   - GET /api/reminders: default weekday Wednesday (3), cycle info, sent list
#   - POST /api/reminders/mark: customer is cycle me "sent" ho jata hai
#     (dobara mark karne par duplicate NAHI banta)
#   - Branding PUT se reminder_weekday change hota hai aur GET me reflect hota hai
#   - DELETE /api/reminders/mark/:id: undo — customer dobara pending
#   - Baghair client_id ke mark => 400
# Usage: bash tests/regression7.sh [BASE_URL]
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

echo "== Setup: baqaya wala customer =="
CID=$(req POST /api/clients '{"folder_id":1,"name":"Reminder Wala Customer","phone":"03001234567","opening_balance":7500}' | python3 -c "import json,sys;print(json.load(sys.stdin).get('client',{}).get('id') or json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -z "$CID" ]; then
  CID=$(req GET "/api/folders/1/clients" | python3 -c "import json,sys;cs=json.load(sys.stdin)['clients'];print([c['id'] for c in cs if c['name']=='Reminder Wala Customer'][0])")
fi
echo "  client id: $CID"

echo "== Checks: /api/reminders =="
R=$(req GET /api/reminders)
check "default weekday Wednesday (3)" "3" "$(py "d['weekday']" "$R")"
check "cycle_date maujood hai" "True" "$(py "bool(d.get('cycle_date'))" "$R")"
check "next_date maujood hai" "True" "$(py "bool(d.get('next_date'))" "$R")"
check "shuru me sent khaali" "0" "$(py "len([x for x in d['sent'] if x['client_id']==$CID])" "$R")"

M=$(req POST /api/reminders/mark "{\"client_id\":$CID,\"client_name\":\"Reminder Wala Customer\",\"amount\":7500}")
check "mark success" "True" "$(py "d.get('success')" "$M")"

R=$(req GET /api/reminders)
check "mark ke baad sent me hai" "1" "$(py "len([x for x in d['sent'] if x['client_id']==$CID])" "$R")"
check "sent amount snapshot" "True" "$(py "float([x for x in d['sent'] if x['client_id']==$CID][0]['amount'])==7500" "$R")"

req POST /api/reminders/mark "{\"client_id\":$CID,\"client_name\":\"Reminder Wala Customer\",\"amount\":7500}" > /dev/null
R=$(req GET /api/reminders)
check "dobara mark par duplicate nahi" "1" "$(py "len([x for x in d['sent'] if x['client_id']==$CID])" "$R")"

req PUT /api/branding '{"company_name":"Two Star Industries","crm_name":"Two Star Essentials","reminder_weekday":5}' > /dev/null
R=$(req GET /api/reminders)
check "weekday change (Friday=5) reflect" "5" "$(py "d['weekday']" "$R")"
req PUT /api/branding '{"company_name":"Two Star Industries","crm_name":"Two Star Essentials","reminder_weekday":3}' > /dev/null
R=$(req GET /api/reminders)
check "weekday wapas Wednesday (3)" "3" "$(py "d['weekday']" "$R")"
check "weekday wapsi par bhi sent record maujood (same cycle)" "1" "$(py "len([x for x in d['sent'] if x['client_id']==$CID])" "$R")"

req DELETE "/api/reminders/mark/$CID" > /dev/null
R=$(req GET /api/reminders)
check "undo ke baad sent se gayab" "0" "$(py "len([x for x in d['sent'] if x['client_id']==$CID])" "$R")"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -c "$JAR" -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/reminders/mark")
check "baghair client_id ke mark => 400" "400" "$CODE"

echo "================================"
echo "PASS: $PASS   FAIL: $FAIL"
echo "================================"
rm -f "$JAR"
[ "$FAIL" = "0" ]
