-- =====================================================
-- Two Star CRM v8 - Components + Worker Production Tracking
-- =====================================================
-- NEW middle layer between Raw Material and Final Product:
--   Raw Material  ->  COMPONENTS  ->  Final Product
--
-- A "component" is an intermediate part that workers make from raw material,
-- e.g. "Trolley Basket Rings", "Bottom Jaali", "Assembled Basket".
-- Workers are paid PER PIECE for each component they produce.
--
-- When a worker reports production (e.g. "today I made 100 rings"), we:
--   1. Add those 100 rings to the component's current stock.
--   2. Optionally deduct raw material used (recipe-based or manual).
--   3. Optionally record scrap/wastage of raw material.
--   4. Record a per-piece payout line for that worker (item × qty × rate)
--      so it shows in the worker profile + weekly (Thu-Thu) total.
-- =====================================================

-- ---------- COMPONENTS (intermediate parts) ----------
CREATE TABLE IF NOT EXISTS components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                 -- e.g. "Trolley Basket Rings"
  unit TEXT DEFAULT 'pcs',
  category TEXT DEFAULT '',           -- e.g. "Trolley", "Sink Rack"
  quantity REAL DEFAULT 0,            -- current available stock of this component
  default_rate REAL DEFAULT 0,        -- default per-piece worker rate (PKR/piece)
  notes TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_components_name ON components(name);

-- ---------- COMPONENT RECIPE (raw material per 1 component) ----------
-- How much raw material is consumed to make ONE unit of this component.
CREATE TABLE IF NOT EXISTS component_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id INTEGER NOT NULL,
  raw_material_id INTEGER NOT NULL,
  quantity_required REAL DEFAULT 0,   -- raw material used per 1 component
  unit TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE,
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ci_component ON component_ingredients(component_id);
CREATE INDEX IF NOT EXISTS idx_ci_raw ON component_ingredients(raw_material_id);

-- ---------- PRODUCTION LOGS (worker daily production) ----------
-- Every time a worker reports how many components they made.
CREATE TABLE IF NOT EXISTS production_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,            -- the day production happened (YYYY-MM-DD)
  employee_id INTEGER,                 -- which worker (links employees.id)
  employee_name TEXT DEFAULT '',       -- snapshot of worker name
  component_id INTEGER,                -- which component was produced
  component_name TEXT DEFAULT '',      -- snapshot of component name
  quantity REAL DEFAULT 0,             -- how many pieces produced
  rate REAL DEFAULT 0,                 -- per-piece pay rate at time of entry
  payout REAL DEFAULT 0,               -- quantity * rate (worker earning for this log)
  raw_used REAL DEFAULT 0,             -- total raw material consumed (informational)
  scrap_qty REAL DEFAULT 0,            -- raw material wasted / scrapped
  deducted_raw INTEGER DEFAULT 0,      -- 1 if raw material stock was auto-deducted
  emp_tx_id INTEGER,                   -- linked employee_transactions row (per-piece payout)
  notes TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_plog_emp ON production_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_plog_comp ON production_logs(component_id);
CREATE INDEX IF NOT EXISTS idx_plog_date ON production_logs(entry_date);

-- ---------- RAW MATERIAL CONSUMPTION DETAIL ----------
-- For multi-ingredient components, store per-raw-material usage of a production log.
CREATE TABLE IF NOT EXISTS production_raw_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  production_log_id INTEGER NOT NULL,
  raw_material_id INTEGER,
  raw_name TEXT DEFAULT '',
  qty_used REAL DEFAULT 0,
  scrap_qty REAL DEFAULT 0,
  FOREIGN KEY (production_log_id) REFERENCES production_logs(id) ON DELETE CASCADE,
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pru_log ON production_raw_usage(production_log_id);

-- ---------- LINK final product -> components (optional second layer) ----------
-- A final product can now be assembled from components (not just raw material).
CREATE TABLE IF NOT EXISTS product_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  component_id INTEGER NOT NULL,
  quantity_required REAL DEFAULT 0,    -- components needed per 1 finished product
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pc_product ON product_components(product_id);
CREATE INDEX IF NOT EXISTS idx_pc_component ON product_components(component_id);

-- Mark which production_log created an employee_transaction (reverse link)
ALTER TABLE employee_transactions ADD COLUMN production_log_id INTEGER;
