import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config(); 

cloudinary.config({
  secure: true, // optional but recommended
});

export default cloudinary;
