import { sendEmail } from "./sendEmail.js";

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The password-reset email. Returns nodemailer's send info (null if not actually sent). */
export const sendPasswordResetEmail = ({ to, username, resetLink }) =>
  sendEmail({
    to,
    subject: "Reset your ASAP Lounge password",
    text:
      `Hi ${username},\n\n` +
      `Use this link to reset your password (valid for 1 hour):\n${resetLink}\n\n` +
      `If you didn't request this, you can ignore this email.\n\n— ASAP Lounge`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1c1917">
  <h2 style="margin:0 0 16px;font-size:20px">Reset your password</h2>
  <p>Hi ${escapeHtml(username)},</p>
  <p>Click the button below to choose a new password. The link is valid for 1 hour.</p>
  <p style="margin:28px 0">
    <a href="${resetLink}" style="background:#f59e0b;color:#1c1917;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">Reset password</a>
  </p>
  <p style="font-size:13px;color:#78716c">If the button doesn't work, paste this link into your browser:<br>
    <a href="${resetLink}" style="color:#b45309;word-break:break-all">${resetLink}</a></p>
  <p style="font-size:13px;color:#78716c">If you didn't request this, you can safely ignore this email.</p>
  <p style="font-size:13px;color:#78716c;margin-top:28px">— ASAP Lounge</p>
</div>`,
  });
