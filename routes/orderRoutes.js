import express from "express";
import Order from "../models/Order.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

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
      status: "pending", 
    });

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ message: "Failed to create order" });
  }
});

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

// ✅ Admin updates order status
router.patch("/:id/status", protect, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["pending", "processing", "shipped", "delivered", "cancelled"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.status = status;
    await order.save();

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: "Failed to update order status" });
  }
});

export default router;
