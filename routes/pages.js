const express = require('express');
const config = require('../config');
const db = require('../db');

const router = express.Router();

// Helper to provide common template context
function getBaseContext(req, extra = {}) {
  return {
    config,
    clientConfig: config.getClientConfig(),
    currentPath: req.path,
    ...extra,
  };
}

/**
 * 1. Homepage
 */
router.get('/', (req, res) => {
  res.render('home', getBaseContext(req, {
    title: 'Next Foundery — Businesses Built Better | Business Growth Blueprint Masterclass',
    metaDescription: 'Turn your business idea into an actionable plan. Practical business guidance, open discussion, and session recordings for just ₹199 with Next Foundery.',
  }));
});

/**
 * 2. Dedicated Checkout Page
 */
router.get('/checkout', (req, res) => {
  // If retry from failed order
  let initialData = null;
  if (req.query.retry_order) {
    const prevOrder = db.getOrderById(req.query.retry_order);
    if (prevOrder) {
      initialData = {
        name: prevOrder.name,
        email: prevOrder.email,
        phone: prevOrder.phone,
        interest: prevOrder.interest,
      };
    }
  }

  res.render('checkout', getBaseContext(req, {
    title: 'Checkout — Business Growth Blueprint Masterclass | Next Foundery',
    metaDescription: 'Secure checkout for Business Growth Blueprint Masterclass. Enforced launch offer of ₹199 INR via UPI.',
    initialData,
  }));
});

/**
 * 3. Verified Payment Success Page
 * Accessible ONLY after verified payment
 */
router.get('/success', (req, res) => {
  const { order_id, token } = req.query;

  if (!order_id || !token) {
    return res.redirect('/checkout');
  }

  const order = db.getOrderById(order_id);

  // Strict verification check: Must exist, be paid, and token must match
  if (!order || order.status !== 'paid' || order.verification_token !== token) {
    return res.status(403).render('unauthorized', getBaseContext(req, {
      title: 'Verification Required | Next Foundery',
      orderId: order_id,
      status: order ? order.status : 'not_found',
    }));
  }

  res.render('success', getBaseContext(req, {
    title: 'Registration Confirmed — Business Growth Blueprint Masterclass | Next Foundery',
    metaDescription: 'Your seat for Business Growth Blueprint Masterclass is confirmed. Access your session and recording instructions.',
    order,
    // Sensitive post-purchase delivery links passed securely here
    whatsappInviteUrl: config.postPayment.whatsappGroupUrl,
  }));
});

/**
 * 4. Payment Pending Page
 */
router.get('/payment-pending', (req, res) => {
  const { order_id } = req.query;
  const order = order_id ? db.getOrderById(order_id) : null;

  // If already paid, automatically redirect to success page
  if (order && order.status === 'paid' && order.verification_token) {
    return res.redirect(`/success?order_id=${encodeURIComponent(order.order_id)}&token=${encodeURIComponent(order.verification_token)}`);
  }

  res.render('pending', getBaseContext(req, {
    title: 'Payment Pending Verification | Next Foundery',
    metaDescription: 'Your payment is awaiting confirmation. We will verify your transaction shortly.',
    order,
    orderId: order_id || null,
  }));
});

/**
 * 5. Payment Failed Page
 */
router.get('/payment-failed', (req, res) => {
  const { order_id } = req.query;
  const order = order_id ? db.getOrderById(order_id) : null;

  res.render('failed', getBaseContext(req, {
    title: 'Payment Incomplete | Next Foundery',
    metaDescription: 'Your payment was not confirmed. You can safely retry your registration.',
    order,
    orderId: order_id || null,
  }));
});

/**
 * 6. About Page
 */
router.get('/about', (req, res) => {
  res.render('about', getBaseContext(req, {
    title: 'About Next Foundery — Businesses Built Better',
    metaDescription: 'Learn about Next Foundery. We help entrepreneurs think beyond the idea through research, validation, strategy, positioning, and execution.',
  }));
});

/**
 * 7. Contact Page
 */
router.get('/contact', (req, res) => {
  res.render('contact', getBaseContext(req, {
    title: 'Contact Next Foundery — Support & Inquiries',
    metaDescription: 'Get in touch with the Next Foundery team for questions about the masterclass, business guidance, or support.',
  }));
});

/**
 * 8. Privacy Policy Page
 */
router.get('/privacy', (req, res) => {
  res.render('privacy', getBaseContext(req, {
    title: 'Privacy Policy | Next Foundery',
    metaDescription: 'Our commitment to protecting your personal data, payment security, and attendee privacy.',
  }));
});

/**
 * 9. Terms and Conditions Page
 */
router.get('/terms', (req, res) => {
  res.render('terms', getBaseContext(req, {
    title: 'Terms and Conditions | Next Foundery',
    metaDescription: 'Terms of service, masterclass registration rules, intellectual property, and acceptable use.',
  }));
});

/**
 * 10. Refund Policy Page
 */
router.get('/refund-policy', (req, res) => {
  res.render('refund-policy', getBaseContext(req, {
    title: 'Refund & Cancellation Policy | Next Foundery',
    metaDescription: 'Clear refund and cancellation policies for the Business Growth Blueprint Masterclass.',
  }));
});

/**
 * 11. Admin Orders Dashboard (Internal review & manual UTR approval)
 */
router.get('/admin/orders', (req, res) => {
  const pin = req.query.pin;
  const isAuthenticated = pin === config.adminPin;
  const orders = isAuthenticated ? db.getAllOrders(100) : [];

  res.render('admin-orders', getBaseContext(req, {
    title: 'Admin Orders & Verification Portal | Next Foundery',
    isAuthenticated,
    orders,
    pin: pin || '',
  }));
});

module.exports = router;
