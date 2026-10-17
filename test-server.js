const assert = require('assert');

async function runTests() {
  const baseUrl = 'http://localhost:3000';
  console.log('--- Starting Next Foundery Comprehensive Test Suite ---');

  // Test 1: GET / (Homepage)
  console.log('[Test 1] Testing Homepage (GET /)...');
  const homeRes = await fetch(`${baseUrl}/`);
  assert.strictEqual(homeRes.status, 200, 'Homepage status should be 200');
  const homeHtml = await homeRes.text();
  assert(homeHtml.includes('Next Foundery'), 'Homepage should contain brand name');
  assert(homeHtml.includes('Businesses Built Better'), 'Homepage should contain tagline');
  assert(homeHtml.includes('BUSINESS GROWTH BLUEPRINT MASTERCLASS'), 'Homepage should contain hero eyebrow');
  assert(homeHtml.includes('Your Business Journey Starts Here — For Just ₹199'), 'Homepage should contain headline');
  assert(homeHtml.includes('SPECIAL LAUNCH OFFER · ₹199'), 'Homepage should contain special offer label');
  assert(homeHtml.includes('Claim Your Seat for ₹199'), 'Homepage should contain primary CTA');
  assert(homeHtml.includes('Explore the Masterclass'), 'Homepage should contain secondary CTA');
  assert(homeHtml.includes('Practical Business Guidance'), 'Homepage should highlight Practical Guidance');
  assert(homeHtml.includes('Interactive Open Discussion'), 'Homepage should highlight Open Discussion');
  assert(homeHtml.includes('Session Recordings Included'), 'Homepage should highlight Session Recordings');
  assert(homeHtml.includes('An Idea Is a Start. Knowing What to Do Next Is the Real Challenge'), 'Homepage should contain Problem headline');
  assert(homeHtml.includes('Turn Your Questions Into Clearer Next Steps'), 'Homepage should contain Explore headline');
  assert(homeHtml.includes('Business Idea Clarity'), 'Card 1 should exist');
  assert(homeHtml.includes('Customer and Problem Discovery'), 'Card 2 should exist');
  assert(homeHtml.includes('Idea Validation'), 'Card 3 should exist');
  assert(homeHtml.includes('Business Fundamentals'), 'Card 4 should exist');
  assert(homeHtml.includes('Open Discussion'), 'Card 5 should exist');
  assert(homeHtml.includes('Personalized Direction'), 'Card 6 should exist');
  assert(homeHtml.includes('More Than Just Watching a Session'), 'Homepage should contain Inclusions headline');
  assert(homeHtml.includes('How It Works'), 'Homepage should contain How It Works');
  assert(homeHtml.includes('Your Starting Point Doesn\'t Matter. Your Next Step Does'), 'Homepage should contain Who Is This For headline');
  assert(homeHtml.includes('We Help You Think Beyond the Idea'), 'Homepage should contain About headline');
  assert(homeHtml.includes('Every Business Starts Somewhere. Start With Clarity'), 'Homepage should contain Final CTA headline');
  
  // Verify all 13 FAQs
  assert(homeHtml.includes('What is the Business Growth Blueprint Masterclass?'), 'FAQ 1 present');
  assert(homeHtml.includes('Who should attend this masterclass?'), 'FAQ 2 present');
  assert(homeHtml.includes('Do I need to have a business idea already?'), 'FAQ 3 present');
  assert(homeHtml.includes('What will I learn?'), 'FAQ 4 present');
  assert(homeHtml.includes('Will I receive personalized guidance?'), 'FAQ 5 present');
  assert(homeHtml.includes('How much does the masterclass cost?'), 'FAQ 6 present');
  assert(homeHtml.includes('Will I receive a recording of the session?'), 'FAQ 7 present');
  assert(homeHtml.includes('What if I cannot attend the live session?'), 'FAQ 8 present');
  assert(homeHtml.includes('How will I receive the session details?'), 'FAQ 9 present');
  assert(homeHtml.includes('How can I pay?'), 'FAQ 10 present');
  assert(homeHtml.includes('What happens if my payment is pending?'), 'FAQ 11 present');
  assert(homeHtml.includes('Is business success or income guaranteed?'), 'FAQ 12 present');
  assert(homeHtml.includes('What is the refund policy?'), 'FAQ 13 present');
  console.log('✓ Homepage passed with all 9 sections & 13 FAQs verified!');

  // Test 2: GET /checkout
  console.log('[Test 2] Testing Dedicated Checkout (GET /checkout)...');
  const checkoutRes = await fetch(`${baseUrl}/checkout`);
  assert.strictEqual(checkoutRes.status, 200, 'Checkout status should be 200');
  const checkoutHtml = await checkoutRes.text();
  assert(checkoutHtml.includes('Business Growth Blueprint Masterclass'), 'Checkout should show masterclass name');
  assert(checkoutHtml.includes('₹199'), 'Checkout should show ₹199');
  assert(checkoutHtml.includes('Session Recordings Included'), 'Checkout should state session recordings included');
  assert(checkoutHtml.includes('UPI Payment Gateway'), 'Checkout should specify UPI gateway');
  console.log('✓ Checkout page verified!');

  // Test 3: POST /api/create-order (Validation check & order creation)
  console.log('[Test 3] Testing POST /api/create-order input validation & ₹199 enforcement...');
  // Bad request: missing phone
  const badRes = await fetch(`${baseUrl}/api/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test User', email: 'test@example.com' }),
  });
  assert.strictEqual(badRes.status, 400, 'Should reject missing phone');

  // Valid request: client tries to pass amount=1 (tampering attempt)
  const validRes = await fetch(`${baseUrl}/api/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Aarush Kumar',
      email: 'aarush.test@nextfoundery.com',
      phone: '9876543210',
      interest: 'AI & Automation Venture',
      amount: 1, // Attempted tamper
    }),
  });
  assert.strictEqual(validRes.status, 201, 'Should create order with 201');
  const orderData = await validRes.json();
  assert.strictEqual(orderData.success, true);
  assert.strictEqual(orderData.amount, 199, 'Server MUST strictly enforce amount=199');
  assert.strictEqual(orderData.currency, 'INR');
  assert(orderData.orderId.startsWith('NF-ORD-'), 'Order ID should follow NF-ORD format');
  assert(orderData.qrCodeUrl.includes('official-upi-qr') || orderData.generatedQrUrl.startsWith('data:image/png;base64,'), 'QR code generated');
  console.log(`✓ Order created: ${orderData.orderId} (Strictly ₹199 INR enforced)`);

  // Test 4: UTR Submission for UPI QR fallback & Pending status
  console.log('[Test 4] Testing UTR Submission & Pending Verification state...');
  const utrRes = await fetch(`${baseUrl}/api/submit-utr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: orderData.orderId,
      utrReference: '429381729012',
    }),
  });
  assert.strictEqual(utrRes.status, 200);
  const utrData = await utrRes.json();
  assert.strictEqual(utrData.status, 'pending_verification');

  // Verify GET /api/order-status/:id
  const statusRes = await fetch(`${baseUrl}/api/order-status/${orderData.orderId}`);
  const statusData = await statusRes.json();
  assert.strictEqual(statusData.isPending, true);
  assert.strictEqual(statusData.isPaid, false);

  // Verify GET /payment-pending page
  const pendingPageRes = await fetch(`${baseUrl}/payment-pending?order_id=${orderData.orderId}`);
  assert.strictEqual(pendingPageRes.status, 200);
  const pendingHtml = await pendingPageRes.text();
  assert(pendingHtml.includes('Payment Pending Verification'));
  assert(pendingHtml.includes('Please Do Not Make a Duplicate Payment'));
  assert(pendingHtml.includes(orderData.orderId));
  console.log('✓ UPI QR Fallback, UTR submission & Pending page verified!');

  // Test 5: Admin Manual Verification & Success page security
  console.log('[Test 5] Testing Admin Approval & Success Page protection...');
  // Direct access to /success without token should redirect to checkout or 403
  const directSuccessRes = await fetch(`${baseUrl}/success?order_id=${orderData.orderId}`, { redirect: 'manual' });
  assert(directSuccessRes.status === 302 || directSuccessRes.status === 403, 'Direct access to /success without token should be blocked');

  // Approve order via Admin endpoint
  const adminRes = await fetch(`${baseUrl}/api/admin/verify-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pin: 'admin199',
      orderId: orderData.orderId,
    }),
  });
  assert.strictEqual(adminRes.status, 200);
  const adminData = await adminRes.json();
  assert.strictEqual(adminData.success, true);
  assert(adminData.order.verification_token, 'Token must be generated');

  // Access /success with valid token
  const successRes = await fetch(`${baseUrl}/success?order_id=${orderData.orderId}&token=${adminData.order.verification_token}`);
  assert.strictEqual(successRes.status, 200);
  const successHtml = await successRes.text();
  assert(successHtml.includes('Your Seat Is Confirmed!'));
  assert(successHtml.includes('Aarush Kumar'));
  assert(successHtml.includes('₹199 INR'));
  assert(successHtml.includes('Join the WhatsApp Group'));
  assert(successHtml.includes(orderData.orderId));
  console.log('✓ Success page verified with confirmed registration & protected WhatsApp button!');

  // Test 6: Payment simulation (Success & Failed)
  console.log('[Test 6] Testing Payment Failure journey...');
  const order2Res = await fetch(`${baseUrl}/api/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Priya Sharma',
      email: 'priya@example.com',
      phone: '9812345678',
    }),
  });
  const order2Data = await order2Res.json();
  
  // Simulate failure
  await fetch(`${baseUrl}/api/simulate-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: order2Data.orderId, outcome: 'failed' }),
  });

  const failedPageRes = await fetch(`${baseUrl}/payment-failed?order_id=${order2Data.orderId}`);
  assert.strictEqual(failedPageRes.status, 200);
  const failedHtml = await failedPageRes.text();
  assert(failedHtml.includes('Payment Was Not Completed'));
  assert(failedHtml.includes('Retry UPI Payment · ₹199'));
  console.log('✓ Payment failure journey verified!');

  // Test 7: Supporting pages
  console.log('[Test 7] Testing Supporting Pages (/about, /contact, /privacy, /terms, /refund-policy)...');
  const pages = ['about', 'contact', 'privacy', 'terms', 'refund-policy'];
  for (const page of pages) {
    const res = await fetch(`${baseUrl}/${page}`);
    assert.strictEqual(res.status, 200, `Page /${page} should return 200`);
    console.log(`  ✓ /${page} responded HTTP 200`);
  }

  // Test 8: Contact API
  console.log('[Test 8] Testing POST /api/contact...');
  const contactRes = await fetch(`${baseUrl}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Rohan Mehra',
      email: 'rohan@example.com',
      phone: '9876543210',
      subject: 'Masterclass Inquiry',
      message: 'Hello, looking forward to the business validation session.',
    }),
  });
  assert.strictEqual(contactRes.status, 200);
  const contactData = await contactRes.json();
  assert.strictEqual(contactData.success, true);
  console.log('✓ Contact API verified!');

  console.log('\n======================================================');
  console.log('ALL 8 TEST SUITES PASSED FLAWLESSLY! 100% SUCCESS');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
