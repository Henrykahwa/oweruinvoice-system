CREATE TABLE IF NOT EXISTS invoice_ranges (id INT AUTO_INCREMENT PRIMARY KEY, start_range INT NOT NULL, end_range INT NOT NULL, current_number INT NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS range_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(50) NOT NULL,
  range_start INT,
  range_end INT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  admin_username VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  receipt_number VARCHAR(50) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  paid_for VARCHAR(255),
  phone VARCHAR(20),
  email VARCHAR(255),
  amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  bank_name VARCHAR(255),
  branch_name VARCHAR(255),
  reference_number VARCHAR(255),
  receipt_date DATE NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS petty_cash_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date DATE NOT NULL,
  description VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payment_vouchers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  voucher_number VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  category VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  approved_by INT,
  approved_at TIMESTAMP NULL,
  rejected_by INT,
  rejected_at TIMESTAMP NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id),
  FOREIGN KEY (rejected_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payment_voucher_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  initial_voucher_number INT DEFAULT 1,
  user_id INT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
