import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve('.env') });

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT) || 587;
const smtpSecure = process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1';
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM || 'School Management System <noreply@schoolmanagement.com>';

if (!smtpHost) {
  console.error("❌ SMTP_HOST is not set in your .env file.");
  console.log("Please configure:\n  SMTP_HOST=smtp.yourprovider.com\n  SMTP_PORT=587\n  SMTP_SECURE=false\n  SMTP_USER=your_user\n  SMTP_PASS=your_password\n  SMTP_FROM=your_email@domain.com");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: (smtpUser && smtpPass) ? { user: smtpUser, pass: smtpPass } : undefined
});

async function testEmail() {
  console.log(`📡 Connecting to SMTP server at ${smtpHost}:${smtpPort}...`);

  try {
    await transporter.verify();
    console.log("✅ SMTP connection and authentication verified successfully!");

    const testRecipient = process.env.TEST_EMAIL_RECIPIENT || smtpUser || 'admin@schoolmanagement.com';
    console.log(`✉️ Sending test message to ${testRecipient}...`);

    const info = await transporter.sendMail({
      from: smtpFrom,
      to: testRecipient,
      subject: 'Nodemailer SMTP Test - School Management System',
      html: '<h2>Nodemailer Configuration Active</h2><p>Your SMTP mail service is configured and operational.</p>',
      text: 'Nodemailer Configuration Active. Your SMTP mail service is configured and operational.'
    });

    console.log("✅ Test email sent successfully!");
    console.log("Message ID:", info.messageId);
    console.log("Response:", info.response);
  } catch (err) {
    console.error("❌ SMTP Error:", err.message);
  }
}

testEmail();

