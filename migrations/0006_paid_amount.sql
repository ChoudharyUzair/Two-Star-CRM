-- =====================================================
-- Two Star CRM v4 - Add paid_amount field to employee_transactions
-- For tracking partial payments (e.g., total 3000 but only 2500 paid → remaining 500)
-- =====================================================

ALTER TABLE employee_transactions ADD COLUMN paid_amount REAL DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_emp_tx_paid ON employee_transactions(paid_amount);
