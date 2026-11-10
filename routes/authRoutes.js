import express from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.js";
import { sendPasswordResetEmail } from "../utils/emails.js";
import { protect } from "../middleware/authMiddleware.js";
import { accountLimiter, authLimiter, resetLimiter } from "../middleware/rateLimit.js";

const router = express.Router();

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const publicUser = (u) => ({ _id: u._id, username: u.username, email: u.email, role: u.role });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Emails are stored lowercase; anything that isn't a string (e.g. a {$ne: null} query object) is rejected
const normalizeEmail = (email) => (typeof email === "string" ? email.trim().toLowerCase() : null);

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const RESET_COOLDOWN_MS = 60 * 1000; // at most one reset email per account per minute

// Register
router.post("/register", authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const email = normalizeEmail(req.body.email);

    if (typeof username !== "string" || username.trim().length < 3) {
      return res.status(400).json({ message: "Username must be at least 3 characters" });
    }
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ message: "Invalid email" });
    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    if (await User.exists({ email })) return res.status(400).json({ message: "User already exists" });

    const user = await User.create({ username: username.trim(), email, password });
    res.status(201).json({ token: generateToken(user._id), user: publicUser(user) });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Registration failed" });
  }
});

// Login
router.post("/login", authLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;
    if (!email || typeof password !== "string") {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) return res.status(400).json({ message: "Invalid credentials" });

    res.json({ token: generateToken(user._id), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Forgot password
// Always responds the same way (and without waiting for the email) so the endpoint can't be used
// to discover which emails exist. The token is never returned — it must only reach the account owner.
router.post("/forgot-password", resetLimiter, async (req, res) => {
  const genericResponse = { message: "If an account exists for that email, a reset link has been sent." };
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) return res.json(genericResponse);

    const user = await User.findOne({ email });
    if (!user) return res.json(genericResponse);

    // Cooldown: don't let someone flood this inbox with reset emails
    const lastIssued = user.resetTokenExpiry ? user.resetTokenExpiry.getTime() - RESET_TTL_MS : 0;
    if (Date.now() - lastIssued < RESET_COOLDOWN_MS) return res.json(genericResponse);

    const token = crypto.randomBytes(32).toString("hex");
    user.resetToken = hashToken(token); // store only the hash, so a DB leak doesn't expose live tokens
    user.resetTokenExpiry = Date.now() + RESET_TTL_MS;
    await user.save();

    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const resetLink = `${clientUrl}/reset-password/${token}`;

    sendPasswordResetEmail({ to: user.email, username: user.username, resetLink }).catch((mailErr) => console.error("Reset email failed:", mailErr.message));

    res.json(genericResponse);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Reset password
router.post("/reset-password/:token", resetLimiter, async (req, res) => {
  try {
    const { password } = req.body;
    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    const user = await User.findOne({
      resetToken: hashToken(req.params.token),
      resetTokenExpiry: { $gt: Date.now() },
    });
    if (!user) return res.status(400).json({ message: "Invalid or expired token" });

    user.password = password; // also signs out every existing session (see User model)
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ---------- Account (logged-in user) ----------

// Get current user
router.get("/me", protect, (req, res) => res.json(publicUser(req.user)));

// Update profile (username / email)
router.patch("/me", protect, async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findById(req.user._id);

    if (username !== undefined) {
      if (typeof username !== "string" || username.trim().length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters" });
      }
      user.username = username.trim();
    }

    if (req.body.email !== undefined) {
      const newEmail = normalizeEmail(req.body.email);
      if (!newEmail || !EMAIL_RE.test(newEmail)) {
        return res.status(400).json({ message: "Invalid email" });
      }
      if (newEmail !== user.email && (await User.exists({ email: newEmail }))) {
        return res.status(400).json({ message: "That email is already in use" });
      }
      user.email = newEmail;
    }

    await user.save();
    res.json(publicUser(user));
  } catch (err) {
    res.status(500).json({ message: "Failed to update profile" });
  }
});

// Change password. Signs out all other sessions and returns a fresh token for this one.
router.patch("/me/password", protect, accountLimiter, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }
    const user = await User.findById(req.user._id);
    if (typeof currentPassword !== "string" || !(await user.matchPassword(currentPassword))) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }
    user.password = newPassword;
    await user.save();
    res.json({ message: "Password updated", token: generateToken(user._id) });
  } catch (err) {
    res.status(500).json({ message: "Failed to change password" });
  }
});

// Delete own account (requires password). Past orders are kept for the restaurant's records.
router.delete("/me", protect, accountLimiter, async (req, res) => {
  try {
    if (req.user.role === "admin") {
      return res.status(403).json({ message: "Admin accounts can't be deleted here" });
    }
    const user = await User.findById(req.user._id);
    const { password } = req.body || {};
    if (typeof password !== "string" || !(await user.matchPassword(password))) {
      return res.status(400).json({ message: "Password is incorrect" });
    }
    await user.deleteOne();
    res.json({ message: "Account deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete account" });
  }
});

export default router;
