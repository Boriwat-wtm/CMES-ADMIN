import mongoose from "mongoose";

/**
 * RankingHistory Schema
 * เก็บประวัติคะแนน ranking ทุกรายการแยกตามวันที่
 * ใช้สำหรับดูย้อนหลังได้ทุกวัน/เดือน/ปี
 */
const rankingHistorySchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            default: null,
        },
        avatar: {
            type: String,
            default: null,
        },
        // จำนวนเงิน (คะแนน) ของรายการนี้
        amount: {
            type: Number,
            required: true,
        },
        // วันที่ (YYYY-MM-DD)
        date: {
            type: String,
            required: true,
            index: true,
        },
        // เดือน (YYYY-MM)
        month: {
            type: String,
            required: true,
            index: true,
        },
        // ปี (YYYY)
        year: {
            type: String,
            required: true,
            index: true,
        },
        // เวลาที่บันทึก
        createdAt: {
            type: Date,
            default: Date.now,
        },
    }
);

// Compound index สำหรับ query ที่ใช้บ่อย
rankingHistorySchema.index({ date: 1, userId: 1 });
rankingHistorySchema.index({ month: 1, userId: 1 });
rankingHistorySchema.index({ year: 1, userId: 1 });

const RankingHistory = mongoose.model("RankingHistory", rankingHistorySchema);
export default RankingHistory;
