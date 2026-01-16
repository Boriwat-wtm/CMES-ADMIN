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

// Helper method to get business date (day starts at 06:01)
rankingSchema.statics.getBusinessDate = function() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  
  // If time is between 00:00 - 06:00 (or exactly 06:00)
  // Consider it as previous day
  if (hours < 6 || (hours === 6 && minutes === 0)) {
    now.setDate(now.getDate() - 1);
  }
  
  // Return date in YYYY-MM-DD format
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

// Helper method to get business month (month starts at 06:01 on the 1st)
rankingSchema.statics.getBusinessMonth = function() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const date = now.getDate();
  
  // If it's the 1st day and time is between 00:00 - 06:00
  // Consider it as previous month
  if (date === 1 && (hours < 6 || (hours === 6 && minutes === 0))) {
    now.setMonth(now.getMonth() - 1);
  }
  
  // Return month in YYYY-MM format
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  
  return `${year}-${month}`;
};

const Ranking = mongoose.model("Ranking", rankingSchema);

export default Ranking;
