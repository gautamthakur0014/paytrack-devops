'use strict';

const nodemailer = require('nodemailer');
const logger = require('../config/logger');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    pool: true,
    maxConnections: 5,
  });

  return transporter;
}

async function sendEmail({ to, subject, html, text }) {
  const t = getTransporter();
  try {
    const info = await t.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
      text,
    });
    logger.info(`Email sent: ${info.messageId} to ${to}`);
    return info;
  } catch (err) {
    logger.error(`Email failed to ${to}: ${err.message}`);
    throw err;
  }
}

async function sendOtpEmail(to, name, otp) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, sans-serif; background: #0a0a0f; color: #fff; margin: 0; padding: 0; }
        .container { max-width: 480px; margin: 40px auto; background: #13131a; border-radius: 16px; overflow: hidden; border: 1px solid #2a2a3a; }
        .header { background: linear-gradient(135deg, #10b981, #059669); padding: 32px; text-align: center; }
        .header h1 { margin: 0; color: #fff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
        .body { padding: 32px; }
        .otp-box { background: #1e1e2e; border: 2px solid #10b981; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }
        .otp { font-size: 42px; font-weight: 800; letter-spacing: 12px; color: #10b981; font-family: monospace; }
        .note { color: #6b7280; font-size: 13px; text-align: center; margin-top: 8px; }
        .footer { padding: 20px 32px; border-top: 1px solid #2a2a3a; color: #4b5563; font-size: 12px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>PayTrack</h1></div>
        <div class="body">
          <p style="color: #d1d5db; font-size: 16px;">Hi <strong style="color: #fff;">${name}</strong>,</p>
          <p style="color: #9ca3af;">Use the code below to reset your password. It expires in <strong style="color: #fff;">10 minutes</strong>.</p>
          <div class="otp-box">
            <div class="otp">${otp}</div>
            <div class="note">One-time password · Do not share</div>
          </div>
          <p style="color: #6b7280; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
        <div class="footer">© ${new Date().getFullYear()} PayTrack · <a href="#" style="color: #10b981;">Unsubscribe</a></div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `${otp} — Your PayTrack password reset code`,
    html,
    text: `Your PayTrack OTP is: ${otp}. Valid for 10 minutes.`,
  });
}

module.exports = { sendEmail, sendOtpEmail };
