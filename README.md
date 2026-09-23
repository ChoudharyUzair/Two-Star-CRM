# Two Star CRM

## Project Overview
- **Name**: Two Star CRM
- **Owner**: Muhammad Uzair
- **Goal**: Complete business CRM for Two Star Industries — manage clients, ledgers, inventory, raw materials, manufacturing recipes, employees, side expenses, and bills with auto Net Profit tracking.
- **Stack**: Hono (TypeScript) + Cloudflare Pages + Cloudflare D1 (SQLite) + TailwindCSS + Vanilla JS frontend

## What's New (latest update — 2026-09-23) — 3 Requested Features

### 1. 🔍 Customer Ledger Search (Ledgers)
Sidebar ke **Sections** ke neeche ek naya **search box** aur ek 🔍 icon add ho gaya hai. Ab **kisi bhi customer ka naam / phone / section type karke uska ledger direct khola** ja sakta hai — chahe woh kisi bhi section (folder) me ho.
- Sidebar search box → live suggestions → click karo → ledger khul jata hai.
- 🔍 icon → bara full modal search bhi milta hai.
- Search sab folders ke saare clients par chalta hai (`GET /api/clients`). Naya client add/edit hone par cache auto-refresh ho jata hai.

### 2. 🔁 Customer Return (multi-product) — Inventory
Inventory page par naya **"Customer Return"** button. Ek hi entry me:
- **Customer select** karo (sirf customer-type folders dikhते hain, suppliers nahi).
- **Ek saath multiple products** ki return entry karo (Add Product se rows barhao).
- Har product ka **rate customer ke saved special-rate se apne aap lag jata hai** (na ho to product ka default selling rate). Rate manually edit bhi ho sakta hai.
- Save par: har product ka stock **barh** jata hai (`return` movement) **aur** poori return customer ke **ledger me ek CREDIT** (Amount Received) ke tor par sync ho jati hai — customer ka baqaya us hisab se kam ho jata hai.
- API: `POST /api/inventory/customer-return` (body: `client_id`, `entry_date`, `notes`, `items:[{inventory_id, quantity, rate}]`).

### 3. 🎚️ Stage Stock Correction + Recent Correction Log — Products Manufacturing
Products Manufacturing me **Assembled (un-painted) / Painted / Packed (final)** stock ko ab **directly edit/correct** kiya ja sakta hai (kabhi stock upar-neeche ho jaye to).
- Har stage number par **click** karo, ya row ke Action me naya **slider** button dabao → correction modal khulta hai.
- Modal me current stock dikhta hai, aap **correct value** set karo — delta (change) live dikhta hai — reason likh sakte ho.
- Neeche naya **"Recent Correction Log"** table: date, product, stage, old → new, change (delta), reason. Har log delete kar sakte ho (option: stock revert karna hai ya sirf log hataana hai).
- API: `GET/POST /api/stage-corrections`, `DELETE /api/stage-corrections/:id?revert=1`.
- DB migration: `0021_stage_stock_corrections.sql` (`stage_stock_corrections` table).

## What's New (latest update — 2026-09-04) — 🏦 Banking / Payments System (fully integrated)

Ab CRM me ek **proper industrial-level Banking / Payments system** add ho gaya hai jahan **har paisa jo aata (IN) ya jata (OUT) hai woh kisi na kisi bank/cash account se linked hota hai**. Poora system ek jagah linked hai.

### Core idea (jaisa owner ne maanga)
1. **Apne banks / cash accounts add karo** — har account me opening balance (e.g. "is bank account me itni amount hai").
2. **Customer se payment aayi** → uski ledger me entry karo → jis bank account me aayi woh **select** karo → utni amount us bank ke balance me **plus (+)** ho jati hai.
3. **Kisi ko pay kiya** (supplier, salary, employee, expense, raw material — kuch bhi) → jis account se diya woh **select** karo → utni amount us balance se **minus (−)** ho jati hai.
4. Neeche **proper records** (last transactions, running balance) dikhte hain.
5. **Bank statement PDF** form me nikal sakte ho (Two Star branding ke saath).

### Golden rule (data integrity)
`current_balance = opening_balance + Σ(money IN) − Σ(money OUT)` — balance kabhi incrementally drift nahi karta; har change ke baad server-side `recomputeBankBalance()` se **poora dobara compute** hota hai. Isliye edit / move / delete sab **hamesha sahi** rehta hai (regression-tested).

### Everything is LINKED (single system)
In sab modules ki har money-flow entry me ab ek **Bank/Cash account selector** hai, aur woh entry us account ke ledger me automatically reflect hoti hai:

| Module | Direction | Category |
|---|---|---|
| Customer ledger payment (Received) | **IN (+)** | `customer_payment` |
| Supplier ledger payment (Paid) | **OUT (−)** | `supplier_payment` |
| Bill — Paid amount | **IN (+)** | `bill` |
| Employee salary / payment / advance (paid) | **OUT (−)** | `salary` / `employee` |
| Side expense | **OUT (−)** | `expense` |
| Raw material purchase / restock / pay-supplier (paid) | **OUT (−)** | `raw_material` |
| Bank ↔ Bank transfer | OUT of one, IN to other | `transfer` |

Har linked table par `bank_account_id` + `bank_txn_id` columns hain; ek central `syncModuleBankTxn()` helper linked bank transaction ko idempotently create / update / move / remove karta hai (source entry edit/delete karo to bank txn bhi khud adjust ho jata hai).

### UI
- **Nav → "Banking / Payments"**: saare accounts ka grid + KPIs (Total Balance, Money In, Money Out, Net Flow), aur Money In / Money Out / Transfer / Add Account buttons.
- **Account detail page**: full statement table with **running balance** + date filter (from/to).
- **Dashboard**: ek "Banking / Payments" strip — total balance across all accounts, total in/out (transfers excluded), aur per-account balance cards (click → detail).
- **Bank Statement PDF**: jsPDF se branded statement (header, summary, running-balance table, multi-page footer).

### API endpoints (banking)
- `GET/POST /api/bank-accounts`, `GET/PUT/DELETE /api/bank-accounts/:id` (`GET :id` returns account + transactions with running_balance + period_opening; supports `?from=&to=`; `DELETE ?force=1`)
- `GET/POST/PUT/DELETE /api/bank-transactions` (sirf `source='manual'` txns directly edit/delete honge; module-linked txns unke source se manage hote hain)
- `POST /api/bank-transfers` (two-leg transfer, `transfer_group`)
- `GET /api/banking/summary` (accounts, total_balance, total_in/out **excluding transfers**, by_category)

### New DB schema
- Migration `0020_banking_system.sql` — `bank_accounts` + `bank_transactions` tables, plus `bank_account_id` + `bank_txn_id` columns on `bills`, `transactions`, `employee_transactions`, `side_expenses`, `raw_material_purchases`.

---

## What's New (latest update — 2026-07-22) — 7 Confirmed Bug Fixes + Hardening

Ye 7 confirmed bugs fix kiye gaye hain (sab regression-tested — `tests/regression.sh`, 19/19 pass):

1. **BUG 1 — Inventory "Adjust" edit stock corrupt karta tha.** Adjust movement ki direction ab DB me store hoti hai (`inventory_movements.direction` +1/-1, migration `0018`). Edit ab pehle purana effect poora REVERSE karta hai, phir naya apply karta hai (delete jaisa pattern). Delete bhi ab adjust rows ko sahi reverse karta hai (pehle skip hota tha).

2. **BUG 2 — Pack-stage production log edit inventory sync tor deta tha.** Pack log edit ab delete+recreate jaisa full behaviour rakhta hai: finished-goods inventory qty delta ke saath update hoti hai, consumed set-items (components/raw materials) proportionally re-adjust hote hain, linked `production` movement sync rehta hai, painted/packed counters saath move karte hain. Assemble/paint edits bhi recipe consumption re-adjust karte hain. Stock-shortage checks kisi bhi write se PEHLE chalte hain.

3. **BUG 3 — Net Profit me labor cost shamil nahi thi.** `computeAndSaveBillProfit()` ab per-unit labor (assemble_rate + paint_rate + pack_rate, matching manufacturing product se by name) minus karta hai: `profit = (rate − mfg_cost − labor) × qty`.

4. **BUG 4 — Fully-paid bill customer ka purana balance ghata deta tha.** `syncBillLedger` ab har bill ledger row par `amount_pending = bill ka FULL total` aur `amount_received = paid` (same row) store karta hai. Fully-paid bill ab exactly 0 net karta hai — purane outstanding par koi asar nahi. Migration `0019` existing corrupted bill ledger rows repair karta hai.

5. **BUG 5 — Scrap/reject pieces ki labor payment nahi honi chahiye.** Payout ab `(qty − scrap) × rate` hai (create + edit dono par). Example: 100 pcs, 10 scrap, rate 5 → payout 450 (500 nahi). Frontend payout preview bhi match karta hai.

6. **BUG 6 — Employee ka apna custom rate server-side enforce nahi tha.** Jab request me `rate` nahi aata, backend ab pehle us worker ka apna saved rate (`employee_items`) dekhta hai (component name / "Product stage" candidates), sirf na milne par product/component ka default rate use hota hai.

7. **BUG 7 — Dashboard salary stats me dead `'per_piece'` type check.** `type IN (...)` filter se `'per_piece'` hata diya gaya — woh `entry_type` hai, `type` kabhi nahi hota; per-piece earnings pehle se `type='salary'` branch me count hoti hain (rakhne se double-count hota).

### Hardening
- Har multi-step write (bill create/update/delete, production log create/edit/delete, inventory movement create/edit/delete) ab single atomic D1 `batch()` me chalta hai — mid-failure par partial data nahi banta.
- `tests/regression.sh` — 19 automated checks: create→edit→delete round trips verify karte hain ke stock apni original state par wapas aata hai.

### New DB schema
- Migration `0018_movement_direction.sql` — `inventory_movements.direction` (+1/-1) + legacy backfill.
- Migration `0019_fix_bill_ledger_rows.sql` — existing bill ledger rows ka `amount_pending` repair.

---

## What's New (latest update — 2026-07-04) — 7 Requested Features

Ye 7 cheezein add / fix ki gayi hain:

1. **Product "Pack" hone par Inventory Recent Entries me record.** Jab Products Manufacturing me koi product **Pack** hota hai to woh inventory me add hota hai — aur ab inventory ki **"Recent Entries"** me bhi ek entry aati hai jo dikhati hai kitna inventory update hua aur **kis worker** ne kiya. Naya movement type `production` (green badge). Entry delete karne par stock reverse ho jata hai.
   - DB: migration `0017_movement_product_log_link.sql` — `inventory_movements.product_log_id` column + index (pack log ke saath link).
   - Backend: `product-production` pack stage ab `inventory_movements` me `type='production'` insert karta hai; pack log delete par woh movement bhi delete + stock reverse hota hai. `production` type ki entries edit se protected hain (kyunki source pack log hai).

2. **Raw Material me "Recent Entries" section.** Har naya raw material purchase ab Recent Entries me apna record dikhata hai (date, material, qty, rate, total, supplier).
   - Naya endpoint: `GET /api/raw-materials/purchases/recent?limit=500`.
   - Frontend: Raw Materials page par **Recent Entries** table + edit/delete option.

3. **Har jagah recent entries / production logs par Edit option + 20-per-page pagination.** CRM me jahan bhi recent entries / production logs hain (Inventory movements, Product production log, Component production log, Raw material recent) wahan **Edit** button aur **pagination** (20 entries per page, 20 se zyada hone par agli page banti rehti hai) add ki gayi.
   - Naya endpoint: `PUT /api/inventory/movements/:id` (edit movement, stock delta auto-adjust).
   - Frontend: shared `paginate()` / `renderPager()` / `goPage()` helpers.

4. **Customer ledger product rate ab Edit ho sakta hai.** Pehle sirf delete option tha; ab **Edit** option bhi hai (`_editCustomerRate`).

5. **Ledgers me page system.** Ledger par 20 entries per page, 20 se zyada hone par agli page (running balance sab rows par sahi compute hota hai, default last page khulti hai).

6. **Employee week cycle Friday → Thursday.** Pehle Thursday-to-Thursday tha; ab **Friday se Thursday** (week reset Friday ko hota hai). Backend `weekStartOf` `getUTCDay()` par `dow-5` use karta hai; saare frontend labels bhi update.

7. **Customer ledger PDF export.** Ab customer ledger ko **PDF** me bhej sakte hain. PDF banate waqt option aata hai ke **kitni last entries** include karni hain. PDF par **Two Star logo** (branding se) lagta hai. Download + WhatsApp/Share dono options.
   - Frontend: `showLedgerPdfModal`, `_buildLedgerPDF(limitCount)`, `downloadLedgerPDF`, `shareLedgerPDF` (jsPDF + html2canvas).

### New DB schema (migration 0017)
- `inventory_movements.product_log_id` (INTEGER) — pack production log ko inventory movement se link karta hai (reverse/cleanup ke liye).

---

## What's New (latest update — 2026-06-13) — 6 Requested Fixes (Two Star CRM rebrand)

Ye 6 cheezein add / fix ki gayi hain:

1. **Remaining Balance ab clear 2 hisson me hai.** Pehle ek hi confusing "Remaining Balance" tha. Ab dashboard par 2 alag cards:
   - **Customers Se Lena (Receivable)** — jo paisa customers humein dene hain.
   - **Suppliers Ko Dena (Payable)** — jo paisa hum suppliers ko dene hain.
   - SQL level par `folders.ledger_type` (`customer`/`supplier`) ke hisaab se split hota hai. Per-section summary table me ab **Type** column bhi hai.

2. **Opening Balance ka matlab clear kiya.** Customer profile + Add/Edit customer forms me hint diya gaya hai ke opening balance = "is customer se jo purana udhaar lena hai" (receivable). Supplier ke liye hint alag hai.

3. **Per-customer product selling rate (MAIN feature).** Manufacturing rate sab ke liye same, lekin selling rate har customer ka alag ho sakta hai. Ab ek dafa set karo "ye customer = ye product = ye rate". Phir us customer ki bill banate waqt jab item add karte ho to rate **khud-ba-khud bhar jata hai**.
   - Naye endpoints: `GET/POST /api/clients/:id/product-rates`, `DELETE /api/clients/:id/product-rates/:rid`, `GET /api/clients/:id/rate-map`.
   - Customer profile me **"Product Rates"** button.

4. **Nested Components (component se component).** Pehle components sirf raw material se bante the. Ab ek component doosre components se bhi ban sakta hai. Production karte waqt child component ka stock auto-deduct hota hai, aur shortage check + delete-par-restore dono kaam karte hain.

5. **Components Production summary dashboard par.** Ab dashboard par alag section: kitne pieces banaye (Today / Month / All), total payout, aur har component ka produced count.

6. **Logo fix + bada bill logo + WhatsApp share.** Logo ab crop nahi hota (`object-fit: contain`), printed bill par logo bada (150px). Bill par **WhatsApp share** button bhi add kiya — customer ke profile-saved number par bill summary bhejta hai (print ke saath-saath).

### New DB schema (migration 0015)
- `customer_product_rates` (client_id, inventory_id, rate) — per-customer per-product rate.
- `component_subcomponents` (component_id, child_component_id, quantity_required) — nested BOM.
- `production_raw_usage.child_component_id` — child component usage tracking for reversal.

## What's New (latest update — 2026-06-10) — Real Net Profit + Ledger Type + Inventory Recent Entries

Teen requested features add kiye gaye:

1. **Net Profit ab REAL cash-based hai.** Pehle dashboard ka Net Profit sirf `Gross Profit − Side Expenses` tha (adhura). Ab system poore business costs ghatata hai:
   - **Gross Profit** = (Selling Rate − Manufacturing Cost) × Qty — jo products bechte hain (Two Star + Wire customers dono).
   - **Net Profit** = Gross Profit − **Raw Material Cost** − **Employee Salaries/Payments** − **Side Expenses**.
   - Dashboard "Profit Overview" table me ab alag-alag columns hain: Gross Profit | Raw Material | Salaries | Side Expenses | **Net Profit** — Today / This Month / All Time ke liye. (`rawCostStats` + `salaryPaidStats` `GET /api/dashboard` me add kiye.)

2. **Ledger Type option (Customer vs Supplier).** Jab naya ledger/section banayein to ab choose karna hota hai:
   - **Customer — We RECEIVE payment** (Two Star / Wire customers): bills profit me ADD hote hain.
   - **Supplier — We PAY them** (raw material suppliers): bills ek COST hain (gross profit se minus).
   - `folders.ledger_type` ('customer'/'supplier') column. Purane folders auto-detect ho gaye (naam/section_type se). `isSupplierContext()` ab is field ko priority deta hai.

3. **Inventory "Recent Entries" section + Record Sale / Return.** Inventory page par ab:
   - **Record Sale / Return** button — sold (stock kam), returned (stock barh), ya manual adjustment log karein. Stock automatically update hota hai.
   - **Recent Entries** table — last 50 movements (date, item, type, qty, rate, total, customer/note). Entry delete karne par stock automatically reverse ho jata hai. (`inventory_movements` table + `GET/POST/DELETE /api/inventory/movements`.)

---

## Previous update (2026-06-09) — Worker payout fixes + Payment type

Char requested fixes:

1. **Weekly Production Payout ab har production type dikhata hai.** Pehle "Weekly Production Payout (Thursday → Wednesday)" sirf **Components Production** ka data dikhata tha. Ab woh **employee_transactions** (saari per-piece earnings) par based hai — to **Products Manufacturing (Assemble / Paint / Pack)** aur kisi bhi field/stage ka kaam bhi automatically worker ke weekly payout + profile me show hota hai. (`GET /api/production/weekly` ko rewrite kiya.)
2. **"Total Earned / Owed" card hata diya** employee profile se (clutter kam).
3. **Naya "Payment" entry type** — jab aap worker ko paisa dete hain (salary paid) to **Type → Payment** choose karein. Ye sirf **Remaining se ghatata hai**, naya earning nahi banata. Pehle "Salary" entry total+paid dono add karti thi to remaining par farak nahi padta tha — ab payment se remaining sahi kam hota hai. (`type='payment'` employee_transactions me; remaining = earned − salary-paid − advance-active − **payments**.)
4. **Weekly auto-reset clarified** — har **Thursday** naya week start hota hai (auto-reset), lekin **active advance / remaining balance reset nahi hota** (carry-forward). Sirf jo pay kar diya woh settle hota hai. Header me note add kiya.

---

## Previous update (2026-06-09) — Products Manufacturing: auto per-pcs rate from worker profile

**Products Manufacturing** ka **Log Production** ab bilkul **Components Production** jaisa kaam karta hai: jab aap **component/product select** karke phir **employee (worker) select** karte hain, to us worker ke **profile (Per Piece Items)** se per-pcs rate **automatically fetch** ho jata hai — bar bar rate likhne ki zaroorat nahi.

### Rate auto-fill priority (Products Manufacturing — Assemble / Paint / Pack)
1. **Worker profile rate** — selected worker ke "Per Piece Items" se rate match hota hai. Matching names (case-insensitive), most-specific first:
   - `"<Product> <Stage>"` (e.g. `Rack Paint`)
   - `"<Stage> <Product>"` (e.g. `Paint Rack`)
   - `"<Product> - <Stage>"` (e.g. `Rack - Paint`)
   - `"<Product>"` (any-stage rate, e.g. `Rack`)
2. **Product stage default rate** — agar worker profile me match na mile, to product ka `assemble_rate` / `paint_rate` / `pack_rate` use hota hai.

Rate field ke saath **source label** (`from worker profile` ya `product default`) bhi dikhta hai, taaki pata chale rate kahan se aaya. Worker change karne par rate dobara auto-fill ho jata hai (`_onPProdWorkerChange`).

> Tip: kisi worker ko per-product/stage rate dene ke liye, **Employee editor → Salary Type: Per Piece → Items** me item name aise rakhein jaisa upar diya hai (e.g. `Rack Paint` with rate). Phir Products Manufacturing > Log Production me wahi rate auto aayega.

---

## Previous update (2026-06-09) — Products Manufacturing Worker Stages (Assemble → Paint → Pack)

**Products Manufacturing** ab **Components Production** ki tarah worker production track karta hai, aur real-world flow ko model karta hai:

```
Raw Material → Components → ASSEMBLE (non-painted) → PAINT → PACK (final finished product)
```

### What was added
- **"Log Production" button** (header + per-row Action) in Products Manufacturing — exactly like Components Production.
- **3-stage worker logging** with per-piece payout per stage:
  - **Assemble** — components/raw material stock se non-painted product banta hai.
  - **Paint** — assembled (un-painted) stock paint hota hai.
  - **Pack** — painted stock + **Set Items** (e.g. tyres, rolling 460, tiers) box me pack ho kar **final finished product** banta hai (auto-added to Inventory).
- **Stage stock columns** in the products table: Buildable · Assembled (un-painted) · Painted · Packed (final).
- **Set Items** in the product editor — extra parts (component ya raw material) jo pack stage par lagte hain, with auto stock deduction.
- **Per-stage default rates** (Assemble / Paint / Pack) in product editor — Log Production me auto-fill ho jate hain.
- **"Recent Production Log"** table — kis worker ne kis stage par kitne pieces banaye, with payout. Har stage payout worker profile + weekly (Thu→Wed) total me automatically add hota hai.
- **Stock guards**: paint > assembled ya pack > painted ya set-item shortage par clear error. **Delete** poora stock movement + set-item usage + payout reverse karta hai.

#### DB migration `0013_product_manufacturing_stages.sql`
- `products`: added `assembled_qty`, `painted_qty`, `packed_qty`, `assemble_rate`, `paint_rate`, `pack_rate`.
- New tables: `product_set_items`, `product_production_logs`, `product_set_usage`.
- `employee_transactions`: added `product_log_id` (reverse link to stage payout).

#### New API Endpoints
- `GET /api/product-production` — list stage logs (filters: employee_id, product_id, stage, from, to)
- `POST /api/product-production` — record a stage (assemble/paint/pack); moves stock + records per-piece payout
- `PUT /api/product-production/:id` — edit date/qty/rate/notes (adjusts stage stock by delta)
- `DELETE /api/product-production/:id` — reverse stock movement, set-item usage, and payout
- `GET/POST/PUT /api/products` extended to read/write `set_items` + stage rates

---

## Previous update (2026-06-09) — Dashboard Restructure + Calendar "View Days" Fix

This update focuses on two requested improvements:

### A. Professional Dashboard restructure
The dashboard is now organised into clear, labelled sections instead of a long flat list of cards:
1. **Key Metrics** — all 8 KPI cards (Received, Remaining Balance, Bills, Clients/Sections, Raw Materials, Products/Mfg., Employees, Side Expenses) combined into one clean responsive grid.
2. **Profit Overview** — the previous **6 large coloured cards** (3× Gross Profit + 3× Final Net Profit) are now combined into a **single compact table** (rows: Today / This Month / All Time; columns: Gross Profit · Side Expenses · Net Profit). Much less clutter, same information.
3. **Sales Summary** — daily / monthly / all-time units, revenue and product breakdown.
4. **Detailed Summaries** — Per-Section, Inventory, Manufacturing, Raw Material, Employees and Side Expenses tables grouped under one heading.
5. **Activity & History** — Activity Calendar + Recent Transactions.

Semantic `<section>` tags and consistent `dash-section-title` / `dash-card-title` / `dash-link-btn` styles are used throughout.

### B. Calendar "View Days" button fixed
The **"View Days"** toggle (on both the Dashboard and Employee calendars) did not open the month grid. Root cause: `renderCalendar()` rebuilt its internal state object on every render and **dropped the `expanded` flag**, so the grid was always re-collapsed immediately after toggling. Fixed by preserving previous calendar state (`{ ...cur, ... }`) so the expanded/collapsed state now persists correctly. Clicking **View Days** now opens the day grid, and **Hide** closes it.

---

## Previous update — 6 FIXES (Production, Products, Worker Rate, Calendar, Advances)

This update fixes 6 reported issues:

### 1. Raw material exhaustion now blocks production
- When **Log Production** has auto-deduct ON and a component has a recipe, the system now **rejects** production if there isn't enough raw material in stock.
- The API returns `400` with a `shortages` array (e.g. `Steel Wire: need 1000, have 5`) and the UI shows a clear error instead of silently producing.

### 2. Components are now linked to Final Products
- A final product can now be built **from components** (not just raw materials). The product editor has a new **"Recipe — Components per 1 unit"** section.
- The product table shows both raw-material chips (green) and **component chips (teal)**, so you can see exactly what each product is made of.
- **Buildable units** and **cost per unit** are computed from both raw materials *and* components.
- Building a product now **deducts the required components from stock** and blocks the build when components are insufficient (e.g. `Not enough component "Rings" (need 4, have 1)`).
- New API: `product_components` is now fully wired into `GET/POST/PUT /api/products`, `GET /api/products/:id`, and `/build`.

### 3. Worker rate auto-fills in Log Production
- In **Components Production → Log Production**, selecting a worker now **auto-fills the per-piece rate** from that worker's profile (their saved per-piece item rates), instead of typing it every time.
- Priority: worker's saved item rate matching the component name → component's default rate. A small label shows where the rate came from.

### 4. Renamed labels
- **"Components / Production" → "Components Production"**
- **"Products / Manufacturing" → "Products Manufacturing"**

### 5. Compact calendar UI
- The large space-hungry calendar has been replaced with a compact **mini calendar** (`cal-mini`): summary chips are always visible, the month grid is collapsible, and days use small colored **dots** instead of long text — much better UX and far less screen space.

### 6. Employee advance auto-deduct + defer + no bonus/deduction
- Advances now **auto-deduct from the remaining balance**. Example: Hassan makes 1000 rings @ 3.5 = 3500 owed; he took a 1000 advance → **Remaining shows 2500** and **Salary Paid (incl. advance) shows 1000**.
- **Defer option**: if a worker says *"don't cut this week's advance, cut next week"*, you can **defer** that advance with one click. Deferred advances are **not** deducted from the remaining until you un-defer them.
- The **Bonus** and **Deduction** sections have been **removed entirely** — transactions are now only **Salary** or **Advance**.
- New API: `POST /api/employee-transactions/:id/toggle-defer`; employees list returns `advance_active` (non-deferred advances) used for the remaining calculation.

#### DB migration `0012`
- Adds a `deferred` column (+ index) to `employee_transactions` for the defer-advance feature.

---

## What's New (previous update — 2026-06-09) — COMPONENTS + WORKER PRODUCTION

### NEW middle layer: Raw Material → **Components** → Final Product
Pehle system tha: Raw Material → Product. Ab beech mein ek naya layer add hua hai — **Components / Production** — jisse factory ke contract (per-piece) workers ka kaam track hota hai.

A **component** is an intermediate part workers make from raw material — e.g. *Trolley Basket Rings*, *Bottom Jaali*, *Assembled Basket*. Workers are paid **per piece**.

#### 1. New "Components / Production" Section (sidebar)
- **Add Component**: name, unit, category, **default per-piece rate** (worker pay/piece), current stock, and an optional **recipe** (raw material × qty per 1 piece).
- The components table shows each component, what it's made from, the per-piece rate and **current stock**.
- A live **Recent Production Log** table shows every entry (date, worker, component, pieces, rate, payout, raw used, scrap).
- Summary cards: total components, total stock, produced today, total scrap/waste.

#### 2. Worker Production Logging (per-piece counting)
- Click **Log Production** → pick worker + component + pieces made (+ optional scrap).
- On save the system automatically:
  1. **Increases the component's stock** by the pieces produced.
  2. **Deducts raw material** from stock (recipe-based) — so you can see how much raw was used.
  3. **Records scrap/wastage** (single-ingredient components also deduct scrap from raw stock).
  4. **Adds a per-piece payout line** (`pieces × rate`) into that worker's profile so it counts toward their salary.
- Example: 2 workers make rings. Worker A makes 100 rings, Worker B makes 200 rings → log both → component stock = 300, raw material reduced, both workers paid for their pieces.

#### 3. Weekly Payout — Thursday → Wednesday (per worker)
- Each worker's profile now has a **Weekly Production Payout** section that groups all production into weeks that **start every Thursday and end on Wednesday** (matching the factory's "Thursday ka Thursday" payout cycle).
- Each week shows: total pieces, total payout, per-component breakdown, and a day-by-day list.
- The current week is highlighted. Grand total (all weeks) is shown at the top.

#### 4. Raw Material Usage & Scrap Visibility
- Every production log stores `raw_used` and `scrap_qty`, so you can see exactly how much raw material was consumed and how much was wasted per batch.
- Deleting/editing a production log correctly reverses or re-applies stock, raw material and worker payout.

#### New API Endpoints
- `GET/POST/PUT/DELETE /api/components` — manage components + their recipe
- `GET /api/components/:id` — component detail + recent production
- `GET /api/production` — list production logs (filters: `employee_id`, `component_id`, `from`, `to`)
- `POST /api/production` — log a worker's production (auto stock + raw deduct + scrap + payout)
- `PUT/DELETE /api/production/:id` — edit/delete a log (reverses stock & payout)
- `GET /api/production/weekly?employee_id=` — Thursday→Wednesday weekly payout summary

#### New DB tables (migration `0011`)
- `components`, `component_ingredients`, `production_logs`, `production_raw_usage`, `product_components`
- `employee_transactions.production_log_id` (reverse link to production)

## What's New (previous update — 2026-05-14)

### 1. Dashboard Sales Summary — Reordered (Day → Month → All Time)
- Gross Profit cards on the Dashboard are now displayed in the natural order: **Today → This Month → All Time** (previously was All Time → Month → Today).
- Sales Summary cards stay in the same Day / Month / All Time order for consistency.

### 2. Side Expense Folders / Ledgers (NEW)
- **Side Expenses** is now a folder-based system. You can create custom folders/ledgers (e.g. *Utility Bills*, *Workers Food*, *Travel*) and put related expenses inside them — for example, **Gas, Electricity, Water and Internet bills** can all live inside one *Utility Bills* folder.
- New folder grid view shows each folder with icon, color, entry count and total spent.
- 5 default folders are seeded: Utility Bills, Workers Food, Travel & Transport, Repairs & Maintenance, Miscellaneous.
- Each expense can be assigned to a folder (or left Uncategorized).
- New endpoints: `GET/POST/PUT/DELETE /api/side-expense-folders`, and `/api/side-expenses` now accepts `?folder_id=` filter.

### 3. Final Net Profit Section (NEW — clearer naming)
Two distinct profit concepts are now shown on the Dashboard to avoid confusion:
- **Gross Profit** (Today / Month / All Time) — earnings from **products only**: (Sale Price − Manufacturing Cost) × Quantity Sold. *Previously labelled "Net Profit".*
- **Final Net Profit** (Today / Month / All Time) — **Gross Profit minus all Side Expenses** for the same period. This is your real take-home figure after deducting utility bills, workers food, repairs, etc.
- Each Final Net Profit card shows the math: `Gross − Side Exp.` so the user can see exactly how the number is computed.

## What's New (previous update — 2026-05-10)

### Dashboard Enhancements
- **New Inventory Summary section** on the Dashboard — shows for each product: Quantity in stock, Cost (Mfg.), Sale Price, and Sold units (clean overview, no extra columns).
- **New Sales Summary section** on the Dashboard — three side-by-side cards showing how many products were sold:
  - **Today** — units sold, revenue, bill count, and per-product breakdown
  - **This Month** — units sold, revenue, bill count, and per-product breakdown
  - **All Time** — units sold, revenue, bill count, and per-product breakdown
- **Manufacturing Summary cleaned up** — removed `Sale Rate`, `Sold`, and `Profit Earned` columns. Now only shows Product, Recipe (per unit), Cost / unit, and Buildable for a focused production view.

## What's New (previous update — 2026-05-09)

### 1. Multi-Supplier Raw Materials
- A single raw material can now be sourced from **multiple suppliers** (each batch tracked separately in the new `raw_material_purchases` table).
- The green "+" restock icon was **removed from each Raw Material row** — restock is now done from inside the editor / detail view only.
- New **"View Detail"** button (list icon) opens a per-material modal showing the full purchase history (every batch, supplier, qty, rate, paid, remaining) with per-batch **Pay** and **Delete** actions.

### 2. Supplier Payment Field + Auto Ledger Sync
- When **adding** or **restocking** a raw material you can now enter:
  - Supplier (dropdown of existing suppliers + free-text fallback)
  - Quantity & Rate (Total auto-calculates)
  - **Amount Paid Now** (Remaining = Total − Paid auto-displays)
- The **remaining amount auto-pushes to that supplier's ledger** (via the existing `auto_generated` ledger pattern), so the supplier folder always reflects what we still owe.
- New endpoint `POST /api/raw-material-purchases/:pid/pay` lets you settle batches later from the detail modal.

### 3. Supplier Ledger Semantics Fixed
Suppliers are entities **we pay** (not receive from). When you open a folder under section_type `suppliers` (or whose name contains "supplier") the ledger now shows correct labels:
- `Amount Received` → **Amount Paid** (what we paid the supplier)
- `Amount Pending`  → **Bill Amount** (what they billed us)
- `Running Total`   → **Outstanding Balance** (what we still owe)
- A **"Supplier"** badge appears in the ledger title; balance hint reads "You owe supplier" / "Advance paid" / "Settled".

### 4. Manufacturing Summary on Dashboard (replaces Inventory stats)
The dashboard's old inventory-cost table has been replaced with a true **Manufacturing Summary**:
- Each manufactured product, its **recipe** (raw materials × quantity per unit)
- **Cost / unit** computed live from current raw-material rates
- **Sale Rate** and **Buildable** units (from current raw stock — limiting ingredient wins)
- **Sold** units and **Profit Earned** (from completed bills)
- 4 summary cards underneath: Products count · Raw Purchased · Paid to Suppliers · Owed to Suppliers

### 6. Editable Bill Template (Branding)
The Bill / Invoice template can now be edited from **Branding & Settings**. Editable fields:
- **Number** (phone)
- **Gmail / Email**
- **Website**
- **Address**

All four fields appear at the top of every printed bill (each shown only if filled in).

### 7. Inventory — Manufacturing Cost
Every inventory product now has two prices:
- **Manufacturing Cost** (internal — never shown on the bill)
- **Selling Rate** (used on the bill)

The editor shows the live "Net Profit per unit" margin. The inventory list shows Mfg. Cost, Selling Rate, Margin, and Potential Profit.

### 8. Net Profit (auto-calculated)
**Net Profit = Σ (Selling Rate − Manufacturing Cost) × Quantity** for every bill item.

Example: stock = 100 racks, mfg cost = 2,000, selling = 3,000 → bill of 10 racks → Net Profit = (3000 − 2000) × 10 = **PKR 10,000**.

This profit is:
- Saved on the bill (`bills.net_profit`) but **never printed on the bill**
- Aggregated on the **Dashboard** (All-time / This Month / Today)
- Aggregated **day-by-day on the Calendar**
- Shown internally (in green box) inside the Bill editor while creating the bill

### 9. Smaller Calendar
Calendar widget redesigned to be ~30% smaller (cells, gaps, fonts, paddings) while keeping all info readable. Net Profit is highlighted on the totals strip and on each day cell.

## URLs
- **Production**: https://two-star-crm.pages.dev
- **Latest Deployment**: https://52b0ee6f.two-star-crm.pages.dev (2026-07-04, 7 features)
- **GitHub**: https://github.com/ChoudharyUzair/Two-Star-CRM

## API — Functional Entry Points
- `POST /api/auth/login` — login (default admin / admin123)
- `GET  /api/dashboard` — totals, perFolder, profitStats, productList, invMfgList, **supplierStats**, **mfgProducts**, **mfgIngredients**, **builtSoldStats**
- `GET  /api/calendar?month=YYYY-MM` — daily summary incl. `net_profit`
- `GET  /api/inventory` · `POST /api/inventory` · `PUT /api/inventory/:id` — with `manufacturing_cost`
- `GET  /api/bills` · `POST /api/bills` · `PUT /api/bills/:id` — auto-computes & stores `net_profit`
- `GET  /api/branding` · `PUT /api/branding` — bill_phone, bill_email, bill_website, bill_address
- `GET/POST/PUT/DELETE /api/products` — manufacturing recipes
- **Raw Materials (multi-supplier)**:
  - `GET    /api/raw-materials` — list with grouped `suppliers` array per item
  - `GET    /api/raw-materials/:id` — full purchase history
  - `POST   /api/raw-materials` — create batch (qty, rate, supplier, paid_amount, entry_date) → ledger sync
  - `PUT    /api/raw-materials/:id` — edit name/unit/category/notes only
  - `DELETE /api/raw-materials/:id` — drops material + linked supplier-ledger rows
  - `POST   /api/raw-materials/:id/restock` — add another batch (different supplier OK)
  - `PUT    /api/raw-material-purchases/:pid` — edit one batch
  - `DELETE /api/raw-material-purchases/:pid` — remove one batch + its ledger row
  - `POST   /api/raw-material-purchases/:pid/pay` — record additional payment to a batch
- Plus Clients, Folders, Transactions, Employees, Side Expenses, Custom Sections.

## Data Architecture
- **Storage**: Cloudflare D1 (SQLite, globally distributed)
- **Key tables**: `users`, `sessions`, `branding`, `folders`, `clients`, `transactions`, `inventory`, `raw_materials`, `products`, `product_ingredients`, `bills`, `bill_items`, `employees`, `employee_transactions`, `side_expenses`, `custom_sections`
- **New table (migration `0009`)**: `raw_material_purchases` — per-batch purchase rows (raw_material_id, supplier_id, supplier_name, entry_date, quantity, rate, total_amount, paid_amount, remaining_amount, ledger_transaction_id). Plus `transactions.rm_purchase_id` column linking supplier-ledger rows back to a purchase batch.
- **Migration `0008`**:
  - `inventory.manufacturing_cost` REAL DEFAULT 0
  - `bill_items.manufacturing_cost` REAL DEFAULT 0  *(snapshot at sale time)*
  - `bills.net_profit` REAL DEFAULT 0  *(server-computed)*
  - `branding.bill_website` TEXT, `branding.bill_email` TEXT

## User Guide
1. **Login** with `admin / admin123` (change later under user menu).
2. **Branding & Settings** → fill in your Number, Gmail, Website, Address — they appear on every bill.
3. **Suppliers folder** → add your suppliers (entities you pay) so they appear in the dropdown when adding raw material.
4. **Raw Materials** → click **+ Add Raw Material**. Enter date, name, unit, qty, rate (Total auto-fills), pick a Supplier, enter Amount Paid Now (Remaining auto-fills) → submit. The unpaid balance lands in that supplier's ledger automatically. Use the **list (View Detail)** icon on any row to see the full batch history and pay later.
5. **Inventory** → add an inventory product with **Manufacturing Cost** and **Selling Rate**.
6. **Products (Recipes)** → define which raw materials × qty go into one unit of a manufactured product.
7. **Bills** → make a new bill, pick the product → rate auto-fills. The internal green box shows real-time Net Profit; it does **not** print on the bill.
8. **Dashboard** → see total Net Profit, This Month, Today, plus the new **Manufacturing Summary** (recipes, buildable units, sold, profit per product) and supplier balances.
9. **Calendar** → see Net Profit per day; click any day for a breakdown popup.

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: ✅ Active
- **Tech Stack**: Hono + TypeScript + Vite + Cloudflare D1 + TailwindCSS
- **Last Updated**: 2026-07-04

### Latest changes (2026-06-16)
- **Invoice brand name logic:** Agar logo set hai to invoice header me company/brand **name text show nahi hota** (logo hi brand hai). Logo na ho to hi brand name aata hai.
- **Logo aspect ratio fix (Print / PDF / WhatsApp):** Logo ab kabhi pichka/stretch nahi hota. Logo ki **natural aspect ratio** preload karke explicit width/height set ki jaati hai, aur PDF banane se pehle image fully load hone ka wait hota hai — teeno outputs (Print, PDF, WhatsApp) me clean, undistorted logo aata hai.

## Local Development
```bash
npm install
npm run build
npx wrangler d1 migrations apply webapp-production --local
pm2 start ecosystem.config.cjs
# Open http://localhost:3000
```

## Production Deployment
```bash
npm run build
npx wrangler d1 migrations apply webapp-production
npx wrangler pages deploy dist --project-name two-star-crm
```
