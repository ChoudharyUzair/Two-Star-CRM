-- =====================================================
-- Two Star CRM v5 - Manufacturing / Products with Recipes
-- =====================================================
-- "Products" here means manufactured products (e.g. "Rack")
-- that are made from raw materials (e.g. A=100kg, B=200ft, C=200kg).
-- Each product has a recipe (product_ingredients) describing
-- how much of each raw material is needed to produce ONE unit
-- of the finished product. Using the current raw_materials.quantity,
-- we can compute how many finished products can be built right now.
-- =====================================================

-- Manufactured products (recipe header)
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT DEFAULT 'pcs',          -- unit of the finished product (pcs, set, etc.)
  category TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  sale_rate REAL DEFAULT 0,         -- optional selling price for one finished unit
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

-- Recipe items: which raw material and how much is needed per 1 unit of product
CREATE TABLE IF NOT EXISTS product_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  raw_material_id INTEGER NOT NULL,
  quantity_required REAL DEFAULT 0, -- amount of raw material used to make 1 finished product
  unit TEXT DEFAULT '',             -- snapshot of raw material's unit (display only)
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pi_product ON product_ingredients(product_id);
CREATE INDEX IF NOT EXISTS idx_pi_raw ON product_ingredients(raw_material_id);
