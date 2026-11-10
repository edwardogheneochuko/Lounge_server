import express from "express";
import Product from "../models/Product.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";
import cloudinary from "../config/cloudinary.js";

const router = express.Router();

// https://res.cloudinary.com/<cloud>/image/upload/v123/products/abc.jpg -> "products/abc"
const cloudinaryPublicId = (url) => {
  const match = typeof url === "string" && url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i);
  return match ? match[1] : null;
};

// GET all products
router.get("/", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch products" });
  }
});

// POST add product (expects JSON, no file upload here)
router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const { name, price, image } = req.body;

    if (!name || !price) {
      return res.status(400).json({ message: "Name and price required" });
    }

    const priceNum = Number(price);
    if (isNaN(priceNum)) {
      return res.status(400).json({ message: "Invalid price" });
    }

    const product = await Product.create({
      name,
      price: priceNum,
      image: image || null, // Cloudinary URL already provided
      available: true,
    });

    res.status(201).json(product);
  } catch (err) {
    console.error("❌ Product add error:", err);
    res.status(500).json({ message: "Failed to add product", error: err.message });
  }
});

// DELETE product
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    await product.deleteOne();

    // Best-effort cleanup of the Cloudinary image; a failure here shouldn't fail the delete.
    const publicId = cloudinaryPublicId(product.image);
    if (publicId) {
      cloudinary.uploader.destroy(publicId).catch((e) => console.error("Cloudinary cleanup failed:", e.message));
    }

    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete product" });
  }
});

// PATCH toggle availability
router.patch("/:id/toggle", protect, adminOnly, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    product.available = !product.available;
    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: "Failed to update product status" });
  }
});

export default router;
