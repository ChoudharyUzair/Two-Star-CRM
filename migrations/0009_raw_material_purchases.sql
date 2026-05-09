-- =====================================================
-- Two Star CRM v7 - Raw Material Purchases / Multi-Supplier
-- =====================================================
-- Tracks every batch of raw material received from a supplier.
-- One raw material can have many purchase rows (one per supplier / batch).
-- Each purchase tracks how much was paid to the supplier and the remaining
-- amount we still owe them. The balance is auto-pushed to the supplier's ledger.
-- =====================================================

CREATE TABLE IF NOT EXISTS raw_material_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_material_id INTEGER NOT NULL,
  supplier_id INTEGER,                  -- links to clients.id (supplier)
  supplier_name TEXT DEFAULT '',
  entry_date TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  rate REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,          -- quantity * rate
  paid_amount REAL DEFAULT 0,           -- how much we paid the supplier
  remaining_amount REAL DEFAULT 0,      -- total - paid (we owe the supplier)
  notes TEXT DEFAULT '',
  ledger_transaction_id INTEGER,        -- linked transaction in supplier's ledger
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE CASCADE,
  FOREIGN KEY (supplier_id) REFERENCES clients(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_rmp_raw ON raw_material_purchases(raw_material_id);
CREATE INDEX IF NOT EXISTS idx_rmp_supplier ON raw_material_purchases(supplier_id);

-- Mark transactions table to know which transaction came from a raw-material purchase
ALTER TABLE transactions ADD COLUMN rm_purchase_id INTEGER;
