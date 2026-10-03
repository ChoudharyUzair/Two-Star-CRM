-- =====================================================
-- Two Star CRM v12 — Per-pack-entry "Generate Barcode" checkbox
-- =====================================================
-- Products Manufacturing me Pack entry karte waqt ab ek checkbox hai:
--   ✔ tick   → is pack entry ke har piece ka unique barcode banega
--   ✘ untick → is entry ke liye koi barcode NAHI banega
-- Ye choice har log row pe save hoti hai taake edit (qty change) karte waqt
-- bhi barcode generator usi choice ko follow kare.
-- =====================================================
ALTER TABLE product_production_logs ADD COLUMN generate_barcodes INTEGER DEFAULT 0;

-- Purani pack entries: jin ke barcodes bane hue hain unhein 1 mark karo.
UPDATE product_production_logs
   SET generate_barcodes = CASE WHEN EXISTS (
         SELECT 1 FROM product_barcodes pb WHERE pb.pack_log_id = product_production_logs.id
       ) THEN 1 ELSE 0 END
 WHERE stage = 'pack';
