import express from "express";
import Product from "../models/Product.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";
import multer from "multer";
import path from "path";

const router = express.Router();

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// GET all products
router.get("/", async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch products" });
  }
});

// POST add product (admin only)
router.post("/", protect, adminOnly, upload.single("image"), async (req, res) => {
  try {
    console.log("BODY:", req.body);
    console.log("FILE:", req.file);

    const { name, price } = req.body;
    if (!name || !price) return res.status(400).json({ message: "Name and price required" });

    const priceNum = Number(price);
    if (isNaN(priceNum)) return res.status(400).json({ message: "Invalid price" });

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const product = await Product.create({
      name,
      price: priceNum,
      image: imageUrl,
      available: true, // default available
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
