-- =====================================================
-- Two Star CRM v14 — Weekly Payment Reminder system
-- =====================================================
-- 1) branding.reminder_weekday: hafte ka wo din jis din payment
--    reminders bhejne hain (0=Sunday .. 6=Saturday, default 3=Wednesday).
ALTER TABLE branding ADD COLUMN reminder_weekday INTEGER DEFAULT 3;

-- 2) payment_reminders: kis customer ko is hafte (cycle) me reminder
--    bhej diya gaya — taake us ka Reminder button gayab ho jaye aur
--    sirf un-sent customers par dikhe. cycle_date = maujooda cycle ke
--    reminder-day ki date (Asia/Karachi), har naye cycle me buttons
--    khud wapas aa jate hain (purani rows history ke liye rehti hain).
CREATE TABLE IF NOT EXISTS payment_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  client_name TEXT DEFAULT '',
  amount REAL DEFAULT 0,
  cycle_date TEXT NOT NULL,
  sent_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_cycle ON payment_reminders(cycle_date, client_id);
