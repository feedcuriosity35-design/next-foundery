/**
 * Next Foundery — Checkout Page Controller
 * Strictly UPI Gateway & Verification
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('checkoutForm');
  const payBtn = document.getElementById('payButton');
  const btnText = document.getElementById('buttonText');
  const btnSpinner = document.getElementById('buttonSpinner');
  const feedback = document.getElementById('checkoutFeedback');

  const upiModal = document.getElementById('upiModal');
  const qrImage = document.getElementById('qrCodeImage');
  const upiVpaDisplay = document.getElementById('upiVpaDisplay');
  const upiIntentLink = document.getElementById('upiIntentLink');

  const utrForm = document.getElementById('utrForm');
  const utrInput = document.getElementById('utrInput');
  const utrError = document.getElementById('utrError');

  const simSuccessBtn = document.getElementById('simPaySuccessBtn');
  const simFailBtn = document.getElementById('simPayFailBtn');
  const copyUpiBtn = document.getElementById('copyUpiBtn');

  if (copyUpiBtn && upiVpaDisplay) {
    copyUpiBtn.addEventListener('click', () => {
      const vpa = upiVpaDisplay.textContent.trim();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(vpa).then(() => {
          copyUpiBtn.textContent = 'Copied!';
          copyUpiBtn.style.backgroundColor = '#25B84A';
          setTimeout(() => {
            copyUpiBtn.textContent = 'Copy';
            copyUpiBtn.style.backgroundColor = 'var(--color-forest)';
          }, 2000);
        });
      }
    });
  }

  let currentOrderId = null;

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

  // 1. Submit Registration & Initialize UPI
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Reset error states
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

    // Set Loading State
    setLoading(true);

    try {
      if (typeof window.trackEvent === 'function') {
        window.trackEvent('checkout_started', {
          attendee_name: name,
          amount: 199,
          currency: 'INR',
        });
      }

      // Call Backend to create order (amount is fixed server-side at 199)
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

      // Update UPI QR fallback view
      if (qrImage && data.qrCodeUrl) {
        qrImage.src = data.qrCodeUrl;
      }
      if (upiVpaDisplay && data.upiVpa) {
        upiVpaDisplay.textContent = data.upiVpa;
      }
      if (upiIntentLink && data.upiUri) {
        upiIntentLink.href = data.upiUri;
      }

      // 1. Check if official Cashfree client is active with session ID
      if (data.cashfreePaymentSessionId && typeof window.Cashfree === 'function') {
        launchCashfreePG(data);
      } else if (data.isRazorpayConfigured && data.keyId && window.Razorpay && data.razorpayOrderId) {
        // 2. Check Razorpay fallback
        launchRazorpayUPI(data);
      } else {
        // 3. Direct UPI QR Workflow
        showUPIFallbackModal(data);
      }
    } catch (err) {
      console.error('Order creation error:', err);
      showFeedback(err.message || 'Unable to proceed to payment. Please check your connection and try again.', 'error');
    } finally {
      setLoading(false);
    }
  });

  // Launch Cashfree Payment Gateway
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
      showFeedback('Cashfree gateway error. Falling back to UPI QR...', 'warning');
      showUPIFallbackModal(orderData);
    }
  }

  // 2. Launch Razorpay UPI Payment Flow
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
      // Strictly restrict payment method to UPI only
      config: {
        display: {
          blocks: {
            upi: {
              name: 'Pay with UPI',
              instruments: [
                { method: 'upi' }
              ],
            },
          },
          sequence: ['block.upi'],
          preferences: {
            show_default_blocks: false,
          },
        },
      },
      theme: {
        color: '#07140B',
      },
      handler: async function (response) {
        // Backend Verification: Send signature tokens to server
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
            if (typeof window.trackEvent === 'function') {
              window.trackEvent('payment_verified', {
                order_id: currentOrderId,
                amount: 199,
              });
            }
            window.location.href = verifyData.redirectUrl;
          } else {
            throw new Error(verifyData.error || 'Payment signature verification failed.');
          }
        } catch (verifyErr) {
          console.error('Verification error:', verifyErr);
          showFeedback('Payment verification was not completed. Please contact support if your account was debited.', 'error');
          setLoading(false);
        }
      },
      modal: {
        ondismiss: function () {
          setLoading(false);
          showFeedback('Payment was cancelled or closed. You can retry with the button below or scan the UPI QR code.', 'warning');
          showUPIFallbackModal(orderData);
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function (response) {
      console.warn('Payment failed:', response.error);
      window.location.href = `/payment-failed?order_id=${encodeURIComponent(currentOrderId)}`;
    });
    rzp.open();
  }

  // 3. Show Direct UPI QR Fallback View
  function showUPIFallbackModal(orderData) {
    if (upiModal) {
      upiModal.style.display = 'block';
      upiModal.scrollIntoView({ behavior: 'smooth' });
    }
    showFeedback('Order registered! Complete your ₹199 payment using the UPI QR code or any UPI app below.', 'success');
  }

  // 4. Submit UTR Reference
  if (utrForm) {
    utrForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (utrError) utrError.classList.remove('show');

      const utr = utrInput.value.trim();
      if (!utr || utr.length < 6) {
        if (utrError) utrError.classList.add('show');
        return;
      }

      if (!currentOrderId) {
        showFeedback('Please create an order first.', 'error');
        return;
      }

      const submitBtn = document.getElementById('submitUtrBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

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
        showFeedback(err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit for Verification';
      }
    });
  }

  // 5. Simulation Sandbox Buttons (For testing end-to-end payment flows)
  if (simSuccessBtn) {
    simSuccessBtn.addEventListener('click', async () => {
      if (!currentOrderId) {
        showFeedback('Please click "Proceed to UPI Payment" first to create an order.', 'warning');
        return;
      }
      simSuccessBtn.disabled = true;
      simSuccessBtn.textContent = 'Verifying...';

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

  if (simFailBtn) {
    simFailBtn.addEventListener('click', async () => {
      if (!currentOrderId) {
        showFeedback('Please click "Proceed to UPI Payment" first to create an order.', 'warning');
        return;
      }
      try {
        const res = await fetch('/api/simulate-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: currentOrderId, outcome: 'failed' }),
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
