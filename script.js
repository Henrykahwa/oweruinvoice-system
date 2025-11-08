let currentSessionId = null;
let currentUserRole = null;
let currentUsername = null;

function login() {
  const user = document.getElementById("username").value;
  const pass = document.getElementById("password").value;

  fetch("http://localhost:3000/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password: pass })
  })
  .then(res => res.json())
  .then(response => {
    if (response.success) {
      currentSessionId = response.sessionId;
      currentUserRole = response.role;
      currentUsername = response.username;
      document.getElementById("login-screen").style.display = "none";
      if (response.role === "admin") {
        document.getElementById("admin-screen").style.display = "block";
        loadUsers();
        loadCurrentRange();
        loadLogs();
      } else {
        document.getElementById("dashboard-screen").style.display = "block";
      }
    } else {
      alert("Invalid credentials. Please try again.");
    }
  })
  .catch(err => {
    console.error("Login error:", err);
    alert("Login failed. Please try again.");
  });
}

function initializePaymentListeners() {
  const paymentCheckboxes = document.querySelectorAll("input[name='payment']");
  paymentCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', toggleBankDetailsRequired);
  });
}

function toggleBankDetailsRequired() {
  const cashCheckbox = document.querySelector("input[name='payment'][value='Cash']");
  const bankSection = document.querySelector(".form-section:nth-child(4)"); // Bank Details section
  const bankInputs = document.querySelectorAll("input[name='account'], input[name='holder'], input[name='bank'], input[name='branch']");

  if (cashCheckbox.checked) {
    bankSection.style.display = "none";
    bankInputs.forEach(input => input.required = false);
  } else {
    bankSection.style.display = "block";
    bankInputs.forEach(input => input.required = true);
  }
}

function calculateSummary() {
  const subtotalInput = document.getElementById("subtotal");
  const vatInput = document.getElementById("vat");
  const discountInput = document.getElementById("discount");
  const totalInput = document.getElementById("total");

  const subtotal = parseFloat(subtotalInput.value) || 0;
  const config = JSON.parse(localStorage.getItem("invoiceConfig")) || {};
  const vatPercent = parseFloat(config.vat) || 10;
  const discountAmount = parseFloat(config.discount) || 0;

  const vat = subtotal * (vatPercent / 100);
  const discount = discountAmount; // Now it's a fixed amount in TZS
  const grandTotal = subtotal + vat - discount;

  vatInput.value = vat.toFixed(2);
  discountInput.value = discount.toFixed(2);
  totalInput.value = grandTotal.toFixed(2);

  // Update labels to reflect current config
  const vatLabel = document.getElementById("vat-label");
  const discountLabel = document.getElementById("discount-label");
  if (vatLabel) vatLabel.textContent = `VAT & Tax (${vatPercent}%):`;
  if (discountLabel) discountLabel.textContent = `Discount (TZS):`;
}

function addItem() {
  const table = document.getElementById("item-table");
  const row = table.insertRow(-1);
  const index = table.rows.length - 1;

  row.innerHTML = `
    <td>${index}</td>
    <td><input type="text" class="desc" placeholder="Item description" /></td>
    <td><input type="number" class="qty" placeholder="Qty" oninput="updateSubtotal()" /></td>
    <td><input type="text" class="price" placeholder="Unit Price" oninput="updateSubtotal()" /></td>
    <td><input type="number" class="item-total" readonly /></td>
  `;
}

function parseMoney(value) {
  if (!value) return 0;
  // Remove currency symbols, commas, and spaces, then parse
  const cleaned = value.toString().replace(/[^\d.-]/g, '');
  return parseFloat(cleaned) || 0;
}

function updateSubtotal() {
  const rows = document.querySelectorAll("#item-table tr");
  let subtotal = 0;

  rows.forEach((row, i) => {
    if (i === 0) return;
    const qty = parseFloat(row.querySelector(".qty")?.value) || 0;
    const price = parseMoney(row.querySelector(".price")?.value);
    const total = qty * price;
    subtotal += total;

    const totalField = row.querySelector(".item-total");
    if (totalField) totalField.value = total.toFixed(2);
  });

  document.getElementById("subtotal").value = subtotal.toFixed(2);
  calculateSummary();
}

async function generateReport(event) {
  event.preventDefault();

  try {
    // Load and assign the next invoice number
    await loadNextInvoiceNumber();

    const form = document.getElementById("invoice-form");
    const formData = new FormData(form);
    const items = [];

    document.querySelectorAll("#item-table tr").forEach((row, i) => {
      if (i === 0) return;
      const desc = row.querySelector(".desc")?.value || "";
      const qty = row.querySelector(".qty")?.value || "";
      const price = row.querySelector(".price")?.value || "";
      const total = row.querySelector(".item-total")?.value || "";
      items.push({ desc, qty, price, total });
    });

    const data = {
      sessionId: currentSessionId,
      invoice_number: formData.get("invoice_number"),
      tin: formData.get("tin"),
      invoice_date: formData.get("date"),
      director: formData.get("director"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      payment_method: [...form.querySelectorAll("input[name='payment']:checked")].map(el => el.value).join(", "),
      account: formData.get("account"),
      holder: formData.get("holder"),
      bank: formData.get("bank"),
      branch: formData.get("branch"),
      subtotal: formData.get("subtotal"),
      vat: formData.get("vat"),
      discount: formData.get("discount"),
      grand_total: formData.get("total"),
      items
    };

    const saveResponse = await fetch("http://localhost:3000/save-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const response = await saveResponse.json();

    if (response.success) {
      generateReportHTML(data);
      // Load the next number for the subsequent form
      await loadNextInvoiceNumber();
    } else {
      alert(response.message || "Failed to save invoice.");
    }
  } catch (err) {
    console.error("Error:", err);
    if (err.message && err.message.includes("No range set")) {
      alert("Invoice number range not set. Please login as admin and set the range in the admin panel.");
    } else {
      alert("Server error.");
    }
  }
}

function generateReportHTML(data) {
  const config = JSON.parse(localStorage.getItem("invoiceConfig")) || {};
  const companyName = config.companyName || "OWERU INTERNATIONAL LIMITED";
  const logoUrl = "http://localhost:3000/oweru.jpeg";
  const address = config.address || "Tancot House, Posta - Dar es salaam";
  const companyPhone = config.companyPhone || "+255 711890764";
  const companyEmail = config.companyEmail || "info@oweru.com";

  const reportWindow = window.open("", "Invoice Report", "width=800,height=600");
  reportWindow.document.write("<html><head><title>Invoice Report</title>");
  reportWindow.document.write(`
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
  `);
  reportWindow.document.write("</head><body>");

  // Header with logo and company details
  reportWindow.document.write(`
    <div class="header">
      <img src="${logoUrl}" alt="Company Logo" class="logo" />
      <h1>${companyName}</h1>
      <h2>INVOICE</h2>
      <div class="company-info">
        <p>${address}</p>
        <p>Phone: ${companyPhone} | Email: ${companyEmail}</p>
      </div>
    </div>
    <div style="text-align: center; margin-bottom: 20px;">
      <button onclick="window.close()" style="padding: 10px 20px; background-color: #c28840; color: white; border: none; border-radius: 5px; cursor: pointer;">Back to Admin Dashboard</button>
    </div>
  `);

  reportWindow.document.write("<h2>Invoice Report</h2>");

  reportWindow.document.write(`
    <div class="invoice-details">
      <p><strong>Invoice Number:</strong> ${data.invoice_number}</p>
      <p><strong>TIN:</strong> ${data.tin}</p>
      <p><strong>Date:</strong> ${data.invoice_date}</p>
      <p><strong>Customer's Name:</strong> ${data.director}</p>
      <p><strong>Phone:</strong> ${data.phone}</p>
      <p><strong>Email:</strong> ${data.email}</p>
      <p><strong>Payment Method:</strong> ${data.payment_method}</p>
      <p><strong>Bank Account:</strong> ${data.account}</p>
      <p><strong>Holder Name:</strong> ${data.holder}</p>
      <p><strong>Bank Name:</strong> ${data.bank}</p>
      <p><strong>Branch:</strong> ${data.branch}</p>
    </div>
  `);

  reportWindow.document.write("<h3>Items</h3><table><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>");
  data.items.forEach(item => {
    reportWindow.document.write(`<tr><td>${item.desc}</td><td>${item.qty}</td><td>${item.price}</td><td>${item.total}</td></tr>`);
  });
  reportWindow.document.write("</table>");

  reportWindow.document.write("<h3>Summary</h3>");
  reportWindow.document.write(`<p><strong>Subtotal:</strong> ${data.subtotal}</p>`);
  reportWindow.document.write(`<p><strong>VAT & Tax:</strong> ${data.vat}</p>`);
  reportWindow.document.write(`<p><strong>Discount:</strong> ${data.discount}</p>`);
  reportWindow.document.write(`<p><strong>Grand Total:</strong> ${data.grand_total}</p>`);

  reportWindow.document.write("<h3>Terms & Conditions</h3>");
  reportWindow.document.write("<p>All items are personalized, returns and refunds are not accepted. Unless the item is defective upon arrival, we will offer a refund or exchange. Thank you for your business!</p>");

  // Footer with company details
  reportWindow.document.write(`
    <div class="footer">
      <p><strong>${companyName}</strong></p>
      <p>${address}</p>
      <p>Phone: ${companyPhone} | Email: ${companyEmail}</p>
      <p>Thank you for your business!</p>
    </div>
  `);

  reportWindow.document.write("</body></html>");
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.print();
}

// Admin functions
function addUser() {
  const username = document.getElementById("new-username").value;
  const password = document.getElementById("new-password").value;
  const role = document.getElementById("new-role").value;

  if (!username || !password) {
    alert("Please enter both username and password.");
    return;
  }

  fetch("http://localhost:3000/add-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: currentSessionId, username, password, role })
  })
  .then(res => res.json())
  .then(response => {
    if (response.success) {
      alert("User added successfully. The user can now log in with the provided credentials.");
      loadUsers();
      document.getElementById("new-username").value = "";
      document.getElementById("new-password").value = "";
    } else {
      alert("Failed to add user.");
    }
  })
  .catch(err => {
    console.error("Error adding user:", err);
    alert("Error adding user.");
  });
}

function loadUsers() {
  fetch(`http://localhost:3000/get-users?sessionId=${currentSessionId}`)
    .then(res => res.json())
    .then(users => {
      displayUsers(users);
    })
    .catch(err => {
      console.error("Error loading users:", err);
      alert("Failed to load users.");
    });
}

function displayUsers(users) {
  const list = document.getElementById("user-list");
  list.innerHTML = "";

  if (users.length === 0) {
    list.innerHTML = "<p>No users found.</p>";
    return;
  }

  users.forEach(user => {
    const userDiv = document.createElement("div");
    userDiv.className = "user-item";
    userDiv.innerHTML = `
      <p><strong>Username:</strong> ${user.username}</p>
      <p><strong>Role:</strong> ${user.role}</p>
      <button onclick="removeUser(${user.id})">Remove</button>
    `;
    list.appendChild(userDiv);
  });
}

function removeUser(userId) {
  if (confirm("Are you sure you want to remove this user?")) {
    fetch("http://localhost:3000/remove-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId, userId })
    })
    .then(res => res.json())
    .then(response => {
      if (response.success) {
        alert("User removed successfully.");
        loadUsers();
      } else {
        alert("Failed to remove user.");
      }
    })
    .catch(err => {
      console.error("Error removing user:", err);
      alert("Error removing user.");
    });
  }
}

function showInvoiceReports() {
  document.getElementById("admin-screen").style.display = "none";
  document.getElementById("reports-screen").style.display = "block";
  loadAllInvoices();
}

function showReceiptReports() {
  document.getElementById("admin-screen").style.display = "none";
  document.getElementById("reports-screen").style.display = "block";
  loadAllReceipts();
}

function loadAllInvoices() {
  fetch(`http://localhost:3000/get-all-invoices?sessionId=${currentSessionId}`)
    .then(res => res.json())
    .then(invoices => {
      displayAllInvoices(invoices);
    })
    .catch(err => {
      console.error("Error loading all invoices:", err);
      alert("Failed to load invoices.");
    });
}

function loadAllReceipts() {
  fetch(`http://localhost:3000/get-all-receipts?sessionId=${currentSessionId}`)
    .then(res => res.json())
    .then(receipts => {
      displayAllReceipts(receipts);
    })
    .catch(err => {
      console.error("Error loading all receipts:", err);
      alert("Failed to load receipts.");
    });
}

function displayAllReceipts(receipts) {
  const list = document.getElementById("reports-list");
  list.innerHTML = "";

  if (receipts.length === 0) {
    list.innerHTML = "<p>No receipts found.</p>";
    return;
  }

  receipts.forEach(receipt => {
    const receiptDiv = document.createElement("div");
    receiptDiv.className = "invoice-item";
    receiptDiv.innerHTML = `
      <h3>Receipt #${receipt.receipt_number}</h3>
      <p><strong>Date:</strong> ${receipt.receipt_date}</p>
      <p><strong>Customer Name:</strong> ${receipt.customer_name}</p>
      <p><strong>Created by:</strong> ${receipt.created_by || 'Unknown'}</p>
      <p><strong>Amount:</strong> ${receipt.amount}</p>
      <button onclick="reprintReceipt(${receipt.id})">Print Receipt</button>
      <button onclick="shareReceipt(${receipt.id})">Share</button>
    `;
    list.appendChild(receiptDiv);
  });
}

function displayAllInvoices(invoices) {
  const list = document.getElementById("reports-list");
  list.innerHTML = "";

  if (invoices.length === 0) {
    list.innerHTML = "<p>No invoices found.</p>";
    return;
  }

  invoices.forEach(invoice => {
    const invoiceDiv = document.createElement("div");
    invoiceDiv.className = "invoice-item";
    invoiceDiv.innerHTML = `
      <h3>Invoice #${invoice.invoice_number}</h3>
      <p><strong>Date:</strong> ${invoice.invoice_date}</p>
      <p><strong>Customer's Name:</strong> ${invoice.director}</p>
      <p><strong>Created by:</strong> ${invoice.created_by || 'Unknown'}</p>
      <p><strong>Total:</strong> ${invoice.grand_total}</p>
      <button onclick="reprintInvoice(${invoice.id})">Print Report</button>
      <button onclick="shareInvoice(${invoice.id})">Share</button>
    `;
    list.appendChild(invoiceDiv);
  });
}

function logout() {
  currentSessionId = null;
  currentUserRole = null;
  currentUsername = null;
  document.getElementById("admin-screen").style.display = "none";
  document.getElementById("login-screen").style.display = "block";
}

function openConfig() {
  document.getElementById("form-screen").style.display = "none";
  document.getElementById("config-screen").style.display = "block";
}

function backToForm() {
  document.getElementById("config-screen").style.display = "none";
  document.getElementById("history-screen").style.display = "none";
  document.getElementById("form-screen").style.display = "block";
  calculateSummary(); // Recalculate summary when returning to form to apply new config
}

function saveConfig() {
  const config = {
    password: document.getElementById("new-password").value,
    vat: document.getElementById("default-vat").value,
    discount: document.getElementById("default-discount").value,
    director: document.getElementById("default-director").value,
    logo: document.getElementById("logo-url").value,
    companyName: document.getElementById("company-name").value,
    address: document.getElementById("company-address").value,
    companyPhone: document.getElementById("company-phone").value,
    companyEmail: document.getElementById("company-email").value,
    account: document.getElementById("default-account").value,
    bank: document.getElementById("default-bank").value,
    branch: document.getElementById("default-branch").value
  };
  localStorage.setItem("invoiceConfig", JSON.stringify(config));
  alert("Configuration saved.");
}

function openHistory() {
  document.getElementById("form-screen").style.display = "none";
  document.getElementById("history-screen").style.display = "block";
  loadInvoices();
}

function loadInvoices() {
  fetch("http://localhost:3000/invoices")
    .then(res => res.json())
    .then(invoices => {
      displayInvoices(invoices);
    })
    .catch(err => {
      console.error("Error loading invoices:", err);
      alert("Failed to load invoices.");
    });
}

function displayInvoices(invoices) {
  const list = document.getElementById("invoice-list");
  list.innerHTML = "";

  if (invoices.length === 0) {
    list.innerHTML = "<p>No invoices found.</p>";
    return;
  }

  invoices.forEach(invoice => {
    const invoiceDiv = document.createElement("div");
    invoiceDiv.className = "invoice-item";
    invoiceDiv.innerHTML = `
      <h3>Invoice #${invoice.invoice_number}</h3>
      <p><strong>Date:</strong> ${invoice.invoice_date}</p>
      <p><strong>Customer's Name:</strong> ${invoice.director}</p>
      <p><strong>Total:</strong> ${invoice.grand_total}</p>
      <button onclick="reprintInvoice(${invoice.id})">Print Report</button>
      <button onclick="shareInvoice(${invoice.id})">Share</button>
    `;
    list.appendChild(invoiceDiv);
  });
}

function reprintInvoice(invoiceId) {
  fetch("http://localhost:3000/invoices")
    .then(res => res.json())
    .then(invoices => {
      const invoice = invoices.find(inv => inv.id == invoiceId);
      if (invoice) {
        generateReportFromData(invoice);
      } else {
        alert("Invoice not found.");
      }
    })
    .catch(err => {
      console.error("Error fetching invoice:", err);
      alert("Failed to reprint invoice.");
    });
}

function generateReportFromData(data) {
  const config = JSON.parse(localStorage.getItem("invoiceConfig")) || {};
  const companyName = config.companyName || "OWERU INTERNATIONAL LIMITED";
  const logoUrl = "http://localhost:3000/oweru.jpeg";
  const address = config.address || "Tancot House, Posta - Dar es salaam";
  const companyPhone = config.companyPhone || "+255 711890764";
  const companyEmail = config.companyEmail || "info@oweru.com";

  const reportWindow = window.open("", "Invoice Report", "width=800,height=600");
  reportWindow.document.write("<html><head><title>Invoice Report</title>");
  reportWindow.document.write(`
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
  `);
  reportWindow.document.write("</head><body>");

  // Header with logo and company details
  reportWindow.document.write(`
    <div class="header">
      <img src="${logoUrl}" alt="Company Logo" class="logo" />
      <h1>${companyName}</h1>
      <h2>INVOICE</h2>
      <div class="company-info">
        <p>${address}</p>
        <p>Phone: ${companyPhone} | Email: ${companyEmail}</p>
      </div>
    </div>
  `);

  reportWindow.document.write("<h2>Invoice Report</h2>");

  reportWindow.document.write(`
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
  `);

  reportWindow.document.write("<h3>Items</h3><table><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>");
  data.items.forEach(item => {
    reportWindow.document.write(`<tr><td>${item.description}</td><td>${item.quantity}</td><td>${item.unit_price}</td><td>${item.total}</td></tr>`);
  });
  reportWindow.document.write("</table>");

  reportWindow.document.write("<h3>Summary</h3>");
  reportWindow.document.write(`<p><strong>Subtotal:</strong> ${data.subtotal}</p>`);
  reportWindow.document.write(`<p><strong>VAT & Tax:</strong> ${data.vat}</p>`);
  reportWindow.document.write(`<p><strong>Discount:</strong> ${data.discount}</p>`);
  reportWindow.document.write(`<p><strong>Grand Total:</strong> ${data.grand_total}</p>`);

  reportWindow.document.write("<h3>Terms & Conditions</h3>");
  reportWindow.document.write("<p>All items are personalized, returns and refunds are not accepted. Unless the item is defective upon arrival, we will offer a refund or exchange. Thank you for your business!</p>");

  // Footer with company details
  reportWindow.document.write(`
    <div class="footer">
      <p><strong>${companyName}</strong></p>
      <p>${address}</p>
      <p>Phone: ${companyPhone} | Email: ${companyEmail}</p>
      <p>Thank you for your business!</p>
    </div>
  `);

  reportWindow.document.write("</body></html>");
  reportWindow.document.close();
  reportWindow.print();
}

// Invoice number range functions
function setRange() {
  const startRange = parseInt(document.getElementById("start-range").value);
  const endRange = parseInt(document.getElementById("end-range").value);
  const currentNumber = parseInt(document.getElementById("current-number").value) || startRange;

  if (!startRange || !endRange || startRange >= endRange) {
    alert("Please enter valid start and end ranges, with start less than end.");
    return;
  }

  if (currentNumber < startRange || currentNumber > endRange) {
    alert("Current number must be within the start and end range.");
    return;
  }

  fetch("http://localhost:3000/set-range", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: currentSessionId, startRange, endRange, currentNumber })
  })
  .then(res => res.json())
  .then(response => {
    if (response.success) {
      alert("Range set successfully.");
      loadCurrentRange();
      loadLogs();
      document.getElementById("start-range").value = "";
      document.getElementById("end-range").value = "";
      document.getElementById("current-number").value = "";
    } else {
      alert("Failed to set range: " + response.message);
    }
  })
  .catch(err => {
    console.error("Error setting range:", err);
    alert("Error setting range.");
  });
}

function loadCurrentRange() {
  fetch(`http://localhost:3000/get-current-range?sessionId=${currentSessionId}`)
    .then(res => res.json())
    .then(range => {
      const display = document.getElementById("current-range-display");
      if (range) {
        display.innerHTML = `<p><strong>Current Range:</strong> ${range.start_range} - ${range.end_range}</p><p><strong>Next Number:</strong> ${range.current_number}</p><button onclick="deleteRange()">Delete Range ${range.start_range}-${range.end_range}</button>`;
      } else {
        display.innerHTML = "<p>No range set.</p>";
      }
    })
    .catch(err => {
      console.error("Error loading range:", err);
      alert("Failed to load current range.");
    });
}

function deleteRange() {
  if (confirm("Are you sure you want to delete the current range?")) {
    fetch("http://localhost:3000/delete-range", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId })
    })
    .then(res => res.json())
    .then(response => {
      if (response.success) {
        alert("Range deleted successfully.");
        loadCurrentRange();
        loadLogs();
        // Reload the next invoice number for users
        if (currentUserRole !== 'admin') {
          loadNextInvoiceNumber();
        }
      } else {
        alert("Failed to delete range: " + response.message);
      }
    })
    .catch(err => {
      console.error("Error deleting range:", err);
      alert("Error deleting range.");
    });
  }
}

function loadLogs() {
  fetch(`http://localhost:3000/get-range-logs?sessionId=${currentSessionId}`)
    .then(res => res.json())
    .then(logs => {
      displayLogs(logs);
    })
    .catch(err => {
      console.error("Error loading logs:", err);
      alert("Failed to load logs.");
    });
}

function displayLogs(logs) {
  const display = document.getElementById("range-logs-display");
  display.innerHTML = "";

  if (logs.length === 0) {
    display.innerHTML = "<p>No logs found.</p>";
    return;
  }

  logs.forEach(log => {
    const logDiv = document.createElement("div");
    logDiv.className = "log-item";
    logDiv.innerHTML = `
      <p><strong>Action:</strong> ${log.action}</p>
      <p><strong>Range:</strong> ${log.range_start} - ${log.range_end}</p>
      <p><strong>Admin:</strong> ${log.admin_username || 'Unknown'}</p>
      <p><strong>Timestamp:</strong> ${new Date(log.timestamp).toLocaleString()}</p>
    `;
    display.appendChild(logDiv);
  });
}

function loadNextInvoiceNumber() {
  return fetch(`http://localhost:3000/get-next-invoice-number?sessionId=${currentSessionId}`)
    .then(res => res.json())
    .then(response => {
      if (response.nextNumber) {
        const invoiceNumberField = document.querySelector("input[name='invoice_number']");
        invoiceNumberField.value = response.nextNumber;
        invoiceNumberField.readOnly = true;
        return response.nextNumber;
      } else {
        throw new Error("Failed to load next invoice number: " + response.message);
      }
    })
    .catch(err => {
      console.error("Error loading next invoice number:", err);
      alert("Failed to load next invoice number.");
      throw err;
    });
}

// Dashboard functions
function openMailManagement() {
  alert("Mail Management System is under development.");
}

function openExpensesIncome() {
  document.getElementById("dashboard-screen").style.display = "none";
  document.getElementById("expenses-income-dashboard").style.display = "block";
}

function openInvoiceReceipt() {
  document.getElementById("dashboard-screen").style.display = "none";
  document.getElementById("invoice-receipt-dashboard").style.display = "block";
}

function openInvoiceForm() {
  document.getElementById("invoice-receipt-dashboard").style.display = "none";
  document.getElementById("form-screen").style.display = "block";
  initializePaymentListeners();
  loadNextInvoiceNumber();
}

function openReceiptForm() {
  document.getElementById("invoice-receipt-dashboard").style.display = "none";
  document.getElementById("receipt-screen").style.display = "block";
  initializeReceiptPaymentListeners();
}

function backToDashboard() {
  document.getElementById("form-screen").style.display = "none";
  document.getElementById("receipt-screen").style.display = "none";
  document.getElementById("receipt-history-screen").style.display = "none";
  document.getElementById("invoice-receipt-dashboard").style.display = "none";
  document.getElementById("expenses-income-dashboard").style.display = "none";
  document.getElementById("dashboard-screen").style.display = "block";
}

function openExpenses() {
  document.getElementById("expenses-income-dashboard").style.display = "none";
  document.getElementById("expenses-dashboard").style.display = "block";
}

function openIncome() {
  alert("Income management is under development.");
}

function openPettyCash() {
  document.getElementById("expenses-dashboard").style.display = "none";
  document.getElementById("petty-cash-screen").style.display = "block";
  loadPettyCashTransactions();
  loadPettyCashSummary();
  loadInitialCash();
}

function openPaymentVoucher() {
  document.getElementById("expenses-dashboard").style.display = "none";
  document.getElementById("payment-voucher-screen").style.display = "block";
  loadPaymentVouchers();
  loadPaymentVoucherSummary();
}

function backToExpensesIncomeDashboard() {
  document.getElementById("expenses-dashboard").style.display = "none";
  document.getElementById("expenses-income-dashboard").style.display = "block";
}

function backToExpensesDashboard() {
  document.getElementById("petty-cash-screen").style.display = "none";
  document.getElementById("expenses-income-dashboard").style.display = "block";
}

function backToInvoiceReceiptDashboard() {
  document.getElementById("form-screen").style.display = "none";
  document.getElementById("receipt-screen").style.display = "none";
  document.getElementById("receipt-history-screen").style.display = "none";
  document.getElementById("invoice-receipt-dashboard").style.display = "block";
}

function backToReceiptForm() {
  document.getElementById("receipt-history-screen").style.display = "none";
  document.getElementById("receipt-screen").style.display = "block";
}

function backToAdmin() {
  document.getElementById("reports-screen").style.display = "none";
  document.getElementById("admin-screen").style.display = "block";
}

// Receipt functions
function initializeReceiptPaymentListeners() {
  const paymentRadios = document.querySelectorAll("input[name='payment_method']");
  paymentRadios.forEach(radio => {
    radio.addEventListener('change', toggleReceiptBankDetails);
  });
}

function toggleReceiptBankDetails() {
  const bankDetailsSection = document.getElementById("bank-details-section");
  const bankInputs = document.querySelectorAll("input[name='bank_name'], input[name='branch_name'], input[name='reference_number']");

  if (document.querySelector("input[name='payment_method'][value='Bank Transfer']").checked) {
    bankDetailsSection.style.display = "block";
    bankInputs.forEach(input => input.required = true);
  } else {
    bankDetailsSection.style.display = "none";
    bankInputs.forEach(input => input.required = false);
  }
}

async function generateReceipt(event) {
  event.preventDefault();

  const form = document.getElementById("receipt-form");
  const formData = new FormData(form);

  const data = {
    sessionId: currentSessionId,
    receipt_number: formData.get("receipt_number"),
    customer_name: formData.get("customer_name"),
    paid_for: formData.get("paid_for"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    amount: formData.get("amount"),
    payment_method: formData.get("payment_method"),
    bank_name: formData.get("bank_name"),
    branch_name: formData.get("branch_name"),
    reference_number: formData.get("reference_number"),
    receipt_date: formData.get("receipt_date")
  };

  try {
    const saveResponse = await fetch("http://localhost:3000/save-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const response = await saveResponse.json();

    if (response.success) {
      generateReceiptHTML(data);
      form.reset();
      toggleReceiptBankDetails(); // Reset bank details visibility
    } else {
      alert("Failed to save receipt.");
    }
  } catch (err) {
    console.error("Error:", err);
    alert("Server error.");
  }
}

function generateReceiptHTML(data) {
  const config = JSON.parse(localStorage.getItem("invoiceConfig")) || {};
  const companyName = config.companyName || "OWERU INTERNATIONAL LIMITED";
  const logoUrl = "http://localhost:3000/oweru.jpeg";
  const address = config.address || "Tancot House, Posta - Dar es salaam";
  const companyPhone = config.companyPhone || "+255 711890764";
  const companyEmail = config.companyEmail || "info@oweru.com";

  const receiptWindow = window.open("", "Receipt Report", "width=800,height=600");
  receiptWindow.document.write("<html><head><title>Receipt Report</title>");
  receiptWindow.document.write(`
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
  `);
  receiptWindow.document.write("</head><body>");

  // Header with logo and company details
  receiptWindow.document.write(`
    <div class="header">
      <img src="${logoUrl}" alt="Company Logo" class="logo" />
      <h1>${companyName}</h1>
      <h2>RECEIPT</h2>
      <div class="company-info">
        <p>${address}</p>
        <p>Phone: ${companyPhone} | Email: ${companyEmail}</p>
      </div>
    </div>
  `);

  receiptWindow.document.write("<h2>Receipt Details</h2>");

  receiptWindow.document.write(`
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
  `);

  // Summary section
  receiptWindow.document.write("<h3>Summary</h3>");
  receiptWindow.document.write(`<p><strong>Total Amount Paid:</strong> ${data.amount}</p>`);

  receiptWindow.document.write("<h3>Terms & Conditions</h3>");
  receiptWindow.document.write("<p>All payments are non-refundable. Thank you for your business!</p>");

  // Footer with company details
  receiptWindow.document.write(`
    <div class="footer">
      <p><strong>${companyName}</strong></p>
      <p>${address}</p>
      <p>Phone: ${companyPhone} | Email: ${companyEmail}</p>
      <p>Thank you for your business!</p>
    </div>
  `);

  receiptWindow.document.write("</body></html>");
  receiptWindow.document.close();
  receiptWindow.focus();
  // Delay print to ensure content is fully loaded
  setTimeout(() => {
    receiptWindow.print();
  }, 500);
}

function openReceiptHistory() {
  document.getElementById("receipt-screen").style.display = "none";
  document.getElementById("receipt-history-screen").style.display = "block";
  loadReceipts();
}

function loadReceipts() {
  fetch("http://localhost:3000/receipts")
    .then(res => res.json())
    .then(receipts => {
      displayReceipts(receipts);
    })
    .catch(err => {
      console.error("Error loading receipts:", err);
      alert("Failed to load receipts.");
    });
}

function displayReceipts(receipts) {
  const list = document.getElementById("receipt-list");
  list.innerHTML = "";

  if (receipts.length === 0) {
    list.innerHTML = "<p>No receipts found.</p>";
    return;
  }

  receipts.forEach(receipt => {
    const receiptDiv = document.createElement("div");
    receiptDiv.className = "invoice-item";
    receiptDiv.innerHTML = `
      <h3>Receipt #${receipt.receipt_number}</h3>
      <p><strong>Date:</strong> ${receipt.receipt_date}</p>
      <p><strong>Customer Name:</strong> ${receipt.customer_name}</p>
      <p><strong>Amount:</strong> ${receipt.amount}</p>
      <button onclick="reprintReceipt(${receipt.id})">Print Receipt</button>
      <button onclick="shareReceipt(${receipt.id})">Share</button>
    `;
    list.appendChild(receiptDiv);
  });
}

function reprintReceipt(receiptId) {
  fetch("http://localhost:3000/receipts")
    .then(res => res.json())
    .then(receipts => {
      const receipt = receipts.find(rec => rec.id == receiptId);
      if (receipt) {
        generateReceiptHTML(receipt);
      } else {
        alert("Receipt not found.");
      }
    })
    .catch(err => {
      console.error("Error fetching receipt:", err);
      alert("Failed to reprint receipt.");
    });
}

function shareInvoice(invoiceId) {
  const pdfUrl = `http://localhost:3000/generate-pdf/invoice/${invoiceId}?sessionId=${currentSessionId}`;
  const message = `Download Invoice PDF: ${pdfUrl}`;
  document.getElementById("share-message").textContent = message;
  const downloadBtn = document.getElementById("download-pdf-btn");
  downloadBtn.href = pdfUrl;
  downloadBtn.download = `invoice_${invoiceId}.pdf`;
  document.getElementById("share-modal").style.display = "block";
}

function shareReceipt(receiptId) {
  const pdfUrl = `http://localhost:3000/generate-pdf/receipt/${receiptId}?sessionId=${currentSessionId}`;
  const message = `Download Receipt PDF: ${pdfUrl}`;
  document.getElementById("share-message").textContent = message;
  const downloadBtn = document.getElementById("download-pdf-btn");
  downloadBtn.href = pdfUrl;
  downloadBtn.download = `receipt_${receiptId}.pdf`;
  document.getElementById("share-modal").style.display = "block";
}

function closeShareModal() {
  document.getElementById("share-modal").style.display = "none";
}

function shareViaEmail() {
  const message = document.getElementById("share-message").textContent;
  const subject = "Shared Document from OWERU Invoice System";
  const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  window.open(mailtoLink);
}

function copyLink() {
  const message = document.getElementById("share-message").textContent;
  navigator.clipboard.writeText(message).then(() => {
    alert("Document details copied to clipboard!");
  }).catch(err => {
    console.error("Failed to copy: ", err);
    alert("Failed to copy to clipboard.");
  });
}

function shareViaWhatsApp() {
  const message = document.getElementById("share-message").textContent;
  const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

function shareViaFacebook() {
  const message = document.getElementById("share-message").textContent;
  const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}&quote=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

// Petty Cash functions
function loadPettyCashTransactions() {
  fetch(`http://localhost:3000/petty-cash-transactions?sessionId=${currentSessionId}`)
    .then(res => res.json())
    .then(transactions => {
      displayPettyCashTransactions(transactions);
    })
    .catch(err => {
      console.error("Error loading petty cash transactions:", err);
      alert("Failed to load petty cash transactions.");
    });
}

function loadPettyCashSummary() {
  fetch(`http://localhost:3000/petty-cash-summary?sessionId=${currentSessionId}`)
    .then(res => res.json())
    .then(summary => {
      document.getElementById("total-cash").textContent = summary.initial_cash || "0.00";
      document.getElementById("total-payments").textContent = summary.total_spent || "0.00";
      document.getElementById("available-balance").textContent = summary.available_balance || "0.00";
    })
    .catch(err => {
      console.error("Error loading petty cash summary:", err);
      alert("Failed to load petty cash summary.");
    });
}

function loadInitialCash() {
  fetch(`http://localhost:3000/petty-cash-summary?sessionId=${currentSessionId}`)
    .then(res => res.json())
    .then(summary => {
      document.getElementById("initial-cash-input").value = summary.initial_cash || "";
    })
    .catch(err => {
      console.error("Error loading initial cash:", err);
      alert("Failed to load initial cash.");
    });
}

function setInitialCash() {
  const amount = parseFloat(document.getElementById("initial-cash-input").value);
  if (isNaN(amount) || amount < 0) {
    alert("Please enter a valid initial cash amount.");
    return;
  }

  fetch("http://localhost:3000/petty-cash-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: currentSessionId, initialCash: amount })
  })
  .then(res => res.json())
  .then(response => {
    if (response.success) {
      alert("Initial cash added successfully.");
      document.getElementById("initial-cash-input").value = "";
      loadPettyCashSummary();
      loadInitialCash(); // Reload to show updated value
    } else {
      alert("Failed to add initial cash.");
    }
  })
  .catch(err => {
    console.error("Error adding initial cash:", err);
    alert("Failed to add initial cash.");
  });
}

function displayPettyCashTransactions(transactions) {
  const tbody = document.getElementById("petty-cash-tbody");
  tbody.innerHTML = "";

  if (transactions.length === 0) {
    tbody.innerHTML = "<tr><td colspan='5'>No transactions found.</td></tr>";
    return;
  }

  transactions.forEach(transaction => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${transaction.date}</td>
      <td>${transaction.description}</td>
      <td>${transaction.category}</td>
      <td>${transaction.amount}</td>
      <td>
        <button onclick="editPettyCashTransaction(${transaction.id})">Edit</button>
        <button onclick="deletePettyCashTransaction(${transaction.id})">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function addPettyCashTransaction() {
  document.getElementById("modal-title").textContent = "Add Transaction";
  document.getElementById("transaction-form").reset();
  document.getElementById("transaction-modal").style.display = "block";
}

function closeTransactionModal() {
  document.getElementById("transaction-modal").style.display = "none";
}

function exportPettyCash() {
  const period = document.getElementById("export-period").value;
  let url = `http://localhost:3000/export-petty-cash?sessionId=${currentSessionId}`;
  if (period) url += `&period=${period}`;

  fetch(url)
    .then(res => res.blob())
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "petty_cash_transactions.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
    })
    .catch(err => {
      console.error("Error exporting petty cash:", err);
      alert("Failed to export petty cash transactions.");
    });
}

function showPettyCashDashboard() {
  // Already on dashboard, perhaps refresh data
  loadPettyCashTransactions();
  loadPettyCashSummary();
}

function showPettyCashTransactions() {
  // Already showing transactions, perhaps refresh
  loadPettyCashTransactions();
}

function editPettyCashTransaction(id) {
  fetch(`http://localhost:3000/petty-cash-transaction/${id}?sessionId=${currentSessionId}`)
    .then(res => res.json())
    .then(transaction => {
      document.getElementById("modal-title").textContent = "Edit Transaction";
      document.getElementById("transaction-date").value = transaction.date;
      document.getElementById("transaction-description").value = transaction.description;
      document.getElementById("transaction-category").value = transaction.category;
      document.getElementById("transaction-amount").value = transaction.amount;
      document.getElementById("transaction-modal").style.display = "block";
      // Store transaction ID for update
      document.getElementById("transaction-form").dataset.transactionId = id;
    })
    .catch(err => {
      console.error("Error loading transaction:", err);
      alert("Failed to load transaction.");
    });
}

function deletePettyCashTransaction(id) {
  if (confirm("Are you sure you want to delete this transaction?")) {
    fetch(`http://localhost:3000/petty-cash-transaction/${id}?sessionId=${currentSessionId}`, {
      method: "DELETE"
    })
    .then(res => res.json())
    .then(response => {
      if (response.success) {
        loadPettyCashTransactions();
        loadPettyCashSummary();
      } else {
        alert("Failed to delete transaction.");
      }
    })
    .catch(err => {
      console.error("Error deleting transaction:", err);
      alert("Failed to delete transaction.");
    });
  }
}

// Payment Voucher functions
function loadPaymentVouchers() {
  fetch(`http://localhost:3000/payment-vouchers?sessionId=${currentSessionId}`)
    .then(res => res.json())
    .then(vouchers => {
      displayPaymentVouchers(vouchers);
    })
    .catch(err => {
      console.error("Error loading payment vouchers:", err);
      alert("Failed to load payment vouchers.");
    });
}

function loadPaymentVoucherSummary() {
  fetch(`http://localhost:3000/payment-voucher-summary?sessionId=${currentSessionId}`)
    .then(res => res.json())
    .then(summary => {
      document.getElementById("total-vouchers").textContent = summary.total_vouchers || "0";
      document.getElementById("pending-approval").textContent = summary.pending_approval || "0";
      document.getElementById("approved-vouchers").textContent = summary.approved_vouchers || "0";
    })
    .catch(err => {
      console.error("Error loading payment voucher summary:", err);
      alert("Failed to load payment voucher summary.");
    });
}

function displayPaymentVouchers(vouchers) {
  const tbody = document.getElementById("voucher-table-body");
  tbody.innerHTML = "";

  if (vouchers.length === 0) {
    tbody.innerHTML = "<tr><td colspan='7'>No vouchers found.</td></tr>";
    return;
  }

  vouchers.forEach(voucher => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${voucher.voucher_number}</td>
      <td>${voucher.date}</td>
      <td>${voucher.category}</td>
      <td>${voucher.description}</td>
      <td>${voucher.amount}</td>
      <td>${voucher.status}</td>
      <td>
        <button onclick="editPaymentVoucher(${voucher.id})">Edit</button>
        <button onclick="deletePaymentVoucher(${voucher.id})">Delete</button>
        <button onclick="approvePaymentVoucher(${voucher.id})">Approve</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function openVoucherModal() {
  document.getElementById("voucher-modal-title").textContent = "Add New Voucher";
  document.getElementById("voucher-form").reset();
  // Generate voucher number
  generateVoucherNumber();
  document.getElementById("voucher-modal").style.display = "block";
}

function closeVoucherModal() {
  document.getElementById("voucher-modal").style.display = "none";
}

function generateVoucherNumber() {
  fetch(`http://localhost:3000/get-next-voucher-number?sessionId=${currentSessionId}`)
    .then(res => res.json())
    .then(response => {
      if (response.nextNumber) {
        document.getElementById("voucher-number").value = response.nextNumber;
      }
    })
    .catch(err => {
      console.error("Error generating voucher number:", err);
    });
}

function editPaymentVoucher(id) {
  fetch(`http://localhost:3000/payment-voucher/${id}?sessionId=${currentSessionId}`)
    .then(res => res.json())
    .then(voucher => {
      document.getElementById("voucher-modal-title").textContent = "Edit Voucher";
      document.getElementById("voucher-number").value = voucher.voucher_number;
      document.getElementById("voucher-date").value = voucher.date;
      document.getElementById("voucher-category").value = voucher.category;
      document.getElementById("voucher-description").value = voucher.description;
      document.getElementById("voucher-amount").value = voucher.amount;
      document.getElementById("voucher-modal").style.display = "block";
      // Store voucher ID for update
      document.getElementById("voucher-form").dataset.voucherId = id;
    })
    .catch(err => {
      console.error("Error loading voucher:", err);
      alert("Failed to load voucher.");
    });
}

function deletePaymentVoucher(id) {
  if (confirm("Are you sure you want to delete this voucher?")) {
    fetch(`http://localhost:3000/payment-voucher/${id}?sessionId=${currentSessionId}`, {
      method: "DELETE"
    })
    .then(res => res.json())
    .then(response => {
      if (response.success) {
        loadPaymentVouchers();
        loadPaymentVoucherSummary();
      } else {
        alert("Failed to delete voucher.");
      }
    })
    .catch(err => {
      console.error("Error deleting voucher:", err);
      alert("Failed to delete voucher.");
    });
  }
}

function approvePaymentVoucher(id) {
  if (confirm("Are you sure you want to approve this voucher?")) {
    fetch(`http://localhost:3000/approve-payment-voucher/${id}?sessionId=${currentSessionId}`, {
      method: "PUT"
    })
    .then(res => res.json())
    .then(response => {
      if (response.success) {
        loadPaymentVouchers();
        loadPaymentVoucherSummary();
      } else {
        alert("Failed to approve voucher.");
      }
    })
    .catch(err => {
      console.error("Error approving voucher:", err);
      alert("Failed to approve voucher.");
    });
  }
}

function exportPaymentVouchers() {
  const period = document.getElementById("export-period").value;
  let url = `http://localhost:3000/export-payment-vouchers?sessionId=${currentSessionId}`;
  if (period) url += `&period=${period}`;

  fetch(url)
    .then(res => res.blob())
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "payment_vouchers.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
    })
    .catch(err => {
      console.error("Error exporting payment vouchers:", err);
      alert("Failed to export payment vouchers.");
    });
}

function showPaymentVoucherDashboard() {
  // Already on dashboard, perhaps refresh data
  loadPaymentVouchers();
  loadPaymentVoucherSummary();
}

function showPaymentVouchers() {
  // Already showing vouchers, perhaps refresh
  loadPaymentVouchers();
}

function backToExpensesDashboardFromVoucher() {
  document.getElementById("payment-voucher-screen").style.display = "none";
  document.getElementById("expenses-dashboard").style.display = "block";
}

function backToDashboardFromVoucher() {
  document.getElementById("payment-voucher-screen").style.display = "none";
  document.getElementById("dashboard-screen").style.display = "block";
}

// Add event listeners for modal buttons
document.addEventListener("DOMContentLoaded", function() {
  document.getElementById("copy-link-btn").addEventListener("click", copyLink);
  document.getElementById("email-share-btn").addEventListener("click", shareViaEmail);

  // Petty Cash form submission
  document.getElementById("transaction-form").addEventListener("submit", function(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const transactionId = event.target.dataset.transactionId;
    const data = {
      sessionId: currentSessionId,
      date: formData.get("transaction-date"),
      description: formData.get("transaction-description"),
      category: formData.get("transaction-category"),
      amount: parseFloat(formData.get("transaction-amount"))
    };

    let url, method;
    if (transactionId) {
      url = `http://localhost:3000/edit-petty-cash-transaction`;
      method = "PUT";
      data.id = transactionId;
    } else {
      url = "http://localhost:3000/add-petty-cash-transaction";
      method = "POST";
    }

    fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(response => {
      if (response.success) {
        closeTransactionModal();
        loadPettyCashTransactions();
        loadPettyCashSummary();
        delete event.target.dataset.transactionId; // Clear transaction ID
      } else {
        alert("Failed to save transaction.");
      }
    })
    .catch(err => {
      console.error("Error saving transaction:", err);
      alert("Failed to save transaction.");
    });
  });

  // Payment Voucher form submission
  document.getElementById("voucher-form").addEventListener("submit", function(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const voucherId = event.target.dataset.voucherId;
    const data = {
      sessionId: currentSessionId,
      voucher_number: formData.get("voucher-number"),
      date: formData.get("voucher-date"),
      category: formData.get("voucher-category"),
      description: formData.get("voucher-description"),
      amount: parseFloat(formData.get("voucher-amount"))
    };

    let url, method;
    if (voucherId) {
      url = `http://localhost:3000/edit-payment-voucher`;
      method = "PUT";
      data.id = voucherId;
    } else {
      url = "http://localhost:3000/add-payment-voucher";
      method = "POST";
    }

    fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(response => {
      if (response.success) {
        closeVoucherModal();
        loadPaymentVouchers();
        loadPaymentVoucherSummary();
        delete event.target.dataset.voucherId; // Clear voucher ID
      } else {
        alert("Failed to save voucher.");
      }
    })
    .catch(err => {
      console.error("Error saving voucher:", err);
      alert("Failed to save voucher.");
    });
  });
});
