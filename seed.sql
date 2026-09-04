-- Sample clients
INSERT OR IGNORE INTO clients (folder_id, name, phone, email, opening_balance) VALUES 
  (1, 'Ali Traders', '0300-1234567', 'ali@example.com', 0),
  (1, 'Hassan & Sons', '0301-9876543', 'hassan@example.com', 5000),
  (2, 'ABC Wholesale', '0302-5555555', 'abc@example.com', 0);

-- Sample transactions
INSERT OR IGNORE INTO transactions (client_id, entry_date, bill_no, amount_received, amount_pending, status, description) VALUES 
  (1, '2026-05-01', 'BL-001', 10000, 0, 'Received', 'Cash sale'),
  (1, '2026-05-03', 'BL-002', 0, 5000, 'Pending', 'Credit sale'),
  (1, '2026-05-05', 'BL-003', 3000, 2000, 'Partial', 'Partial payment'),
  (2, '2026-05-02', 'BL-004', 8000, 0, 'Received', 'Full payment');
