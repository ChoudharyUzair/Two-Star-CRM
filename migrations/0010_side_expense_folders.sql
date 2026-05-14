-- =====================================================
-- Two Star CRM v8 - Side Expense Folders / Categories
-- =====================================================
-- Adds a folder/ledger concept for side expenses so users can
-- group expenses (e.g. "Utility Bills" folder containing
-- gas, electricity, water bills) for better organization.
-- =====================================================

CREATE TABLE IF NOT EXISTS side_expense_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT DEFAULT 'fa-folder',
  color TEXT DEFAULT '#ef4444',
  description TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Link existing side_expenses to a folder (NULL = uncategorized)
ALTER TABLE side_expenses ADD COLUMN folder_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_side_exp_folder ON side_expenses(folder_id);

-- Seed a few sensible default folders
INSERT INTO side_expense_folders (name, icon, color, description, sort_order) VALUES
  ('Utility Bills', 'fa-bolt', '#f59e0b', 'Gas, electricity, water, internet bills', 1),
  ('Workers Food', 'fa-utensils', '#10b981', 'Daily food / tea / snacks for workers', 2),
  ('Travel & Transport', 'fa-truck', '#3b82f6', 'Fuel, transport, delivery charges', 3),
  ('Repairs & Maintenance', 'fa-tools', '#8b5cf6', 'Machine / building repairs and maintenance', 4),
  ('Miscellaneous', 'fa-receipt', '#6b7280', 'Other uncategorized expenses', 99);
