// Real email delivery. Needs SMTP_* and TEST_EMAIL_TO in .env; skipped otherwise.
// Sends ONE real password-reset email to TEST_EMAIL_TO. Run with: npm run test:integration
import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "../helpers.js";

const to = process.env.TEST_EMAIL_TO;
const configured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && to);

describe("Password reset email (integration)", { skip: !configured && "SMTP_* or TEST_EMAIL_TO not set" }, () => {
  let t;

  before(async () => {
    t = await startTestServer({ env: { CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173" } });
  });
  after(() => t.close());

  it("the reset flow generates a working link", async () => {
    // Same flow a user goes through, captured in the test outbox
    await t.createUser({ email: to });
    await t.req("POST", "/auth/forgot-password", { body: { email: to } });
    const token = t.lastResetToken(to);
    assert.ok(token, "reset email should contain a token");
  });

  it("delivers a real password-reset email over SMTP", async () => {
    process.env.EMAIL_DELIVERY = "real";
    try {
      const { sendPasswordResetEmail } = await import("../../utils/emails.js");
      const info = await sendPasswordResetEmail({
        to,
        username: "ASAP Lounge test",
        resetLink: `${process.env.CLIENT_URL || "http://localhost:5173"}/reset-password/integration-test-link`,
      });
      assert.ok(info, "email should have been sent, not skipped");
      assert.deepEqual(info.rejected, [], `rejected: ${info.rejected}`);
      assert.ok(info.accepted.includes(to), `accepted: ${info.accepted}`);
      assert.match(info.response, /^250/, "SMTP server should accept the message");
    } finally {
      delete process.env.EMAIL_DELIVERY;
    }
  });
});
