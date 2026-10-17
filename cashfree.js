const crypto = require('crypto');
const config = require('./config');

/**
 * Next Foundery — Cashfree Payment Gateway Service
 * Integrates with Cashfree PG API (v2023-08-01)
 * Supports Sandbox / Test & Production environments
 */

class CashfreeService {
  constructor() {
    this.appId = config.payment.cashfreeAppId;
    this.secretKey = config.payment.cashfreeSecretKey;
    this.env = config.payment.cashfreeEnv; // 'SANDBOX' or 'PRODUCTION'
    this.apiVersion = config.payment.cashfreeApiVersion || '2023-08-01';

    this.baseUrl = this.env === 'PRODUCTION'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
  }

  /**
   * Check if Cashfree live or test credentials are configured
   */
  isConfigured() {
    return Boolean(
      this.appId &&
      this.secretKey &&
      !this.appId.includes('placeholder') &&
      !this.secretKey.includes('placeholder')
    );
  }

  /**
   * Get client-side mode for cashfree.js SDK
   * returns 'sandbox' or 'production'
   */
  getClientMode() {
    return this.env === 'PRODUCTION' ? 'production' : 'sandbox';
  }

  /**
   * Standard headers for Cashfree API requests
   */
  getHeaders() {
    return {
      'x-client-id': this.appId,
      'x-client-secret': this.secretKey,
      'x-api-version': this.apiVersion,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  /**
   * Create an Order with Cashfree PG
   * 
   * @param {Object} params
   * @param {string} params.orderId - Internal Next Foundery order ID (e.g. NF-ORD-...)
   * @param {number} params.amount - Order amount in INR (strictly 199)
   * @param {string} params.customerName - Attendee full name
   * @param {string} params.customerEmail - Attendee email address
   * @param {string} params.customerPhone - Attendee 10-digit mobile number
   * @param {string} params.returnUrl - Absolute redirect URL upon payment completion
   * @param {string} [params.notifyUrl] - Webhook notification URL
   * @returns {Promise<{ success: boolean, paymentSessionId?: string, cashfreeOrderId?: string, error?: string }>}
   */
  async createOrder({ orderId, amount, customerName, customerEmail, customerPhone, returnUrl, notifyUrl }) {
    if (!this.isConfigured()) {
      return {
        success: false,
        isConfigured: false,
        error: 'Cashfree API credentials not configured in .env',
      };
    }

    try {
      // Clean phone number (must be 10 digits for Indian customers)
      const cleanPhone = (customerPhone || '').replace(/[^0-9]/g, '').slice(-10);
      const customerId = `NF_CUST_${cleanPhone || Date.now()}`;

      const payload = {
        order_id: orderId,
        order_amount: Number(amount).toFixed(2),
        order_currency: 'INR',
        customer_details: {
          customer_id: customerId,
          customer_name: customerName || 'Attendee',
          customer_email: customerEmail,
          customer_phone: cleanPhone || '9999999999',
        },
        order_meta: {
          return_url: returnUrl,
          ...(notifyUrl ? { notify_url: notifyUrl } : {}),
        },
        order_note: `${config.brand.masterclassTitle} (₹${amount})`,
      };

      const response = await fetch(`${this.baseUrl}/orders`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[Cashfree Error] Create Order Failed:', data);
        return {
          success: false,
          error: data.message || 'Failed to create Cashfree payment order',
          details: data,
        };
      }

      return {
        success: true,
        isConfigured: true,
        cashfreeOrderId: data.order_id,
        paymentSessionId: data.payment_session_id,
        orderStatus: data.order_status,
        mode: this.getClientMode(),
      };
    } catch (err) {
      console.error('[Cashfree Error] Network/Exception during createOrder:', err);
      return {
        success: false,
        error: err.message || 'Unable to connect to Cashfree payment server',
      };
    }
  }

  /**
   * Fetch order status from Cashfree
   * 
   * @param {string} orderId - Order reference ID
   * @returns {Promise<Object>}
   */
  async getOrder(orderId) {
    if (!this.isConfigured()) {
      return { success: false, error: 'Cashfree not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/orders/${encodeURIComponent(orderId)}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Order fetch failed', details: data };
      }

      return {
        success: true,
        order: data,
        isPaid: data.order_status === 'PAID',
        status: data.order_status,
      };
    } catch (err) {
      console.error('[Cashfree Error] getOrder Exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Fetch all payment attempts/transactions for an order
   * 
   * @param {string} orderId - Order reference ID
   * @returns {Promise<Object>}
   */
  async getOrderPayments(orderId) {
    if (!this.isConfigured()) {
      return { success: false, error: 'Cashfree not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/orders/${encodeURIComponent(orderId)}/payments`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || 'Payments fetch failed' };
      }

      // Check if any payment attempt was successful
      const payments = Array.isArray(data) ? data : [];
      const successfulPayment = payments.find(p => p.payment_status === 'SUCCESS');

      return {
        success: true,
        payments,
        successfulPayment: successfulPayment || null,
        isPaid: Boolean(successfulPayment),
      };
    } catch (err) {
      console.error('[Cashfree Error] getOrderPayments Exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Verify Cashfree Webhook Signature
   * Signature is computed as base64(hmacSha256(timestamp + rawBody, secretKey))
   * 
   * @param {string} rawBody - Raw unparsed webhook payload string
   * @param {string} signature - Value of 'x-webhook-signature' header
   * @param {string} timestamp - Value of 'x-webhook-timestamp' header
   * @returns {boolean}
   */
  verifyWebhookSignature(rawBody, signature, timestamp) {
    if (!this.secretKey || !signature || !timestamp || !rawBody) {
      return false;
    }

    try {
      const data = `${timestamp}${rawBody}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.secretKey)
        .update(data)
        .digest('base64');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8')
      );
    } catch (err) {
      console.error('[Cashfree Webhook Signature Error]:', err.message);
      return false;
    }
  }
}

module.exports = new CashfreeService();
