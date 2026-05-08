# Two Star CRM

## Project Overview
- **Name**: Two Star CRM
- **Company**: Two Star Industries
- **Author**: Muhammad Uzair
- **Goal**: A complete, secure, password-protected CRM for managing clients, ledgers, inventory, and bills/invoices for Two Star Industries.
- **Tech Stack**: Hono (TypeScript) + Cloudflare Pages + Cloudflare D1 (SQLite) + TailwindCSS + Chart.js + FontAwesome

## URLs
- **Production**: https://two-star-crm.pages.dev
- **GitHub**: https://github.com/ChoudharyUzair/two-star-crm

## Default Login
- **Username**: `admin`
- **Password**: `admin123`
- ⚠️ **Change the password after first login** (sidebar menu → Change Password)

## Completed Features ✅

### 🌟 Branding & White-Labeling
- **Branding section** — fully customizable: company name, CRM display name, logo URL
- **Custom theme colors** — primary, accent, received, pending, running balance
- **Bill template settings** — company address, phone, footer text printed on invoices
- Live preview while editing
- All colors apply globally via CSS variables

### 🎨 New Color Scheme (per user request)
- **Received Amount**: 🔴 Red
- **Pending Amount**: 🔵 Blue
- **Running Balance**: 🟢 Green
- (All three are also customizable in the Branding section)

### 📒 Ledger / Khata Sheet
- All previous features (per-client ledger, auto-running total, custom columns)
- **NEW: Rename existing built-in columns** — click the pen icon on any column header (#, Date, Bill No, Amount Received, Amount Pending, Status, Description, Running Balance) or use the "Columns" modal
- Inline editing with auto-save (debounced)

### 📄 Bills / Invoices Section
- Create, edit, print, and delete bills
- 4-column line items: **Quantity / Product Name / Rate / Total**
- Header automatically shows: **Customer Name**, **Date**, **"Two Star Industries"**, **Logo on right side**
- Auto-fills phone & address when picking an existing client
- Linked to inventory — pick from product dropdown, auto-fills rate
- Auto-decrements inventory when a bill is saved (and restores on delete/edit)
- Calculations: Subtotal, Discount, Tax %, Total, Paid, Due
- **Print button** — clean, professional invoice ready for print/PDF (uses `window.print()`)

### 📦 Inventory Section
- Add, edit, delete products
- Fields: name, SKU, unit, rate, quantity, category, notes
- Inline editable (every field)
- Stock value auto-calculated
- Low-stock indicator (≤5 units)
- Search bar
- **Linked to Bill section** — products appear in bill creation dropdown

### 📊 Dashboard
- Top stats: Received, Pending, Net Balance, Clients/Folders, Bills count
- Per-folder summary table
- Status doughnut + folder comparison bar chart
- Top pending clients
- Recent transactions
- All queries run in **parallel** for speed

### ⚡ Speed Optimization
- All dashboard queries run in `Promise.all()` (parallelized)
- API GET response caching (cleared on writes)
- Debounced inputs (350ms) for inline editing
- `requestAnimationFrame` for chart rendering
- Lazy `<script defer>` loading for Chart.js & app.js
- `<link rel="preconnect">` for CDNs
- Boot loader to mask any delay
- Local in-place re-render (no full reload) on row updates

### 🎨 UI / UX Improvements
- Modern flat design with consistent spacing
- Sticky page headers
- Mobile-responsive sidebar with toggle button
- ESC key closes modals
- Toast animations
- Status badges with proper colors
- Smooth modal transitions (fadeIn / slideUp)
- Better empty states with icons

### 🔐 Authentication & Security
- SHA-256 hashed password
- Session-based auth (HttpOnly cookies, 7-day expiry)
- Logout & change password

### 📁 Folders, Clients, Custom Columns
- All previous features intact

## API Endpoints

### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET  /api/auth/check`
- `POST /api/auth/change-password`

### Branding
- `GET  /api/branding`
- `PUT  /api/branding`

### Folders
- `GET    /api/folders`
- `POST   /api/folders`
- `PUT    /api/folders/:id`
- `DELETE /api/folders/:id`

### Clients
- `GET    /api/folders/:id/clients`
- `GET    /api/clients` (all clients — used by bill module)
- `POST   /api/clients`
- `GET    /api/clients/:id`
- `PUT    /api/clients/:id`
- `DELETE /api/clients/:id`
- `PUT    /api/clients/:id/columns`        — custom columns
- `PUT    /api/clients/:id/column-labels`  — rename built-in columns

### Transactions
- `GET    /api/clients/:id/transactions`
- `POST   /api/transactions`
- `PUT    /api/transactions/:id`
- `DELETE /api/transactions/:id`

### Inventory
- `GET    /api/inventory`
- `POST   /api/inventory`
- `PUT    /api/inventory/:id`
- `DELETE /api/inventory/:id`

### Bills
- `GET    /api/bills`
- `GET    /api/bills/:id`
- `POST   /api/bills`
- `PUT    /api/bills/:id`
- `DELETE /api/bills/:id`

### Dashboard
- `GET    /api/dashboard`

## Data Architecture

### Tables (Cloudflare D1 / SQLite)
- **users** — admin credentials
- **sessions** — auth sessions
- **folders** — sidebar categories
- **clients** — client records per folder
- **client_columns** — per-client custom column config
- **column_labels** — per-client rename overrides for built-in columns
- **transactions** — ledger / khata rows
- **branding** — single-row company branding settings
- **inventory** — product catalog
- **bills** — invoice headers
- **bill_items** — invoice line items (linked to inventory)

### Storage
- **Cloudflare D1** (`webapp-production`)

## User Guide

1. Login with `admin / admin123` (change immediately)
2. **Branding** — open from sidebar to set company name, logo, and colors
3. **Inventory** — add all your products (linked into bills automatically)
4. **Bills** — click "New Bill", pick customer, add items (auto-fills from inventory), print
5. **Folders** — create categories (Customers / Suppliers / etc.)
6. **Clients** — open a folder → add clients
7. **Ledger** — open any client → track received/pending; rename columns by clicking the pen icon
8. **Dashboard** — overall view of money in / out, top pending clients

## Features Not Yet Implemented
- Multi-user support (currently single admin)
- Export to PDF/Excel (workaround: use browser print to PDF)
- Search in ledger
- Date-range filtering on dashboard
- File attachments per transaction

## Deployment
- **Platform**: Cloudflare Pages
- **Project**: `two-star-crm`
- **Database**: Cloudflare D1 (`webapp-production`)
- **Status**: ✅ Active
- **Last Updated**: 2026-05-08

### Build & Deploy
```bash
npm run build
npx wrangler d1 migrations apply webapp-production --remote
npx wrangler pages deploy dist --project-name two-star-crm --branch main
```
