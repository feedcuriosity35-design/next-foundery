const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Masterclass details
  brand: {
    name: 'Next Foundery',
    tagline: 'Businesses Built Better',
    heroEyebrow: 'BUSINESS GROWTH BLUEPRINT MASTERCLASS',
    offerBadge: 'SPECIAL LAUNCH OFFER · ₹199',
    masterclassTitle: process.env.MASTERCLASS_TITLE || 'Business Growth Blueprint Masterclass',
    price: 199, // STRICTLY ENFORCED SERVER-SIDE
    currency: 'INR',
    currencySymbol: '₹',
  },

  // Logistics (configurable placeholders until confirmed)
  logistics: {
    sessionDate: process.env.SESSION_DATE || 'Saturday, 25 October 2026',
    sessionTime: process.env.SESSION_TIME || '11:00 AM – 1:00 PM IST',
    sessionFormat: process.env.SESSION_FORMAT || 'Live Interactive Online Session (Zoom)',
    joinInfo: process.env.SESSION_JOIN_INFO || 'Official joining link and access instructions will be sent to your registered email and WhatsApp 24 hours before the session.',
    recordingInfo: process.env.RECORDING_ACCESS_INFO || 'Session recordings will be uploaded and shared with registered participants within 24 hours after session completion.',
  },

  // Payment Gateway Configuration
  payment: {
    // Cashfree Payment Gateway (Primary)
    cashfreeAppId: process.env.CASHFREE_APP_ID || '',
    cashfreeSecretKey: process.env.CASHFREE_SECRET_KEY || '',
    cashfreeEnv: (process.env.CASHFREE_ENV || 'SANDBOX').toUpperCase(), // 'SANDBOX' or 'PRODUCTION'
    cashfreeApiVersion: process.env.CASHFREE_API_VERSION || '2023-08-01',
    isCashfreeConfigured: Boolean(
      process.env.CASHFREE_APP_ID &&
      process.env.CASHFREE_SECRET_KEY &&
      !process.env.CASHFREE_APP_ID.includes('placeholder') &&
      !process.env.CASHFREE_SECRET_KEY.includes('placeholder')
    ),

    // Razorpay (Secondary / Fallback)
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    upiVpa: process.env.UPI_VPA || '9205828721@ptsbi',
    upiPayeeName: process.env.UPI_PAYEE_NAME || 'Aarushi Bajpai (Next Foundery)',
    officialQrImage: process.env.OFFICIAL_QR_IMAGE || '/images/official-upi-qr.png',
    isLive: false,
    // Detect whether actual Razorpay credentials are provided
    isRazorpayConfigured: Boolean(
      process.env.RAZORPAY_KEY_ID &&
      process.env.RAZORPAY_KEY_SECRET &&
      !process.env.RAZORPAY_KEY_ID.includes('placeholder') &&
      !process.env.RAZORPAY_KEY_SECRET.includes('placeholder')
    ),
  },

  // Post-payment delivery (Confidential: NEVER expose before payment verification)
  postPayment: {
    whatsappGroupUrl: process.env.WHATSAPP_GROUP_INVITE_URL || 'https://chat.whatsapp.com/FCWNqLKr9Vo3Y94r5m2STl?s=cl&p=a&mlu=4&ilr=4',
  },

  // Business contact
  support: {
    email: process.env.SUPPORT_EMAIL || 'nextfoundery@gmail.com',
    hours: process.env.SUPPORT_HOURS || 'Monday – Saturday, 10:00 AM – 6:00 PM IST',
  },

  // Gmail SMTP (Nodemailer) — used for contact form email delivery
  gmail: {
    user: process.env.GMAIL_USER || 'nextfoundery@gmail.com',
    appPassword: process.env.GMAIL_APP_PASSWORD || '',
    isConfigured: Boolean(
      process.env.GMAIL_APP_PASSWORD &&
      !process.env.GMAIL_APP_PASSWORD.includes('your_16_char')
    ),
  },

  // Internal Admin PIN
  adminPin: process.env.ADMIN_ACCESS_PIN || 'admin199',

  // Safe client configuration (no secrets exposed)
  getClientConfig() {
    return {
      brandName: this.brand.name,
      tagline: this.brand.tagline,
      masterclassTitle: this.brand.masterclassTitle,
      price: this.brand.price,
      currency: this.brand.currency,
      currencySymbol: this.brand.currencySymbol,
      cashfreeAppId: this.payment.isCashfreeConfigured ? this.payment.cashfreeAppId : null,
      isCashfreeConfigured: this.payment.isCashfreeConfigured,
      cashfreeMode: this.payment.cashfreeEnv === 'PRODUCTION' ? 'production' : 'sandbox',
      razorpayKeyId: this.payment.isRazorpayConfigured ? this.payment.razorpayKeyId : null,
      isRazorpayConfigured: this.payment.isRazorpayConfigured,
      upiVpa: this.payment.upiVpa,
      upiPayeeName: this.payment.upiPayeeName,
      officialQrImage: this.payment.officialQrImage,
      sessionDate: this.logistics.sessionDate,
      sessionTime: this.logistics.sessionTime,
      sessionFormat: this.logistics.sessionFormat,
      recordingInfo: this.logistics.recordingInfo,
      supportEmail: this.support.email,
    };
  }
};

module.exports = config;
