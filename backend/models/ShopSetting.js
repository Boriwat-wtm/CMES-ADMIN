import mongoose from "mongoose";

const shopSettingSchema = new mongoose.Schema({
  shopId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Shop Profile
  name: {
    type: String,
    default: ""
  },
  logo: {
    type: String,
    default: null  // Cloudinary URL
  },
  // Display Settings
  displayTime: {
    type: Number,
    default: 8
  },
  autoPlayEnabled: {
    type: Boolean,
    default: true
  },
  queueDelay: {
    type: Number,
    default: 15 // seconds between items
  },
  // Birthday Feature Settings
  birthdaySpendingRequirement: {
    type: Number,
    default: 100
  },
  birthdayEnabled: {
    type: Boolean,
    default: true
  },
  // Perks/Benefits for supporters
  perks: {
    type: [String],
    default: [
      "🎁 แสดงข้อความและโปรไฟล์ฟรีกับหน้าอันดับผู้สนับสนุน",
      "🌟 ป้าย Diamond/Gold/Silver ที่ช่วยแยกความโดดเด่น",
      "💎 สิทธิเข้าถึงโปรโมชั่นพิเศษหรือกิจกรรมทดลองใหม่",
      "💬 ช่องทางติดต่อทีมเซทอัพสำหรับแสดงความคิดเห็น"
    ]
  },
  // Payment QR Code
  paymentQrUrl: {
    type: String,
    default: null  // Cloudinary URL สำหรับภาพ QR code ชำระเงิน
  },
  // Gift Settings
  tableCount: {
    type: Number,
    default: 10
  },
  // General System Config
  systemConfig: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

const ShopSetting = mongoose.model("ShopSetting", shopSettingSchema);

export default ShopSetting;
