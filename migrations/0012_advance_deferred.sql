-- =====================================================
-- Two Star CRM v9 - Advance defer flag + simplify salary
-- =====================================================
-- Issue #6:
--  * Advance is money the worker already took out. By default it should be
--    auto-deducted from what the employer still owes (Remaining) and counted
--    as part of "Salary Paid".
--  * Sometimes the worker says "is week advance mat kaato, next week kaat lena".
--    For that we add a `deferred` flag on advance rows. A deferred advance is
--    NOT deducted from the current remaining (it is parked for later).
--  * Bonus & Deduction concept is removed from the UI; existing rows (if any)
--    are converted so they no longer affect balances unexpectedly. We keep the
--    column values but the app no longer reads bonus/deduction into Remaining.
-- =====================================================

ALTER TABLE employee_transactions ADD COLUMN deferred INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_emp_tx_deferred ON employee_transactions(deferred);
