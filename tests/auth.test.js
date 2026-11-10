import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { sleep, startTestServer } from "./helpers.js";

let t;
before(async () => {
  t = await startTestServer({ env: { AUTH_RATE_LIMIT: "1000", RESET_RATE_LIMIT: "1000" } });
});
after(() => t.close());

describe("register & login", () => {
  it("registers a user and returns a token", async () => {
    const r = await t.req("POST", "/auth/register", {
      body: { username: "Ada", email: "ada@test.com", password: "secret1" },
    });
    assert.equal(r.status, 201);
    assert.ok(r.data.token);
    assert.equal(r.data.user.role, "user");
    assert.equal(r.data.user.password, undefined);
  });

  it("ignores a role sent by the client", async () => {
    const r = await t.req("POST", "/auth/register", {
      body: { username: "Eve", email: "eve@test.com", password: "secret1", role: "admin" },
    });
    assert.equal(r.data.user.role, "user");
  });

  it("validates input", async () => {
    const bad = [
      { username: "Al", email: "al@test.com", password: "secret1" },
      { username: "Alan", email: "not-an-email", password: "secret1" },
      { username: "Alan", email: "al@test.com", password: "123" },
    ];
    for (const body of bad) {
      const r = await t.req("POST", "/auth/register", { body });
      assert.equal(r.status, 400, JSON.stringify(body));
    }
  });

  it("stores emails lowercase and logs in case-insensitively", async () => {
    const r = await t.req("POST", "/auth/register", {
      body: { username: "Mixy", email: "  Mixed@Test.COM ", password: "secret1" },
    });
    assert.equal(r.data.user.email, "mixed@test.com");

    const login = await t.req("POST", "/auth/login", { body: { email: "MIXED@test.com", password: "secret1" } });
    assert.equal(login.status, 200);

    const dupe = await t.req("POST", "/auth/register", {
      body: { username: "Dupe", email: "mixed@TEST.com", password: "secret1" },
    });
    assert.equal(dupe.status, 400);
  });

  it("rejects a wrong password", async () => {
    const r = await t.req("POST", "/auth/login", { body: { email: "ada@test.com", password: "wrong!" } });
    assert.equal(r.status, 400);
  });

  it("rejects a query object as email (NoSQL injection)", async () => {
    const r = await t.req("POST", "/auth/login", { body: { email: { $ne: null }, password: "secret1" } });
    assert.equal(r.status, 400);
  });
});

describe("account", () => {
  it("returns and updates the profile", async () => {
    const u = await t.createUser();
    const me = await t.req("GET", "/auth/me", { token: u.token });
    assert.equal(me.data.email, u.email);

    const upd = await t.req("PATCH", "/auth/me", { token: u.token, body: { username: "New Name", email: "NEW@test.com" } });
    assert.equal(upd.status, 200);
    assert.equal(upd.data.username, "New Name");
    assert.equal(upd.data.email, "new@test.com");
  });

  it("refuses an email that's already taken", async () => {
    const a = await t.createUser();
    const b = await t.createUser();
    const r = await t.req("PATCH", "/auth/me", { token: b.token, body: { email: a.email.toUpperCase() } });
    assert.equal(r.status, 400);
  });

  it("requires the current password to change it", async () => {
    const u = await t.createUser();
    const r = await t.req("PATCH", "/auth/me/password", {
      token: u.token,
      body: { currentPassword: "wrong!", newPassword: "secret2" },
    });
    assert.equal(r.status, 400);
  });

  it("changing password signs out old sessions and returns a new token", async () => {
    const u = await t.createUser();
    await sleep(1100); // let the old token's iat fall outside the 1s grace window

    const r = await t.req("PATCH", "/auth/me/password", {
      token: u.token,
      body: { currentPassword: "secret1", newPassword: "secret2" },
    });
    assert.equal(r.status, 200);
    assert.ok(r.data.token);

    assert.equal((await t.req("GET", "/auth/me", { token: u.token })).status, 401);
    assert.equal((await t.req("GET", "/auth/me", { token: r.data.token })).status, 200);

    const login = await t.req("POST", "/auth/login", { body: { email: u.email, password: "secret2" } });
    assert.equal(login.status, 200);
  });

  it("deletes an account only with the right password", async () => {
    const u = await t.createUser();
    const wrong = await t.req("DELETE", "/auth/me", { token: u.token, body: { password: "nope!!" } });
    assert.equal(wrong.status, 400);

    const ok = await t.req("DELETE", "/auth/me", { token: u.token, body: { password: "secret1" } });
    assert.equal(ok.status, 200);

    // The token now belongs to a deleted user: 401, not a crash
    assert.equal((await t.req("GET", "/auth/me", { token: u.token })).status, 401);
  });

  it("does not let admins delete themselves", async () => {
    const admin = await t.createAdmin();
    const r = await t.req("DELETE", "/auth/me", { token: admin.token, body: { password: "secret1" } });
    assert.equal(r.status, 403);
  });

  it("rejects requests without a valid token", async () => {
    assert.equal((await t.req("GET", "/auth/me")).status, 401);
    assert.equal((await t.req("GET", "/auth/me", { token: "garbage" })).status, 401);
  });
});

describe("forgot & reset password", () => {
  it("gives the same answer for known and unknown emails, and never returns the token", async () => {
    const u = await t.createUser();
    const unknown = await t.req("POST", "/auth/forgot-password", { body: { email: "nobody@test.com" } });
    const known = await t.req("POST", "/auth/forgot-password", { body: { email: u.email } });

    assert.equal(known.status, 200);
    assert.deepEqual(known.data, unknown.data);
    assert.equal(known.data.token, undefined);
    assert.ok(t.lastResetToken(u.email), "a reset email should have been sent");
  });

  it("resets the password with the emailed link, once", async () => {
    const u = await t.createUser();
    await sleep(1100);
    await t.req("POST", "/auth/forgot-password", { body: { email: u.email.toUpperCase() } });
    const token = t.lastResetToken(u.email);

    const reset = await t.req("POST", `/auth/reset-password/${token}`, { body: { password: "brandnew" } });
    assert.equal(reset.status, 200);

    const reuse = await t.req("POST", `/auth/reset-password/${token}`, { body: { password: "another1" } });
    assert.equal(reuse.status, 400, "reset links are single-use");

    assert.equal((await t.req("GET", "/auth/me", { token: u.token })).status, 401, "old sessions are signed out");
    const login = await t.req("POST", "/auth/login", { body: { email: u.email, password: "brandnew" } });
    assert.equal(login.status, 200);
  });

  it("rejects an invalid token", async () => {
    const r = await t.req("POST", "/auth/reset-password/deadbeef", { body: { password: "brandnew" } });
    assert.equal(r.status, 400);
  });

  it("sends at most one reset email per account per minute", async () => {
    const u = await t.createUser();
    const before = t.outbox.filter((m) => m.to === u.email).length;
    await t.req("POST", "/auth/forgot-password", { body: { email: u.email } });
    await t.req("POST", "/auth/forgot-password", { body: { email: u.email } });
    const sent = t.outbox.filter((m) => m.to === u.email).length - before;
    assert.equal(sent, 1);
  });
});
