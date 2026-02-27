import mongoose from "mongoose";

const timeHistorySchema = new mongoose.Schema({
    shopId: {
        type: String,
        required: true,
        index: true
    },
    id: {
        type: String,
        required: true
    },
    mode: {
        type: String, // 'text', 'image', 'birthday'
        required: true
    },
    date: String,     // e.g. "14/12/2025" or ISO string
    duration: String, // e.g. "1 ชั่วโมง"
    time: Number,     // Duration in seconds
    price: Number,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound unique index: แต่ละ shop มี id ไม่ซ้ำกัน
timeHistorySchema.index({ shopId: 1, id: 1 }, { unique: true });

const TimeHistory = mongoose.model("TimeHistory", timeHistorySchema);

export default TimeHistory;
