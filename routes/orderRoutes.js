import express from "express";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

const MAX_QTY_PER_ITEM = 100;
const REQUIRED_ADDRESS_FIELDS = ["phone", "street", "city", "state"];
const ADDRESS_FIELDS = ["fullName", ...REQUIRED_ADDRESS_FIELDS, "zip"];

/**
 * @route   POST /api/orders
 * @desc    Create new order (checkout). Prices and total are taken from the database,
 *          never from the client; the client only sends product ids and quantities.
 * @access  Private (user)
 */
router.post("/", protect, async (req, res) => {
  try {
    const { items, address } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Your cart is empty" });
    }
    if (!address || typeof address !== "object") {
      return res.status(400).json({ message: "Shipping address is required" });
    }

    // Merge duplicate lines and validate ids/quantities
    const quantities = new Map();
    for (const item of items) {
      const id = String(item?.product ?? "");
      const qty = Number(item?.quantity);
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid product in cart" });
      }
      if (!Number.isInteger(qty) || qty < 1) {
        return res.status(400).json({ message: "Invalid quantity in cart" });
      }
      quantities.set(id, (quantities.get(id) || 0) + qty);
    }
    for (const qty of quantities.values()) {
      if (qty > MAX_QTY_PER_ITEM) {
        return res.status(400).json({ message: `Maximum ${MAX_QTY_PER_ITEM} of each item per order` });
      }
    }

    const products = await Product.find({ _id: { $in: [...quantities.keys()] } });
    const productsById = new Map(products.map((p) => [String(p._id), p]));

    const orderItems = [];
    let total = 0;
    for (const [id, quantity] of quantities) {
      const product = productsById.get(id);
      if (!product) {
        return res.status(400).json({ message: "A product in your cart no longer exists" });
      }
      if (!product.available) {
        return res.status(400).json({ message: `${product.name} is out of stock` });
      }
      orderItems.push({ product: product._id, name: product.name, price: product.price, quantity });
      total += product.price * quantity;
    }

    const cleanAddress = {};
    for (const field of ADDRESS_FIELDS) {
      const value = address[field];
      if (value !== undefined && typeof value !== "string") {
        return res.status(400).json({ message: `Invalid ${field}` });
      }
      cleanAddress[field] = value?.trim() || "";
    }
    if (REQUIRED_ADDRESS_FIELDS.some((f) => !cleanAddress[f])) {
      return res.status(400).json({ message: "Please complete your shipping details" });
    }
    if (!cleanAddress.fullName) cleanAddress.fullName = req.user.username;

    const order = await Order.create({
      user: req.user._id,
      items: orderItems,
      total,
      address: cleanAddress,
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
      .sort({ createdAt: -1 })
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
      .sort({ createdAt: -1 })
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
