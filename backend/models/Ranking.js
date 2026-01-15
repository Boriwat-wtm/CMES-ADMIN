import mongoose from "mongoose";

const rankingSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      default: null,
    },
    avatar: {
      type: String,
      default: null,
    },
    // All-time points
    points: {
      type: Number,
      required: true,
      default: 0,
    },
    rank: {
      type: Number,
      default: 0,
    },
    // Daily points
    dailyPoints: {
      type: Number,
      default: 0,
    },
    dailyRank: {
      type: Number,
      default: 0,
    },
    dailyDate: {
      type: String, // Format: YYYY-MM-DD
      default: null,
    },
    // Monthly points
    monthlyPoints: {
      type: Number,
      default: 0,
    },
    monthlyRank: {
      type: Number,
      default: 0,
    },
    monthlyPeriod: {
      type: String, // Format: YYYY-MM
      default: null,
    },
  },
  { timestamps: true }
);

// Compound unique index for userId (one record per user)
rankingSchema.index({ userId: 1 }, { unique: true });

// Index for faster queries
rankingSchema.index({ points: -1 });
rankingSchema.index({ rank: 1 });
rankingSchema.index({ dailyPoints: -1 });
rankingSchema.index({ dailyRank: 1 });
rankingSchema.index({ dailyDate: 1 });
rankingSchema.index({ monthlyPoints: -1 });
rankingSchema.index({ monthlyRank: 1 });
rankingSchema.index({ monthlyPeriod: 1 });

const Ranking = mongoose.model("Ranking", rankingSchema);

export default Ranking;
