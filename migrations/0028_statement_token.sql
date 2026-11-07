-- =====================================================
-- Two Star CRM v15 — Customer Statement Link
-- =====================================================
-- Har customer ke liye aik ghair-andaza (unguessable) token, jisse
-- us ke ledger ki public statement page /s/<token> khulti hai.
-- Ye link WhatsApp payment reminder ke saath bheja jata hai taake
-- customer apna poora khata khud dekh sake. Token regenerate karne
-- se purana link foran band ho jata hai.
ALTER TABLE clients ADD COLUMN statement_token TEXT;
CREATE INDEX IF NOT EXISTS idx_clients_statement_token ON clients(statement_token);
