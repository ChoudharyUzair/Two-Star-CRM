# Two Star CRM

## Project Overview
- **Name**: Two Star CRM
- **Owner**: Muhammad Uzair
- **Goal**: Complete business CRM for Two Star Industries — manage clients, ledgers, inventory, raw materials, manufacturing recipes, employees, side expenses, and bills with auto Net Profit tracking.
- **Stack**: Hono (TypeScript) + Cloudflare Pages + Cloudflare D1 (SQLite) + TailwindCSS + Vanilla JS frontend

## What's New (latest update — 2026-05-09)

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
- **Last Updated**: 2026-05-09

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
