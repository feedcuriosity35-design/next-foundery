const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'nextfoundery.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency and performance
db.pragma('journal_mode = WAL');

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT UNIQUE NOT NULL,
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    interest TEXT,
    amount INTEGER NOT NULL DEFAULT 199,
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'created', -- 'created', 'pending_verification', 'paid', 'failed'
    payment_method TEXT DEFAULT 'upi',
    utr_reference TEXT,
    verification_token TEXT UNIQUE,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    verified_at TEXT
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS webhook_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT,
    payload TEXT,
    received_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
  CREATE INDEX IF NOT EXISTS idx_orders_rzp_order_id ON orders(razorpay_order_id);
  CREATE INDEX IF NOT EXISTS idx_orders_token ON orders(verification_token);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
`);

// Safe migrations for Cashfree columns
try { db.exec(`ALTER TABLE orders ADD COLUMN cashfree_order_id TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE orders ADD COLUMN cashfree_payment_id TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE orders ADD COLUMN cashfree_session_id TEXT;`); } catch (e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_cf_order_id ON orders(cashfree_order_id);`); } catch (e) {}


/**
 * Generate a clean, human-readable order ID
 * e.g. NF-ORD-20261014-A8B9C
 */
function generateOrderId() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `NF-ORD-${dateStr}-${randomSuffix}`;
}

/**
 * Create a new registration order
 * Price is strictly enforced as 199
 */
function createOrder({ name, email, phone, interest = '', razorpayOrderId = null, paymentMethod = 'upi' }) {
  const orderId = generateOrderId();
  const stmt = db.prepare(`
    INSERT INTO orders (
      order_id, razorpay_order_id, name, email, phone, interest, amount, currency, status, payment_method
    ) VALUES (
      @orderId, @razorpayOrderId, @name, @email, @phone, @interest, 199, 'INR', 'created', @paymentMethod
    )
  `);

  stmt.run({
    orderId,
    razorpayOrderId,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    interest: interest ? interest.trim() : '',
    paymentMethod,
  });

  return getOrderById(orderId);
}

/**
 * Fetch an order by order_id
 */
function getOrderById(orderId) {
  if (!orderId) return null;
  const stmt = db.prepare(`SELECT * FROM orders WHERE order_id = ?`);
  return stmt.get(orderId) || null;
}

/**
 * Fetch an order by Razorpay order id
 */
function getOrderByRazorpayOrderId(rzpOrderId) {
  if (!rzpOrderId) return null;
  const stmt = db.prepare(`SELECT * FROM orders WHERE razorpay_order_id = ?`);
  return stmt.get(rzpOrderId) || null;
}

/**
 * Fetch an order by Cashfree order id
 */
function getOrderByCashfreeOrderId(cfOrderId) {
  if (!cfOrderId) return null;
  const stmt = db.prepare(`SELECT * FROM orders WHERE cashfree_order_id = ? OR order_id = ?`);
  return stmt.get(cfOrderId, cfOrderId) || null;
}

/**
 * Update order with Cashfree order id & session id
 */
function updateCashfreeOrder(orderId, { cashfreeOrderId, paymentSessionId }) {
  const stmt = db.prepare(`
    UPDATE orders 
    SET cashfree_order_id = @cashfreeOrderId,
        cashfree_session_id = @paymentSessionId,
        payment_method = 'cashfree',
        updated_at = CURRENT_TIMESTAMP
    WHERE order_id = @orderId
  `);
  stmt.run({
    orderId,
    cashfreeOrderId,
    paymentSessionId: paymentSessionId || null,
  });
  return getOrderById(orderId);
}

/**
 * Fetch an order by verification token
 */
function getOrderByToken(token) {
  if (!token) return null;
  const stmt = db.prepare(`SELECT * FROM orders WHERE verification_token = ?`);
  return stmt.get(token) || null;
}

/**
 * Update order when UTR reference is submitted for manual/QR payment
 */
function submitOrderUTR({ orderId, utrReference, notes = '' }) {
  const stmt = db.prepare(`
    UPDATE orders 
    SET status = 'pending_verification',
        utr_reference = @utrReference,
        notes = @notes,
        updated_at = CURRENT_TIMESTAMP
    WHERE order_id = @orderId
  `);
  stmt.run({ orderId, utrReference: utrReference.trim(), notes });
  return getOrderById(orderId);
}

/**
 * Formally verify payment and transition order to 'paid'
 * Generates an immutable, cryptographic verification token for the post-payment success page
 */
function verifyOrderPayment({ orderId, razorpayPaymentId = null, paymentMethod = 'upi', notes = '' }) {
  const order = getOrderById(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  // If already paid, return existing record idempotently
  if (order.status === 'paid' && order.verification_token) {
    return order;
  }

  const verificationToken = crypto.randomBytes(24).toString('hex');
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE orders 
    SET status = 'paid',
        razorpay_payment_id = COALESCE(@razorpayPaymentId, razorpay_payment_id),
        payment_method = @paymentMethod,
        verification_token = @verificationToken,
        verified_at = @now,
        notes = @notes,
        updated_at = CURRENT_TIMESTAMP
    WHERE order_id = @orderId
  `);

  stmt.run({
    orderId,
    razorpayPaymentId: razorpayPaymentId || order.razorpay_payment_id,
    paymentMethod,
    verificationToken,
    now,
    notes: notes || order.notes,
  });

  return getOrderById(orderId);
}

/**
 * Formally verify Cashfree payment and transition order to 'paid'
 */
function verifyCashfreePayment({ orderId, cashfreePaymentId = null, paymentMethod = 'cashfree', notes = '' }) {
  const order = getOrderById(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  if (order.status === 'paid' && order.verification_token) {
    return order;
  }

  const verificationToken = crypto.randomBytes(24).toString('hex');
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE orders 
    SET status = 'paid',
        cashfree_payment_id = COALESCE(@cashfreePaymentId, cashfree_payment_id),
        payment_method = @paymentMethod,
        verification_token = @verificationToken,
        verified_at = @now,
        notes = @notes,
        updated_at = CURRENT_TIMESTAMP
    WHERE order_id = @orderId
  `);

  stmt.run({
    orderId,
    cashfreePaymentId: cashfreePaymentId || order.cashfree_payment_id,
    paymentMethod,
    verificationToken,
    now,
    notes: notes || order.notes || 'Verified via Cashfree PG',
  });

  return getOrderById(orderId);
}

/**
 * Mark order as failed or cancelled
 */
function markOrderFailed({ orderId, notes = '' }) {
  const stmt = db.prepare(`
    UPDATE orders 
    SET status = 'failed',
        notes = @notes,
        updated_at = CURRENT_TIMESTAMP
    WHERE order_id = @orderId
  `);
  stmt.run({ orderId, notes });
  return getOrderById(orderId);
}

/**
 * Update Razorpay Order ID for an existing internal order
 */
function updateRazorpayOrderId(orderId, razorpayOrderId) {
  const stmt = db.prepare(`
    UPDATE orders 
    SET razorpay_order_id = ?
    WHERE order_id = ?
  `);
  stmt.run(razorpayOrderId, orderId);
  return getOrderById(orderId);
}

/**
 * Save contact inquiry
 */
function saveContact({ name, email, phone = '', subject, message }) {
  const stmt = db.prepare(`
    INSERT INTO contacts (name, email, phone, subject, message)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(name.trim(), email.trim(), phone.trim(), subject.trim(), message.trim());
  return result.lastInsertRowid;
}

/**
 * Record webhook event for idempotent processing
 */
function recordWebhook({ eventId, eventType, payload }) {
  try {
    const stmt = db.prepare(`
      INSERT INTO webhook_logs (event_id, event_type, payload)
      VALUES (?, ?, ?)
    `);
    stmt.run(eventId, eventType, typeof payload === 'string' ? payload : JSON.stringify(payload));
    return true; // Newly recorded
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || err.message.includes('UNIQUE constraint failed')) {
      return false; // Already processed
    }
    throw err;
  }
}

/**
 * Get all orders (for admin/reviewer testing)
 */
function getAllOrders(limit = 100) {
  const stmt = db.prepare(`SELECT * FROM orders ORDER BY id DESC LIMIT ?`);
  return stmt.all(limit);
}

module.exports = {
  db,
  generateOrderId,
  createOrder,
  getOrderById,
  getOrderByRazorpayOrderId,
  getOrderByCashfreeOrderId,
  getOrderByToken,
  submitOrderUTR,
  verifyOrderPayment,
  verifyCashfreePayment,
  markOrderFailed,
  updateRazorpayOrderId,
  updateCashfreeOrder,
  saveContact,
  recordWebhook,
  getAllOrders,
};
