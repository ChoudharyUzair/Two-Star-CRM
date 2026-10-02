-- =====================================================
-- Two Star CRM v11 — Product Barcodes / Unique Serial Numbers
-- =====================================================
-- Har pack ki hui finished product unit ko ek UNIQUE barcode milta hai.
-- Issey hum apni products ko verify kar sakte hain:
--   • Scanner ya manual lookup se check kiya ja sakta hai ke ye asli Two Star
--     ka product hai ya nahi.
--   • Date / production run / which pack log banaya — sab track hota hai.
--   • Status (in_stock | sold | returned | lost | voided) se life-cycle track.
--
-- Code format:
--     TS-<PRODCODE>-<DDMMYY>-<RANDOM8>
--
--   TS         = Two Star brand prefix
--   PRODCODE   = 2–4 letter product abbreviation (e.g. "SNK" for Sink Rack).
--                Generated from products.name (uppercase first-letters of
--                each word, fallback: first 3 letters of name).
--   DDMMYY     = production date (so date barcode me b visible hai).
--   RANDOM8    = 8 crypto-random uppercase base32 characters.
--                This makes it IMPOSSIBLE to guess the next serial.
--                Avoided chars: 0 / O / 1 / I to prevent OCR ambiguity.
--
-- Full code is stored in `code` with a UNIQUE index — so duplicates can
-- never happen (unique constraint + random space of ~1 trillion per day
-- per product makes collisions negligible, and the API retries on conflict).
-- =====================================================

CREATE TABLE IF NOT EXISTS product_barcodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,              -- The full barcode string (unique)
  product_id INTEGER,                     -- Which manufactured product (products.id)
  product_name TEXT DEFAULT '',           -- snapshot (so barcode survives product deletion)
  product_code TEXT DEFAULT '',           -- the PRODCODE part (for grouping / lookups)
  pack_log_id INTEGER,                    -- which product_production_logs row (if auto-generated at Pack)
  inventory_id INTEGER,                   -- link to inventory row (for lookups)
  production_date TEXT NOT NULL,          -- YYYY-MM-DD (date the unit was packed/made)
  status TEXT DEFAULT 'in_stock',         -- in_stock | sold | returned | lost | voided
  sold_bill_id INTEGER,                   -- if sold, link to the bill (bills.id)
  sold_customer_name TEXT DEFAULT '',     -- snapshot of customer at sale time
  sold_at DATETIME,                       -- when it was marked sold
  notes TEXT DEFAULT '',
  printed INTEGER DEFAULT 0,              -- 1 after user prints the sticker
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (pack_log_id) REFERENCES product_production_logs(id) ON DELETE SET NULL,
  FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE SET NULL,
  FOREIGN KEY (sold_bill_id) REFERENCES bills(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pbc_code      ON product_barcodes(code);
CREATE INDEX IF NOT EXISTS idx_pbc_product   ON product_barcodes(product_id);
CREATE INDEX IF NOT EXISTS idx_pbc_pack      ON product_barcodes(pack_log_id);
CREATE INDEX IF NOT EXISTS idx_pbc_status    ON product_barcodes(status);
CREATE INDEX IF NOT EXISTS idx_pbc_date      ON product_barcodes(production_date);
CREATE INDEX IF NOT EXISTS idx_pbc_bill      ON product_barcodes(sold_bill_id);

-- Settings table (if not already) — we'll store the master toggle
-- "auto-generate barcodes on Pack" here so the user can turn it off/on.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES ('barcode_auto_on_pack', '1');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('barcode_brand_prefix', 'TS');
