import express from "express";
import Product from "../models/Product.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";
import multer from "multer";
import path from "path";

const router = express.Router();

// Configure Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // folder to save uploaded files
  },
  filename: function (req, file, cb) {
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

// POST add product (Admin only) with file upload
router.post("/", protect, adminOnly, upload.single("image"), async (req, res) => {
  try {
    const { name, price } = req.body;
    if (!name || !price || !req.file) {
      return res.status(400).json({ message: "All fields required" });
    }

    const imageUrl = `/uploads/${req.file.filename}`; // path to the saved file
    const product = await Product.create({ name, price, image: imageUrl });
    res.status(201).json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to add product" });
  }
});

export default router;
