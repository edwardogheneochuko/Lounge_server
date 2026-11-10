// The Express app, without starting a server or connecting to MongoDB,
// so tests can run it in-process. server.js does the connecting and listening.
import express from "express";
import cors from "cors";

import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";

const app = express();

// Behind Render's proxy: trust the first X-Forwarded-For hop so rate limits see real client IPs
app.set("trust proxy", 1);

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/upload", uploadRoutes);

app.get("/", (req, res) => res.send("✅ API is running with Cloudinary..."));

export default app;
