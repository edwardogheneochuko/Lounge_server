import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    resetToken: String,
    resetTokenExpiry: Date,
    // Tokens issued before this moment are rejected (see authMiddleware)
    passwordChangedAt: Date,
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  if (!this.isNew) {
    // JWT `iat` has 1-second resolution; back-date slightly so the token issued
    // right after this change (same second) is still accepted.
    this.passwordChangedAt = new Date(Date.now() - 1000);
  }
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// True if the JWT was issued before the password last changed
userSchema.methods.tokenIssuedBeforePasswordChange = function (iatSeconds) {
  return Boolean(this.passwordChangedAt) && iatSeconds * 1000 < this.passwordChangedAt.getTime();
};

export default mongoose.model("User", userSchema);
