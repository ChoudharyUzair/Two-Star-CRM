-- =====================================================
-- Two Star CRM v13 — Production stock/salary calculation fixes
-- =====================================================
-- 1) production_logs.stock_added: is entry ne component stock me ASAL me
--    kitne GOOD pieces add kiye (quantity - scrap). Purani entries me scrap
--    bhi stock me add ho jata tha, is liye purani rows ke liye stock_added =
--    quantity backfill kiya gaya hai — taake edit/delete ka reversal purani
--    aur nayi entries dono ke liye sahi rahe.
ALTER TABLE production_logs ADD COLUMN stock_added REAL;
UPDATE production_logs SET stock_added = quantity WHERE stock_added IS NULL;

-- 2) product_recipe_usage: Assemble stage par use hue components / raw
--    materials ka SNAPSHOT. Pehle assemble ka koi usage record nahi banta
--    tha — edit/delete reversal MAUJOUDA recipe se hota tha, to agar recipe
--    badal jaye to stock ghalat reverse hota tha. Ab har assemble entry
--    apna usage snapshot rakhegi; purani entries (baghair snapshot) ke liye
--    purana tareeqa (current recipe) fallback rahega.
CREATE TABLE IF NOT EXISTS product_recipe_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_log_id INTEGER NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'raw',   -- 'component' | 'raw'
  source_id INTEGER,
  item_name TEXT DEFAULT '',
  qty_used REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_log_id) REFERENCES product_production_logs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pru_log ON product_recipe_usage(product_log_id);
