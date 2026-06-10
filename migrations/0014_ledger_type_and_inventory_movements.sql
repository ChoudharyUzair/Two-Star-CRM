-- =====================================================
-- Two Star CRM v10 - Ledger Type + Inventory Movements
-- =====================================================
-- 1) folders.ledger_type:
--      'customer' = these are people WE RECEIVE payment from
--                   (Two Star customers, Wire customers). Their bills ADD to profit.
--      'supplier' = these are people WE PAY (raw material suppliers).
--                   Their bills SUBTRACT from gross profit / are a cost.
--    The user chooses this when creating a ledger/section so the system knows
--    whether money flows IN (customer) or OUT (supplier).
--
-- 2) inventory_movements:
--      Records every stock change for an inventory product:
--        - 'sale'   : items sold to a customer (stock goes DOWN)
--        - 'return' : items returned by a customer (stock goes UP)
--        - 'adjust' : manual stock correction (in or out)
--      This powers the "Recent Entries" section in Inventory so the user can
--      see, day by day, how many items were sold / returned / which item.
-- =====================================================

-- 1. Ledger direction on folders/sections
ALTER TABLE folders ADD COLUMN ledger_type TEXT DEFAULT 'customer';  -- 'customer' | 'supplier'

-- Backfill sensible defaults based on existing names / section_type
UPDATE folders SET ledger_type = 'supplier'
  WHERE LOWER(name) LIKE '%supplier%' OR section_type = 'suppliers';
UPDATE folders SET ledger_type = 'customer'
  WHERE ledger_type IS NULL OR ledger_type = '';

-- 2. Inventory movement log (sold / returned / adjusted)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL,
  product_name TEXT DEFAULT '',          -- snapshot of product name
  entry_date TEXT NOT NULL,              -- YYYY-MM-DD when it happened
  type TEXT NOT NULL DEFAULT 'sale',     -- 'sale' | 'return' | 'adjust'
  quantity REAL DEFAULT 0,               -- always positive; type decides direction
  rate REAL DEFAULT 0,                   -- per-unit rate at the time (optional)
  total REAL DEFAULT 0,                  -- quantity * rate (optional)
  customer_name TEXT DEFAULT '',         -- who bought / returned (optional)
  notes TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inv_mov_item ON inventory_movements(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_date ON inventory_movements(entry_date);
CREATE INDEX IF NOT EXISTS idx_inv_mov_type ON inventory_movements(type);
