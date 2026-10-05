import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from root or backend
dotenv.config({ path: path.resolve('.env') });
dotenv.config({ path: path.resolve('backend/.env') });
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

const recipientArg = process.argv[2] || process.env.TEST_EMAIL_RECIPIENT || 'ahamedtamzil95@gmail.com';
const templateType = (process.argv[3] || 'welcome').toLowerCase();

const wrapTemplateHtml = (title, content, schoolName = 'School Management System') => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 24px 12px; margin: 0; }
    .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.07); }
    .header { background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0 0; font-size: 13px; color: #c7d2fe; text-transform: uppercase; letter-spacing: 1px; }
    .content { padding: 32px 28px; color: #334155; line-height: 1.6; font-size: 15px; }
    .greeting { font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0; margin-bottom: 12px; }
    .badge { display: inline-block; background-color: #e0e7ff; color: #4338ca; padding: 4px 12px; border-radius: 9999px; font-weight: 600; font-size: 13px; margin-bottom: 16px; }
    .card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .card-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; border-bottom: 1px dashed #e2e8f0; }
    .card-row:last-child { border-bottom: none; }
    .card-label { color: #64748b; font-weight: 500; }
    .card-value { color: #0f172a; font-weight: 600; }
    .btn-container { text-align: center; margin: 28px 0 20px; }
    .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2); }
    .footer { padding: 24px; text-align: center; font-size: 13px; color: #94a3b8; border-top: 1px solid #f1f5f9; background: #f8fafc; }
    .muted { font-size: 13px; color: #64748b; word-break: break-all; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${schoolName}</h1>
      <p>Official Portal Notification</p>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} ${schoolName}. All rights reserved.<br>
      Automated email delivered via Nodemailer SMTP Service.
    </div>
  </div>
</body>
</html>`;

function getTemplateData(type, recipient) {
  const schoolName = 'Spring Mount Public School';
  const userName = recipient.split('@')[0];

  switch (type) {
    case 'reset':
    case 'forgot-password': {
      const resetLink = 'https://app.sms.com/reset-password?token=a1b2c3d4e5f67890sampletoken';
      const content = `
        <h2 class="greeting">Password Reset Request</h2>
        <p>We received a request to reset your password for your <strong>${schoolName}</strong> account.</p>
        <p>Click the button below to securely set your new password:</p>
        <div class="btn-container">
          <a href="${resetLink}" class="btn">Reset Password</a>
        </div>
        <div class="card">
          <div class="card-row">
            <span class="card-label">Requested For:</span>
            <span class="card-value">${recipient}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Link Validity:</span>
            <span class="card-value">1 Hour</span>
          </div>
        </div>
        <p class="muted">If you did not request this change, you can safely ignore this email. Your password will remain unchanged.</p>
        <p class="muted">Direct Link:<br><a href="${resetLink}" style="color:#4f46e5;">${resetLink}</a></p>
      `;
      return {
        subject: `Password Reset Request - ${schoolName}`,
        html: wrapTemplateHtml('Password Reset Request', content, schoolName),
        text: `Password Reset Request - ${schoolName}\n\nReset your password here: ${resetLink}`
      };
    }
    case 'approval': {
      const dashboardLink = 'https://app.sms.com/admin/dashboard';
      const content = `
        <h2 class="greeting">Congratulations! School Account Approved 🎉</h2>
        <span class="badge">Approved & Activated</span>
        <p>Your registration for <strong>${schoolName}</strong> has been successfully reviewed and approved by the Super Admin.</p>
        <div class="card">
          <div class="card-row">
            <span class="card-label">School:</span>
            <span class="card-value">${schoolName}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Admin Email:</span>
            <span class="card-value">${recipient}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Status:</span>
            <span class="card-value" style="color:#16a34a;">Active</span>
          </div>
        </div>
        <p>You can now access your School ERP administrative dashboard and start configuring your classes, staff, and students.</p>
        <div class="btn-container">
          <a href="${dashboardLink}" class="btn">Go to Dashboard</a>
        </div>
      `;
      return {
        subject: `Your School Account is Approved! - ${schoolName}`,
        html: wrapTemplateHtml('School Approved', content, schoolName),
        text: `Congratulations! Your school ${schoolName} has been approved. Access your dashboard at ${dashboardLink}`
      };
    }
    case 'welcome':
    default: {
      const loginUrl = 'https://app.sms.com/login';
      const content = `
        <h2 class="greeting">Welcome to the Portal, ${userName}! 👋</h2>
        <span class="badge">New Account Created</span>
        <p>Your portal account has been created for <strong>${schoolName}</strong>.</p>
        <div class="card">
          <div class="card-row">
            <span class="card-label">Assigned Role:</span>
            <span class="card-value">Administrator</span>
          </div>
          <div class="card-row">
            <span class="card-label">Username / Email:</span>
            <span class="card-value">${recipient}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Mail Delivery:</span>
            <span class="card-value" style="color:#4f46e5;">Nodemailer SMTP</span>
          </div>
        </div>
        <p>Click the button below to log in and access your workspace:</p>
        <div class="btn-container">
          <a href="${loginUrl}" class="btn">Login to Dashboard</a>
        </div>
        <p class="muted">If you have any questions or need assistance, please contact your school administrator or support team.</p>
      `;
      return {
        subject: `Welcome to ${schoolName} - Account Active`,
        html: wrapTemplateHtml('Welcome to the Portal', content, schoolName),
        text: `Welcome to ${schoolName}!\n\nYour account has been created. Login at: ${loginUrl}`
      };
    }
  }
}

async function testEmail() {
  console.log(`📡 Connecting to SMTP server at ${smtpHost}:${smtpPort}...`);

  try {
    await transporter.verify();
    console.log("✅ SMTP connection and authentication verified successfully!");

    const templateData = getTemplateData(templateType, recipientArg);
    console.log(`✉️ Sending [${templateType.toUpperCase()}] template email to ${recipientArg}...`);

    const info = await transporter.sendMail({
      from: smtpFrom,
      to: recipientArg,
      subject: templateData.subject,
      html: templateData.html,
      text: templateData.text
    });

    console.log("✅ Templated email sent successfully!");
    console.log("Subject:", templateData.subject);
    console.log("Message ID:", info.messageId);
    console.log("Response:", info.response);
  } catch (err) {
    console.error("❌ SMTP Error:", err.message);
  }
}

testEmail();

