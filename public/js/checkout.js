/**
 * Next Foundery — Checkout Page Controller
 * Cashfree Gateway & Interactive Next Foundery Payment Modal
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('checkoutForm');
  const payBtn = document.getElementById('payButton');
  const btnText = document.getElementById('buttonText');
  const btnSpinner = document.getElementById('buttonSpinner');
  const feedback = document.getElementById('checkoutFeedback');

  // Interactive Payment Gateway Modal Elements
  const gatewayModal = document.getElementById('paymentGatewayModal');
  const closeGatewayBtn = document.getElementById('closeGatewayBtn');
  const gatewayAttendeeSummary = document.getElementById('gatewayAttendeeSummary');
  const gpayAppBtn = document.getElementById('gpayAppBtn');
  const phonepeAppBtn = document.getElementById('phonepeAppBtn');
  const paytmAppBtn = document.getElementById('paytmAppBtn');
  const upiIntentBtn = document.getElementById('upiIntentBtn');
  const gatewayQrImage = document.getElementById('gatewayQrImage');
  const gatewayUpiVpa = document.getElementById('gatewayUpiVpa');
  const copyVpaBtn = document.getElementById('copyVpaBtn');

  // UTR Form inside Modal
  const gatewayUtrForm = document.getElementById('gatewayUtrForm');
  const gatewayUtrInput = document.getElementById('gatewayUtrInput');
  const gatewayUtrError = document.getElementById('gatewayUtrError');
  const gatewaySubmitUtrBtn = document.getElementById('gatewaySubmitUtrBtn');

  // Test Simulator Button
  const simSuccessBtn = document.getElementById('simPaySuccessBtn');

  let currentOrderId = null;
  let statusPollInterval = null;

  // Modal Close Action
  if (closeGatewayBtn) {
    closeGatewayBtn.addEventListener('click', () => {
      closeGatewayModal();
    });
  }

  // Dismiss on clicking backdrop
  if (gatewayModal) {
    gatewayModal.addEventListener('click', (e) => {
      if (e.target === gatewayModal) {
        closeGatewayModal();
      }
    });
  }

  function closeGatewayModal() {
    if (gatewayModal) gatewayModal.style.display = 'none';
    if (statusPollInterval) {
      clearInterval(statusPollInterval);
      statusPollInterval = null;
    }
  }

  // Copy UPI ID Action
  if (copyVpaBtn && gatewayUpiVpa) {
    copyVpaBtn.addEventListener('click', () => {
      const vpa = gatewayUpiVpa.textContent.trim();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(vpa).then(() => {
          copyVpaBtn.textContent = 'Copied!';
          copyVpaBtn.style.backgroundColor = '#25B84A';
          setTimeout(() => {
            copyVpaBtn.textContent = 'Copy';
            copyVpaBtn.style.backgroundColor = 'var(--color-forest)';
          }, 2000);
        });
      }
    });
  }

  // Restore cached form data if available
  try {
    const cached = JSON.parse(sessionStorage.getItem('nf_checkout_data') || '{}');
    if (cached.name && !document.getElementById('attendeeName').value) {
      document.getElementById('attendeeName').value = cached.name;
    }
    if (cached.email && !document.getElementById('attendeeEmail').value) {
      document.getElementById('attendeeEmail').value = cached.email;
    }
    if (cached.phone && !document.getElementById('attendeePhone').value) {
      document.getElementById('attendeePhone').value = cached.phone;
    }
    if (cached.interest && !document.getElementById('attendeeInterest').value) {
      document.getElementById('attendeeInterest').value = cached.interest;
    }
  } catch (e) {}

  // 1. Submit Registration Form & Launch Gateway
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    hideErrors();
    hideFeedback();

    const name = document.getElementById('attendeeName').value.trim();
    const email = document.getElementById('attendeeEmail').value.trim();
    const phone = document.getElementById('attendeePhone').value.trim();
    const interest = document.getElementById('attendeeInterest').value.trim();

    // Client Validation
    let hasError = false;

    if (!name || name.length < 2) {
      showError('nameError');
      hasError = true;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      showError('emailError');
      hasError = true;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length !== 10) {
      showError('phoneError');
      hasError = true;
    }

    if (hasError) return;

    // Cache form values safely
    try {
      sessionStorage.setItem('nf_checkout_data', JSON.stringify({ name, email, phone: cleanPhone, interest }));
    } catch (e) {}

    setLoading(true);

    try {
      if (typeof window.trackEvent === 'function') {
        window.trackEvent('checkout_started', {
          attendee_name: name,
          amount: 199,
          currency: 'INR',
        });
      }

      // Call Backend to create order (amount is strictly ₹199)
      const res = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone: cleanPhone,
          interest,
          paymentMethod: 'upi',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to initialize payment.');
      }

      currentOrderId = data.orderId;

      // 1. Check if official Cashfree client is active with session ID
      if (data.cashfreePaymentSessionId && typeof window.Cashfree === 'function') {
        launchCashfreePG(data);
      } else if (data.isRazorpayConfigured && data.keyId && window.Razorpay && data.razorpayOrderId) {
        // 2. Check Razorpay fallback
        launchRazorpayUPI(data);
      } else {
        // 3. Open Next Foundery Interactive Payment Gateway Modal
        openGatewayModal(data);
      }
    } catch (err) {
      console.error('Order creation error:', err);
      showFeedback(err.message || 'Unable to proceed to payment. Please check your connection and try again.', 'error');
    } finally {
      setLoading(false);
    }
  });

  // Launch Cashfree Payment Gateway Flow
  function launchCashfreePG(orderData) {
    try {
      showFeedback('Opening Cashfree Payment Gateway...', 'info');
      const cashfree = window.Cashfree({
        mode: orderData.cashfreeMode || 'sandbox',
      });

      cashfree.checkout({
        paymentSessionId: orderData.cashfreePaymentSessionId,
        redirectTarget: '_self',
      });
    } catch (cfErr) {
      console.error('[Cashfree Launch Error]:', cfErr);
      showFeedback('Cashfree error. Opening secure UPI Gateway...', 'warning');
      openGatewayModal(orderData);
    }
  }

  // Open Interactive Next Foundery Payment Gateway Modal
  function openGatewayModal(orderData) {
    if (!gatewayModal) return;

    if (gatewayAttendeeSummary) {
      gatewayAttendeeSummary.textContent = `${orderData.attendee.name} · +91 ${orderData.attendee.phone}`;
    }

    if (gatewayQrImage) {
      gatewayQrImage.src = orderData.qrCodeUrl || orderData.generatedQrUrl || '/images/official-upi-qr.png';
    }

    if (gatewayUpiVpa) {
      gatewayUpiVpa.textContent = orderData.upiVpa || '9205828721@ptsbi';
    }

    if (gpayAppBtn) {
      gpayAppBtn.href = orderData.gpayUri || orderData.upiUri;
    }

    if (phonepeAppBtn) {
      phonepeAppBtn.href = orderData.phonepeUri || orderData.upiUri;
    }

    if (paytmAppBtn) {
      paytmAppBtn.href = orderData.paytmUri || orderData.upiUri;
    }

    if (upiIntentBtn) {
      upiIntentBtn.href = orderData.upiUri;
    }

    // Display Modal
    gatewayModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Start auto-checking payment status
    startOrderStatusPolling(orderData.orderId);
  }

  // Poll order status to automatically detect verified payment
  function startOrderStatusPolling(orderId) {
    if (statusPollInterval) clearInterval(statusPollInterval);

    statusPollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/order-status/${encodeURIComponent(orderId)}`);
        const data = await res.json();
        if (data && data.isPaid && data.successUrl) {
          clearInterval(statusPollInterval);
          statusPollInterval = null;
          window.location.href = data.successUrl;
        }
      } catch (e) {}
    }, 3000);
  }

  // Submit UTR Reference inside Modal
  if (gatewayUtrForm) {
    gatewayUtrForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (gatewayUtrError) gatewayUtrError.classList.remove('show');

      const utr = gatewayUtrInput.value.trim();
      if (!utr || utr.length < 6) {
        if (gatewayUtrError) gatewayUtrError.classList.add('show');
        return;
      }

      if (!currentOrderId) {
        showFeedback('Please create an order first.', 'error');
        return;
      }

      if (gatewaySubmitUtrBtn) {
        gatewaySubmitUtrBtn.disabled = true;
        gatewaySubmitUtrBtn.textContent = 'Verifying...';
      }

      try {
        const res = await fetch('/api/submit-utr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: currentOrderId,
            utrReference: utr,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          window.location.href = data.redirectUrl;
        } else {
          throw new Error(data.error || 'Failed to submit reference.');
        }
      } catch (err) {
        if (gatewayUtrError) {
          gatewayUtrError.textContent = err.message || 'Error submitting UTR.';
          gatewayUtrError.classList.add('show');
        }
        if (gatewaySubmitUtrBtn) {
          gatewaySubmitUtrBtn.disabled = false;
          gatewaySubmitUtrBtn.textContent = 'Confirm Seat';
        }
      }
    });
  }

  // Instant Test Approve (For Sandbox Demonstration)
  if (simSuccessBtn) {
    simSuccessBtn.addEventListener('click', async () => {
      if (!currentOrderId) return;
      simSuccessBtn.disabled = true;
      simSuccessBtn.textContent = 'Approving...';

      try {
        const res = await fetch('/api/simulate-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: currentOrderId, outcome: 'success' }),
        });
        const data = await res.json();
        if (data.success) {
          window.location.href = data.redirectUrl;
        }
      } catch (e) {
        console.error(e);
      }
    });
  }

  // Launch Razorpay UPI Payment Flow (Fallback)
  function launchRazorpayUPI(orderData) {
    const options = {
      key: orderData.keyId,
      amount: orderData.amount * 100, // paise
      currency: 'INR',
      name: 'Next Foundery',
      description: 'Business Growth Blueprint Masterclass (₹199)',
      image: '/nextfoundery-logo.png',
      order_id: orderData.razorpayOrderId,
      prefill: {
        name: orderData.attendee.name,
        email: orderData.attendee.email,
        contact: orderData.attendee.phone,
      },
      theme: { color: '#07140B' },
      handler: async function (response) {
        setLoading(true);
        showFeedback('Verifying UPI payment with bank...', 'info');

        try {
          const verifyRes = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: currentOrderId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });

          const verifyData = await verifyRes.json();

          if (verifyRes.ok && verifyData.success) {
            window.location.href = verifyData.redirectUrl;
          } else {
            throw new Error(verifyData.error || 'Payment signature verification failed.');
          }
        } catch (verifyErr) {
          console.error('Verification error:', verifyErr);
          showFeedback('Payment verification was not completed. Please contact support.', 'error');
          setLoading(false);
        }
      },
      modal: {
        ondismiss: function () {
          setLoading(false);
          openGatewayModal(orderData);
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function () {
      window.location.href = `/payment-failed?order_id=${encodeURIComponent(currentOrderId)}`;
    });
    rzp.open();
  }

  // Helper UI functions
  function setLoading(isLoading) {
    payBtn.disabled = isLoading;
    if (isLoading) {
      btnText.style.display = 'none';
      btnSpinner.style.display = 'inline-block';
    } else {
      btnText.style.display = 'inline-block';
      btnSpinner.style.display = 'none';
    }
  }

  function showError(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.classList.add('show');
  }

  function hideErrors() {
    document.querySelectorAll('.form-error').forEach(el => el.classList.remove('show'));
  }

  function showFeedback(message, type = 'info') {
    if (!feedback) return;
    feedback.style.display = 'block';
    feedback.textContent = message;

    if (type === 'error') {
      feedback.style.background = 'rgba(255, 90, 95, 0.12)';
      feedback.style.border = '1px solid #FF5A5F';
      feedback.style.color = '#FF5A5F';
    } else if (type === 'success') {
      feedback.style.background = 'rgba(37, 184, 74, 0.12)';
      feedback.style.border = '1px solid #25B84A';
      feedback.style.color = '#B7F52A';
    } else if (type === 'warning') {
      feedback.style.background = 'rgba(255, 180, 0, 0.12)';
      feedback.style.border = '1px solid #FFB400';
      feedback.style.color = '#FFB400';
    } else {
      feedback.style.background = 'rgba(183, 245, 42, 0.1)';
      feedback.style.border = '1px solid rgba(183, 245, 42, 0.3)';
      feedback.style.color = '#FFFFFF';
    }
    feedback.style.padding = '0.9rem 1.2rem';
    feedback.style.borderRadius = 'var(--radius-sm)';
    feedback.style.fontSize = '0.92rem';
  }

  function hideFeedback() {
    if (feedback) feedback.style.display = 'none';
  }
});
