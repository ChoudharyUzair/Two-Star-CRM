-- =====================================================
-- Two Star CRM v2 - Sections, Raw Materials, Employees
-- =====================================================

-- Add section_type to folders so they act as sections
-- type: 'clients' (default ledger), 'custom' (custom data), 'raw_material', 'employees', 'side_expenses'
ALTER TABLE folders ADD COLUMN section_type TEXT DEFAULT 'clients';
ALTER TABLE folders ADD COLUMN is_system INTEGER DEFAULT 0;

-- Allow logo to be stored as data URL (large field) — already TEXT in branding
-- No schema change needed; just usage

-- =====================================================
-- RAW MATERIALS
-- =====================================================
CREATE TABLE IF NOT EXISTS raw_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT DEFAULT 'pcs',
  quantity REAL DEFAULT 0,
  rate REAL DEFAULT 0,
  total_value REAL DEFAULT 0,
  supplier_id INTEGER,            -- links to clients.id where folder is supplier
  supplier_name TEXT DEFAULT '',
  category TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES clients(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_raw_supplier ON raw_materials(supplier_id);

-- =====================================================
-- EMPLOYEES
-- =====================================================
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  cnic TEXT DEFAULT '',
  address TEXT DEFAULT '',
  designation TEXT DEFAULT '',
  joining_date TEXT DEFAULT '',
  monthly_salary REAL DEFAULT 0,
  notes TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Salary transactions: paid salary, advance, deduction, bonus
CREATE TABLE IF NOT EXISTS employee_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  entry_date TEXT NOT NULL,
  type TEXT DEFAULT 'salary',     -- salary | advance | bonus | deduction
  amount REAL DEFAULT 0,
  description TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_emp_tx_emp ON employee_transactions(employee_id);

-- =====================================================
-- SIDE EXPENSES (rename of generic expenses concept)
-- =====================================================
CREATE TABLE IF NOT EXISTS side_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  category TEXT DEFAULT '',
  description TEXT DEFAULT '',
  amount REAL DEFAULT 0,
  paid_to TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- CUSTOM SECTIONS (user-defined data tables)
-- =====================================================
CREATE TABLE IF NOT EXISTS custom_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT DEFAULT 'fa-folder',
  color TEXT DEFAULT '#3b82f6',
  columns_json TEXT NOT NULL DEFAULT '[]',  -- [{key, name, type}]
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS custom_section_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (section_id) REFERENCES custom_sections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_csr_section ON custom_section_rows(section_id);

-- =====================================================
-- LINK BILL <-> CLIENT LEDGER TRANSACTION
-- bills already have client_id; we need to track which transaction was auto-created.
-- =====================================================
ALTER TABLE bills ADD COLUMN ledger_transaction_id INTEGER;
ALTER TABLE transactions ADD COLUMN bill_id INTEGER;
ALTER TABLE transactions ADD COLUMN auto_generated INTEGER DEFAULT 0;

-- Mark default folders with section_type
UPDATE folders SET section_type = 'clients' WHERE section_type IS NULL OR section_type = '';
UPDATE folders SET section_type = 'clients' WHERE id = 1;  -- Customers
UPDATE folders SET section_type = 'clients' WHERE id = 2;  -- Suppliers
-- Old "Expenses" folder (id=3) we'll keep as clients-style ledger but the new dedicated section is side_expenses.
