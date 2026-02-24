import mongoose from "mongoose";

const adminUserSchema = new mongoose.Schema(
  {
    shopId: {
      type: String,
      required: true,
      index: true
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["super_admin", "admin", "moderator"],
      default: "admin",
    },
    email: String,
    permissions: [String],
    lastLogin: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Compound unique index: username ต้องไม่ซ้ำภายใน shop เดียวกัน
adminUserSchema.index({ shopId: 1, username: 1 }, { unique: true });

const AdminUser = mongoose.model("AdminUser", adminUserSchema);

export default AdminUser;
