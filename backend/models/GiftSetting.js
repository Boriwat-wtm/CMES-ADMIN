import mongoose from "mongoose";

const giftSettingSchema = new mongoose.Schema(
  {
    shopId: {
      type: String,
      required: true,
      index: true
    },
    giftId: {
      type: String,
      required: true,
    },
    giftName: {
      type: String,
      required: true,
    },
    description: String,
    price: {
      type: Number,
      required: true,
    },
    available: {
      type: Boolean,
      default: true,
    },
    stock: {
      type: Number,
      default: 0,
    },
    image: String,
    category: String,
    minDonationAmount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Compound unique index: giftId ต้องไม่ซ้ำภายใน shop เดียวกัน
giftSettingSchema.index({ shopId: 1, giftId: 1 }, { unique: true });

const GiftSetting = mongoose.model("GiftSetting", giftSettingSchema);

export default GiftSetting;
