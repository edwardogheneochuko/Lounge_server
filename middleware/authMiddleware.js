import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }

  let decoded;
  try {
    decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }

  try {
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return res.status(401).json({ message: "Not authorized, user no longer exists" });
    if (user.tokenIssuedBeforePasswordChange(decoded.iat)) {
      return res.status(401).json({ message: "Password was changed, please sign in again" });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const adminOnly = (req, res, next) => {
  if (req.user?.role === "admin") return next();
  res.status(403).json({ message: "Admin access only" });
};
