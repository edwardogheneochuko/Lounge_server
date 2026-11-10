import express from "express";
import multer from "multer";
import streamifier from "streamifier";
import cloudinary from "../config/cloudinary.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// Keep the file in memory and stream it to Cloudinary, so nothing is left on disk if the upload fails.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

const uploadToCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: "products" }, (err, result) =>
      err ? reject(err) : resolve(result)
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });

router.post("/", protect, adminOnly, (req, res) => {
  upload.single("image")(req, res, async (err) => {
    if (err) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "Image must be 5 MB or smaller" : err.message;
      return res.status(400).json({ message });
    }
    if (!req.file) return res.status(400).json({ message: "No image provided" });

    try {
      const result = await uploadToCloudinary(req.file.buffer);
      res.json({ url: result.secure_url });
    } catch (uploadErr) {
      console.error("Upload error:", uploadErr);
      res.status(500).json({ message: "Image upload failed" });
    }
  });
});

export default router;
