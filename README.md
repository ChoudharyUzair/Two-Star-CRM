# Two Star CRM

## Project Overview
- **Name**: Two Star CRM
- **Owner**: Muhammad Uzair
- **Goal**: Complete business CRM for Two Star Industries — manage clients, ledgers, inventory, raw materials, manufacturing recipes, employees, side expenses, and bills with auto Net Profit tracking.
- **Stack**: Hono (TypeScript) + Cloudflare Pages + Cloudflare D1 (SQLite) + TailwindCSS + Vanilla JS frontend

## What's New (latest update — 2026-06-09) — 6 FIXES (Production, Products, Worker Rate, Calendar, Advances)

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
- **Latest Deployment**: https://bc008b6d.two-star-crm.pages.dev
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
- **Last Updated**: 2026-06-09

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
