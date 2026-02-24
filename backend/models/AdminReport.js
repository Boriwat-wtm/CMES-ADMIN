import mongoose from "mongoose";

const adminReportSchema = new mongoose.Schema(
  {
    shopId: {
      type: String,
      required: true,
      index: true
    },
    reportId: {
      type: String,
      required: true,
    },
    title: String,
    description: String,
    category: {
      type: String,
      enum: ["technical", "display", "payment", "upload", "account", "suggestion", "other"],
      default: "other",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "in-progress", "resolved", "closed", "reading", "new"], // Added reading and new to be safe
      default: "open",
    },
    senderName: String,
    senderEmail: String,
    senderPhone: String,
    assignedTo: String,
    resolvedAt: Date,
    resolution: String,
    attachments: [String],
  },
  { timestamps: true }
);

// Index: reportId ไม่ซ้ำซ้อนภายใน shop เดียวกัน
adminReportSchema.index({ shopId: 1, reportId: 1 }, { unique: true });

const AdminReport = mongoose.model("AdminReport", adminReportSchema);

export default AdminReport;
