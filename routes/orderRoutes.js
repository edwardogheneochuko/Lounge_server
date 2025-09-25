import express from "express";
import Order from "../models/Order.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// ✅ User places an order
router.post("/", protect, async (req, res) => {
  try {
    const { items, total, address } = req.body;
    if (!items || !total || !address) {
      return res.status(400).json({ message: "Invalid order data" });
    }

    const order = await Order.create({
      user: req.user._id,
      items,
      total,
      address,
    });

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ message: "Failed to create order" });
  }
});

// ✅ User gets their own orders
router.get("/my-orders", protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .populate("items.product", "name price image")
      .populate("user", "email");

    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch your orders" });
  }
});

// ✅ Admin gets all orders
router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("items.product", "name price image")
      .populate("user", "email");

    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch all orders" });
  }
});

export default router;
