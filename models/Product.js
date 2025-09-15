import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String, required: false }, // image is optional
    available: { type: Boolean, default: true }, // for Available / Out of Order
  },
  { timestamps: true }
);

export default mongoose.model("Product", productSchema);
