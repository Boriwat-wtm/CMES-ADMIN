import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import mongoose from "mongoose";
import dotenv from "dotenv";
import TimeHistory from "./models/TimeHistory.js";

dotenv.config();

const settingsPath = "./settings.json";

const app = express();

// CORS Configuration - รองรับ Development และ Production
const allowedOrigins = [
  'http://localhost:3000',                    // Admin Frontend (Dev)
  'http://localhost:3001',                    // User Frontend (Dev)
  'https://cmesadminfrontend.vercel.app',     // Admin Frontend (Production)
  'https://cmesuserfrontend.vercel.app',      // User Frontend (Production)
  process.env.ADMIN_FRONTEND_URL,             // Admin Frontend (Custom)
  process.env.USER_FRONTEND_URL,              // User Frontend (Custom)
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`[Realtime] CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// Create separate connection for realtime server
mongoose.connect(process.env.MONGODB_URI, {
  dbName: 'cmes-admin'
}).then(() => {
  console.log("[Realtime] Connected to MongoDB (DB: cmes-admin)");
  loadInitialConfig();
}).catch(err => {
  console.error("[Realtime] MongoDB connection error:", err);
});

let config = {
  systemOn: true,
  enableImage: true,
  enableText: true,
  enableGift: true,
  enableBirthday: true,
  birthdaySpendingRequirement: 100, // จำนวนเงินขั้นต่ำที่ต้องใช้จ่ายเพื่อใช้ฟีเจอร์วันเกิดฟรี
  price: 100,
  time: 10,
  settings: [], // This will be hydrated from DB
  publicRankingType: 'alltime' // 🔥 PUBLIC DISPLAY RANKING TYPE
};

// Load initial config from MongoDB (for settings history) and maintain runtime config
async function loadInitialConfig() {
  try {
    // โหลดประวัติจาก DB
    const history = await TimeHistory.find({}).sort({ createdAt: -1 });
    console.log("[Realtime] Loaded history from DB:", JSON.stringify(history, null, 2));

    // Auto-cleanup: Fix duplicate "1 นาที" ghost item reported by user
    // User wants only "1 นาที 1 วินาที", so we remove "1 นาที" for text mode
    const ghostItem = await TimeHistory.findOne({ mode: 'text', duration: '1 นาที' });
    if (ghostItem) {
      console.log("[Realtime] Found ghost item '1 นาที', Removing...", ghostItem.id);
      await TimeHistory.findByIdAndDelete(ghostItem._id);
      // Remove from history array in memory too
      const index = history.findIndex(h => h.id === ghostItem.id);
      if (index !== -1) history.splice(index, 1);
    }

    // Auto-repair: Fix missing 'time' field for existing records
    for (const h of history) {
      if (!h.time && h.duration) {
        let seconds = 0;
        // Try to parse "X นาที Y วินาที" or "X นาที"
        const minMatch = h.duration.match(/(\d+)\s*นาที/);
        const secMatch = h.duration.match(/(\d+)\s*วินาที/);

        if (minMatch) seconds += parseInt(minMatch[1]) * 60;
        if (secMatch) seconds += parseInt(secMatch[1]);

        if (seconds > 0) {
          console.log(`[Realtime] Repairing time for ${h.id}: ${h.duration} -> ${seconds}s`);
          h.time = seconds;
          await h.save();
        }
      }
    }

    config.settings = history.map(h => ({
      id: h.id,
      mode: h.mode,
      date: h.date,
      duration: h.duration,
      time: h.time, // Include time in seconds
      price: h.price
    }));

    // โหลด runtime config อื่นๆ จากไฟล์ (ถ้ายังต้องการเก็บค่า switch เปิดปิดไว้ในไฟล์ หรือจะย้ายลง DB ก็ได้ แต่ user เน้น TimeHistory)
    // เพื่อความปลอดภัย ใช้ไฟล์สำหรับ saved switches ไปก่อน แต่ TimeHistory ใช้ DB
    if (fs.existsSync(settingsPath)) {
      const savedFile = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      // Merge only non-settings fields
      const { settings, ...rest } = savedFile;
      config = { ...config, ...rest };
    }
  } catch (error) {
    console.error("[Realtime] Error loading initial config:", error);
  }
}

// Function to save Runtime Config (Switches) to JSON (User only complained about TimeHistory not in DB)
function saveRuntimeConfig() {
  const { settings, ...runtimeConfig } = config;
  // Save runtime config without settings array (to avoid huge file)
  // Or keep as is but we know settings come from DB
  // For backward compatibility let's keep it simple: We save everything to JSON but rely on DB for settings.
  // Actually, user said "TimeHistory ไม่ถูกบันทึกลงใน DB มันถูกบันทึกลงใน setting.json" -> implies we should STOP saving it to JSON?
  // I will save only runtime switches to json.
  fs.writeFileSync(settingsPath, JSON.stringify(runtimeConfig, null, 2));
}

// REST API (optional สำหรับ fallback)
app.get("/api/status", (req, res) => res.json(config));

// API สำหรับดึง settings history (เรียกจาก DB)
app.get("/api/check-history", async (req, res) => {
  try {
    const history = await TimeHistory.find({}).sort({ createdAt: -1 });
    // Map to format frontend expects
    const formatted = history.map(h => ({
      id: h.id,
      mode: h.mode,
      date: h.date, // Note: Schema stores string date as requested
      duration: h.duration,
      time: h.time,
      price: h.price
    }));
    res.json(formatted);
  } catch (err) {
    console.error("Error fetching history:", err);
    res.status(500).json([]);
  }
});

// WebSocket
io.on("connection", (socket) => {
  // ส่งสถานะล่าสุดให้ client ที่เพิ่งเชื่อมต่อ
  socket.emit("status", config);

  // Send current public ranking type to newly connected client
  socket.emit("publicRankingTypeUpdated", { type: config.publicRankingType });

  // รับสถานะใหม่จาก admin (Switches)
  socket.on("updateStatus", (newStatus) => {
    config = { ...config, ...newStatus };
    io.emit("status", config);
    saveRuntimeConfig();
  });

  socket.on("getConfig", () => {
    socket.emit("status", config);
  });

  socket.on("adminUpdateConfig", (newConfig) => {
    config = { ...config, ...newConfig };
    io.emit("configUpdate", config);
    saveRuntimeConfig();
  });

  // 🔥 Handle public ranking type broadcast from Admin
  socket.on("setPublicRankingType", (data) => {
    const { type } = data;
    if (['daily', 'monthly', 'alltime'].includes(type)) {
      config.publicRankingType = type;
      console.log(`[Realtime] Public ranking type updated to: ${type}`);
      // Broadcast to ALL clients (Admin + Users)
      io.emit("publicRankingTypeUpdated", { type: config.publicRankingType });
      saveRuntimeConfig();
    } else {
      console.warn(`[Realtime] Invalid ranking type received: ${type}`);
    }
  });

  // Add History -> Save to DB
  socket.on("addSetting", async (setting) => {
    try {
      // Save to DB
      await TimeHistory.create({
        id: setting.id,
        mode: setting.mode,
        date: setting.date,
        duration: setting.duration,
        time: setting.time, // Save seconds
        price: setting.price
      });

      // Update local memory config
      config.settings.unshift(setting);

      io.emit("status", config); // broadcast
    } catch (err) {
      console.error("Error adding setting to DB:", err);
    }
  });

  // Remove History -> Remove from DB
  socket.on("removeSetting", async (id) => {
    try {
      await TimeHistory.findOneAndDelete({ id });

      config.settings = config.settings.filter(item => String(item.id) !== String(id));
      io.emit("status", config);
    } catch (err) {
      console.error("Error removing setting from DB:", err);
    }
  });
});

const REALTIME_PORT = process.env.PORT || 4005;
server.listen(REALTIME_PORT, () => {
  const baseUrl = process.env.REALTIME_URL || 'https://cmes-admin-realtime.onrender.com';
  console.log(`[Realtime] Server running on port ${REALTIME_PORT}`);
  console.log(`[Realtime] URL: ${baseUrl}`);
});