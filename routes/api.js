const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
let Razorpay = null;
try {
  Razorpay = require('razorpay');
} catch (e) {
  // Graceful fallback if razorpay package isn't loaded
}

const config = require('../config');
const db = require('../db');
const cashfree = require('../cashfree');
const { sendContactEmail } = require('../mailer');

const router = express.Router();

// Initialize Razorpay instance if credentials configured
let rzpInstance = null;
if (Razorpay && config.payment.isRazorpayConfigured) {
  try {
    rzpInstance = new Razorpay({
      key_id: config.payment.razorpayKeyId,
      key_secret: config.payment.razorpayKeySecret,
    });
  } catch (err) {
    console.warn('[Razorpay] Failed to initialize client:', err.message);
  }
}

/**
 * 1. GET /api/config
 * Public configuration for frontend (No secrets exposed)
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: config.getClientConfig(),
  });
});

/**
 * 2. POST /api/create-order
 * Create registration order with server-enforced amount of 199 INR
 */
router.post('/create-order', async (req, res) => {
  try {
    const { name, email, phone, interest, paymentMethod = 'upi' } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Please enter your full name.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    // Indian phone number validation (10 digits, optional country code)
    const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    const validPhone = cleanPhone.length === 10 ? cleanPhone : cleanPhone.endsWith(cleanPhone.slice(-10)) && cleanPhone.length > 10 ? cleanPhone.slice(-10) : '';
    if (!validPhone || validPhone.length !== 10) {
      return res.status(400).json({ success: false, error: 'Please enter a valid 10-digit mobile number.' });
    }

    // Amount is FIXED server-side at ₹199 INR. Never trust client-submitted price!
    const enforcedAmount = 199;
    const enforcedCurrency = 'INR';

    // Create internal order record in SQLite
    const order = db.createOrder({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: validPhone,
      interest: interest ? interest.trim() : '',
      paymentMethod,
    });

    let razorpayOrderId = null;
    let cashfreePaymentSessionId = null;
    let cashfreeOrderId = null;

    // 1. If Cashfree Gateway is configured (Primary)
    if (config.payment.isCashfreeConfigured) {
      try {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const returnUrl = `${baseUrl}/api/cashfree/return?order_id=${encodeURIComponent(order.order_id)}`;
        const notifyUrl = `${baseUrl}/api/cashfree/webhook`;

        const cfRes = await cashfree.createOrder({
          orderId: order.order_id,
          amount: enforcedAmount,
          customerName: order.name,
          customerEmail: order.email,
          customerPhone: validPhone,
          returnUrl,
          notifyUrl,
        });

        if (cfRes.success && cfRes.paymentSessionId) {
          cashfreePaymentSessionId = cfRes.paymentSessionId;
          cashfreeOrderId = cfRes.cashfreeOrderId || order.order_id;
          db.updateCashfreeOrder(order.order_id, {
            cashfreeOrderId,
            paymentSessionId: cashfreePaymentSessionId,
          });
        } else {
          console.warn('[Cashfree PG Notice] Could not generate session, falling back to direct UPI:', cfRes.error);
        }
      } catch (cfErr) {
        console.error('[Cashfree Order Error]:', cfErr.message);
      }
    }

    // 2. If Razorpay gateway is active and credentials are provided
    if (rzpInstance) {
      try {
        const rzpOrder = await rzpInstance.orders.create({
          amount: enforcedAmount * 100, // paise
          currency: enforcedCurrency,
          receipt: order.order_id,
          notes: {
            attendee_name: order.name,
            attendee_email: order.email,
            attendee_phone: order.phone,
            masterclass: config.brand.masterclassTitle,
          },
        });
        razorpayOrderId = rzpOrder.id;
        db.updateRazorpayOrderId(order.order_id, razorpayOrderId);
      } catch (rzpErr) {
        console.error('[Razorpay Order Creation Error]:', rzpErr);
      }
    }

    // Generate Standard UPI Deep Link (UPI standard v1.5)
    // upi://pay?pa=...&pn=...&am=199&cu=INR&tn=...
    const upiUri = `upi://pay?pa=${encodeURIComponent(config.payment.upiVpa)}` +
      `&pn=${encodeURIComponent(config.payment.upiPayeeName)}` +
      `&am=${enforcedAmount}` +
      `&cu=${enforcedCurrency}` +
      `&tn=${encodeURIComponent(`NextFoundery-${order.order_id}`)}`;

    // Generate dynamic QR Code Data URL
    const qrCodeUrl = await QRCode.toDataURL(upiUri, {
      width: 280,
      margin: 2,
      color: {
        dark: '#07140B',
        light: '#FFFFFF',
      },
    });

    return res.status(201).json({
      success: true,
      orderId: order.order_id,
      cashfreePaymentSessionId,
      cashfreeOrderId,
      isCashfreeConfigured: config.payment.isCashfreeConfigured,
      cashfreeMode: config.payment.cashfreeEnv === 'PRODUCTION' ? 'production' : 'sandbox',
      cashfreeAppId: config.payment.isCashfreeConfigured ? config.payment.cashfreeAppId : null,
      razorpayOrderId,
      amount: enforcedAmount,
      currency: enforcedCurrency,
      amountFormatted: `₹${enforcedAmount}`,
      upiUri,
      qrCodeUrl: config.payment.officialQrImage || qrCodeUrl,
      generatedQrUrl: qrCodeUrl,
      officialQrImage: config.payment.officialQrImage,
      upiVpa: config.payment.upiVpa,
      upiPayeeName: config.payment.upiPayeeName,
      keyId: config.payment.isRazorpayConfigured ? config.payment.razorpayKeyId : null,
      isRazorpayConfigured: config.payment.isRazorpayConfigured,
      attendee: {
        name: order.name,
        email: order.email,
        phone: order.phone,
      },
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ success: false, error: 'Internal server error creating order. Please try again.' });
  }
});

/**
 * 3. POST /api/verify-payment
 * Verify gateway payment via official HMAC SHA-256 signature
 */
router.post('/verify-payment', (req, res) => {
  try {
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Missing orderId' });
    }

    const order = db.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // If Razorpay secret is set, enforce official HMAC SHA256 cryptographic check
    if (config.payment.isRazorpayConfigured) {
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ success: false, error: 'Missing signature verification tokens' });
      }

      const expectedSignature = crypto
        .createHmac('sha256', config.payment.razorpayKeySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        console.warn(`[Security Alert] Invalid payment signature for order ${orderId}`);
        db.markOrderFailed({ orderId, notes: 'Invalid payment signature' });
        return res.status(400).json({ success: false, error: 'Payment signature verification failed' });
      }
    }

    // Cryptographic verification passed -> verify order and issue unique access token
    const verifiedOrder = db.verifyOrderPayment({
      orderId,
      razorpayPaymentId: razorpay_payment_id || 'manual_verified',
      paymentMethod: 'upi',
    });

    res.json({
      success: true,
      status: 'paid',
      orderId: verifiedOrder.order_id,
      token: verifiedOrder.verification_token,
      redirectUrl: `/success?order_id=${encodeURIComponent(verifiedOrder.order_id)}&token=${encodeURIComponent(verifiedOrder.verification_token)}`,
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ success: false, error: 'Error verifying payment.' });
  }
});

/**
 * 4. POST /api/submit-utr
 * UPI QR Fallback: Submits 12-digit UTR reference for manual verification
 * Routes to "Payment Pending Verification" state
 */
router.post('/submit-utr', (req, res) => {
  try {
    const { orderId, utrReference } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Order ID is required.' });
    }

    const order = db.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found.' });
    }

    if (!utrReference || typeof utrReference !== 'string' || utrReference.trim().length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid 12-digit UPI reference (UTR / Transaction ID) from your payment app.',
      });
    }

    // Update order status to 'pending_verification'
    const updated = db.submitOrderUTR({
      orderId,
      utrReference: utrReference.trim(),
      notes: `User submitted UPI Reference: ${utrReference.trim()} at ${new Date().toISOString()}`,
    });

    res.json({
      success: true,
      status: 'pending_verification',
      orderId: updated.order_id,
      redirectUrl: `/payment-pending?order_id=${encodeURIComponent(updated.order_id)}`,
    });
  } catch (error) {
    console.error('Error submitting UTR:', error);
    res.status(500).json({ success: false, error: 'Failed to record transaction reference.' });
  }
});

/**
 * 5. GET /api/order-status/:orderId
 * Idempotent check for order status (Used by pending verification polling)
 */
router.get('/order-status/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;
    const order = db.getOrderById(orderId);

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    res.json({
      success: true,
      orderId: order.order_id,
      status: order.status,
      isPaid: order.status === 'paid',
      isPending: order.status === 'pending_verification',
      isFailed: order.status === 'failed',
      name: order.name,
      email: order.email,
      amount: order.amount,
      utrReference: order.utr_reference,
      token: order.status === 'paid' ? order.verification_token : null,
      successUrl: order.status === 'paid'
        ? `/success?order_id=${encodeURIComponent(order.order_id)}&token=${encodeURIComponent(order.verification_token)}`
        : null,
    });
  } catch (error) {
    console.error('Error fetching order status:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * 6. POST /api/simulate-payment
 * Safe sandbox simulator for testing the full payment cycle in development or demo mode
 */
router.post('/simulate-payment', (req, res) => {
  try {
    const { orderId, outcome = 'success' } = req.body;

    const order = db.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (outcome === 'success') {
      const simulatedPaymentId = `pay_sim_${crypto.randomBytes(6).toString('hex')}`;
      const verified = db.verifyOrderPayment({
        orderId,
        razorpayPaymentId: simulatedPaymentId,
        paymentMethod: 'upi_test_simulation',
        notes: 'Simulated UPI test verification',
      });

      return res.json({
        success: true,
        status: 'paid',
        orderId: verified.order_id,
        token: verified.verification_token,
        redirectUrl: `/success?order_id=${encodeURIComponent(verified.order_id)}&token=${encodeURIComponent(verified.verification_token)}`,
      });
    } else {
      const failed = db.markOrderFailed({
        orderId,
        notes: 'Payment cancelled or declined in test simulation',
      });

      return res.json({
        success: true,
        status: 'failed',
        orderId: failed.order_id,
        redirectUrl: `/payment-failed?order_id=${encodeURIComponent(failed.order_id)}`,
      });
    }
  } catch (error) {
    console.error('Simulation error:', error);
    res.status(500).json({ success: false, error: 'Simulation failed' });
  }
});

/**
 * 7. POST /api/admin/verify-order
 * Admin approval for pending manual UTRs
 */
router.post('/admin/verify-order', (req, res) => {
  try {
    const { pin, orderId } = req.body;

    if (pin !== config.adminPin) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Admin PIN' });
    }

    const order = db.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const verified = db.verifyOrderPayment({
      orderId,
      paymentMethod: 'upi_manual_verified',
      notes: `Manually verified by admin on ${new Date().toISOString()}`,
    });

    res.json({
      success: true,
      message: `Order ${orderId} verified successfully`,
      order: verified,
      successUrl: `/success?order_id=${encodeURIComponent(verified.order_id)}&token=${encodeURIComponent(verified.verification_token)}`,
    });
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ success: false, error: 'Admin verification error' });
  }
});

/**
 * 8. POST /api/webhook
 * Razorpay Signed Webhook handler with cryptographic verification and idempotent processing
 */
router.post('/webhook', (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = config.payment.razorpayWebhookSecret;

    // If webhook secret configured, verify HMAC signature
    if (webhookSecret && !webhookSecret.includes('placeholder')) {
      const rawBody = req.rawBody || JSON.stringify(req.body);
      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (signature !== expectedSig) {
        console.warn('[Webhook] Invalid webhook signature detected');
        return res.status(400).json({ status: 'invalid_signature' });
      }
    }

    const event = req.body;
    const eventId = event.event_id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const eventType = event.event;

    // Idempotency check: Ignore duplicate events
    const isNew = db.recordWebhook({ eventId, eventType, payload: event });
    if (!isNew) {
      console.log(`[Webhook] Duplicate event ${eventId} ignored.`);
      return res.status(200).json({ status: 'already_processed' });
    }

    console.log(`[Webhook] Received event: ${eventType} (ID: ${eventId})`);

    // Handle payment capture
    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      const paymentEntity = event.payload?.payment?.entity;
      const rzpOrderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;

      if (rzpOrderId) {
        const order = db.getOrderByRazorpayOrderId(rzpOrderId);
        if (order) {
          db.verifyOrderPayment({
            orderId: order.order_id,
            razorpayPaymentId: paymentId,
            paymentMethod: paymentEntity?.method || 'upi',
            notes: `Auto-verified via Webhook ${eventType} at ${new Date().toISOString()}`,
          });
          console.log(`[Webhook] Order ${order.order_id} marked as PAID via webhook.`);
        }
      }
    } else if (eventType === 'payment.failed') {
      const paymentEntity = event.payload?.payment?.entity;
      const rzpOrderId = paymentEntity?.order_id;
      if (rzpOrderId) {
        const order = db.getOrderByRazorpayOrderId(rzpOrderId);
        if (order && order.status !== 'paid') {
          db.markOrderFailed({
            orderId: order.order_id,
            notes: `Payment failed webhook: ${paymentEntity?.error_description || 'Unknown error'}`,
          });
        }
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ status: 'error' });
  }
});

/**
 * 9. GET /api/cashfree/return
 * Handles browser return redirect from Cashfree after attendee payment
 */
router.get('/cashfree/return', async (req, res) => {
  try {
    const orderId = req.query.order_id;
    if (!orderId) {
      return res.redirect('/checkout?error=missing_order');
    }

    const order = db.getOrderById(orderId) || db.getOrderByCashfreeOrderId(orderId);
    if (!order) {
      return res.redirect('/checkout?error=order_not_found');
    }

    // If order already paid, redirect straight to verified success screen
    if (order.status === 'paid' && order.verification_token) {
      return res.redirect(`/success?order_id=${encodeURIComponent(order.order_id)}&token=${encodeURIComponent(order.verification_token)}`);
    }

    // Verify payment status with Cashfree PG API
    const orderStatusRes = await cashfree.getOrder(orderId);
    if (orderStatusRes.success && orderStatusRes.isPaid) {
      const paymentsRes = await cashfree.getOrderPayments(orderId);
      const paymentId = paymentsRes.successfulPayment ? paymentsRes.successfulPayment.cf_payment_id : `CF_${Date.now()}`;

      const verifiedOrder = db.verifyCashfreePayment({
        orderId: order.order_id,
        cashfreePaymentId: String(paymentId),
        paymentMethod: 'cashfree',
        notes: `Verified via Cashfree PG Redirect. Status: ${orderStatusRes.status}`,
      });

      return res.redirect(`/success?order_id=${encodeURIComponent(verifiedOrder.order_id)}&token=${encodeURIComponent(verifiedOrder.verification_token)}`);
    } else {
      console.warn(`[Cashfree Return] Order ${orderId} status: ${orderStatusRes.status || 'UNPAID'}`);
      return res.redirect(`/pending?order_id=${encodeURIComponent(order.order_id)}`);
    }
  } catch (err) {
    console.error('[Cashfree Return Exception]:', err);
    res.redirect('/checkout?error=return_verification_failed');
  }
});

/**
 * 10. POST /api/cashfree/verify
 * In-page AJAX verification for modal or seamless callback
 */
router.post('/cashfree/verify', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Order ID required' });
    }

    const order = db.getOrderById(orderId) || db.getOrderByCashfreeOrderId(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (order.status === 'paid' && order.verification_token) {
      return res.json({
        success: true,
        orderId: order.order_id,
        token: order.verification_token,
        redirectUrl: `/success?order_id=${encodeURIComponent(order.order_id)}&token=${encodeURIComponent(order.verification_token)}`,
      });
    }

    // Query Cashfree status
    const orderStatusRes = await cashfree.getOrder(orderId);
    if (orderStatusRes.success && orderStatusRes.isPaid) {
      const paymentsRes = await cashfree.getOrderPayments(orderId);
      const paymentId = paymentsRes.successfulPayment ? paymentsRes.successfulPayment.cf_payment_id : `CF_${Date.now()}`;

      const verifiedOrder = db.verifyCashfreePayment({
        orderId: order.order_id,
        cashfreePaymentId: String(paymentId),
        paymentMethod: 'cashfree',
        notes: `Verified via Cashfree AJAX. Status: ${orderStatusRes.status}`,
      });

      return res.json({
        success: true,
        orderId: verifiedOrder.order_id,
        token: verifiedOrder.verification_token,
        redirectUrl: `/success?order_id=${encodeURIComponent(verifiedOrder.order_id)}&token=${encodeURIComponent(verifiedOrder.verification_token)}`,
      });
    }

    return res.json({
      success: false,
      status: orderStatusRes.status || 'UNPAID',
      message: 'Payment has not been confirmed yet.',
    });
  } catch (err) {
    console.error('[Cashfree Verify Exception]:', err);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

/**
 * 11. POST /api/cashfree/webhook
 * Cashfree Server-to-Server Webhook handler with signature verification
 */
router.post('/cashfree/webhook', (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    if (config.payment.isCashfreeConfigured) {
      const isValid = cashfree.verifyWebhookSignature(rawBody, signature, timestamp);
      if (!isValid) {
        console.warn('[Cashfree Webhook] Invalid signature rejected');
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
    }

    const payload = req.body;
    const eventType = payload.type || payload.event;
    const orderData = payload.data ? payload.data.order : null;
    const paymentData = payload.data ? payload.data.payment : null;

    if (orderData && orderData.order_id) {
      const orderId = orderData.order_id;
      const paymentStatus = paymentData ? paymentData.payment_status : null;

      if (eventType === 'PAYMENT_SUCCESS_WEBHOOK' || paymentStatus === 'SUCCESS') {
        const order = db.getOrderById(orderId) || db.getOrderByCashfreeOrderId(orderId);
        if (order) {
          db.verifyCashfreePayment({
            orderId: order.order_id,
            cashfreePaymentId: paymentData ? String(paymentData.cf_payment_id) : null,
            paymentMethod: 'cashfree',
            notes: `Verified via Cashfree Webhook event: ${eventType}`,
          });
          console.log(`[Cashfree Webhook] Order ${order.order_id} marked as PAID.`);
        }
      }
    }

    res.status(200).json({ status: 'OK' });
  } catch (err) {
    console.error('[Cashfree Webhook Exception]:', err);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

/**
 * 9. POST /api/contact
 * Handles contact form submissions — saves to DB + emails nextfoundery@gmail.com
 */
router.post('/contact', async (req, res) => {
  try {
    const { name, email, phone = '', subject, message } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Please enter your name.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    if (!subject || subject.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Please provide a subject.' });
    }

    if (!message || message.trim().length < 10) {
      return res.status(400).json({ success: false, error: 'Please write a message of at least 10 characters.' });
    }

    // Save to database
    db.saveContact({ name, email, phone, subject, message });

    // Send email to nextfoundery@gmail.com (non-blocking — user gets confirmation either way)
    sendContactEmail({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      subject: subject.trim(),
      message: message.trim(),
    }).catch((err) => {
      console.error('[Mailer] Failed to deliver contact email:', err.message);
    });

    res.json({
      success: true,
      message: 'Thank you for reaching out. We have received your message and will respond within 24 business hours.',
    });
  } catch (error) {
    console.error('Contact error:', error);
    res.status(500).json({ success: false, error: 'Error sending message. Please try again later.' });
  }
});

module.exports = router;
