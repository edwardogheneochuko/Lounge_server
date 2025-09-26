import express from "express";
import Product from "../models/Product.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";

const router = express.Router();

// Use multer memory storage (no local uploads)
const storage = multer.memoryStorage();
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
    const { name, price } = req.body;
    if (!name || !price) return res.status(400).json({ message: "Name and price required" });

    const priceNum = Number(price);
    if (isNaN(priceNum)) return res.status(400).json({ message: "Invalid price" });

    let imageUrl = null;

    if (req.file) {
      const result = await cloudinary.uploader.upload_stream(
        { folder: "products" },
        (error, result) => {
          if (error) throw error;
          imageUrl = result.secure_url;
        }
      );

      // Cloudinary expects a stream
      const stream = cloudinary.uploader.upload_stream(
        { folder: "products" },
        async (error, result) => {
          if (error) return res.status(500).json({ message: "Image upload failed" });
          imageUrl = result.secure_url;

          const product = await Product.create({
            name,
            price: priceNum,
            image: imageUrl,
            available: true,
          });

          return res.status(201).json(product);
        }
      );

      stream.end(req.file.buffer);
      return; // exit here because response is inside the callback
    }

    // If no image, just save product
    const product = await Product.create({
      name,
      price: priceNum,
      image: null,
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
