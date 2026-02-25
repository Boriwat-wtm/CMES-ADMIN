// นำเข้า dependencies ที่จำเป็น
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import mongoose from "mongoose";
import dotenv from "dotenv";
import TimeHistory from "./models/TimeHistory.js";

// โหลดตัวแปรสภาพแวดล้อมจากไฟล์ .env
dotenv.config();

// กำหนดเส้นทางไฟล์สำหรับเก็บการตั้งค่า
const settingsPath = "./settings.json";

// สร้าง Express application
const app = express();

// CORS Configuration - รองรับ Development และ Production
// รายการ Origins ที่อนุญาตให้เชื่อมต่อ CORS
const allowedOrigins = [
  'http://localhost:3000',                    // หน้า Admin (พัฒนา)
  'http://localhost:3001',                    // หน้า User (พัฒนา)
  'http://localhost:5000',                    // เซิร์ฟเวอร์ Admin (พัฒนา) - สำหรับ OBS Overlay
  'https://cmesadminfrontend.vercel.app',     // หน้า Admin (โปรดักชัน)
  'https://cmesuserfrontend.vercel.app',      // หน้า User (โปรดักชัน)
  'https://cmes-admin-server.onrender.com',   // เซิร์ฟเวอร์ Admin (โปรดักชัน) - สำหรับ OBS Overlay
  process.env.ADMIN_FRONTEND_URL,             // หน้า Admin (กำหนดเอง)
  process.env.USER_FRONTEND_URL,              // หน้า User (กำหนดเอง)
  process.env.ADMIN_BACKEND_URL,              // เซิร์ฟเวอร์ Admin (กำหนดเอง) - สำหรับ OBS Overlay
].filter(Boolean);

// ตั้งค่า CORS Middleware เพื่อตรวจสอบ Origin ที่เข้ามา
app.use(cors({
  origin: function (origin, callback) {
    // อนุญาตคำขอที่ไม่มี origin (เช่น Postman, server-to-server)
    if (!origin) return callback(null, true);

    // ตรวจสอบว่า origin อยู่ในรายการที่อนุญาตหรือไม่
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`[Realtime] CORS ปฏิเสธ origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
// Middleware สำหรับ parse JSON body
app.use(express.json());

// สร้าง HTTP Server และ Socket.IO instance
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// เชื่อมต่อ MongoDB สำหรับ Realtime Server
mongoose.connect(process.env.MONGODB_URI, {
  dbName: 'cmes-admin'
}).then(() => {
  console.log("[Realtime] เชื่อมต่อ MongoDB สำเร็จ (DB: cmes-admin)");
  loadInitialConfig();
}).catch(err => {
  console.error("[Realtime] เกิดข้อผิดพลาดในการเชื่อมต่อ MongoDB:", err);
});

// ตัวแปร Config สำหรับเก็บการตั้งค่าระบบแบบ Realtime
let config = {
  systemOn: true,              // สถานะระบบเปิด/ปิด
  enableImage: true,           // เปิด/ปิดฟีเจอร์รูปภาพ
  enableText: true,            // เปิด/ปิดฟีเจอร์ข้อความ
  enableGift: true,            // เปิด/ปิดฟีเจอร์ของขวัญ
  enableBirthday: true,        // เปิด/ปิดฟีเจอร์วันเกิด
  birthdaySpendingRequirement: 100, // จำนวนเงินขั้นต่ำที่ต้องใช้จ่ายเพื่อใช้ฟีเจอร์วันเกิดฟรี
  price: 100,                  // ราคาเริ่มต้น
  time: 10,                    // เวลาเริ่มต้น (วินาที)
  settings: [],                // รายการการตั้งค่าประวัติ (โหลดจาก Database)
  publicRankingType: 'alltime' // ประเภท Ranking ที่แสดงสาธารณะ (daily, monthly, alltime)
};

// ฟังก์ชันโหลดการตั้งค่าเริ่มต้นจาก MongoDB และรักษาการตั้งค่า Runtime
async function loadInitialConfig() {
  try {
    // โหลดประวัติจาก DB
    const history = await TimeHistory.find({}).sort({ createdAt: -1 });
    console.log("[Realtime] โหลดประวัติจาก DB:", JSON.stringify(history, null, 2));

    // ทำความสะอาดอัตโนมัติ: แก้ไขรายการผี "1 นาที" ที่ซ้ำกันตามที่ผู้ใช้แจ้ง
    // ผู้ใช้ต้องการเฉพาะ "1 นาที 1 วินาที" เท่านั้น ดังนั้นเราจะลบ "1 นาที" สำหรับโหมดข้อความ
    const ghostItem = await TimeHistory.findOne({ mode: 'text', duration: '1 นาที' });
    if (ghostItem) {
      console.log("[Realtime] พบรายการผี '1 นาที', กำลังลบ...", ghostItem.id);
      await TimeHistory.findByIdAndDelete(ghostItem._id);
      // ลบออกจาก array history ใน memory ด้วย
      const index = history.findIndex(h => h.id === ghostItem.id);
      if (index !== -1) history.splice(index, 1);
    }

    // ซ่อมแซมอัตโนมัติ: แก้ไขฟิลด์ 'time' ที่หายไปสำหรับข้อมูลที่มีอยู่
    for (const h of history) {
      if (!h.time && h.duration) {
        let seconds = 0;
        // พยายาม parse รูปแบบ "X นาที Y วินาที" หรือ "X นาที"
        const minMatch = h.duration.match(/(\d+)\s*นาที/);
        const secMatch = h.duration.match(/(\d+)\s*วินาที/);

        if (minMatch) seconds += parseInt(minMatch[1]) * 60;
        if (secMatch) seconds += parseInt(secMatch[1]);

        if (seconds > 0) {
          console.log(`[Realtime] กำลังซ่อมแซม time สำหรับ ${h.id}: ${h.duration} -> ${seconds}s`);
          h.time = seconds;
          await h.save();
        }
      }
    }

    // แปลงข้อมูลประวัติเป็นรูปแบบที่ใช้ใน config
    config.settings = history.map(h => ({
      id: h.id,
      mode: h.mode,
      date: h.date,
      duration: h.duration,
      time: h.time, // รวมเวลาเป็นวินาที
      price: h.price
    }));

    // โหลด runtime config อื่นๆ จากไฟล์ (ถ้ายังต้องการเก็บค่า switch เปิดปิดไว้ในไฟล์ หรือจะย้ายลง DB ก็ได้ แต่ user เน้น TimeHistory)
    // เพื่อความปลอดภัย ใช้ไฟล์สำหรับ saved switches ไปก่อน แต่ TimeHistory ใช้ DB
    if (fs.existsSync(settingsPath)) {
      const savedFile = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      // รวมเฉพาะฟิลด์ที่ไม่ใช่ settings
      const { settings, ...rest } = savedFile;
      config = { ...config, ...rest };
    }
  } catch (error) {
    console.error("[Realtime] เกิดข้อผิดพลาดในการโหลด config:", error);
  }
}

// ฟังก์ชันบันทึกการตั้งค่า Runtime (Switches) ลงไฟล์ JSON (ผู้ใช้แจ้งปัญหาว่า TimeHistory ไม่ถูกบันทึกลง DB)
function saveRuntimeConfig() {
  const { settings, ...runtimeConfig } = config;
  // บันทึก runtime config โดยไม่รวม settings array (เพื่อหลีกเลี่ยงไฟล์ขนาดใหญ่)
  // หรือเก็บไว้ตามเดิม แต่เรารู้ว่า settings มาจาก DB
  // เพื่อความเข้ากันได้ย้อนหลัง: เราบันทึกทุกอย่างลง JSON แต่พึ่งพา DB สำหรับ settings
  // อันที่จริงผู้ใช้บอกว่า "TimeHistory ไม่ถูกบันทึกลงใน DB มันถูกบันทึกลงใน setting.json" -> หมายความว่าเราควรหยุดบันทึกลง JSON?
  // ผมจะบันทึกเฉพาะ runtime switches ลง json
  fs.writeFileSync(settingsPath, JSON.stringify(runtimeConfig, null, 2));
}

// REST API (สำรอง สำหรับ fallback)
app.get("/api/status", (req, res) => res.json(config));

// API สำหรับดึง settings history (เรียกจาก DB)
app.get("/api/check-history", async (req, res) => {
  try {
    const history = await TimeHistory.find({}).sort({ createdAt: -1 });
    // แปลงเป็นรูปแบบที่ frontend คาดหวัง
    const formatted = history.map(h => ({
      id: h.id,
      mode: h.mode,
      date: h.date, // หมายเหตุ: Schema เก็บวันที่เป็น string ตามที่ร้องขอ
      duration: h.duration,
      time: h.time,
      price: h.price
    }));
    res.json(formatted);
  } catch (err) {
    console.error("เกิดข้อผิดพลาดในการดึงประวัติ:", err);
    res.status(500).json([]);
  }
});

// การจัดการ WebSocket Connection
io.on("connection", (socket) => {
  // ส่งสถานะล่าสุดให้ client ที่เพิ่งเชื่อมต่อ
  socket.emit("status", config);

  // ส่งประเภท ranking สาธารณะปัจจุบันให้กับ client ที่เพิ่งเชื่อมต่อ
  socket.emit("publicRankingTypeUpdated", { type: config.publicRankingType });

  // รับสถานะใหม่จาก admin (Switches เปิด/ปิดฟีเจอร์ต่างๆ)
  socket.on("updateStatus", (newStatus) => {
    config = { ...config, ...newStatus };
    io.emit("status", config);
    saveRuntimeConfig();
  });

  // ส่ง config ปัจจุบันเมื่อมีการร้องขอ
  socket.on("getConfig", () => {
    socket.emit("status", config);
  });

  // อัพเดท config จาก admin และแจ้งเตือนทุก client
  socket.on("adminUpdateConfig", (newConfig) => {
    config = { ...config, ...newConfig };
    io.emit("configUpdate", config);
    saveRuntimeConfig();
  });

  // 🔥 จัดการ broadcast ประเภท ranking สาธารณะจาก Admin
  socket.on("setPublicRankingType", (data) => {
    const { type } = data;
    if (['daily', 'monthly', 'alltime'].includes(type)) {
      config.publicRankingType = type;
      console.log(`[Realtime] อัพเดตประเภท ranking สาธารณะเป็น: ${type}`);
      // ส่ง broadcast ไปยังทุก client (Admin + Users)
      io.emit("publicRankingTypeUpdated", { type: config.publicRankingType });
      saveRuntimeConfig();
    } else {
      console.warn(`[Realtime] ได้รับประเภท ranking ที่ไม่ถูกต้อง: ${type}`);
    }
  });

  // 🔥 จัดการ broadcast การอัพเดตสิทธิพิเศษ (Perks) จาก Admin
  socket.on("adminUpdatePerks", (data) => {
    const { perks } = data;
    if (perks && Array.isArray(perks)) {
      console.log(`[Realtime] อัพเดตสิทธิพิเศษ, กำลัง broadcast ไปยังผู้ใช้ทั้งหมด. จำนวนสิทธิพิเศษ: ${perks.length}`);
      // ส่ง broadcast ไปยังทุก client (โดยเฉพาะ Users)
      io.emit("perksUpdated", { perks });
    } else {
      console.warn(`[Realtime] ได้รับข้อมูลสิทธิพิเศษที่ไม่ถูกต้อง:`, data);
    }
  });

  // เพิ่มประวัติการตั้งค่า -> บันทึกลง Database
  socket.on("addSetting", async (setting) => {
    try {
      // บันทึกลง Database
      await TimeHistory.create({
        id: setting.id,
        mode: setting.mode,
        date: setting.date,
        duration: setting.duration,
        time: setting.time, // บันทึกเป็นวินาที
        price: setting.price
      });

      // อัพเดท config ในหน่วยความจำ
      config.settings.unshift(setting);

      io.emit("status", config); // ส่ง broadcast ไปยังทุก client
    } catch (err) {
      console.error("เกิดข้อผิดพลาดในการเพิ่มการตั้งค่าลง DB:", err);
    }
  });

  // ลบประวัติการตั้งค่า -> ลบจาก Database
  socket.on("removeSetting", async (id) => {
    try {
      await TimeHistory.findOneAndDelete({ id });

      config.settings = config.settings.filter(item => String(item.id) !== String(id));
      io.emit("status", config);
    } catch (err) {
      console.error("เกิดข้อผิดพลาดในการลบการตั้งค่าจาก DB:", err);
    }
  });
});

// ===== LUCKY WHEEL API ENDPOINTS สำหรับ OBS =====
// API สำหรับแสดงภาพตัวอย่างวงล้อบน OBS
app.post('/api/lucky-wheel/preview', (req, res) => {
  const { segments } = req.body;

  // ตรวจสอบว่ามีข้อมูล segments และเป็น array หรือไม่
  if (!segments || !Array.isArray(segments)) {
    return res.status(400).json({ error: 'ข้อมูล segments หายไปหรือไม่ถูกต้อง' });
  }

  console.log('[Realtime] ตัวอย่างวงล้อ Lucky Wheel:', segments.length, 'ส่วน');

  // Broadcast ไปยัง OBS ที่เชื่อมต่ออยู่
  io.emit('lucky-wheel-preview', { segments });

  return res.json({ success: true, message: 'ส่ง broadcast ตัวอย่างไปยัง OBS สำเร็จ' });
});

// API สำหรับหมุนวงล้อและแสดงผลบน OBS
app.post('/api/lucky-wheel/spin', (req, res) => {
  const { segments, winnerIndex, reward } = req.body;

  // ตรวจสอบว่ามีข้อมูล segments และ winnerIndex หรือไม่
  if (!segments || !Array.isArray(segments) || winnerIndex === undefined) {
    return res.status(400).json({ error: 'ข้อมูล segments หรือ winnerIndex หายไป' });
  }

  console.log('[Realtime] หมุนวงล้อ Lucky Wheel - ดัชนีผู้ชนะ:', winnerIndex, 'รางวัล:', reward);

  // Broadcast ไปยัง OBS ที่เชื่อมต่ออยู่
  io.emit('lucky-wheel-spin', {
    segments,
    winnerIndex,
    reward,
    timestamp: Date.now()
  });

  return res.json({ success: true, message: 'ส่ง broadcast การหมุนไปยัง OBS สำเร็จ' });
});

// API สำหรับซ่อนวงล้อบน OBS
app.post('/api/lucky-wheel/hide', (req, res) => {
  console.log('[Realtime] เหตุการณ์ซ่อนวงล้อ Lucky Wheel');

  // Broadcast ไปยัง OBS ที่เชื่อมต่ออยู่
  io.emit('lucky-wheel-hide');

  return res.json({ success: true, message: 'ส่ง broadcast การซ่อนไปยัง OBS สำเร็จ' });
});

// กำหนดพอร์ตสำหรับ Realtime Server
const REALTIME_PORT = process.env.REALTIME_PORT || 4005;
server.listen(REALTIME_PORT, () => {
  const baseUrl = process.env.REALTIME_URL || 'https://cmes-admin-realtime.onrender.com';
  console.log(`[Realtime] เซิร์ฟเวอร์ทำงานที่พอร์ต ${REALTIME_PORT}`);
  console.log(`[Realtime] URL: ${baseUrl}`);
});