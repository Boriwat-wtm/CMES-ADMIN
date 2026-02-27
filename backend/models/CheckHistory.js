import mongoose from "mongoose";

const checkHistorySchema = new mongoose.Schema(
  {
    // Multi-tenant Identifier
    shopId: {
      type: String,
      required: true,
      index: true
    },

    // Common fields
    transactionId: { type: String, required: true }, // เดิม giftId
    type: {
      type: String,
      // enum: ["text", "image", "gift", "birthday"], // Remove strict enum or ensure sender sends correct type
      required: true
    },
    sender: { type: String, default: "Unknown" },
    price: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["rejected", "completed"], // เก็บเฉพาะสถานะสุดท้าย
      required: true,
    },

    // Content fields
    content: { type: String, default: "" }, // สำหรับ Text message หรือ Gift Name
    mediaUrl: { type: String, default: null }, // สำหรับ Image path, เดิม filePath

    // User information
    userId: { type: String, default: null },
    email: { type: String, default: null },
    avatar: { type: String, default: null },

    // Metadata for specific types (Gift, etc.)
    metadata: {
      tableNumber: { type: Number, default: 0 },
      giftItems: [Object], // รายการของขวัญ
      note: String,
      theme: String, // textColor or theme
      socialColor: { type: String, default: '#ffffff' },
      textLayout: { type: String, default: 'right' },
      social: {
        type: { type: String, default: null },
        name: { type: String, default: null }
      },
      qrCodePath: { type: String, default: null } // Added to persist QR code
    },

    // Audit fields
    receivedAt: Date, // เวลาที่ Order ถูกส่งเข้ามาใน Queue
    approvalDate: Date,
    startedAt: Date, // เวลาเริ่มแสดง
    endedAt: Date,   // เวลาจบการแสดง
    duration: Number, // ระยะเวลา (วินาที)
    approvedBy: String,
    rejectReason: String,
    notes: String, // Internal notes

    // Legacy mapping support (optional, can remove if migration script handles it. keeping for safety)
    // giftId, giftName, senderName, amount, filePath - we can rely on new fields but server must map legacy data if exists.
  },
  { timestamps: true }
);

// TTL Index: ลบข้อมูลที่เก่ากว่า 18 เดือน (47304000 วินาที)
checkHistorySchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 47304000, // 18 months
    partialFilterExpression: { type: { $ne: "gift" } }
  }
);

// Index for shop-specific queries
checkHistorySchema.index({ shopId: 1, status: 1, createdAt: -1 });

const CheckHistory = mongoose.model("CheckHistory", checkHistorySchema);

export default CheckHistory;
