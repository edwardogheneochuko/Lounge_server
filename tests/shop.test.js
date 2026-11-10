import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers.js";

let t, user, admin, jollof, suya;
const address = { fullName: "Ada", phone: "08012345678", street: "1 Admiralty Way", city: "Lagos", state: "Lagos" };

before(async () => {
  t = await startTestServer();
  user = await t.createUser();
  admin = await t.createAdmin();
});
after(() => t.close());

describe("uploads", () => {
  it("requires an admin", async () => {
    assert.equal((await t.req("POST", "/upload")).status, 401);
    assert.equal((await t.req("POST", "/upload", { token: user.token })).status, 403);
  });

  it("returns 400 when no image is sent", async () => {
    const r = await t.req("POST", "/upload", { token: admin.token });
    assert.equal(r.status, 400);
  });
});

describe("products", () => {
  it("only admins can add products", async () => {
    const r = await t.req("POST", "/products", { token: user.token, body: { name: "X", price: 1 } });
    assert.equal(r.status, 403);
  });

  it("admin adds and toggles products", async () => {
    jollof = (await t.req("POST", "/products", { token: admin.token, body: { name: "Jollof", price: 4500 } })).data;
    suya = (await t.req("POST", "/products", { token: admin.token, body: { name: "Suya", price: 3000 } })).data;
    assert.equal(jollof.price, 4500);

    const toggled = await t.req("PATCH", `/products/${suya._id}/toggle`, { token: admin.token });
    assert.equal(toggled.data.available, false);
  });

  it("lists products newest first, publicly", async () => {
    const r = await t.req("GET", "/products");
    assert.equal(r.status, 200);
    assert.equal(r.data[0]._id, suya._id);
  });
});

describe("orders", () => {
  it("computes prices and total on the server, ignoring client values", async () => {
    const r = await t.req("POST", "/orders", {
      token: user.token,
      body: { items: [{ product: jollof._id, quantity: 2, price: 1, name: "Free food" }], total: 2, address },
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.total, 9000);
    assert.equal(r.data.items[0].price, 4500);
    assert.equal(r.data.items[0].name, "Jollof");
  });

  it("merges duplicate lines", async () => {
    const r = await t.req("POST", "/orders", {
      token: user.token,
      body: { items: [{ product: jollof._id, quantity: 1 }, { product: jollof._id, quantity: 2 }], address },
    });
    assert.equal(r.data.items.length, 1);
    assert.equal(r.data.items[0].quantity, 3);
    assert.equal(r.data.total, 13500);
  });

  it("rejects bad orders with 400", async () => {
    const cases = {
      "sold-out product": { items: [{ product: suya._id, quantity: 1 }], address },
      "invalid product id": { items: [{ product: "not-an-id", quantity: 1 }], address },
      "unknown product": { items: [{ product: "64b7f0c2a1b2c3d4e5f60718", quantity: 1 }], address },
      "negative quantity": { items: [{ product: jollof._id, quantity: -3 }], address },
      "fractional quantity": { items: [{ product: jollof._id, quantity: 1.5 }], address },
      "too many": { items: [{ product: jollof._id, quantity: 101 }], address },
      "empty cart": { items: [], address },
      "incomplete address": { items: [{ product: jollof._id, quantity: 1 }], address: { phone: "1" } },
    };
    for (const [name, body] of Object.entries(cases)) {
      const r = await t.req("POST", "/orders", { token: user.token, body });
      assert.equal(r.status, 400, name);
    }
  });

  it("requires sign-in to order", async () => {
    const r = await t.req("POST", "/orders", { body: { items: [{ product: jollof._id, quantity: 1 }], address } });
    assert.equal(r.status, 401);
  });

  it("lists the user's own orders newest first", async () => {
    const latest = await t.req("POST", "/orders", {
      token: user.token,
      body: { items: [{ product: jollof._id, quantity: 1 }], address },
    });
    const other = await t.createUser();
    const r = await t.req("GET", "/orders/my-orders", { token: user.token });
    assert.equal(r.data[0]._id, latest.data._id);
    assert.ok(r.data.every((o) => o.user === user.user._id));

    const none = await t.req("GET", "/orders/my-orders", { token: other.token });
    assert.deepEqual(none.data, []);
  });

  it("only admins can list all orders and change status", async () => {
    assert.equal((await t.req("GET", "/orders", { token: user.token })).status, 403);

    const all = await t.req("GET", "/orders", { token: admin.token });
    assert.equal(all.status, 200);
    const id = all.data[0]._id;

    assert.equal((await t.req("PATCH", `/orders/${id}/status`, { token: user.token, body: { status: "shipped" } })).status, 403);
    const bad = await t.req("PATCH", `/orders/${id}/status`, { token: admin.token, body: { status: "teleported" } });
    assert.equal(bad.status, 400);
    const ok = await t.req("PATCH", `/orders/${id}/status`, { token: admin.token, body: { status: "shipped" } });
    assert.equal(ok.data.status, "shipped");
  });

  it("admin deletes a product", async () => {
    const r = await t.req("DELETE", `/products/${jollof._id}`, { token: admin.token });
    assert.equal(r.status, 200);
  });
});
