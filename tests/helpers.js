// Shared test setup: an in-memory MongoDB plus the Express app on a random port.
// Each test file runs in its own process (node --test default), so state never leaks between files.
import { MongoMemoryServer } from "mongodb-memory-server-core";
import mongoose from "mongoose";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.CLIENT_URL = "http://client.test";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} [options]
 * @param {Record<string,string>} [options.env] extra env vars, applied before the app is loaded
 */
export async function startTestServer({ env = {} } = {}) {
  Object.assign(process.env, env);

  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri("lounge-test");
  await mongoose.connect(uri);

  // Import after env is set, since rate limits are read at load time
  const { default: app } = await import("../app.js");
  const { testOutbox } = await import("../utils/sendEmail.js");

  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  /** Make a JSON request. Returns { status, data }. */
  const req = async (method, path, { token, body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data };
  };

  let counter = 0;
  /** Register a fresh user and return { token, user, email, password }. */
  const createUser = async (overrides = {}) => {
    counter += 1;
    const body = { username: `User${counter}`, email: `user${counter}@test.com`, password: "secret1", ...overrides };
    const r = await req("POST", "/auth/register", { body });
    if (r.status !== 201) throw new Error(`createUser failed: ${JSON.stringify(r)}`);
    return { ...r.data, email: body.email, password: body.password };
  };

  /** Create a user, promote them to admin directly in the DB, and sign in. */
  const createAdmin = async () => {
    const u = await createUser();
    await mongoose.connection.db.collection("users").updateOne({ _id: new mongoose.Types.ObjectId(u.user._id) }, { $set: { role: "admin" } });
    const r = await req("POST", "/auth/login", { body: { email: u.email, password: u.password } });
    return { ...u, token: r.data.token, user: r.data.user };
  };

  /** Pull the token out of the most recent reset email sent to `email`. */
  const lastResetToken = (email) => {
    const mail = [...testOutbox].reverse().find((m) => m.to === email.toLowerCase());
    return mail?.text.match(/reset-password\/([a-f0-9]+)/)?.[1];
  };

  const close = async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongo.stop();
  };

  return { uri, base, req, createUser, createAdmin, outbox: testOutbox, lastResetToken, db: () => mongoose.connection.db, close };
}
