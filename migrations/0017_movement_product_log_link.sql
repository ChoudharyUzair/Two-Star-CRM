-- =====================================================
-- Two Star CRM v12 - Link inventory movements to a pack production log
-- =====================================================
-- Feature #1: When a product is PACKED from Products Manufacturing, the packed
-- units are added to Inventory. We now also record an inventory_movements row
-- of type 'production' so it shows in Inventory > Recent Entries (how many were
-- added, on what date, and by which worker). product_log_id links that movement
-- back to the product_production_logs row so deleting the pack log can also
-- remove its "Recent Entries" record.
-- =====================================================

ALTER TABLE inventory_movements ADD COLUMN product_log_id INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_inv_mov_product_log ON inventory_movements(product_log_id);
