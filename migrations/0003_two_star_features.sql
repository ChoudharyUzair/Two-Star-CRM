-- Two Star CRM - Additional features migration

-- Branding settings (single row, key-value style)
CREATE TABLE IF NOT EXISTS branding (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  company_name TEXT DEFAULT 'Two Star Industries',
  crm_name TEXT DEFAULT 'Two Star CRM',
  logo_url TEXT DEFAULT '',
  primary_color TEXT DEFAULT '#3b82f6',
  accent_color TEXT DEFAULT '#8b5cf6',
  received_color TEXT DEFAULT '#ef4444',
  pending_color TEXT DEFAULT '#3b82f6',
  running_color TEXT DEFAULT '#10b981',
  bill_address TEXT DEFAULT '',
  bill_phone TEXT DEFAULT '',
  bill_footer TEXT DEFAULT 'Thank you for your business!',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default branding row (id=1) if not present
INSERT OR IGNORE INTO branding (id, company_name, crm_name) VALUES (1, 'Two Star Industries', 'Two Star CRM');

-- Column label overrides (rename existing built-in columns) - per client
CREATE TABLE IF NOT EXISTS column_labels (
  client_id INTEGER PRIMARY KEY,
  labels_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- Inventory: products
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sku TEXT,
  unit TEXT DEFAULT 'pcs',
  rate REAL DEFAULT 0,
  quantity REAL DEFAULT 0,
  category TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);

-- Bills (header)
CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_no TEXT NOT NULL,
  bill_date TEXT NOT NULL,
  client_id INTEGER,
  customer_name TEXT NOT NULL,
  customer_phone TEXT DEFAULT '',
  customer_address TEXT DEFAULT '',
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  total REAL DEFAULT 0,
  paid REAL DEFAULT 0,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'Unpaid',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bills_client ON bills(client_id);
CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(bill_date);

-- Bill items (line items, 4 columns: qty, product, rate, total)
CREATE TABLE IF NOT EXISTS bill_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  rate REAL DEFAULT 0,
  total REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES inventory(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id);
