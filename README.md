# Uzair CRM - Company CRM System

## Project Overview
- **Name**: Uzair CRM
- **Author**: Muhammad Uzair
- **Goal**: A secure, password-protected CRM for managing company clients/customers/suppliers with a digital ledger (khata) system, automatic balance calculation, and a dashboard overview.
- **Tech Stack**: Hono (TypeScript) + Cloudflare Pages + Cloudflare D1 (SQLite) + TailwindCSS + Chart.js + FontAwesome

## URLs
- **Production**: https://uzair-crm.pages.dev
- **Latest Deployment**: https://d070639a.uzair-crm.pages.dev
- **Sandbox Dev**: https://3000-i9tyzlf2wf00e8gj5mqxp-5634da27.sandbox.novita.ai

## Default Login
- **Username**: `admin`
- **Password**: `admin123`
- ⚠️ **Change the password after first login** (Profile menu → Change Password)

## Features (Completed ✅)

### 🔐 Authentication & Security
- Password-protected login (SHA-256 hashed)
- Session-based authentication using HttpOnly cookies
- Logout & Change Password
- Whole CRM is locked behind login — nothing accessible without auth

### 📁 Custom Folders (Sidebar Categories)
- Pre-seeded folders: Customers, Suppliers, Expenses
- Add unlimited custom folders (Add new folder type)
- Customize folder name, icon (10 icons), color picker
- Edit & delete folders (cascades to clients/transactions)
- Live client count per folder

### 👥 Clients per Folder
- Click any folder → see all clients in it
- Add client with name, phone, email, address, notes, opening balance
- Edit & delete clients
- Click any client name from sidebar → opens their khata/ledger sheet

### 📊 Ledger / Khata Sheet (per Client)
Each client has a full ledger spreadsheet with these columns:
1. **#** — Row number
2. **Date** — Transaction date
3. **Bill No** — Bill/invoice number
4. **Amount Received** — Cash received (green)
5. **Amount Pending** — Outstanding amount (orange)
6. **Status** — Dropdown: Pending / Received / Partial / Overdue / Cancelled
7. **Description** — Notes
8. **Custom columns** — User-added columns (text or number)
9. **Running Total** — Auto-calculated rolling balance (+/- automatic)

- **Auto-calculation**: Running total updates automatically with `+` (pending) and `−` (received) operations
- **Net Balance Box**: Big highlighted box showing total amount due (separate, prominent)
- **Inline editing**: Edit any field in the table directly — saves automatically (debounced)
- Add row / Delete row buttons
- 4 summary cards on top: Opening Balance, Total Received, Total Pending, **Net Balance Due**

### 🛠️ Customizable Columns (per Client)
- Click "Columns" button on any client ledger
- Add/remove/rename custom columns
- Choose column type: Text or Number
- Saved per-client in DB

### 📈 Dashboard (Overall View)
- 4 top stat cards: Total Received, Total Pending, Total Clients, Folders/Transactions
- **Per-Folder Summary Table**: Each folder's received/pending/net totals
- **Status Breakdown Doughnut Chart** (Chart.js)
- **Folder Comparison Bar Chart** (Received vs Pending per folder)
- **Top Pending Clients** list (sorted by amount owed)
- **Recent Transactions** table (last 10)

## Functional API Endpoints (Entry URIs)

### Auth
- `POST /api/auth/login` — body: `{ username, password }`
- `POST /api/auth/logout`
- `GET  /api/auth/check`
- `POST /api/auth/change-password` — body: `{ oldPassword, newPassword }`

### Folders
- `GET    /api/folders`
- `POST   /api/folders` — body: `{ name, icon, color }`
- `PUT    /api/folders/:id`
- `DELETE /api/folders/:id`

### Clients
- `GET    /api/folders/:id/clients`
- `POST   /api/clients` — body: `{ folder_id, name, phone, email, address, notes, opening_balance }`
- `GET    /api/clients/:id`
- `PUT    /api/clients/:id`
- `DELETE /api/clients/:id`
- `PUT    /api/clients/:id/columns` — body: `{ columns: [{ name, type, key }] }`

### Transactions (Ledger Rows)
- `GET    /api/clients/:id/transactions`
- `POST   /api/transactions` — body: `{ client_id, entry_date, bill_no, amount_received, amount_pending, status, description, custom_data }`
- `PUT    /api/transactions/:id`
- `DELETE /api/transactions/:id`

### Dashboard
- `GET /api/dashboard` — returns totals, per-folder, top pending, recent, status breakdown

All endpoints (except `auth/login` and `auth/check`) require an authenticated session cookie.

## Data Architecture

### Tables (Cloudflare D1 / SQLite)
- **users** — id, username, password_hash, created_at
- **sessions** — id, user_id, expires_at
- **folders** — id, name, icon, color, sort_order
- **clients** — id, folder_id, name, phone, email, address, notes, opening_balance
- **client_columns** — client_id, columns_json (custom column config per client)
- **transactions** — id, client_id, entry_date, bill_no, amount_received, amount_pending, status, description, custom_data

### Storage Service
- **Cloudflare D1** (globally-distributed SQLite) — `webapp-production` database
- All data is persistent and synced to Cloudflare's edge network

## User Guide

1. **Open the site** → https://uzair-crm.pages.dev
2. **Login** with `admin / admin123` → change password from the menu (top-right ⋮)
3. **Sidebar** shows Dashboard + all Folders
4. **Add a folder** — Click `+` next to "Folders" in sidebar, pick name/icon/color
5. **Add a client** — Click any folder → "Add Client" button, fill details
6. **Open a client** — Click the client name (sidebar) → ledger sheet opens
7. **Add ledger rows** — Click "Add Row" → edit cells inline (auto-saves)
8. **Customize columns** — Click "Columns" on the client page → add custom fields
9. **Track balance** — Net Balance Due card on top shows total outstanding
10. **Dashboard** — Click "Dashboard" in sidebar for overall company view

## Features Not Yet Implemented
- Multi-user support (currently single admin user)
- Export to PDF / Excel
- Search / filter inside ledger
- Date range filtering on dashboard
- File attachments per transaction
- Print invoice from a transaction
- Audit log of changes

## Recommended Next Steps
1. Add export-to-PDF for client statements
2. Add date-range filter to dashboard
3. Add inline search bar in sidebar for quick client lookup
4. Add multi-user / role-based access control
5. Add SMS/Email reminders for overdue payments

## Deployment

- **Platform**: Cloudflare Pages
- **Database**: Cloudflare D1 (`webapp-production`, ID `e20fe0c9-62dd-4e55-9c53-75a5c40c48cb`)
- **Status**: ✅ Active
- **Last Updated**: 2026-05-08

### Local Development
```bash
npm run build
npx wrangler d1 migrations apply webapp-production --local
pm2 start ecosystem.config.cjs
```

### Deploy
```bash
npm run build
npx wrangler d1 migrations apply webapp-production --remote
npx wrangler pages deploy dist --project-name uzair-crm --branch main
```
