-- Migration 0016: Add supplier_id to inventory_movements for restock cost tracking
-- When a restock has a supplier, the cost should be deducted from gross profit.
-- supplier_id = NULL means it's a self-manufactured product (no cost deduction).
-- supplier_id != NULL means it was bought from a supplier (deduct from profit).

ALTER TABLE inventory_movements ADD COLUMN supplier_id INTEGER DEFAULT NULL REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inv_mov_supplier ON inventory_movements(supplier_id);
