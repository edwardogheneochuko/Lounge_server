import express from "express";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const router = express.Router();

// Use Cloudinary storage directly
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "products",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const upload = multer({ storage });

// POST /api/upload
router.post("/", upload.single("image"), (req, res) => {
  try {
    res.json({ url: req.file.path }); 
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Image upload failed" });
  }
});

export default router;
