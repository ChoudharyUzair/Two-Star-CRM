-- =====================================================
-- Two Star CRM v12 — Stock calculation fixes + KG→Pieces conversion
-- =====================================================
-- 1) Bill-linked inventory movements: har bill sale ab inventory_movements
--    me 'sale' entry ke tor par record hogi, bill_id ke saath — taake trace
--    ho sake ke kis bill ne kitna stock minus kiya. Bill edit/delete par
--    ye entries khud saaf ho jati hain (stock bill logic khud handle karta
--    hai; in entries ko Recent Entries se manually edit/delete karna
--    blocked hai taake double reversal na ho).
ALTER TABLE inventory_movements ADD COLUMN bill_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_inv_mov_bill ON inventory_movements(bill_id);

-- 2) KG → Pieces conversion (raw materials):
--    Kuch choti cheezein KG me aati hain lekin Pieces me use hoti hain.
--    Har material par save hota hai:
--      purchase_unit            = jis unit me cheez aati hai (e.g. 'kg')
--      pieces_per_purchase_unit = 1 purchase_unit me kitne pieces
--                                 (e.g. 250  =>  1 kg = 250 pcs)
--    Stock hamesha raw_materials.unit (pcs) me rehta hai; purchase/restock
--    purchase_unit me enter hota hai aur system khud pieces me badal deta hai.
ALTER TABLE raw_materials ADD COLUMN purchase_unit TEXT DEFAULT '';
ALTER TABLE raw_materials ADD COLUMN pieces_per_purchase_unit REAL DEFAULT 0;

-- 3) Purchase batch par asal input record (audit ke liye):
--    input_quantity / input_unit = jo user ne asal me enter kiya (e.g. 10 kg)
--    input_rate = rate per purchase unit (e.g. PKR per kg)
--    Jab ke quantity/rate hamesha STOCK unit (pieces) me rehte hain.
ALTER TABLE raw_material_purchases ADD COLUMN input_quantity REAL;
ALTER TABLE raw_material_purchases ADD COLUMN input_unit TEXT DEFAULT '';
ALTER TABLE raw_material_purchases ADD COLUMN input_rate REAL;
