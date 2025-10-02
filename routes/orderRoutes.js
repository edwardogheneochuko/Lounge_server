import express from "express";
import Order from "../models/Order.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * @route   POST /api/orders
 * @desc    Create new order (checkout)
 * @access  Private (user)
 */
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
    console.error("Checkout error:", err);
    res.status(500).json({ message: "Failed to create order" });
  }
});

/**
 * @route   GET /api/orders/my-orders
 * @desc    Get logged-in user's orders
 * @access  Private (user)
 */
router.get("/my-orders", protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .populate("items.product", "name price image");
    res.json(orders);
  } catch (err) {
    console.error("Fetch my orders error:", err);
    res.status(500).json({ message: "Failed to fetch your orders" });
  }
});

/**
 * @route   GET /api/orders
 * @desc    Get all orders (admin)
 * @access  Private/Admin
 */
router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("items.product", "name price image")
      .populate("user", "email");
    res.json(orders);
  } catch (err) {
    console.error("Fetch all orders error:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

/**
 * @route   PATCH /api/orders/:id/status
 * @desc    Update order status (admin)
 * @access  Private/Admin
 */
// PATCH /api/orders/:id/status
router.patch("/:id/status", protect, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["pending", "processing", "shipped", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.status = status;
    await order.save();

    res.json(order);
  } catch (err) {
    console.error("Update order status error:", err);
    res.status(500).json({ message: "Failed to update status" });
  }
});


/**
 * @route   DELETE /api/orders/:id
 * @desc    Delete order (admin)
 * @access  Private/Admin
 */
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    await order.deleteOne();
    res.json({ message: "Order deleted" });
  } catch (err) {
    console.error("Delete order error:", err);
    res.status(500).json({ message: "Failed to delete order" });
  }
});

export default router;
