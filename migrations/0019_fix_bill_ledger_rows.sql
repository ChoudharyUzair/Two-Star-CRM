-- BUG 4 DATA REPAIR: bill-linked ledger rows previously stored
--   amount_pending = (bill total - paid)  ← WRONG
-- which made fully/partially-paid bills net negative and wrongly reduce the
-- customer's unrelated older outstanding balance.
-- Correct convention (same as raw-material purchase ledger rows):
--   amount_pending  = the bill's FULL total
--   amount_received = the amount actually paid on that bill
-- Repair every auto-generated bill transaction from its source bill.
UPDATE transactions
SET amount_pending = (SELECT b.total FROM bills b WHERE b.id = transactions.bill_id)
WHERE bill_id IS NOT NULL
  AND auto_generated = 1
  AND EXISTS (SELECT 1 FROM bills b WHERE b.id = transactions.bill_id);
