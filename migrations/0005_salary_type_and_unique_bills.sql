-- =====================================================
-- Two Star CRM v3 - Employee salary type, items, unique bills
-- =====================================================

-- Add salary_type column to employees: 'monthly' (default) or 'per_piece'
ALTER TABLE employees ADD COLUMN salary_type TEXT DEFAULT 'monthly';

-- Per-piece items for employees (each row: an item the employee makes + rate)
CREATE TABLE IF NOT EXISTS employee_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  rate REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_emp_items_emp ON employee_items(employee_id);

-- Add piece-work fields to employee_transactions for type='per_piece'
ALTER TABLE employee_transactions ADD COLUMN entry_type TEXT DEFAULT 'cash';   -- 'cash' or 'per_piece'
ALTER TABLE employee_transactions ADD COLUMN item_id INTEGER;
ALTER TABLE employee_transactions ADD COLUMN item_name TEXT DEFAULT '';
ALTER TABLE employee_transactions ADD COLUMN quantity INTEGER DEFAULT 0;
ALTER TABLE employee_transactions ADD COLUMN rate REAL DEFAULT 0;

-- Unique index on bill_no across bills (case-insensitive trim handled at app level)
-- We keep this as a regular index since we need to enforce in app for both bills and transactions.
CREATE INDEX IF NOT EXISTS idx_bills_bill_no ON bills(bill_no);
CREATE INDEX IF NOT EXISTS idx_tx_bill_no ON transactions(bill_no);

-- Remove the default 'Expenses' folder if it exists and is empty (id=3)
-- We use the dedicated Side Expenses module instead.
DELETE FROM folders WHERE id = 3 AND name = 'Expenses' 
  AND NOT EXISTS (SELECT 1 FROM clients WHERE folder_id = 3);
