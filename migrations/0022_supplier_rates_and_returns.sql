-- =====================================================
-- Two Star CRM v13 — Supplier rate list + Supplier return
-- =====================================================
-- Addresses the user's requests #4 and #5 (and supports #3):
--
-- #4) SUPPLIER PRODUCT RATE LIST
--     Just like a customer can have a per-product SELLING rate, a supplier
--     can have a per-item BUYING rate — the rate WE pay that supplier for a
--     given item. This list lives in the supplier's profile and can be
--     edited any time.
--
-- #5) RESTOCK USES THE SUPPLIER BUY RATE (not the product selling rate)
--     The same supplier_product_rates table powers BOTH:
--       • Inventory restock  (item_type = 'inventory', item_id = inventory.id)
--       • Raw material restock (item_type = 'raw',       item_id = raw_materials.id)
--     So when we pick a supplier + item to restock, the rate auto-fills from
--     what THAT supplier charges — never the customer selling rate.
--     One shared table = no duplication.
--
-- SUPPLIER RETURN (request #3)
--     inventory_movements already has a `type` column. We add 'supplier_return'
--     as a valid type (handled in code). No schema change needed for that beyond
--     documenting it; supplier_id already exists (migration 0016). A supplier
--     return DECREASES our stock and posts a DEBIT (money back / reduces what we
--     owe) on the supplier's ledger.
-- =====================================================

CREATE TABLE IF NOT EXISTS supplier_product_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,            -- the supplier client (clients.id)
  item_type TEXT NOT NULL DEFAULT 'inventory', -- 'inventory' | 'raw'
  item_id INTEGER NOT NULL,                -- inventory.id OR raw_materials.id
  item_name TEXT DEFAULT '',               -- snapshot for display convenience
  rate REAL DEFAULT 0,                     -- the BUY rate we pay this supplier
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(supplier_id, item_type, item_id),
  FOREIGN KEY (supplier_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spr_supplier ON supplier_product_rates(supplier_id);
CREATE INDEX IF NOT EXISTS idx_spr_item ON supplier_product_rates(item_type, item_id);
