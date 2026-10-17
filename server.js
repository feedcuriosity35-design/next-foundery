const express = require('express');
const path = require('path');
const cors = require('cors');
const config = require('./config');
const apiRoutes = require('./routes/api');
const pageRoutes = require('./routes/pages');

const app = express();

// Security & Cross-origin
app.use(cors());

// Custom middleware to capture raw body for webhook signature verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);
app.use(express.urlencoded({ extended: true }));

// Serve static assets from public/
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: config.nodeEnv === 'production' ? '1d' : 0,
}));

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Mount routes
app.use('/api', apiRoutes);
app.use('/', pageRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).render('404', {
    config,
    clientConfig: config.getClientConfig(),
    currentPath: req.path,
    title: '404 - Page Not Found | Next Foundery',
    metaDescription: 'The page you requested could not be found.',
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);
  res.status(500).render('500', {
    config,
    clientConfig: config.getClientConfig(),
    currentPath: req.path,
    title: 'Server Error | Next Foundery',
    metaDescription: 'An unexpected error occurred. Please try again shortly.',
  });
});

// Start listening
const server = app.listen(config.port, () => {
  console.log(`====================================================`);
  console.log(`  NEXT FOUNDERY — Businesses Built Better`);
  console.log(`  Masterclass: ${config.brand.masterclassTitle}`);
  console.log(`  Enforced Price: ₹${config.brand.price} INR`);
  console.log(`  Server running at: http://localhost:${config.port}`);
  console.log(`  Cashfree PG: ${config.payment.isCashfreeConfigured ? `Active (${config.payment.cashfreeEnv})` : 'Awaiting API Keys in .env (UPI QR fallback ready)'}`);
  console.log(`  UPI Gateway: ${config.payment.isCashfreeConfigured ? 'Cashfree Payments' : config.payment.isRazorpayConfigured ? 'Razorpay' : 'UPI QR / Test Sandbox Active'}`);
  console.log(`  Admin Portal: http://localhost:${config.port}/admin/orders?pin=${config.adminPin}`);
  console.log(`====================================================`);
});

module.exports = { app, server };
