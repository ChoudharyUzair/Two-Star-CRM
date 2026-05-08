# Two Star CRM

## Project Overview
- **Name**: Two Star CRM
- **Company**: Two Star Industries
- **Author**: Muhammad Uzair
- **Goal**: A complete, secure, password-protected CRM for managing clients, ledgers, inventory, bills, raw materials, employees, side expenses, and unlimited custom sections.
- **Tech Stack**: Hono (TypeScript) + Cloudflare Pages + Cloudflare D1 (SQLite) + TailwindCSS + Chart.js + FontAwesome

## URLs
- **Production**: https://two-star-crm.pages.dev
- **GitHub**: https://github.com/ChoudharyUzair/Two-Star-CRM

## Default Login
- **Username**: `admin`
- **Password**: `admin123`
- ⚠️ **Change the password after first login** (sidebar menu → Change Password)

## Completed Features ✅

### 🌟 Branding & White-Labeling
- Customizable: company name, CRM display name, logo URL
- Custom theme colors (primary, accent, received, pending, running balance)
- Bill template settings (address, phone, footer)

### 📒 Ledger / Khata Sheet (Updated)
- **Column order: # | Date | Bill No | Amount Pending (col 4) | Amount Received (col 5) | Status | Description | Custom Cols | Running Total | Action**
- Per-client running balance, custom columns, rename built-in columns
- Bill No validation: must contain at least 3 digits and be globally unique across bills + ledger
- All quantity/amount inputs are **integer-only** (step="1", whole numbers only)

### 📄 Bills / Invoices Section
- Create, edit, print, delete bills (auto-syncs to client ledger)
- Items: Quantity / Product Name / Rate / Total
- Auto-decrements inventory; restores on delete
- **Bill No** must be 3+ digits and unique (validated server-side); auto-generated if blank
- Subtotal, Discount, Tax, Total, Paid, Due — all whole-number inputs

### 📦 Inventory Section
- Add/edit/delete products (whole-number qty & rate)
- Linked into Bill creation dropdown
- Low-stock indicator

### 🏗️ Raw Material Section (NEW — Bill/Inventory style)
- Track raw materials with name, unit, qty, rate, total value, supplier link
- Whole-number inputs

### 👷 Employees Section (Major Update)
- Add/edit/delete employees with full profile (phone, CNIC, address, designation, joining date)
- **NEW: Salary Type Dropdown**
  - **Monthly Salary** — simple monthly amount field
  - **Per Pcs** (per-piece) — define multiple items, each with its own rate
- **NEW: Per-piece Ledger Entries**
  - When adding an employee transaction (employee with `Per Pcs` salary type), the form shows:
    - Dropdown of all the employee's items
    - Auto-fills rate when item picked
    - Quantity box (whole numbers)
    - Live calculated **Total = Rate × Quantity**
- Track salary, advance, bonus, deduction transactions
- Active/Inactive toggle

### 💰 Side Expenses Section
- Date, category, description, amount, paid_to, notes
- (Replaces the older inline "Expenses" folder; default Expenses folder removed.)

### 🗂️ Custom Sections (Unlimited)
- Define your own sections with custom columns (text/number/date)
- Rows are stored as JSON, fully editable

### 📊 Dashboard
- Stats: Received, Pending, Net Balance, Clients/Folders, Bills, Employees, Side Expenses, Raw Material totals
- Per-folder summary, top pending, recent transactions, status breakdown
- All queries parallelized with `Promise.all()`

### 🔐 Authentication & Security
- SHA-256 hashed passwords, HttpOnly cookies, 7-day session expiry
- Change password from sidebar

### ⚡ Speed Optimization
- Parallel D1 queries, GET caching, debounced inputs, RAF chart rendering, deferred scripts

## API Endpoints

### Auth
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/check`, `POST /api/auth/change-password`

### Branding
- `GET /api/branding`, `PUT /api/branding`

### Folders / Sections (Customers, Suppliers, …)
- `GET /api/folders`, `POST /api/folders`, `PUT /api/folders/:id`, `DELETE /api/folders/:id`

### Clients
- `GET /api/folders/:id/clients`
- `GET /api/clients`, `POST /api/clients`
- `GET /api/clients/:id`, `PUT /api/clients/:id`, `DELETE /api/clients/:id`
- `PUT /api/clients/:id/columns`, `PUT /api/clients/:id/column-labels`

### Transactions (Ledger)
- `GET /api/clients/:id/transactions`
- `POST /api/transactions`, `PUT /api/transactions/:id`, `DELETE /api/transactions/:id`

### Bill No Validation
- `GET /api/bill-no/check?bill_no=…&exclude_bill=…&exclude_tx=…` → `{valid, error}`

### Inventory
- `GET /api/inventory`, `POST /api/inventory`, `PUT /api/inventory/:id`, `DELETE /api/inventory/:id`

### Bills
- `GET /api/bills`, `GET /api/bills/:id`, `POST /api/bills`, `PUT /api/bills/:id`, `DELETE /api/bills/:id`

### Raw Materials
- `GET /api/raw-materials`, `POST /api/raw-materials`, `PUT /api/raw-materials/:id`, `DELETE /api/raw-materials/:id`

### Employees & Employee Transactions
- `GET /api/employees`, `GET /api/employees/:id` (returns employee + transactions + items)
- `POST /api/employees`, `PUT /api/employees/:id`, `DELETE /api/employees/:id`
  - Body includes `salary_type` (`monthly` | `per_piece`) and `items[]` for per-piece
- `POST /api/employee-transactions`, `PUT /api/employee-transactions/:id`, `DELETE /api/employee-transactions/:id`
  - Body includes `entry_type` (`cash` | `per_piece`), `item_id`, `item_name`, `quantity`, `rate`
  - Server auto-computes `amount = quantity × rate` when entry_type=`per_piece`

### Side Expenses
- `GET /api/side-expenses`, `POST /api/side-expenses`, `PUT /api/side-expenses/:id`, `DELETE /api/side-expenses/:id`

### Custom Sections
- `GET /api/custom-sections`, `GET /api/custom-sections/:id`
- `POST /api/custom-sections`, `PUT /api/custom-sections/:id`, `DELETE /api/custom-sections/:id`
- `POST /api/custom-sections/:id/rows`, `PUT /api/custom-sections/rows/:rowId`, `DELETE /api/custom-sections/rows/:rowId`

### Dashboard
- `GET /api/dashboard`

## Data Architecture

### Tables (Cloudflare D1 / SQLite)
- **users**, **sessions**, **branding**
- **folders** (`section_type`), **clients**, **client_columns**, **column_labels**
- **transactions** (with `bill_id`, `auto_generated`)
- **inventory**
- **bills**, **bill_items** (with `ledger_transaction_id`)
- **raw_materials**
- **employees** (with `salary_type`)
- **employee_items** (per-piece rate book) — NEW
- **employee_transactions** (with `entry_type`, `item_id`, `quantity`, `rate`) — extended
- **side_expenses**
- **custom_sections**, **custom_section_rows**

### Storage
- **Cloudflare D1** (`webapp-production`)

## User Guide
1. Login with `admin / admin123` (change immediately)
2. **Branding** — set company name, logo, colors
3. **Inventory** — add products (used in bills)
4. **Raw Material** — track input stocks
5. **Bills** — create invoices; bill numbers must be 3+ digits and unique
6. **Sections** (Customers/Suppliers) — manage clients & per-client ledgers
7. **Employees** — pick **Monthly Salary** or **Per Pcs**; for Per Pcs, define items & rates, then log per-piece work in the employee ledger
8. **Side Expenses** — log miscellaneous costs
9. **Custom Sections** — create your own data tables
10. **Dashboard** — see overall summary

## Recent Changes (2026-05-08)
- Renamed repository to **Two Star CRM** (GitHub: `ChoudharyUzair/Two-Star-CRM`)
- Pushed under author **Muhammad Uzair**
- Removed default **Expenses** folder (use Side Expenses module instead)
- Sections (`Customers` / `Suppliers`) shown in sidebar; Bill / Inventory / Raw Material / Employees / Side Expenses behave as full top-level modules
- Ledger column order updated → Amount Pending = column 4, Amount Received = column 5
- Employees now support **Monthly Salary** vs **Per Pcs** salary types with per-item rates and live qty×rate computation in ledger entries
- All quantity & amount inputs locked to whole-number increments (`step="1"`)
- Bill numbers must be 3+ digits, validated and **globally unique** across bills + transactions

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
