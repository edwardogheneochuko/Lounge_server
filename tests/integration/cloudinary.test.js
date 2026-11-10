// Real Cloudinary round-trip. Needs CLOUDINARY_* in .env; skipped otherwise.
// Run with: npm run test:integration
import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { sleep, startTestServer } from "../helpers.js";

const configured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
);

// 1×1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

describe("Cloudinary upload (integration)", { skip: !configured && "CLOUDINARY_* not set" }, () => {
  let t, admin, user, cloudinary, publicId;

  before(async () => {
    t = await startTestServer();
    admin = await t.createAdmin();
    user = await t.createUser();
    cloudinary = (await import("../../config/cloudinary.js")).default;
  });

  after(async () => {
    // Safety net: never leave test images behind
    if (publicId) await cloudinary.uploader.destroy(publicId).catch(() => {});
    await t.close();
  });

  const upload = (token, blob, filename = "test.png") => {
    const form = new FormData();
    form.append("image", blob, filename);
    return fetch(`${t.base}/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then(async (r) => ({ status: r.status, data: await r.json() }));
  };

  it("rejects non-admins", async () => {
    const r = await upload(user.token, new Blob([PNG], { type: "image/png" }));
    assert.equal(r.status, 403);
  });

  it("rejects non-image files", async () => {
    const r = await upload(admin.token, new Blob(["hello"], { type: "text/plain" }), "notes.txt");
    assert.equal(r.status, 400);
  });

  it("uploads an image, and deleting the product removes it from Cloudinary", async () => {
    const r = await upload(admin.token, new Blob([PNG], { type: "image/png" }));
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.match(r.data.url, new RegExp(`^https://res\\.cloudinary\\.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/`));

    publicId = r.data.url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i)[1];
    assert.match(publicId, /^products\//);
    const info = await cloudinary.api.resource(publicId);
    assert.equal(info.width, 1);

    const product = await t.req("POST", "/products", {
      token: admin.token,
      body: { name: "Integration test dish", price: 100, image: r.data.url },
    });
    assert.equal(product.status, 201);

    const del = await t.req("DELETE", `/products/${product.data._id}`, { token: admin.token });
    assert.equal(del.status, 200);

    // Cleanup runs in the background; poll until the image is gone
    let gone = false;
    for (let i = 0; i < 10 && !gone; i++) {
      await sleep(500);
      gone = await cloudinary.api
        .resource(publicId)
        .then(() => false)
        .catch((e) => e.error?.http_code === 404);
    }
    assert.ok(gone, "image should be deleted from Cloudinary with the product");
    publicId = null;
  });
});
