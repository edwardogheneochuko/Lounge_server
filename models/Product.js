import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String, required: false }, // <-- make optional
  },
  { timestamps: true }
);

export default mongoose.model("Product", productSchema);
