import express from "express";
import Product from "../models/Product.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// Get all products
router.get("/", async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch products" });
  }
});

// Admin - add product
router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const { name, price, image } = req.body;
    if (!name || !price || !image) return res.status(400).json({ message: "All fields required" });

    const product = await Product.create({ name, price, image });
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: "Failed to add product" });
  }
});

export default router;
