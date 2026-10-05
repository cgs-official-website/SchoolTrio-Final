  import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, subject, html, text } = req.body;

    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ error: 'Missing required fields (to, subject, html/text)' });
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT) || 587;
    const smtpSecure = process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1';
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || 'School Management System <noreply@schoolmanagement.com>';

    if (!smtpHost) {
      console.warn('[api/send-email] SMTP_HOST not configured. Email logged but not sent.');
      return res.status(200).json({
        success: true,
        message: 'SMTP not configured; email logged in dev mode',
        data: { to, subject }
      });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: (smtpUser && smtpPass) ? { user: smtpUser, pass: smtpPass } : undefined,
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      }
    });

    const info = await transporter.sendMail({
      from: smtpFrom,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      text
    });

    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('Nodemailer Error sending email:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}

