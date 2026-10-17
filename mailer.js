/**
 * mailer.js — Next Foundery
 * Nodemailer utility for Gmail SMTP delivery.
 * Uses a Gmail App Password (not the account password).
 *
 * Setup:
 *  1. Enable 2-Step Verification on the Gmail account.
 *  2. Go to https://myaccount.google.com/apppasswords
 *  3. Generate an App Password for "Mail" / "Other (Next Foundery)".
 *  4. Paste the 16-character password into GMAIL_APP_PASSWORD in .env
 */

const nodemailer = require('nodemailer');
const config = require('./config');

let transporter = null;

/**
 * Lazy-initialise the Gmail SMTP transporter.
 * Only created once credentials are present in config.
 */
function getTransporter() {
  if (transporter) return transporter;

  if (!config.gmail.isConfigured) {
    console.warn('[Mailer] Gmail App Password not configured — emails will be logged to console only.');
    return null;
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.gmail.user,
      pass: config.gmail.appPassword,
    },
  });

  return transporter;
}

/**
 * Send an email notification to the Next Foundery inbox
 * when a visitor submits the Contact Us form.
 *
 * @param {{ name: string, email: string, phone: string, subject: string, message: string }} data
 * @returns {Promise<void>}
 */
async function sendContactEmail({ name, email, phone, subject, message }) {
  const t = getTransporter();

  const mailOptions = {
    from: `"Next Foundery Website" <${config.gmail.user}>`,
    to: config.gmail.user,           // Delivered to your own inbox
    replyTo: email,                  // Reply goes directly to the visitor
    subject: `[Contact Form] ${subject} — from ${name}`,
    text: [
      `New contact form submission on nextfoundery.com`,
      ``,
      `Name    : ${name}`,
      `Email   : ${email}`,
      `Phone   : ${phone || 'Not provided'}`,
      `Subject : ${subject}`,
      ``,
      `Message :`,
      message,
      ``,
      `---`,
      `Submitted at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f9f9f9; border-radius: 8px;">
        <div style="background: #07140B; padding: 20px 24px; border-radius: 6px 6px 0 0;">
          <h2 style="color: #B7F52A; margin: 0; font-size: 18px;">📩 New Contact Form Message</h2>
          <p style="color: #aaa; margin: 4px 0 0; font-size: 13px;">nextfoundery.com — Contact Us</p>
        </div>
        <div style="background: #ffffff; padding: 24px; border-radius: 0 0 6px 6px; border: 1px solid #e0e0e0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #333;">
            <tr>
              <td style="padding: 8px 0; font-weight: 700; width: 100px; color: #555;">Name</td>
              <td style="padding: 8px 0;">${name}</td>
            </tr>
            <tr style="background: #f7f7f7;">
              <td style="padding: 8px 0; font-weight: 700; color: #555;">Email</td>
              <td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #07140B;">${email}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 700; color: #555;">Phone</td>
              <td style="padding: 8px 0;">${phone || '<em style="color:#aaa">Not provided</em>'}</td>
            </tr>
            <tr style="background: #f7f7f7;">
              <td style="padding: 8px 0; font-weight: 700; color: #555;">Subject</td>
              <td style="padding: 8px 0;">${subject}</td>
            </tr>
          </table>

          <div style="margin-top: 20px;">
            <div style="font-weight: 700; color: #555; font-size: 13px; margin-bottom: 8px;">MESSAGE</div>
            <div style="background: #f4f4f4; border-left: 3px solid #B7F52A; padding: 14px 16px; border-radius: 4px; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${message}</div>
          </div>

          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #999;">
            Submitted at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
            · Hit <strong>Reply</strong> to respond directly to ${name}
          </div>
        </div>
      </div>
    `,
  };

  if (!t) {
    // Fallback: log to console when SMTP not yet configured
    console.log('[Mailer] [CONSOLE FALLBACK] Contact form submission:');
    console.log(`  Name   : ${name}`);
    console.log(`  Email  : ${email}`);
    console.log(`  Phone  : ${phone || 'N/A'}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Message: ${message}`);
    return;
  }

  await t.sendMail(mailOptions);
  console.log(`[Mailer] Contact email delivered → ${config.gmail.user} (from: ${email})`);
}

module.exports = { sendContactEmail };
