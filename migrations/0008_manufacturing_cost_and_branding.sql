-- =====================================================
-- Two Star CRM v6 - Manufacturing Cost + Editable Bill Template
-- =====================================================
-- 1) Inventory.manufacturing_cost - cost per unit to make this product (internal only, never shown on the bill)
-- 2) bill_items.manufacturing_cost - snapshot of mfg cost at time of sale (per unit)
-- 3) bills.net_profit            - sum((rate - mfg_cost) * qty) for the bill (auto computed by server)
-- 4) Branding extra contact fields (website, email, plus the existing phone/address)
-- =====================================================

-- 1. Inventory: manufacturing cost per unit
ALTER TABLE inventory ADD COLUMN manufacturing_cost REAL DEFAULT 0;

-- 2. Bill line items: snapshot mfg_cost (per unit) at the time the bill was made
ALTER TABLE bill_items ADD COLUMN manufacturing_cost REAL DEFAULT 0;

-- 3. Bills: cached net_profit for the entire bill
ALTER TABLE bills ADD COLUMN net_profit REAL DEFAULT 0;

-- 4. Branding: editable bill template extra fields
ALTER TABLE branding ADD COLUMN bill_website TEXT DEFAULT '';
ALTER TABLE branding ADD COLUMN bill_email   TEXT DEFAULT '';
