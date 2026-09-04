-- =====================================================
-- BANKING / PAYMENTS SYSTEM (fully integrated)
-- =====================================================
-- Every money movement (received / paid) is a bank_transaction linked to a
-- bank_account. The account's `current_balance` is kept in sync on every
-- insert/edit/delete. Other modules (bills, ledgers, employees, side
-- expenses, raw materials) create bank_transactions via `source`/`source_id`
-- so everything stays linked & reversible.

-- ---------- Bank Accounts ----------
CREATE TABLE IF NOT EXISTS bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                 -- e.g. "Meezan Bank", "Cash in Hand", "JazzCash"
  account_type TEXT DEFAULT 'bank',   -- bank | cash | wallet
  account_number TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',          -- institution name
  branch TEXT DEFAULT '',
  iban TEXT DEFAULT '',
  account_title TEXT DEFAULT '',      -- title on the account
  opening_balance REAL DEFAULT 0,     -- balance when account was added
  current_balance REAL DEFAULT 0,     -- kept in sync (opening + all txns)
  color TEXT DEFAULT '#2563eb',
  icon TEXT DEFAULT 'fa-building-columns',
  notes TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ---------- Bank Transactions (the ledger of a bank account) ----------
CREATE TABLE IF NOT EXISTS bank_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  entry_date TEXT NOT NULL,           -- YYYY-MM-DD
  direction TEXT NOT NULL,            -- 'in' (credit / received) | 'out' (debit / paid)
  amount REAL DEFAULT 0,              -- always positive
  category TEXT DEFAULT 'general',    -- customer_payment | supplier_payment | salary | employee | expense | raw_material | bill | transfer | opening | adjustment | general
  payment_method TEXT DEFAULT '',     -- cash | online | cheque | card | other
  reference TEXT DEFAULT '',          -- cheque no / txn ref
  party_name TEXT DEFAULT '',         -- who paid / who got paid
  description TEXT DEFAULT '',
  -- linkage back to the originating module record (for reverse/cleanup)
  source TEXT DEFAULT 'manual',       -- manual | bill | ledger | employee | side_expense | raw_material | transfer
  source_id INTEGER,                  -- id of the linked record
  transfer_account_id INTEGER,        -- for account->account transfers (the other side)
  transfer_group TEXT DEFAULT '',     -- ties the two legs of a transfer together
  auto_generated INTEGER DEFAULT 0,   -- 1 if created by another module
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bank_tx_account ON bank_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_date ON bank_transactions(entry_date);
CREATE INDEX IF NOT EXISTS idx_bank_tx_source ON bank_transactions(source, source_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_category ON bank_transactions(category);

-- ---------- Link columns on existing money-movement tables ----------
-- Bills: which bank account the customer paid into (for the `paid` amount).
ALTER TABLE bills ADD COLUMN bank_account_id INTEGER;
ALTER TABLE bills ADD COLUMN bank_txn_id INTEGER;

-- Client ledger transactions: which bank account the received amount landed in.
ALTER TABLE transactions ADD COLUMN bank_account_id INTEGER;
ALTER TABLE transactions ADD COLUMN bank_txn_id INTEGER;

-- Employee transactions (salary / payment / advance out): which account paid.
ALTER TABLE employee_transactions ADD COLUMN bank_account_id INTEGER;
ALTER TABLE employee_transactions ADD COLUMN bank_txn_id INTEGER;

-- Side expenses: which account paid the expense.
ALTER TABLE side_expenses ADD COLUMN bank_account_id INTEGER;
ALTER TABLE side_expenses ADD COLUMN bank_txn_id INTEGER;

-- Raw material purchases: which account the paid_amount came from.
ALTER TABLE raw_material_purchases ADD COLUMN bank_account_id INTEGER;
ALTER TABLE raw_material_purchases ADD COLUMN bank_txn_id INTEGER;
