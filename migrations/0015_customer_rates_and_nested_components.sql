-- =====================================================
-- Two Star CRM v11 - Customer Rates + Nested Components
-- =====================================================
-- Addresses user requests #3 and #4:
--
-- #3) PER-CUSTOMER PRODUCT SELLING RATE
--     Manufacturing rate is the same for everyone, but the SELLING rate
--     can differ from customer to customer. We let the user set, once,
--     "for THIS customer, THIS product is sold at THIS rate". When a bill
--     is made for that customer and that product is added, the saved rate
--     auto-fills. (inventory.rate stays as the default/fallback rate.)
--
-- #4) COMPONENTS MADE FROM OTHER COMPONENTS (nested BOM)
--     Until now a component's recipe could only consume RAW MATERIALS.
--     Some components are assembled from OTHER components too. We add a
--     component_subcomponents table so a component can require child
--     components. Producing the parent now deducts both raw materials and
--     child-component stock.
-- =====================================================

-- ---------- #3: Per-customer product selling rate ----------
CREATE TABLE IF NOT EXISTS customer_product_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,            -- the customer (clients.id)
  inventory_id INTEGER NOT NULL,         -- the product being priced (inventory.id)
  rate REAL DEFAULT 0,                   -- the special selling rate for this customer
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(client_id, inventory_id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cpr_client ON customer_product_rates(client_id);
CREATE INDEX IF NOT EXISTS idx_cpr_inventory ON customer_product_rates(inventory_id);

-- ---------- #4: Nested components (component made from components) ----------
-- How many of a CHILD component are consumed to make ONE PARENT component.
CREATE TABLE IF NOT EXISTS component_subcomponents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id INTEGER NOT NULL,         -- the PARENT component being produced
  child_component_id INTEGER NOT NULL,   -- the CHILD component it consumes
  quantity_required REAL DEFAULT 0,      -- how many child per 1 parent
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE,
  FOREIGN KEY (child_component_id) REFERENCES components(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_csc_parent ON component_subcomponents(component_id);
CREATE INDEX IF NOT EXISTS idx_csc_child ON component_subcomponents(child_component_id);

-- Track child-component consumption inside a production log so it can be
-- reversed when the production log is edited/deleted.
ALTER TABLE production_raw_usage ADD COLUMN child_component_id INTEGER;
