-- Insert default admin user (password: admin123)
-- Hash is SHA-256 of "admin123" with salt "crm-salt-2024"
INSERT OR IGNORE INTO users (id, username, password_hash) VALUES 
  (1, 'admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9');

-- Insert default folders
INSERT OR IGNORE INTO folders (id, name, icon, color, sort_order) VALUES
  (1, 'Customers', 'fa-users', '#3b82f6', 1),
  (2, 'Suppliers', 'fa-truck', '#10b981', 2),
  (3, 'Expenses', 'fa-money-bill-wave', '#ef4444', 3);
