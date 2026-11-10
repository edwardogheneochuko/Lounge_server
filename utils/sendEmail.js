import nodemailer from "nodemailer";

// Works with any SMTP provider (Gmail app password, Brevo, Resend, Mailgun, ...).
// Required env: SMTP_HOST, SMTP_USER, SMTP_PASS. Optional: SMTP_PORT (default 587), EMAIL_FROM.
const isConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter;
const getTransporter = () => {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
};

// In tests, emails are collected here instead of being sent or printed
export const testOutbox = [];

/**
 * Send an email. Returns nodemailer's send info, or null when nothing was actually sent.
 * Under NODE_ENV=test emails go to `testOutbox`, unless EMAIL_DELIVERY=real (integration tests).
 */
export const sendEmail = async ({ to, subject, text, html }) => {
  if (process.env.NODE_ENV === "test" && process.env.EMAIL_DELIVERY !== "real") {
    testOutbox.push({ to, subject, text, html });
    return null;
  }
  if (!isConfigured()) {
    // Local development without SMTP: print the message instead of sending it.
    console.warn(`✉️  SMTP not configured — email to ${to} not sent.\nSubject: ${subject}\n${text}`);
    return null;
  }
  return getTransporter().sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
  });
};
