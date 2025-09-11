import express from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.js";

const router = express.Router();
const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

// Register
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (await User.findOne({ email })) return res.status(400).json({ message: "User already exists" });

    const user = await User.create({ username, email, password });
    res.status(201).json({ token: generateToken(user._id), user: { _id: user._id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) return res.status(400).json({ message: "Invalid credentials" });

    res.json({ token: generateToken(user._id), user: { _id: user._id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Forgot password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const token = crypto.randomBytes(20).toString("hex");
    user.resetToken = token;
    user.resetTokenExpiry = Date.now() + 3600000;
    await user.save();

    res.json({ message: "Password reset token generated", token });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Reset password
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findOne({ resetToken: req.params.token, resetTokenExpiry: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ message: "Invalid or expired token" });

    user.password = password;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
