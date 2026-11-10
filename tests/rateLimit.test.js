// Uses the real (default) limits, so it runs in its own file/process.
import { after, before, it } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers.js";

let t;
before(async () => {
  delete process.env.AUTH_RATE_LIMIT;
  delete process.env.RESET_RATE_LIMIT;
  t = await startTestServer();
});
after(() => t.close());

it("blocks repeated login attempts with 429 and a JSON message", async () => {
  let r;
  for (let i = 0; i < 25; i++) {
    r = await t.req("POST", "/auth/login", { body: { email: "nobody@test.com", password: "wrongpass" } });
    if (r.status === 429) break;
  }
  assert.equal(r.status, 429);
  assert.equal(typeof r.data.message, "string");
});

it("limits password reset requests", async () => {
  let r;
  for (let i = 0; i < 15; i++) {
    r = await t.req("POST", "/auth/forgot-password", { body: { email: "nobody@test.com" } });
    if (r.status === 429) break;
  }
  assert.equal(r.status, 429);
});
