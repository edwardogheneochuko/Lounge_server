// models/Product.js
import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String, required: false }, // optional
    available: { type: Boolean, default: true }, // 👈 availability field
  },
  { timestamps: true }
);

export default mongoose.model("Product", productSchema);
