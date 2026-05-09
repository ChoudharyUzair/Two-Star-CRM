# Two Star CRM

## Project Overview
- **Name**: Two Star CRM
- **Owner**: Muhammad Uzair
- **Goal**: Complete business CRM for Two Star Industries — manage clients, ledgers, inventory, raw materials, manufacturing recipes, employees, side expenses, and bills with auto Net Profit tracking.
- **Stack**: Hono (TypeScript) + Cloudflare Pages + Cloudflare D1 (SQLite) + TailwindCSS + Vanilla JS frontend

## What's New (this update)

### 1. Dashboard — Products / Manufacturing Summary
A new "Products / Manufacturing Summary" section appears on the Dashboard showing every inventory product with:
Mfg. Cost · Selling Rate · Margin per unit · In Stock · Potential Profit. Plus a totals row showing Net Profit earned from all completed bills.

### 2. Editable Bill Template (Branding)
The Bill / Invoice template can now be edited from **Branding & Settings**. Editable fields:
- **Number** (phone)
- **Gmail / Email**
- **Website**
- **Address**

All four fields appear at the top of every printed bill (each shown only if filled in).

### 3. Inventory — Manufacturing Cost
Every inventory product now has two prices:
- **Manufacturing Cost** (internal — never shown on the bill)
- **Selling Rate** (used on the bill)

The editor shows the live "Net Profit per unit" margin. The inventory list shows Mfg. Cost, Selling Rate, Margin, and Potential Profit.

### 4. Net Profit (auto-calculated)
**Net Profit = Σ (Selling Rate − Manufacturing Cost) × Quantity** for every bill item.

Example: stock = 100 racks, mfg cost = 2,000, selling = 3,000 → bill of 10 racks → Net Profit = (3000 − 2000) × 10 = **PKR 10,000**.

This profit is:
- Saved on the bill (`bills.net_profit`) but **never printed on the bill**
- Aggregated on the **Dashboard** (All-time / This Month / Today)
- Aggregated **day-by-day on the Calendar**
- Shown internally (in green box) inside the Bill editor while creating the bill

### 5. Smaller Calendar
Calendar widget redesigned to be ~30% smaller (cells, gaps, fonts, paddings) while keeping all info readable. Net Profit is highlighted on the totals strip and on each day cell.

## URLs
- **Production**: https://two-star-crm.pages.dev (after Cloudflare deploy)
- **GitHub**: https://github.com/ChoudharyUzair/two-star-crm

## API — Functional Entry Points
- `POST /api/auth/login` — login (default admin / admin123)
- `GET  /api/dashboard` — totals, perFolder, profitStats, productList, invMfgList, etc.
- `GET  /api/calendar?month=YYYY-MM` — daily summary incl. `net_profit`
- `GET  /api/inventory` · `POST /api/inventory` · `PUT /api/inventory/:id` — now with `manufacturing_cost`
- `GET  /api/bills` · `POST /api/bills` · `PUT /api/bills/:id` — auto-computes & stores `net_profit`
- `GET  /api/branding` · `PUT /api/branding` — now includes `bill_phone`, `bill_email`, `bill_website`, `bill_address`
- `GET/POST/PUT/DELETE /api/products` — manufacturing recipes
- Plus Clients, Folders, Transactions, Raw Materials, Employees, Side Expenses, Custom Sections.

## Data Architecture
- **Storage**: Cloudflare D1 (SQLite, globally distributed)
- **Key tables**: `users`, `sessions`, `branding`, `folders`, `clients`, `transactions`, `inventory`, `raw_materials`, `products`, `product_ingredients`, `bills`, `bill_items`, `employees`, `employee_transactions`, `side_expenses`, `custom_sections`
- **New columns (migration `0008`)**:
  - `inventory.manufacturing_cost` REAL DEFAULT 0
  - `bill_items.manufacturing_cost` REAL DEFAULT 0  *(snapshot at sale time)*
  - `bills.net_profit` REAL DEFAULT 0  *(server-computed)*
  - `branding.bill_website` TEXT, `branding.bill_email` TEXT

## User Guide
1. **Login** with `admin / admin123` (change later under user menu).
2. **Branding & Settings** → fill in your Number, Gmail, Website, Address — they appear on every bill.
3. **Inventory** → add a product with **Manufacturing Cost** and **Selling Rate**.
4. **Bills** → make a new bill, pick the product → rate auto-fills. The internal green box shows real-time Net Profit; it does **not** print on the bill.
5. **Dashboard** → see total Net Profit, This Month, Today, plus a Products / Manufacturing summary.
6. **Calendar** → see Net Profit per day; click any day for a breakdown popup.

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
