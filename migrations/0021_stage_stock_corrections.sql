-- =====================================================
-- Two Star CRM - Products Manufacturing: Stage Stock Corrections (Task 3)
-- =====================================================
-- Sometimes the Assembled (un-painted) / Painted / Packed (final) stage stock
-- counters drift from the physical count (miscount, spoilage, manual fix).
-- This table records every manual correction so the user can:
--   • directly EDIT a stage's current stock to the correct value, and
--   • see a "Recent Correction Log" of who/what/when changed.
--
-- Each row stores the OLD value, the NEW value and the delta (new - old),
-- plus an optional reason. The actual products.<stage>_qty column is updated
-- to `new_qty` at the same time the log row is inserted.
-- =====================================================

CREATE TABLE IF NOT EXISTS stage_stock_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,                 -- YYYY-MM-DD
  product_id INTEGER,
  product_name TEXT DEFAULT '',             -- snapshot
  stage TEXT NOT NULL,                       -- 'assembled' | 'painted' | 'packed'
  old_qty REAL DEFAULT 0,
  new_qty REAL DEFAULT 0,
  delta REAL DEFAULT 0,                      -- new_qty - old_qty
  reason TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ssc_product ON stage_stock_corrections(product_id);
CREATE INDEX IF NOT EXISTS idx_ssc_date ON stage_stock_corrections(entry_date);
CREATE INDEX IF NOT EXISTS idx_ssc_stage ON stage_stock_corrections(stage);
