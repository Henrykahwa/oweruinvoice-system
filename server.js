const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const puppeteer = require('puppeteer');
const XLSX = require('xlsx');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// In-memory session store (for simplicity; use proper session management in production)
const sessions = {};

// ✅ Root route to avoid "Cannot GET /"
app.get('/', (req, res) => {
  res.send('✅ Oweru Invoice Server is running and ready to receive data.');
});

// ✅ MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Rwehabulah124@@',
  database: 'oweru_invoices'
});

db.connect(err => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Connected to MySQL');
    // Create receipts table if it doesn't exist
    const createReceiptsTable = `
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
      )
    `;
    db.query(createReceiptsTable, (err) => {
      if (err) {
        console.error('❌ Error creating receipts table:', err.message);
      } else {
        console.log('✅ Receipts table ready');
      }
    });

    // Create petty cash transactions table if it doesn't exist
    const createPettyCashTable = `
      CREATE TABLE IF NOT EXISTS petty_cash_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        date DATE NOT NULL,
        description VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        user_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `;
    db.query(createPettyCashTable, (err) => {
      if (err) {
        console.error('❌ Error creating petty cash table:', err.message);
      } else {
        console.log('✅ Petty cash table ready');
      }
    });

    // Create petty cash config table if it doesn't exist
    const createPettyCashConfigTable = `
      CREATE TABLE IF NOT EXISTS petty_cash_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        initial_cash DECIMAL(10,2) NOT NULL DEFAULT 0,
        user_id INT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `;
    db.query(createPettyCashConfigTable, (err) => {
      if (err) {
        console.error('❌ Error creating petty cash config table:', err.message);
      } else {
        console.log('✅ Petty cash config table ready');
      }
    });

    // Create payment vouchers table if it doesn't exist
    const createPaymentVouchersTable = `
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
      )
    `;
    db.query(createPaymentVouchersTable, (err) => {
      if (err) {
        console.error('❌ Error creating payment vouchers table:', err.message);
      } else {
        console.log('✅ Payment vouchers table ready');
      }
    });

    // Create payment voucher config table if it doesn't exist
    const createPaymentVoucherConfigTable = `
      CREATE TABLE IF NOT EXISTS payment_voucher_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        initial_voucher_number INT DEFAULT 1,
        user_id INT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `;
    db.query(createPaymentVoucherConfigTable, (err) => {
      if (err) {
        console.error('❌ Error creating payment voucher config table:', err.message);
      } else {
        console.log('✅ Payment voucher config table ready');
      }
    });
  }
});

// ✅ Save invoice and items
app.post('/save-invoice', (req, res) => {
  const {
    sessionId, invoice_number, tin, invoice_date, director, phone, email,
    payment_method, account, holder, bank, branch,
    subtotal, vat, discount, grand_total, items
  } = req.body;

  if (!sessions[sessionId]) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Invoice must include at least one item.' });
  }

  const userId = sessions[sessionId].userId;

  const invoiceQuery = `
    INSERT INTO invoices (
      invoice_number, tin, invoice_date, director, phone, email,
      payment_method, bank_account, holder_name,
      bank_name, branch, subtotal, vat, discount, grand_total, user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const invoiceValues = [
    invoice_number, tin, invoice_date, director, phone, email,
    payment_method, account, holder, bank, branch,
    subtotal, vat, discount, grand_total, userId
  ];

  db.query(invoiceQuery, invoiceValues, (err, result) => {
    if (err) {
      console.error('❌ Error saving invoice:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to save invoice' });
    }

    const invoiceId = result.insertId;

    const itemQuery = `
      INSERT INTO invoice_items (
        invoice_id, description, quantity, unit_price, total
      ) VALUES ?
    `;

    const itemValues = items.map(item => [
      invoiceId,
      item.desc || '',
      parseInt(item.qty) || 0,
      parseFloat(item.price) || 0,
      parseFloat(item.total) || 0
    ]);

    db.query(itemQuery, [itemValues], (err) => {
      if (err) {
        console.error('❌ Error saving items:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to save items' });
      }

      console.log(`✅ Invoice #${invoice_number} saved by user ${userId} with ${items.length} items`);
      res.json({ success: true, invoiceId });
    });
  });
});

// ✅ Get all invoices with items
app.get('/invoices', (req, res) => {
  const query = `
    SELECT i.*, GROUP_CONCAT(
      JSON_OBJECT(
        'description', ii.description,
        'quantity', ii.quantity,
        'unit_price', ii.unit_price,
        'total', ii.total
      )
    ) AS items
    FROM invoices i
    LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
    GROUP BY i.id
    ORDER BY i.invoice_date DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Error fetching invoices:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to fetch invoices' });
    }

    const invoices = results.map(row => ({
      id: row.id,
      invoice_number: row.invoice_number,
      tin: row.tin,
      invoice_date: row.invoice_date,
      director: row.director,
      phone: row.phone,
      email: row.email,
      payment_method: row.payment_method,
      bank_account: row.bank_account,
      holder_name: row.holder_name,
      bank_name: row.bank_name,
      branch: row.branch,
      subtotal: row.subtotal,
      vat: row.vat,
      discount: row.discount,
      grand_total: row.grand_total,
      items: row.items ? JSON.parse(`[${row.items}]`) : []
    }));

    res.json(invoices);
  });
});

// ✅ Login endpoint
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const query = 'SELECT * FROM users WHERE username = ? AND password = ?';
  db.query(query, [username, password], (err, results) => {
    if (err) {
      console.error('❌ Error during login:', err.message);
      return res.status(500).json({ success: false, message: 'Login failed' });
    }
    if (results.length > 0) {
      const user = results[0];
      const sessionId = Math.random().toString(36).substring(2);
      sessions[sessionId] = { userId: user.id, role: user.role, username: user.username };
      res.json({ success: true, sessionId, role: user.role, username: user.username });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  });
});

// ✅ Add user (admin only)
app.post('/add-user', (req, res) => {
  const { sessionId, username, password, role } = req.body;
  if (!sessions[sessionId] || sessions[sessionId].role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }
  const query = 'INSERT INTO users (username, password, role) VALUES (?, ?, ?)';
  db.query(query, [username, password, role], (err) => {
    if (err) {
      console.error('❌ Error adding user:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to add user' });
    }
    res.json({ success: true });
  });
});

// ✅ Remove user (admin only)
app.post('/remove-user', (req, res) => {
  const { sessionId, userId } = req.body;
  if (!sessions[sessionId] || sessions[sessionId].role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }
  const query = 'DELETE FROM users WHERE id = ?';
  db.query(query, [userId], (err) => {
    if (err) {
      console.error('❌ Error removing user:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to remove user' });
    }
    res.json({ success: true });
  });
});

// ✅ Get all users (admin only)
app.get('/get-users', (req, res) => {
  const { sessionId } = req.query;
  if (!sessions[sessionId] || sessions[sessionId].role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }
  const query = 'SELECT id, username, role FROM users';
  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Error fetching users:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
    res.json(results);
  });
});

// ✅ Get all invoices with user info (admin only)
app.get('/get-all-invoices', (req, res) => {
  const { sessionId } = req.query;
  if (!sessions[sessionId] || sessions[sessionId].role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }
  const query = `
    SELECT i.*, u.username AS created_by, GROUP_CONCAT(
      JSON_OBJECT(
        'description', ii.description,
        'quantity', ii.quantity,
        'unit_price', ii.unit_price,
        'total', ii.total
      )
    ) AS items
    FROM invoices i
    LEFT JOIN users u ON i.user_id = u.id
    LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
    GROUP BY i.id
    ORDER BY i.invoice_date DESC
  `;
  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Error fetching invoices:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to fetch invoices' });
    }
    const invoices = results.map(row => ({
      id: row.id,
      invoice_number: row.invoice_number,
      tin: row.tin,
      invoice_date: row.invoice_date,
      director: row.director,
      phone: row.phone,
      email: row.email,
      payment_method: row.payment_method,
      bank_account: row.bank_account,
      holder_name: row.holder_name,
      bank_name: row.bank_name,
      branch: row.branch,
      subtotal: row.subtotal,
      vat: row.vat,
      discount: row.discount,
      grand_total: row.grand_total,
      created_by: row.created_by,
      items: row.items ? JSON.parse(`[${row.items}]`) : []
    }));
    res.json(invoices);
  });
});

// ✅ Set invoice number range (admin only)
app.post('/set-range', (req, res) => {
  const { sessionId, startRange, endRange } = req.body;
  if (!sessions[sessionId] || sessions[sessionId].role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }
  if (startRange >= endRange) {
    return res.status(400).json({ success: false, message: 'Start range must be less than end range' });
  }
  const adminUsername = sessions[sessionId].username;

  // Check if range exists
  const checkQuery = 'SELECT * FROM invoice_ranges LIMIT 1';
  db.query(checkQuery, (err, results) => {
    if (err) {
      console.error('❌ Error checking range:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to check range' });
    }
    const action = results.length > 0 ? 'range replaced' : 'range created';

    // Delete old range if exists
    const deleteQuery = 'DELETE FROM invoice_ranges';
    db.query(deleteQuery, (err) => {
      if (err) {
        console.error('❌ Error deleting old range:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to set range' });
      }

      // Insert new range
      const insertQuery = 'INSERT INTO invoice_ranges (start_range, end_range, current_number) VALUES (?, ?, ?)';
      db.query(insertQuery, [startRange, endRange, startRange], (err) => {
        if (err) {
          console.error('❌ Error setting range:', err.message);
          return res.status(500).json({ success: false, message: 'Failed to set range' });
        }

        // Log the action
        const logQuery = 'INSERT INTO range_logs (action, range_start, range_end, admin_username) VALUES (?, ?, ?, ?)';
        db.query(logQuery, [action, startRange, endRange, adminUsername], (err) => {
          if (err) {
            console.error('❌ Error logging range action:', err.message);
            // Don't fail the request if logging fails
          }
          res.json({ success: true });
        });
      });
    });
  });
});

// ✅ Get current range (admin only)
app.get('/get-current-range', (req, res) => {
  const { sessionId } = req.query;
  if (!sessions[sessionId] || sessions[sessionId].role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }
  const query = 'SELECT * FROM invoice_ranges LIMIT 1';
  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Error fetching range:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to fetch range' });
    }
    res.json(results[0] || null);
  });
});

// ✅ Delete invoice number range (admin only)
app.post('/delete-range', (req, res) => {
  const { sessionId } = req.body;
  if (!sessions[sessionId] || sessions[sessionId].role !== 'admin') {
    return res.status(403).send('Unauthorized');
  }
  const adminUsername = sessions[sessionId].username;

  // Get current range before deleting
  const getQuery = 'SELECT * FROM invoice_ranges LIMIT 1';
  db.query(getQuery, (err, results) => {
    if (err) {
      console.error('❌ Error fetching range:', err.message);
      return res.status(500).send('Failed to fetch range');
    }
    if (results.length === 0) {
      return res.status(400).send('No range to delete');
    }
    const range = results[0];

    const deleteQuery = 'DELETE FROM invoice_ranges';
    db.query(deleteQuery, (err) => {
      if (err) {
        console.error('❌ Error deleting range:', err.message);
        return res.status(500).send('Failed to delete range');
      }

      // Log the action
      const logQuery = 'INSERT INTO range_logs (action, range_start, range_end, admin_username) VALUES (?, ?, ?, ?)';
      db.query(logQuery, ['range deleted', range.start_range, range.end_range, adminUsername], (err) => {
        if (err) {
          console.error('❌ Error logging range action:', err.message);
          // Don't fail the request if logging fails
        }
        res.send({ success: true });
      });
    });
  });
});

// ✅ Get range logs (admin only)
app.get('/get-range-logs', (req, res) => {
  const { sessionId } = req.query;
  if (!sessions[sessionId] || sessions[sessionId].role !== 'admin') {
    return res.status(403).send('Unauthorized');
  }
  const query = `
    SELECT * FROM range_logs
    ORDER BY timestamp DESC
  `;
  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Error fetching logs:', err.message);
      return res.status(500).send('Failed to fetch logs');
    }
    res.send(results);
  });
});

// ✅ Get next invoice number
app.get('/get-next-invoice-number', (req, res) => {
  const { sessionId } = req.query;
  if (!sessions[sessionId]) {
    return res.status(401).send('Unauthorized');
  }
  const query = 'SELECT * FROM invoice_ranges LIMIT 1';
  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Error fetching range:', err.message);
      return res.status(500).send('Failed to fetch range');
    }
    if (results.length === 0) {
      return res.status(400).send('No range set');
    }
    const range = results[0];
    if (range.current_number >= range.end_range) {
      return res.status(400).send('Range exhausted');
    }
    const nextNumber = range.current_number + 1;
    const updateQuery = 'UPDATE invoice_ranges SET current_number = ? WHERE id = ?';
    db.query(updateQuery, [nextNumber, range.id], (err) => {
      if (err) {
        console.error('❌ Error updating current number:', err.message);
        return res.status(500).send('Failed to update number');
      }
      res.send({ nextNumber: range.current_number });
    });
  });
});

// ✅ Save receipt
app.post('/save-receipt', (req, res) => {
  const {
    sessionId, receipt_number, customer_name, paid_for, phone, email,
    amount, payment_method, bank_name, branch_name, reference_number, receipt_date
  } = req.body;

  if (!sessions[sessionId]) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const userId = sessions[sessionId].userId;

  const receiptQuery = `
    INSERT INTO receipts (
      receipt_number, customer_name, paid_for, phone, email, amount, payment_method,
      bank_name, branch_name, reference_number, receipt_date, user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const receiptValues = [
    receipt_number, customer_name, paid_for, phone, email, amount, payment_method,
    bank_name, branch_name, reference_number, receipt_date, userId
  ];

  db.query(receiptQuery, receiptValues, (err, result) => {
    if (err) {
      console.error('❌ Error saving receipt:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to save receipt' });
    }

    console.log(`✅ Receipt #${receipt_number} saved by user ${userId}`);
    res.json({ success: true, receiptId: result.insertId });
  });
});

// ✅ Get all receipts
app.get('/receipts', (req, res) => {
  const query = `
    SELECT r.*, u.username AS created_by
    FROM receipts r
    LEFT JOIN users u ON r.user_id = u.id
    ORDER BY r.receipt_date DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Error fetching receipts:', err.message);
      return res.status(500).send('Failed to fetch receipts');
    }

    res.send(results);
  });
});

// ✅ Get all receipts with user info (admin only)
app.get('/get-all-receipts', (req, res) => {
  const { sessionId } = req.query;
  if (!sessions[sessionId] || sessions[sessionId].role !== 'admin') {
    return res.status(403).send('Unauthorized');
  }
  const query = `
    SELECT r.*, u.username AS created_by
    FROM receipts r
    LEFT JOIN users u ON r.user_id = u.id
    ORDER BY r.receipt_date DESC
  `;
  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Error fetching receipts:', err.message);
      return res.status(500).send('Failed to fetch receipts');
    }
    res.send(results);
  });
});

// ✅ Save petty cash transaction
app.post('/save-petty-cash', (req, res) => {
  const { sessionId, date, description, category, amount } = req.body;

  if (!sessions[sessionId]) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const userId = sessions[sessionId].userId;

  const query = `
    INSERT INTO petty_cash_transactions (date, description, category, amount, user_id)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(query, [date, description, category, amount, userId], (err, result) => {
    if (err) {
      console.error('❌ Error saving petty cash transaction:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to save petty cash transaction' });
    }

    console.log(`✅ Petty cash transaction saved by user ${userId}`);
    res.json({ success: true, transactionId: result.insertId });
  });
});

// ✅ Get all petty cash transactions
app.get('/petty-cash', (req, res) => {
  const { sessionId } = req.query;
  if (!sessions[sessionId]) {
    return res.status(401).send('Unauthorized');
  }

  const userId = sessions[sessionId].userId;
  const query = `
    SELECT * FROM petty_cash_transactions
    WHERE user_id = ?
    ORDER BY date DESC
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('❌ Error fetching petty cash transactions:', err.message);
      return res.status(500).send('Failed to fetch petty cash transactions');
    }
    res.send(results);
  });
});

// ✅ Get petty cash transactions (alias for front-end compatibility)
app.get('/petty-cash-transactions', (req, res) => {
  const { sessionId } = req.query;
  if (!sessions[sessionId]) {
    return res.status(401).send('Unauthorized');
  }

  const userId = sessions[sessionId].userId;
  const query = `
    SELECT * FROM petty_cash_transactions
    WHERE user_id = ?
    ORDER BY date DESC
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('❌ Error fetching petty cash transactions:', err.message);
      return res.status(500).send('Failed to fetch petty cash transactions');
    }
    res.send(results);
  });
});

// ✅ Get single petty cash transaction
app.get('/petty-cash-transaction/:id', (req, res) => {
  const { sessionId } = req.query;
  const { id } = req.params;

  if (!sessions[sessionId]) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const userId = sessions[sessionId].userId;

  const query = 'SELECT * FROM petty_cash_transactions WHERE id = ? AND user_id = ?';

  db.query(query, [id, userId], (err, results) => {
    if (err) {
      console.error('❌ Error fetching petty cash transaction:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to fetch petty cash transaction' });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    res.json(results[0]);
  });
});

// ✅ Get petty cash config
app.get('/petty-cash-config', (req, res) => {
  const { sessionId } = req.query;
  if (!sessions[sessionId]) {
    return res.status(401).send('Unauthorized');
  }

  const userId = sessions[sessionId].userId;
  const query = 'SELECT * FROM petty_cash_config WHERE user_id = ?';

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('❌ Error fetching petty cash config:', err.message);
      return res.status(500).send('Failed to fetch petty cash config');
    }
    res.send(results[0] || { initial_cash: 0 });
  });
});

// ✅ Set petty cash config (set initial cash directly)
app.post('/petty-cash-config', (req, res) => {
  const { sessionId, initialCash } = req.body;
  if (!sessions[sessionId]) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const userId = sessions[sessionId].userId;
  const newInitialCash = parseFloat(initialCash);

  if (isNaN(newInitialCash) || newInitialCash < 0) {
    return res.status(400).json({ success: false, message: 'Invalid initial cash amount' });
  }

  const updateQuery = `
    INSERT INTO petty_cash_config (user_id, initial_cash)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE initial_cash = VALUES(initial_cash)
  `;

  db.query(updateQuery, [userId, newInitialCash], (err) => {
    if (err) {
      console.error('❌ Error updating petty cash config:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to update petty cash config' });
    }
    res.json({ success: true });
  });
});

// ✅ Get petty cash summary
app.get('/petty-cash-summary', (req, res) => {
  const { sessionId } = req.query;
  if (!sessions[sessionId]) {
    return res.status(401).send('Unauthorized');
  }

  const userId = sessions[sessionId].userId;

  // Get initial cash and transaction summary
  const configQuery = 'SELECT initial_cash FROM petty_cash_config WHERE user_id = ?';
  const summaryQuery = `
    SELECT
      SUM(amount) AS total_spent
    FROM petty_cash_transactions
    WHERE user_id = ?
  `;

  db.query(configQuery, [userId], (err, configResults) => {
    if (err) {
      console.error('❌ Error fetching petty cash config:', err.message);
      return res.status(500).send('Failed to fetch petty cash summary');
    }

    const initialCash = configResults[0] ? configResults[0].initial_cash : 0;

    db.query(summaryQuery, [userId], (err, summaryResults) => {
      if (err) {
        console.error('❌ Error fetching petty cash summary:', err.message);
        return res.status(500).send('Failed to fetch petty cash summary');
      }

      const totalSpent = summaryResults[0].total_spent || 0;
      const availableBalance = initialCash - totalSpent;

      res.send({
        initial_cash: initialCash,
        total_spent: totalSpent,
        available_balance: availableBalance
      });
    });
  });
});

// ✅ Add petty cash transaction
app.post('/add-petty-cash-transaction', (req, res) => {
  const { sessionId, date, description, category, amount } = req.body;

  if (!sessions[sessionId]) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const userId = sessions[sessionId].userId;

  const query = `
    INSERT INTO petty_cash_transactions (date, description, category, amount, user_id)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(query, [date, description, category, amount, userId], (err, result) => {
    if (err) {
      console.error('❌ Error adding petty cash transaction:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to add petty cash transaction' });
    }

    console.log(`✅ Petty cash transaction added by user ${userId}`);
    res.json({ success: true, transactionId: result.insertId });
  });
});

// ✅ Edit petty cash transaction
app.put('/edit-petty-cash-transaction', (req, res) => {
  const { sessionId, id, date, description, category, amount } = req.body;

  if (!sessions[sessionId]) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const userId = sessions[sessionId].userId;

  const query = `
    UPDATE petty_cash_transactions
    SET date = ?, description = ?, category = ?, amount = ?
    WHERE id = ? AND user_id = ?
  `;

  db.query(query, [date, description, category, amount, id, userId], (err, result) => {
    if (err) {
      console.error('❌ Error editing petty cash transaction:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to edit petty cash transaction' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found or unauthorized' });
    }

    res.json({ success: true });
  });
});

// ✅ Delete petty cash transaction
app.delete('/delete-petty-cash-transaction', (req, res) => {
  const { sessionId, id } = req.body;

  if (!sessions[sessionId]) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const userId = sessions[sessionId].userId;

  const query = 'DELETE FROM petty_cash_transactions WHERE id = ? AND user_id = ?';

  db.query(query, [id, userId], (err, result) => {
    if (err) {
      console.error('❌ Error deleting petty cash transaction:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to delete petty cash transaction' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found or unauthorized' });
    }

    res.json({ success: true });
  });
});

// ✅ Update petty cash transaction
app.put('/update-petty-cash/:id', (req, res) => {
  const { id } = req.params;
  const { sessionId, date, description, category, amount } = req.body;

  if (!sessions[sessionId]) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const userId = sessions[sessionId].userId;

  const query = `
    UPDATE petty_cash_transactions
    SET date = ?, description = ?, category = ?, amount = ?
    WHERE id = ? AND user_id = ?
  `;

  db.query(query, [date, description, category, amount, id, userId], (err, result) => {
    if (err) {
      console.error('❌ Error updating petty cash transaction:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to update petty cash transaction' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found or unauthorized' });
    }

    res.json({ success: true });
  });
});

// ✅ Delete petty cash transaction
app.delete('/delete-petty-cash/:id', (req, res) => {
  const { id } = req.params;
  const { sessionId } = req.query;

  if (!sessions[sessionId]) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const userId = sessions[sessionId].userId;

  const query = 'DELETE FROM petty_cash_transactions WHERE id = ? AND user_id = ?';

  db.query(query, [id, userId], (err, result) => {
    if (err) {
      console.error('❌ Error deleting petty cash transaction:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to delete petty cash transaction' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found or unauthorized' });
    }

    res.json({ success: true });
  });
});

// ✅ Export petty cash transactions to Excel with filtering
app.get('/export-petty-cash', (req, res) => {
  const { sessionId, period } = req.query;
  if (!sessions[sessionId]) {
    return res.status(401).send('Unauthorized');
  }

  const userId = sessions[sessionId].userId;
  let query = `
    SELECT date, description, category, amount
    FROM petty_cash_transactions
    WHERE user_id = ?
  `;
  let params = [userId];

  if (period) {
    const now = new Date();
    let startDate;
    if (period === 'weekly') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'monthly') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'yearly') {
      startDate = new Date(now.getFullYear(), 0, 1);
    }
    if (startDate) {
      query += ' AND date >= ?';
      params.push(startDate.toISOString().split('T')[0]);
    }
  }

  query += ' ORDER BY date DESC';

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('❌ Error fetching petty cash for export:', err.message);
      return res.status(500).send('Failed to export petty cash');
    }

    // Create Excel workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(results);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Petty Cash');

    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const filename = period ? `petty_cash_${period}.xlsx` : 'petty_cash.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(excelBuffer);
  });
});

// ✅ Get next payment voucher number
app.get('/get-next-voucher-number', (req, res) => {
  const { sessionId } = req.query;
  if (!sessions[sessionId]) {
    return res.status(401).send('Unauthorized');
  }

  const userId = sessions[sessionId].userId;
  const query = 'SELECT initial_voucher_number FROM payment_voucher_config WHERE user_id = ?';

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('❌ Error fetching voucher config:', err.message);
      return res.status(500).send('Failed to fetch voucher config');
    }

    let nextNumber = 1;
    if (results.length > 0) {
      nextNumber = results[0].initial_voucher_number;
      // Update the config for next time
      const updateQuery = 'UPDATE payment_voucher_config SET initial_voucher_number = ? WHERE user_id = ?';
      db.query(updateQuery, [nextNumber + 1, userId], (err) => {
        if (err) {
          console.error('❌ Error updating voucher number:', err.message);
        }
      });
    } else {
      // Initialize config
      const insertQuery = 'INSERT INTO payment_voucher_config (user_id, initial_voucher_number) VALUES (?, ?)';
      db.query(insertQuery, [userId, 2], (err) => {
        if (err) {
          console.error('❌ Error initializing voucher config:', err.message);
        }
      });
    }

    res.send({ nextNumber });
  });
});

// ✅ Add payment voucher
app.post('/add-payment-voucher', (req, res) => {
  const { sessionId, voucher_number, date, category, description, amount } = req.body;

  if (!sessions[sessionId]) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const userId = sessions[sessionId].userId;

  const query = `
    INSERT INTO payment_vouchers (voucher_number, date, category, description, amount, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(query, [voucher_number, date, category, description, amount, userId], (err, result) => {
    if (err) {
      console.error('❌ Error adding payment voucher:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to add payment voucher' });
    }

    console.log(`✅ Payment voucher #${voucher_number} added by user ${userId}`);
    res.json({ success: true, voucherId: result.insertId });
  });
});

// ✅ Get all payment vouchers
app.get('/payment-vouchers', (req, res) => {
  const { sessionId } = req.query;
  if (!sessions[sessionId]) {
    return res.status(401).send('Unauthorized');
  }

  const userId = sessions[sessionId].userId;
  const query = `
    SELECT pv.*, u.username AS created_by,
           au.username AS approved_by_name,
           ru.username AS rejected_by_name
    FROM payment_vouchers pv
    LEFT JOIN users u ON pv.user_id = u.id
    LEFT JOIN users au ON pv.approved_by = au.id
    LEFT JOIN users ru ON pv.rejected_by = ru.id
    WHERE pv.user_id = ?
    ORDER BY pv.date DESC
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('❌ Error fetching payment vouchers:', err.message);
      return res.status(500).send('Failed to fetch payment vouchers');
    }
    res.send(results);
  });
});

// ✅ Get payment voucher summary
app.get('/payment-voucher-summary', (req, res) => {
  const { sessionId } = req.query;
  if (!sessions[sessionId]) {
    return res.status(401).send('Unauthorized');
  }

  const userId = sessions[sessionId].userId;

  const summaryQuery = `
    SELECT
      COUNT(*) AS total_vouchers,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_approval,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_vouchers,
      SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) AS total_approved_amount
    FROM payment_vouchers
    WHERE user_id = ?
  `;

  db.query(summaryQuery, [userId], (err, summaryResults) => {
    if (err) {
      console.error('❌ Error fetching payment voucher summary:', err.message);
      return res.status(500).send('Failed to fetch payment voucher summary');
    }

    const summary = summaryResults[0];
    res.send({
      total_vouchers: summary.total_vouchers || 0,
      pending_approval: summary.pending_approval || 0,
      approved_vouchers: summary.approved_vouchers || 0,
      total_approved_amount: summary.total_approved_amount || 0
    });
  });
});

// ✅ Approve payment voucher (admin only)
app.post('/approve-payment-voucher', (req, res) => {
  const { sessionId, voucherId } = req.body;
  if (!sessions[sessionId] || sessions[sessionId].role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  const adminId = sessions[sessionId].userId;

  const query = `
    UPDATE payment_vouchers
    SET status = 'approved', approved_by = ?, approved_at = NOW()
    WHERE id = ?
  `;

  db.query(query, [adminId, voucherId], (err, result) => {
    if (err) {
      console.error('❌ Error approving payment voucher:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to approve payment voucher' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Voucher not found' });
    }

    res.json({ success: true });
  });
});

// ✅ Reject payment voucher (admin only)
app.post('/reject-payment-voucher', (req, res) => {
  const { sessionId, voucherId } = req.body;
  if (!sessions[sessionId] || sessions[sessionId].role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  const adminId = sessions[sessionId].userId;

  const query = `
    UPDATE payment_vouchers
    SET status = 'rejected', rejected_by = ?, rejected_at = NOW()
    WHERE id = ?
  `;

  db.query(query, [adminId, voucherId], (err, result) => {
    if (err) {
      console.error('❌ Error rejecting payment voucher:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to reject payment voucher' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Voucher not found' });
    }

    res.json({ success: true });
  });
});

// ✅ Get all payment vouchers (admin only)
app.get('/get-all-payment-vouchers', (req, res) => {
  const { sessionId } = req.query;
  if (!sessions[sessionId] || sessions[sessionId].role !== 'admin') {
    return res.status(403).send('Unauthorized');
  }

  const query = `
    SELECT pv.*, u.username AS created_by,
           au.username AS approved_by_name,
           ru.username AS rejected_by_name
    FROM payment_vouchers pv
    LEFT JOIN users u ON pv.user_id = u.id
    LEFT JOIN users au ON pv.approved_by = au.id
    LEFT JOIN users ru ON pv.rejected_by = ru.id
    ORDER BY pv.date DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Error fetching all payment vouchers:', err.message);
      return res.status(500).send('Failed to fetch payment vouchers');
    }
    res.send(results);
  });
});

// ✅ Export payment vouchers to Excel with filtering
app.get('/export-payment-vouchers', (req, res) => {
  const { sessionId, period } = req.query;
  if (!sessions[sessionId]) {
    return res.status(401).send('Unauthorized');
  }

  const userId = sessions[sessionId].userId;
  let query = `
    SELECT voucher_number, date, category, description, amount, status
    FROM payment_vouchers
    WHERE user_id = ?
  `;
  let params = [userId];

  if (period) {
    const now = new Date();
    let startDate;
    if (period === 'weekly') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'monthly') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'yearly') {
      startDate = new Date(now.getFullYear(), 0, 1);
    }
    if (startDate) {
      query += ' AND date >= ?';
      params.push(startDate.toISOString().split('T')[0]);
    }
  }

  query += ' ORDER BY date DESC';

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('❌ Error fetching payment vouchers for export:', err.message);
      return res.status(500).send('Failed to export payment vouchers');
    }

    // Create Excel workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(results);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Payment Vouchers');

    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const filename = period ? `payment_vouchers_${period}.xlsx` : 'payment_vouchers.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(excelBuffer);
  });
});

// ✅ Generate PDF for invoice or receipt
app.get('/generate-pdf/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  const { sessionId } = req.query;

  if (!sessions[sessionId]) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    let htmlContent = '';
    if (type === 'invoice') {
      // Fetch invoice data
      const query = `
        SELECT i.*, GROUP_CONCAT(
          JSON_OBJECT(
            'description', ii.description,
            'quantity', ii.quantity,
            'unit_price', ii.unit_price,
            'total', ii.total
          )
        ) AS items
        FROM invoices i
        LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
        WHERE i.id = ?
        GROUP BY i.id
      `;
      const [invoice] = await db.promise().query(query, [id]);
      if (!invoice.length) {
        return res.status(404).send('Invoice not found');
      }
      const data = invoice[0];
      data.items = data.items ? JSON.parse(`[${data.items}]`) : [];
      htmlContent = generateInvoiceHTML(data);
    } else if (type === 'receipt') {
      // Fetch receipt data
      const query = 'SELECT * FROM receipts WHERE id = ?';
      const [receipt] = await db.promise().query(query, [id]);
      if (!receipt.length) {
        return res.status(404).send('Receipt not found');
      }
      const data = receipt[0];
      htmlContent = generateReceiptHTML(data);
    } else {
      return res.status(400).send('Invalid type');
    }

    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({ format: 'A4' });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_${id}.pdf`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).send('Failed to generate PDF');
  }
});

// Helper function to generate invoice HTML
function generateInvoiceHTML(data) {
  // Use default config since localStorage is not available server-side
  const companyName = "OWERU INTERNATIONAL LIMITED";
  const logoUrl = "http://localhost:3000/oweru.jpeg";
  const address = "Tancot House, Posta - Dar es salaam";
  const companyPhone = "+255 711890764";
  const companyEmail = "info@oweru.com";

  return `
    <html>
      <head>
        <title>Invoice Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; margin: 0; }
          .header { text-align: center; border-bottom: 2px solid #0a1f44; padding-bottom: 20px; margin-bottom: 20px; }
          .logo { width: 100px; height: auto; }
          .company-info { margin-top: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: center; }
          .footer { margin-top: 30px; border-top: 1px solid #ccc; padding-top: 20px; font-size: 12px; }
          h2 { color: #000080; margin: 0; }
          .invoice-details { margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${logoUrl}" alt="Company Logo" class="logo" />
          <h1>${companyName}</h1>
          <h2>INVOICE</h2>
          <div class="company-info">
            <p>${address}</p>
            <p>Phone: ${companyPhone} | Email: ${companyEmail}</p>
          </div>
        </div>

        <h2>Invoice Report</h2>

        <div class="invoice-details">
          <p><strong>Invoice Number:</strong> ${data.invoice_number}</p>
          <p><strong>TIN:</strong> ${data.tin}</p>
          <p><strong>Date:</strong> ${data.invoice_date}</p>
          <p><strong>Customer's Name:</strong> ${data.director}</p>
          <p><strong>Phone:</strong> ${data.phone}</p>
          <p><strong>Email:</strong> ${data.email}</p>
          <p><strong>Payment Method:</strong> ${data.payment_method}</p>
          <p><strong>Bank Account:</strong> ${data.bank_account}</p>
          <p><strong>Holder Name:</strong> ${data.holder_name}</p>
          <p><strong>Bank Name:</strong> ${data.bank_name}</p>
          <p><strong>Branch:</strong> ${data.branch}</p>
        </div>

        <h3>Items</h3>
        <table>
          <tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
          ${data.items.map(item => `<tr><td>${item.description}</td><td>${item.quantity}</td><td>${item.unit_price}</td><td>${item.total}</td></tr>`).join('')}
        </table>

        <h3>Summary</h3>
        <p><strong>Subtotal:</strong> ${data.subtotal}</p>
        <p><strong>VAT & Tax:</strong> ${data.vat}</p>
        <p><strong>Discount:</strong> ${data.discount}</p>
        <p><strong>Grand Total:</strong> ${data.grand_total}</p>

        <h3>Terms & Conditions</h3>
        <p>All items are personalized, returns and refunds are not accepted. Unless the item is defective upon arrival, we will offer a refund or exchange. Thank you for your business!</p>

        <div class="footer">
          <p><strong>${companyName}</strong></p>
          <p>${address}</p>
          <p>Phone: ${companyPhone} | Email: ${companyEmail}</p>
          <p>Thank you for your business!</p>
        </div>
      </body>
    </html>
  `;
}

// Helper function to generate receipt HTML
function generateReceiptHTML(data) {
  // Use default config since localStorage is not available server-side
  const companyName = "OWERU INTERNATIONAL LIMITED";
  const logoUrl = "http://localhost:3000/oweru.jpeg";
  const address = "Tancot House, Posta - Dar es salaam";
  const companyPhone = "+255 711890764";
  const companyEmail = "info@oweru.com";

  return `
    <html>
      <head>
        <title>Receipt Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; margin: 0; }
          .header { text-align: center; border-bottom: 2px solid #0a1f44; padding-bottom: 20px; margin-bottom: 20px; }
          .logo { width: 100px; height: auto; }
          .company-info { margin-top: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: center; }
          .footer { margin-top: 30px; border-top: 1px solid #ccc; padding-top: 20px; font-size: 12px; }
          h2 { color: #000080; margin: 0; }
          .receipt-details { margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${logoUrl}" alt="Company Logo" class="logo" />
          <h1>${companyName}</h1>
          <h2>RECEIPT</h2>
          <div class="company-info">
            <p>${address}</p>
            <p>Phone: ${companyPhone} | Email: ${companyEmail}</p>
          </div>
        </div>

        <h2>Receipt Details</h2>

        <div class="receipt-details">
          <p><strong>Receipt Number:</strong> ${data.receipt_number}</p>
          <p><strong>Customer Name:</strong> ${data.customer_name}</p>
          ${data.paid_for ? `<p><strong>Paid For:</strong> ${data.paid_for}</p>` : ''}
          ${data.phone ? `<p><strong>Phone:</strong> ${data.phone}</p>` : ''}
          ${data.email ? `<p><strong>Email:</strong> ${data.email}</p>` : ''}
          <p><strong>Amount Paid:</strong> ${data.amount}</p>
          <p><strong>Payment Method:</strong> ${data.payment_method}</p>
          ${data.payment_method === 'Bank Transfer' ? `
            <p><strong>Bank Name:</strong> ${data.bank_name}</p>
            <p><strong>Branch Name:</strong> ${data.branch_name}</p>
            <p><strong>Reference Number:</strong> ${data.reference_number}</p>
          ` : ''}
          <p><strong>Receipt Date:</strong> ${data.receipt_date}</p>
        </div>

        <h3>Summary</h3>
        <p><strong>Total Amount Paid:</strong> ${data.amount}</p>

        <h3>Terms & Conditions</h3>
        <p>All payments are non-refundable. Thank you for your business!</p>

        <div class="footer">
          <p><strong>${companyName}</strong></p>
          <p>${address}</p>
          <p>Phone: ${companyPhone} | Email: ${companyEmail}</p>
          <p>Thank you for your business!</p>
        </div>
      </body>
    </html>
  `;
}

// ✅ Start server
app.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
