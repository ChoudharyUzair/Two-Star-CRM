-- =====================================================
-- Two Star CRM v9 - Products Manufacturing: Worker Stage Production
-- =====================================================
-- Real-world flow the user described:
--   Raw Material -> COMPONENTS -> ASSEMBLE -> PAINT -> PACK (final finished product)
--
--   1. ASSEMBLE : workers join all the required components into a (non-painted) product.
--   2. PAINT    : the assembled (raw/un-painted) product is painted by workers.
--   3. PACK     : packers add "set items" (tyres / rolling 460 / tiers etc.) and
--                 box the painted product into the FINAL finished product.
--
-- Each stage is done by a worker who is paid PER PIECE (just like Components
-- Production). Every stage entry:
--   - moves stock from the previous stage to the next stage,
--   - records a per-piece payout line for that worker (employee_transactions),
--     so it shows in the worker profile + weekly (Thu->Wed) total,
--   - at PACK stage, consumes the product's "set items" (extra parts) from
--     either component stock or raw-material stock.
-- =====================================================

-- ---------- Stage stock counters on each product ----------
-- assembled_qty : painted nahi hue, sirf assemble hue (non-colored)
-- painted_qty   : paint ho chuke, pack hone ka intezaar
-- packed_qty    : final finished product (packed, ready to sell)
ALTER TABLE products ADD COLUMN assembled_qty REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN painted_qty REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN packed_qty REAL DEFAULT 0;

-- Default per-piece worker rate for each stage (optional convenience).
ALTER TABLE products ADD COLUMN assemble_rate REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN paint_rate REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN pack_rate REAL DEFAULT 0;

-- ---------- PRODUCT SET ITEMS (extra parts added at PACK stage) ----------
-- e.g. for a finished trolley/rack: tyres, rolling 460, tiers etc.
-- A set item can come from either the COMPONENTS stock or RAW MATERIAL stock.
CREATE TABLE IF NOT EXISTS product_set_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  source_type TEXT DEFAULT 'component',   -- 'component' | 'raw' | 'manual'
  source_id INTEGER,                      -- components.id OR raw_materials.id (NULL for manual)
  item_name TEXT DEFAULT '',              -- snapshot name (e.g. "Tyre", "Rolling 460")
  unit TEXT DEFAULT 'pcs',
  quantity_required REAL DEFAULT 0,       -- how many per 1 finished (packed) product
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_psi_product ON product_set_items(product_id);

-- ---------- PRODUCT PRODUCTION LOGS (worker stage production) ----------
-- One row each time a worker reports stage work on a product.
CREATE TABLE IF NOT EXISTS product_production_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,               -- YYYY-MM-DD
  stage TEXT NOT NULL,                     -- 'assemble' | 'paint' | 'pack'
  product_id INTEGER,
  product_name TEXT DEFAULT '',            -- snapshot
  employee_id INTEGER,
  employee_name TEXT DEFAULT '',           -- snapshot
  quantity REAL DEFAULT 0,                 -- pieces processed at this stage
  rate REAL DEFAULT 0,                     -- per-piece pay rate
  payout REAL DEFAULT 0,                   -- quantity * rate
  deducted INTEGER DEFAULT 1,              -- 1 if previous-stage stock / set items were deducted
  emp_tx_id INTEGER,                       -- linked employee_transactions row (per-piece payout)
  notes TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pplog_product ON product_production_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_pplog_emp ON product_production_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_pplog_date ON product_production_logs(entry_date);
CREATE INDEX IF NOT EXISTS idx_pplog_stage ON product_production_logs(stage);

-- ---------- SET ITEM USAGE DETAIL (for reversible pack logs) ----------
CREATE TABLE IF NOT EXISTS product_set_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_log_id INTEGER NOT NULL,
  source_type TEXT DEFAULT 'component',
  source_id INTEGER,
  item_name TEXT DEFAULT '',
  qty_used REAL DEFAULT 0,
  FOREIGN KEY (product_log_id) REFERENCES product_production_logs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_psu_log ON product_set_usage(product_log_id);

-- Reverse link: which product_production_log created an employee_transaction.
ALTER TABLE employee_transactions ADD COLUMN product_log_id INTEGER;
