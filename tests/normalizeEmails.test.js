import { after, before, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startTestServer } from "./helpers.js";

const serverDir = fileURLToPath(new URL("..", import.meta.url));

let t;
before(async () => {
  t = await startTestServer();
});
after(() => t.close());

const runScript = (...args) =>
  spawnSync(process.execPath, ["scripts/normalize-emails.js", ...args], {
    cwd: serverDir,
    env: { ...process.env, MONGO_URI: t.uri },
    encoding: "utf8",
  });

it("lowercases legacy emails, only with --apply, and reports conflicts", async () => {
  const users = t.db().collection("users");
  await users.insertMany([
    { username: "Legacy", email: "Legacy@Example.COM", password: "x", role: "user" },
    { username: "A", email: "Twin@Example.com", password: "x", role: "user" },
    { username: "B", email: "twin@example.com", password: "x", role: "user" },
  ]);

  const dry = runScript();
  assert.match(dry.stdout, /Would update: Legacy@Example.COM -> legacy@example.com/);
  assert.equal((await users.findOne({ username: "Legacy" })).email, "Legacy@Example.COM", "dry run changes nothing");

  const applied = runScript("--apply");
  assert.match(applied.stderr, /Conflict for twin@example.com/);
  assert.equal(applied.status, 1, "exits non-zero when there are conflicts");
  assert.equal((await users.findOne({ username: "Legacy" })).email, "legacy@example.com");
  assert.equal((await users.findOne({ username: "A" })).email, "Twin@Example.com", "conflicting accounts are left alone");
});
