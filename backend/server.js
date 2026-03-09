import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cron from "node-cron"; // Import node-cron
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

import AdminReport from "./models/AdminReport.js";
import CheckHistory from "./models/CheckHistory.js";
import GiftSetting from "./models/GiftSetting.js";
import Ranking from './models/Ranking.js'; // Keep Ranking import
import RankingHistory from './models/RankingHistory.js'; // ประวัติ ranking ทุกรายการ
import AdminUser from './models/AdminUser.js'; // Keep AdminUser import
import ImageQueue from './models/ImageQueue.js'; // 🔥 Image Queue Model
import TimeHistory from './models/TimeHistory.js'; // 🔥 Time History Model
import ShopSetting from './models/ShopSetting.js'; // 🔥 Shop-specific settings
import { verifyPassword, hashPassword } from './hashPasswords.js'; // Keep password utilities import
import { requireShopId, requireAdminAuth } from './middleware/authMiddleware.js'; // Multi-tenant middleware
import { startCleanupJob } from "./cron-cleanup.js";
dotenv.config();

// ===== Helper Functions สำหรับ Thai Timezone (UTC+7) =====
// ใช้แทน toISOString() ที่เป็น UTC เพื่อให้วันที่ตรงกับเวลาไทย
function getThaiDateStr(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD
}
function getThaiMonthStr(date = new Date()) {
  return getThaiDateStr(date).slice(0, 7); // YYYY-MM
}
function getThaiYearStr(date = new Date()) {
  return getThaiDateStr(date).slice(0, 4); // YYYY
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*" }
});

// ===== การเชื่อมต่อฐานข้อมูล MongoDB =====
/**
 * ฟังก์ชันสำหรับเชื่อมต่อกับ MongoDB
 * ใช้ database ชื่อ 'cmes-admin'
 */
async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      dbName: 'cmes-admin'
    });
    console.log(`[MongoDB] Connected to ${conn.connection.host} (DB: cmes-admin)`);
    // เริ่มระบบเคลียร์ไฟล์รูปภาพตกค้าง (และลบข้อความ) ที่เก่าเกิน 2 วันทุกคืน
    startCleanupJob();
    // เพิ่มการใช้งาน publicRankingType หรือลบทิ้งถ้าไม่จำเป็น
  } catch (error) {
    console.error('[MongoDB] Connection failed:', error.message);
    process.exit(1);
  }
}
connectDB();

// ===== CONFIG SWITCHES MANAGEMENT (จาก realtime-server.js) =====
const settingsPath = path.join(__dirname, "settings.json");

let systemConfig = {
  systemOn: true,
  enableImage: true,
  enableText: true,
  enableGift: true,
  enableBirthday: true,
  birthdaySpendingRequirement: 100,
  price: 100,
  time: 10,
  publicRankingType: 'alltime'
};

// โหลด config switches จากไฟล์
function loadSystemConfig() {
  try {
    if (fs.existsSync(settingsPath)) {
      const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      systemConfig = { ...systemConfig, ...saved };
      console.log('[Admin] โหลด config switches สำเร็จ');
    } else {
      fs.writeFileSync(settingsPath, JSON.stringify(systemConfig, null, 2));
      console.log('[Admin] สร้างไฟล์ settings.json ใหม่');
    }
  } catch (error) {
    console.error('[Admin] Error loading config:', error);
  }
}

function saveSystemConfig() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(systemConfig, null, 2));
    console.log('[Admin] บันทึก config switches แล้ว');
  } catch (error) {
    console.error('[Admin] Error saving config:', error);
  }
}

// โหลด config ตอนเริ่มต้น
loadSystemConfig();

// ===== การตั้งค่า CLOUDINARY สำหรับจัดเก็บรูปภาพ =====
/**
 * กำหนดค่า Cloudinary สำหรับการอัปโหลดและจัดเก็บรูปภาพ
 * รองรับทั้งค่าจาก environment variables และค่าเริ่มต้น
 */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log("[Admin] ✓ Cloudinary configured:", {
  cloud_name: cloudinary.config().cloud_name,
  api_key: cloudinary.config().api_key ? '***' + cloudinary.config().api_key.slice(-4) : 'NOT SET'
});

// ===== การตั้งค่า CORS (Cross-Origin Resource Sharing) =====
/**
 * กำหนด origins ที่ได้รับอนุญาตในการเข้าถึง API
 * รองรับทั้ง Development และ Production environments
 */
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
    // อนุญาตให้ requests ที่ไม่มี origin เข้าถึงได้ (เช่น การเรียกจาก server เดียวกันหรือ Render internal calls)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`[Admin] CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-shop-id', 'x-admin-id']
}));

// ===== Middleware สำหรับ Parse ข้อมูล =====
// Middleware สำหรับแปลง JSON body (สำคัญสำหรับ POST/PUT requests)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve ไฟล์ static สำหรับ OBS overlay
app.use(express.static(path.join(__dirname, "public")));

// ===== การสร้างโฟลเดอร์สำหรับเก็บไฟล์ =====
// สร้างโฟลเดอร์สำหรับจัดเก็บไฟล์ต่างๆ ถ้ายังไม่มี
const giftUploadDir = path.join(__dirname, 'uploads/gifts');
const userUploadDir = path.join(__dirname, 'uploads/user-uploads');

if (!fs.existsSync(giftUploadDir)) fs.mkdirSync(giftUploadDir, { recursive: true });
if (!fs.existsSync(userUploadDir)) fs.mkdirSync(userUploadDir, { recursive: true });

// ===== Serve Static Files สำหรับรูปภาพที่อัปโหลด =====
app.use("/uploads/gifts", express.static(giftUploadDir));
app.use("/uploads/user-uploads", express.static(userUploadDir));
app.use("/uploads/qr-codes", express.static(path.join(__dirname, 'uploads/qr-codes')));
// รองรับ path แบบเก่าเพื่อความเข้ากันได้ (Legacy support)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ===== การตั้งค่า Cloudinary Storage สำหรับ Multer =====
/**
 * กำหนดการจัดเก็บไฟล์ผ่าน Cloudinary
 * แยกเป็น 2 ประเภท: Gift Images และ User Uploads
 */

// 1. Gift Storage (Cloudinary - ถาวร)
const giftStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'cmes-admin/gifts',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }],
    public_id: (req, file) => `gift-${Date.now()}-${Math.round(Math.random() * 1e9)}`
  }
});

// 2. User Upload Storage สำหรับไฟล์ที่ผู้ใช้อัปโหลด (รูปภาพ, QR Code)
const userStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file) => {
    if (file.fieldname === 'qrCode') {
      return {
        folder: 'cmes-admin/qr-codes',
        allowed_formats: ['jpg', 'jpeg', 'png'],
        public_id: `qr-${Date.now()}-${Math.round(Math.random() * 1e9)}`
      };
    } else {
      return {
        folder: 'cmes-admin/user-uploads',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4'],
        public_id: `user-${Date.now()}-${Math.round(Math.random() * 1e9)}`
      };
    }
  }
});

const uploadGift = multer({ storage: giftStorage });
const uploadUser = multer({ storage: userStorage }).fields([
  { name: 'file', maxCount: 1 },
  { name: 'qrCode', maxCount: 1 }
]);

// 3. Shop Logo Storage (Cloudinary)
const logoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'cmes-admin/shop-logos',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
    public_id: (req, file) => `logo-${req.shopId || 'shop'}-${Date.now()}`
  }
});
const uploadLogo = multer({ storage: logoStorage }).single('logo');

// 4. Payment QR Code Storage (Cloudinary)
const paymentQrStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'cmes-admin/payment-qr',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }],
    public_id: (req, file) => `payment-qr-${req.shopId || 'shop'}-${Date.now()}`
  }
});
const uploadPaymentQr = multer({ storage: paymentQrStorage }).single('paymentQr');

// POST /api/report — รับ report จาก USER backend
// ไม่ใช้ requireShopId เพื่อให้ report สร้างได้เสมอ (fallback shopId = "default")
app.post('/api/report', async (req, res) => {
  try {
    // รับ shopId จาก header หรือ fallback เป็น "default"
    const shopId = req.headers['x-shop-id'] || req.query.shopId || req.body.shopId || 'default';
    const { category, detail } = req.body;

    console.log(`[Report] Received report: shopId="${shopId}", category="${category}"`);

    if (!category || !detail) {
      return res.status(400).json({ success: false, message: 'category and detail are required' });
    }

    const reportId = `RPT-${Date.now()}`;
    const newReport = await AdminReport.create({
      shopId,
      reportId,
      category,
      description: detail,
      status: 'new',
      priority: 'medium'
    });

    console.log(`[Report] ✓ New report saved: ${reportId} (shop: ${shopId}, _id: ${newReport._id})`);
    res.json({ success: true, reportId: newReport._id });
  } catch (err) {
    console.error('[Report] ✗ POST error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to save report' });
  }
});

// GET /api/reports — ดึงรายการ report ทั้งหมด (สำหรับ Admin frontend)
app.get('/api/reports', requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req;
    const reports = await AdminReport.find({ shopId }).sort({ createdAt: -1 }).lean();

    const mapped = reports.map(r => ({
      id: r._id.toString(),
      reportId: r.reportId,
      category: r.category,
      detail: r.description || '',
      status: r.status || 'new',
      priority: r.priority || 'medium',
      senderName: r.senderName || '',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));

    res.json(mapped);
  } catch (err) {
    console.error('[Report] GET error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch reports' });
  }
});

// PATCH /api/reports/:id — อัปเดตสถานะ report (สำหรับ Admin frontend)
app.patch('/api/reports/:id', requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req;
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'status is required' });
    }

    const updated = await AdminReport.findOneAndUpdate(
      { _id: id, shopId },
      { $set: { status } },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const report = {
      id: updated._id.toString(),
      reportId: updated.reportId,
      category: updated.category,
      detail: updated.description || '',
      status: updated.status,
      priority: updated.priority || 'medium',
      senderName: updated.senderName || '',
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    };

    console.log(`[Report] ✓ Status updated: ${id} → ${status}`);
    res.json({ success: true, report });
  } catch (err) {
    console.error('[Report] PATCH error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update report' });
  }
});

// ===== SHOP PROFILE ENDPOINTS =====
// GET /api/shop/profile — ดึงชื่อและโลโก้ร้าน (public, ต้องการแค่ x-shop-id)
app.get('/api/shop/profile', requireShopId, async (req, res) => {
  try {
    const { shopId } = req;
    const setting = await ShopSetting.findOne({ shopId }).lean();
    res.json({
      success: true,
      shop: {
        name: setting?.name || shopId,
        logo: setting?.logo || null
      }
    });
  } catch (err) {
    console.error('[ShopProfile] GET error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/shop/logo — อัปโหลดโลโก้ร้าน (ต้องการ x-shop-id + x-admin-id)
app.post('/api/shop/logo', requireShopId, (req, res, next) => {
  uploadLogo(req, res, (err) => {
    if (err) {
      console.error('[ShopLogo] Multer error:', err.message);
      return res.status(400).json({ success: false, message: 'อัปโหลดรูปภาพล้มเหลว: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { shopId } = req;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'กรุณาเลือกรูปภาพ' });
    }

    const logoUrl = req.file.path; // Cloudinary URL

    // บันทึก logo URL ลง ShopSetting
    await ShopSetting.findOneAndUpdate(
      { shopId },
      { $set: { logo: logoUrl } },
      { upsert: true, new: true }
    );

    console.log(`[ShopLogo] Updated logo for shop ${shopId}: ${logoUrl}`);
    res.json({ success: true, logo: logoUrl });
  } catch (err) {
    console.error('[ShopLogo] POST error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/shop/name — เปลี่ยนชื่อร้านค้า (ตัวแสดงผล ไม่ใช่ shopId)
app.post('/api/shop/name', requireShopId, async (req, res) => {
  try {
    const { shopId } = req;
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อร้านค้า' });
    }

    await ShopSetting.findOneAndUpdate(
      { shopId },
      { $set: { name: name.trim() } },
      { upsert: true, new: true }
    );

    console.log(`[ShopName] Updated name for shop ${shopId}: ${name.trim()}`);
    res.json({ success: true, name: name.trim() });
  } catch (err) {
    console.error('[ShopName] POST error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



// ===== ระบบ Ranking สำหรับคะแนนผู้สนับสนุน =====
/**
 * ฟังก์ชันสำหรับเพิ่มคะแนน Ranking ให้กับผู้ใช้
 * รองรับการแยกคะแนนตามรายวัน (daily), รายเดือน (monthly), และสะสม (all-time)
 * @param {string} userId - รหัสผู้ใช้
 * @param {string} name - ชื่อผู้ใช้
 * @param {number} amount - จำนวนเงินที่ใช้จ่าย (คะแนน)
 * @param {string} email - อีเมลผู้ใช้
 * @param {string} avatar - URL รูป avatar
 */
/**
 * บันทึกคะแนน ranking สำหรับผู้ใช้ที่ทำการสนับสนุน
 * 🔥 Multi-tenant: แยกตาม shopId
 */
async function addRankingPoint(userId, name, amount, email = null, avatar = null, shopId) {
  try {
    console.log(`[Ranking] addRankingPoint called: shopId=${shopId}, userId=${userId}, name=${name}, amount=${amount}, email=${email}`);

    const points = Number(amount);
    if (isNaN(points) || points <= 0) {
      console.log("[Ranking] ข้าม: คะแนนไม่ถูกต้อง");
      return;
    }

    // ต้องมี shopId และ userId
    if (!shopId) {
      console.log("[Ranking] ข้าม: ไม่มี shopId");
      return;
    }

    // ต้องมี userId จึงจะบันทึก ranking
    if (!userId || userId === "guest" || userId === "unknown") {
      console.log("[Ranking] ข้าม: ผู้ใช้แบบ guest/unknown");
      return;
    }

    const userName = (name || "Guest").trim() || "Guest";
    const today = getThaiDateStr(); // YYYY-MM-DD (เวลาไทย)
    const currentMonth = getThaiMonthStr(); // YYYY-MM (เวลาไทย)
    const currentYear = getThaiYearStr(); // YYYY (เวลาไทย)

    // ===== 1. บันทึกประวัติลง RankingHistory (เก็บทุกรายการ) =====
    try {
      await RankingHistory.create({
        shopId,
        userId,
        name: userName,
        email,
        avatar,
        amount: points,
        date: today,
        month: currentMonth,
        year: currentYear
      });
      console.log(`[Ranking] บันทึกประวัติ: ${userName} +${points} วันที่ ${today}`);
    } catch (histErr) {
      console.error("[Ranking] Error saving history:", histErr.message);
    }

    // ===== 2. อัพเดท Ranking สรุป (เดิม) =====
    // 🔥 ค้นหา ranking ของผู้ใช้แยกตาม shopId
    let ranking = await Ranking.findOne({ userId, shopId });
    if (ranking) {
      // อัปเดตคะแนนทั้งหมด (all-time points)
      ranking.points = (ranking.points || 0) + points;

      // อัปเดตคะแนนรายวัน (รีเซ็ตถ้าวันที่เปลี่ยน)
      if (ranking.dailyDate !== today) {
        ranking.dailyPoints = points;
        ranking.dailyDate = today;
      } else {
        ranking.dailyPoints = (ranking.dailyPoints || 0) + points;
      }

      // อัปเดตคะแนนรายเดือน (รีเซ็ตถ้าเดือนเปลี่ยน)
      if (ranking.monthlyPeriod !== currentMonth) {
        ranking.monthlyPoints = points;
        ranking.monthlyPeriod = currentMonth;
      } else {
        ranking.monthlyPoints = (ranking.monthlyPoints || 0) + points;
      }

      ranking.name = userName; // อัปเดตชื่อถ้ามีการเปลี่ยน
      if (email) ranking.email = email;
      if (avatar) ranking.avatar = avatar;
      ranking.updatedAt = new Date();
      await ranking.save();
      console.log(`[Ranking] อัปเดต ${userName} (${userId}): +${points} คะแนน, ทั้งหมด: ${ranking.points}, รายวัน: ${ranking.dailyPoints}, รายเดือน: ${ranking.monthlyPoints}`);
    } else {
      // สร้าง ranking ใหม่ถ้ายังไม่มี
      ranking = await Ranking.create({
        shopId, // 🔥 Multi-tenant
        userId,
        name: userName,
        email,
        avatar,
        points,
        dailyPoints: points,
        dailyDate: today,
        monthlyPoints: points,
        monthlyPeriod: currentMonth,
        updatedAt: new Date()
      });
      console.log(`[Ranking] สร้างใหม่ ${userName} (${userId}): ${points} คะแนน`);
    }

    // ส่งข้อมูลการอัปเดต ranking ไปยัง clients ของ shop นี้เท่านั้น
    const topRankings = await Ranking.find({ shopId }).sort({ points: -1 }).limit(10);
    // คำนวณอันดับอีกครั้ง (pre-save hook จัดการแล้ว แต่การ fetch แบบ bulk ปลอดภัยกว่า)
    const formattedRankings = topRankings.map((r, index) => ({
      ...r.toObject(),
      rank: index + 1
    }));
    // 🔥 Emit ไปยัง Room เฉพาะของ shop นี้
    if (typeof io !== 'undefined') {
      io.to(shopId).emit("ranking-update", formattedRankings);
    }
  } catch (error) {
    console.error("[Ranking] Error adding points:", error.message);
  }
}

// ===== การจัดการ ImageQueue (ใช้ MongoDB แทน memory - ดู ImageQueue model)
let giftSettings = {
  tableCount: 10,
  items: []
};

// ===== โหลดการตั้งค่าของขวัญจากไฟล์ =====
// โหลดการตั้งค่าของขวัญ
const giftSettingsPath = path.join(__dirname, "gift-settings.json");
if (fs.existsSync(giftSettingsPath)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(giftSettingsPath, "utf8"));
    giftSettings = { ...giftSettings, ...loaded };
  } catch (error) {
    console.warn("ไม่สามารถอ่าน gift-settings.json ใช้ค่าเริ่มต้น", error);
  }
} else {
  fs.writeFileSync(giftSettingsPath, JSON.stringify(giftSettings, null, 2));
}

// ===== ฟังก์ชันบันทึกการตั้งค่าของขวัญ =====
function saveGiftSettings() {
  fs.writeFileSync(giftSettingsPath, JSON.stringify(giftSettings, null, 2));
}

// เก็บประวัติการตรวจสอบ (using Database)
// เปลี่ยนจาก JSON array เป็น checkHistoryIndex สำหรับความสำดวก
let checkHistoryIndex = {};

/**
 * ฟังก์ชันสำหรับโหลดข้อมูลผู้ใช้ Admin จากไฟล์ users.json
 * ถ้าไม่มีไฟล์ จะสร้างผู้ใช้เริ่มต้น
 */
async function loadUsers() {
  try {
    const data = await fs.promises.readFile("users.json", "utf8");
    return JSON.parse(data);
  } catch (error) {
    // สร้างผู้ใช้เริ่มต้นถ้าไม่มีไฟล์ โดยใช้รหัสผ่านจาก .env
    const adminPass = process.env.DEFAULT_ADMIN_PASSWORD;
    const cms1Pass = process.env.DEFAULT_CMS1_PASSWORD;
    const cms2Pass = process.env.DEFAULT_CMS2_PASSWORD;

    if (!adminPass) {
      console.warn("⚠️ DEFAULT_ADMIN_PASSWORD is not set in .env! Using a random password for security.");
    }

    const defaultUsers = [
      { username: "admin", password: await hashPassword(adminPass || Math.random().toString(36).slice(-10)) },
      { username: "cms1", password: await hashPassword(cms1Pass || Math.random().toString(36).slice(-10)) },
      { username: "cms2", password: await hashPassword(cms2Pass || Math.random().toString(36).slice(-10)) },
    ];

    await fs.promises.writeFile("users.json", JSON.stringify(defaultUsers, null, 2));
    return defaultUsers;
  }
}

/**
 * ฟังก์ชันค้นหาผู้ใช้จากฐานข้อมูล
 * @param {string} username - ชื่อผู้ใช้
 * @returns {Object|null} - ข้อมูลผู้ใช้หรือ null
 */
async function findUser(username) {
  try {
    const user = await AdminUser.findOne({ username });
    return user;
  } catch (error) {
    console.error('[Admin] Error finding user:', error.message);
    return null;
  }
}

// ===== API สำหรับจัดการการตั้งค่าของขวัญ (GIFT SETTINGS API) =====
/**
 * API สำหรับดึงการตั้งค่าของขวัญ (จำนวนโต๊ะ และรายการสินค้า)
 * 🔥 Multi-tenant: filter ด้วย shopId
 * ใช้ requireShopId เพื่อให้ User backend เรียกได้โดยไม่ต้องการ x-admin-id
 */
app.get("/api/gifts/settings", requireShopId, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const gifts = await GiftSetting.find({ shopId });
    const tableCount = giftSettings.tableCount || 10;
    res.json({
      tableCount,
      items: gifts.map(g => ({
        id: g._id.toString(),
        name: g.giftName,
        price: g.price,
        description: g.description || "",
        imageUrl: g.image || ""
      }))
    });
  } catch (error) {
    console.error("Error fetching gifts:", error);
    res.status(500).json({ success: false, message: "Failed to fetch gifts" });
  }
});

/**
 * ฟังก์ชัน Helper สำหรับ sync ข้อมูล gift settings จาก DB ไปยัง JSON file
 * 🔥 Multi-tenant: แยกตาม shopId
 */
async function syncGiftSettingsFromDB(shopId) {
  const gifts = await GiftSetting.find({ shopId });
  giftSettings.items = gifts.map(g => ({
    id: g._id.toString(),
    name: g.giftName,
    price: g.price,
    description: g.description || "",
    imageUrl: g.image || ""
  }));
  saveGiftSettings();
  return giftSettings;
}

/**
 * API สำหรับเพิ่มสินค้าใหม่เข้าระบบ
 * 🔥 Multi-tenant: บันทึกพร้อม shopId
 */
app.post("/api/gifts/items", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const { name, price, description, imageUrl } = req.body;
    if (!name || price === undefined || price === null || price === "") {
      return res.status(400).json({ success: false, message: "กรุณาระบุชื่อสินค้าและราคา" });
    }

    // ตรวจสอบความถูกต้องของราคา
    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice < 0) {
      return res.status(400).json({ success: false, message: "ราคาต้องเป็นตัวเลขและไม่ติดลบ" });
    }

    // สร้าง Gift Setting ใหม่ในฐานข้อมูล
    const newGift = new GiftSetting({
      shopId, // 🔥 Multi-tenant
      giftId: Date.now().toString(),
      giftName: name.trim(),
      price: numPrice,
      description: description ? description.trim() : "",
      image: imageUrl || ""
    });

    const savedGift = await newGift.save();

    const item = {
      id: savedGift._id.toString(),
      name: savedGift.giftName,
      price: savedGift.price,
      description: savedGift.description,
      imageUrl: savedGift.image
    };

    // Sync กับ DB เพื่อความสอดคล้องข้อมูล
    await syncGiftSettingsFromDB(shopId);

    res.json({ success: true, item, settings: giftSettings });
  } catch (error) {
    console.error("Error creating gift:", error);
    res.status(500).json({ success: false, message: "Failed to create gift" });
  }
});

/**
 * API สำหรับแก้ไขข้อมูลสินค้า
 * 🔥 Multi-tenant: ตรวจสอบ shopId
 */
app.put("/api/gifts/items/:id", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const { id } = req.params;
    const { name, price, description, imageUrl } = req.body;

    if (price !== undefined) {
      const numPrice = Number(price);
      if (isNaN(numPrice) || numPrice < 0) {
        return res.status(400).json({ success: false, message: "ราคาต้องเป็นตัวเลขและไม่ติดลบ" });
      }
    }

    // 🔥 ตรวจสอบว่า gift นี้เป็นของ shop นี้จริงหรือไม่
    const updatedGift = await GiftSetting.findOneAndUpdate(
      { _id: id, shopId }, // 🔥 filter ด้วย shopId
      {
        ...(name && { giftName: name.trim() }),
        ...(price !== undefined && { price: Number(price) }),
        ...(description !== undefined && { description: description.trim() }),
        ...(imageUrl !== undefined && { image: imageUrl })
      },
      { new: true }
    );

    if (!updatedGift) {
      return res.status(404).json({ success: false, message: "ไม่พบรายการ" });
    }

    const item = {
      id: updatedGift._id.toString(),
      name: updatedGift.giftName,
      price: updatedGift.price,
      description: updatedGift.description,
      imageUrl: updatedGift.image
    };

    // Sync กับ DB เพื่อความสอดคล้องข้อมูล
    await syncGiftSettingsFromDB(shopId);

    res.json({ success: true, item, settings: giftSettings });
  } catch (error) {
    console.error("Error updating gift:", error);
    res.status(500).json({ success: false, message: "Failed to update gift" });
  }
});

/**
 * ฟังก์ชัน Helper สำหรับลบไฟล์รูปภาพ
 * @param {string} imagePath - Path ของไฟล์รูปภาพ
 */
const deleteImageFile = (imagePath) => {
  if (!imagePath) return;
  try {
    let relativePath = imagePath;
    if (relativePath.startsWith("http")) {
      const uploadsIndex = relativePath.indexOf("/uploads/");
      if (uploadsIndex !== -1) relativePath = relativePath.substring(uploadsIndex);
    }
    if (relativePath.startsWith("/uploads/")) {
      const normalizedPath = relativePath.replace(/^\/+/, "");
      const absolutePath = path.join(__dirname, normalizedPath);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
        console.log("[File] Deleted:", absolutePath);
      }
    }
  } catch (err) {
    console.warn("Failed to remove file:", err);
  }
};

/**
 * API สำหรับลบสินค้า
 * 🔥 Multi-tenant: ตรวจสอบ shopId
 */
app.delete("/api/gifts/items/:id", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const { id } = req.params;

    // 🔥 ตรวจสอบว่า gift นี้เป็นของ shop นี้จริงหรือไม่
    const deletedGift = await GiftSetting.findOneAndDelete({ _id: id, shopId });

    if (!deletedGift) {
      return res.status(404).json({ success: false, message: "ไม่พบรายการ" });
    }

    // ลบไฟล์รูปภาพถ้ามี
    if (deletedGift.image) {
      deleteImageFile(deletedGift.image);
    }

    // Sync กับ DB เพื่อความสอดคล้องข้อมูล
    await syncGiftSettingsFromDB(shopId);

    res.json({ success: true, settings: giftSettings });
  } catch (error) {
    console.error("Error deleting gift:", error);
    res.status(500).json({ success: false, message: "Failed to delete gift" });
  }
});

/**
 * API สำหรับอัปเดตจำนวนโต๊ะที่รองรับ
 * 🔥 Multi-tenant: ต้องอัปเดตใน Database แทน in-memory giftSettings
 * เพราะ giftSettings เป็น global variable ไม่เหมาะกับ multi-tenant
 */
app.patch("/api/gifts/table-count", requireAdminAuth, async (req, res) => {
  const { shopId } = req; // 🔥 ได้จาก middleware
  const { tableCount } = req.body;
  const parsed = Number(tableCount);
  if (!parsed || parsed < 1) {
    return res.status(400).json({ success: false, message: "จำนวนโต๊ะไม่ถูกต้อง" });
  }
  // TODO: เก็บ tableCount ใน Database (ShopSetting Model) แทนที่จะเป็น global variable
  // ตอนนี้แค่อัปเดต in-memory ไปก่อน (ไม่เหมาะกับ multi-tenant)
  giftSettings.tableCount = parsed;
  saveGiftSettings();
  console.log(`[Gift][${shopId}] Table count updated to: ${parsed}`);
  res.json({ success: true, tableCount: parsed });
});

/**
 * API สำหรับอัปโหลดรูปภาพ Gift (ใช้ giftStorage สำหรับ upload ไป Cloudinary)
 * 🔥 Multi-tenant: ต้องเป็น Admin ถึงจะ upload ได้
 */
app.post("/api/gifts/upload", requireAdminAuth, uploadGift.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    // Cloudinary คืน URL ใน req.file.path
    const fileUrl = req.file.path;
    console.log("[Admin] ✓ Gift image uploaded to Cloudinary:", fileUrl);
    res.json({ success: true, url: fileUrl });
  } catch (error) {
    console.error("Error uploading gift:", error);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
});

// ===== API สำหรับจัดการ Ranking (อันดับผู้สนับสนุน) =====
/**
 * API ดึง ranking ทั้งหมดหรือตามจำนวนที่กำหนด
 * รองรับทั้ง daily, monthly, alltime
 * 🔥 Multi-tenant: filter ด้วย shopId
 */
app.get("/api/rankings", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const limit = parseInt(req.query.limit) || 10;
    const type = req.query.type || "alltime"; // daily, monthly, alltime

    const today = getThaiDateStr(); // YYYY-MM-DD (เวลาไทย)
    const currentMonth = getThaiMonthStr(); // YYYY-MM (เวลาไทย)

    let query = { shopId }; // 🔥 filter ด้วย shopId
    let sortField = { points: -1 };

    if (type === "daily") {
      query = { shopId, dailyDate: req.query.date || today };
      sortField = { dailyPoints: -1 };
    } else if (type === "monthly") {
      query = { shopId, monthlyPeriod: req.query.month || currentMonth };
      sortField = { monthlyPoints: -1 };
    } else if (type === "alltime" && req.query.year) {
      // กรณีมี filter ปี → ใช้ RankingHistory aggregate
      const pipeline = [
        { $match: { shopId, year: req.query.year } },
        {
          $group: {
            _id: "$userId",
            name: { $last: "$name" },
            email: { $last: "$email" },
            avatar: { $last: "$avatar" },
            userId: { $first: "$userId" },
            points: { $sum: "$amount" },
            updatedAt: { $max: "$createdAt" }
          }
        },
        { $sort: { points: -1 } },
        { $limit: limit }
      ];
      const results = await RankingHistory.aggregate(pipeline);
      const ranksWithPosition = results.map((r, idx) => ({ ...r, position: idx + 1 }));
      const totalCount = await RankingHistory.distinct("userId", { shopId, year: req.query.year });
      return res.json({
        success: true,
        ranks: ranksWithPosition,
        total: totalCount.length,
        totalUsers: totalCount.length,
        type
      });
    }

    // ดึงข้อมูลจาก Ranking collection
    const rankings = await Ranking.find(query)
      .sort(sortField)
      .limit(limit)
      .lean();

    const ranksWithPosition = rankings.map((r, idx) => ({ ...r, position: idx + 1 }));

    res.json({
      success: true,
      ranks: ranksWithPosition,
      total: await Ranking.countDocuments(query),
      totalUsers: await Ranking.countDocuments(query),
      type
    });
  } catch (error) {
    console.error("Error fetching rankings:", error);
    res.status(500).json({ success: false, message: "Failed to fetch rankings" });
  }
});

/**
 * API สรุปยอดรวมคะแนน (Summary)
 * ดึงจาก RankingHistory เพื่อคำนวณยอดรวมตาม filter
 */
app.get("/api/rankings/summary", async (req, res) => {
  try {
    const type = req.query.type || "alltime";
    const today = getThaiDateStr(); // YYYY-MM-DD (เวลาไทย)
    const currentMonth = getThaiMonthStr(); // YYYY-MM (เวลาไทย)

    const shopId = req.query.shopId || req.headers['x-shop-id'] || '';
    let matchQuery = shopId ? { shopId } : {};

    if (type === "daily") {
      matchQuery = { ...matchQuery, date: req.query.date || today };
    } else if (type === "monthly") {
      matchQuery = { ...matchQuery, month: req.query.month || currentMonth };
    } else if (type === "alltime" && req.query.year) {
      matchQuery = { ...matchQuery, year: req.query.year };
    }

    // ใช้ RankingHistory aggregate ถ้ามี filter
    if (Object.keys(matchQuery).length > 0) {
      const result = await RankingHistory.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalSum: { $sum: "$amount" },
            totalUsers: { $addToSet: "$userId" }
          }
        }
      ]);

      const summary = result[0] || { totalSum: 0, totalUsers: [] };
      return res.json({
        success: true,
        totalSum: summary.totalSum,
        totalUsers: Array.isArray(summary.totalUsers) ? summary.totalUsers.length : 0,
        type
      });
    }

    // alltime ไม่มี filter → ใช้ Ranking collection เดิม
    const result = await Ranking.aggregate([
      {
        $group: {
          _id: null,
          totalSum: { $sum: "$points" },
          totalUsers: { $sum: 1 }
        }
      }
    ]);

    const summary = result[0] || { totalSum: 0, totalUsers: 0 };
    res.json({
      success: true,
      totalSum: summary.totalSum,
      totalUsers: summary.totalUsers,
      type
    });
  } catch (error) {
    console.error("Error fetching rankings summary:", error);
    res.status(500).json({ success: false, message: "Failed to fetch summary" });
  }
});

/**
 * API ดึง top 3 rankings สำหรับ backward compatibility
 * 🔥 Multi-tenant: เพิ่ม requireAdminAuth หรือ requireShopId (ถ้าเป็น public API)
 */
app.get("/api/rankings/top", requireShopId, async (req, res) => {
  try {
    const { shopId } = req; // 🔥 ได้จาก middleware
    const type = req.query.type || "alltime";
    const today = getThaiDateStr(); // YYYY-MM-DD (เวลาไทย)
    const currentMonth = getThaiMonthStr(); // YYYY-MM (เวลาไทย)

    let query = { shopId }; // 🔥 filter ด้วย shopId
    let sortField = { points: -1 };

    if (type === "daily") {
      query.dailyDate = today;
      sortField = { dailyPoints: -1 };
    } else if (type === "monthly") {
      query.monthlyPeriod = currentMonth;
      sortField = { monthlyPoints: -1 };
    }

    const top = await Ranking.find(query)
      .sort(sortField)
      .limit(3)
      .lean();

    res.json({
      success: true,
      ranks: top,
      totalUsers: await Ranking.countDocuments(query),
      type: type
    });
  } catch (error) {
    console.error("Error fetching rankings:", error);
    res.status(500).json({ success: false, message: "Failed to fetch rankings" });
  }
});

/**
 * API อัปเดต avatar ของ user ใน ranking
 * ถูกเรียกจาก User Backend เมื่อมีการเปลี่ยน avatar
 * 🔥 Multi-tenant: ต้องส่ง shopId มาด้วย
 */
app.put("/api/rankings/update-avatar", requireShopId, async (req, res) => {
  try {
    const { shopId } = req; // 🔥 ได้จาก middleware
    const { userId, email, avatar, username } = req.body;

    if (!userId && !email) {
      return res.status(400).json({
        success: false,
        message: "userId or email is required"
      });
    }

    // หา ranking record โดยใช้ userId หรือ email 🔥 + shopId
    let query = { shopId }; // 🔥 filter ด้วย shopId
    if (userId) {
      query.userId = userId;
    } else if (email) {
      query.email = email;
    }

    const ranking = await Ranking.findOne(query);

    if (ranking) {
      // อัปเดต avatar และชื่อถ้ามี
      if (avatar !== undefined) ranking.avatar = avatar;
      if (username) ranking.name = username;

      await ranking.save();
      console.log(`[Ranking][${shopId}] Avatar updated for user ${ranking.name} (${ranking.userId})`);

      return res.json({
        success: true,
        message: "Avatar updated successfully"
      });
    } else {
      // ถ้ายังไม่มี ranking record ก็ไม่ต้องสร้าง (จะสร้างตอนซื้อครั้งแรก)
      console.log(`[Ranking][${shopId}] ไม่พบ ranking record สำหรับ user จะสร้างตอนซื้อครั้งแรก`);
      return res.json({
        success: true,
        message: "No ranking record yet, will update on first purchase"
      });
    }
  } catch (error) {
    console.error("Error updating avatar in ranking:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update avatar"
    });
  }
});

// ===== API สำหรับจัดการค่าขั้นต่ำการใช้จ่ายสำหรับวันเกิด (Birthday Spending Requirement) =====
/**
 * API ดึงค่า birthday spending requirement
 * 🔥 Multi-tenant: แต่ละ shop มี config ของตัวเอง
 */
app.get("/api/config/birthday-requirement", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware

    // หา settings ของ shop นี้ หรือสร้างใหม่ถ้ายังไม่มี (Atomic operation ป้องกัน Race Condition)
    let settings = await ShopSetting.findOneAndUpdate(
      { shopId },
      {},
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      birthdaySpendingRequirement: settings.birthdaySpendingRequirement
    });
  } catch (error) {
    console.error("Error fetching birthday requirement:", error);
    res.status(500).json({ success: false, message: "Failed to fetch birthday requirement" });
  }
});

/**
 * API อัปเดตค่า birthday spending requirement
 * 🔥 Multi-tenant: แต่ละ shop มี config ของตัวเอง
 */
app.post("/api/config/birthday-requirement", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const { birthdaySpendingRequirement } = req.body;
    const requirement = Number(birthdaySpendingRequirement);

    if (isNaN(requirement) || requirement < 0) {
      return res.status(400).json({
        success: false,
        message: "ยอดเงินไม่ถูกต้อง"
      });
    }

    // อัปเดตใน Database
    let settings = await ShopSetting.findOneAndUpdate(
      { shopId },
      { birthdaySpendingRequirement: requirement },
      { upsert: true, new: true }
    );

    console.log(`[Admin][${shopId}] Birthday spending requirement updated to: ${requirement}`);

    // 🔥 แจ้ง Admin ของ shop นี้
    io.to(shopId).emit('configUpdated', { birthdaySpendingRequirement: requirement });

    res.json({
      success: true,
      birthdaySpendingRequirement: requirement
    });
  } catch (error) {
    console.error("Error updating birthday requirement:", error);
    res.status(500).json({ success: false, message: "Failed to update birthday requirement" });
  }
});

// ===== API สำหรับจัดการสิทธิพิเศษ (Perks Management) =====
/**
 * API ดึงรายการสิทธิพิเศษทั้งหมด
 * 🔥 Multi-tenant: แต่ละ shop มี perks ของตัวเอง
 */
app.get("/api/config/perks", requireShopId, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware

    // หา settings ของ shop นี้ หรือสร้างใหม่ถ้ายังไม่มี (Atomic operation)
    let settings = await ShopSetting.findOneAndUpdate(
      { shopId },
      {},
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      perks: settings.perks
    });
  } catch (error) {
    console.error("Error fetching perks:", error);
    res.status(500).json({ success: false, message: "Failed to fetch perks" });
  }
});

/**
 * API อัปเดตรายการสิทธิพิเศษ
 * 🔥 Multi-tenant: แต่ละ shop มี perks ของตัวเอง
 */
app.post("/api/config/perks", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const { perks } = req.body;

    if (!Array.isArray(perks) || perks.length === 0) {
      return res.status(400).json({
        success: false,
        message: "ต้องมีสิทธิพิเศษอย่างน้อย 1 รายการ"
      });
    }

    // ตรวจสอบว่าแต่ละ perk เป็น string ที่ไม่ว่างเปล่า
    const validPerks = perks.filter(perk => typeof perk === 'string' && perk.trim().length > 0);

    if (validPerks.length === 0) {
      return res.status(400).json({
        success: false,
        message: "สิทธิพิเศษต้องเป็นข้อความที่ไม่ว่างเปล่า"
      });
    }

    // อัปเดตใน Database
    let settings = await ShopSetting.findOneAndUpdate(
      { shopId },
      { perks: validPerks },
      { upsert: true, new: true }
    );

    console.log(`[Admin][${shopId}] Perks updated. Total: ${validPerks.length} perks`);

    // 🔥 แจ้ง Admin ของ shop นี้
    io.to(shopId).emit('configUpdated', { perks: validPerks });

    res.json({
      success: true,
      perks: validPerks
    });
  } catch (error) {
    console.error("Error updating perks:", error);
    res.status(500).json({ success: false, message: "Failed to update perks" });
  }
});

// ==========================================
// PAYMENT QR CODE APIs
// 🔥 Multi-tenant: แต่ละ shop มี QR code ชำระเงินของตัวเอง
// ==========================================

/**
 * API อัปโหลดภาพ QR Code ชำระเงิน
 * ใช้ Cloudinary storage + บันทึก URL ลง ShopSetting.paymentQrUrl
 */
app.post('/api/config/payment-qr', requireAdminAuth, (req, res, next) => {
  uploadPaymentQr(req, res, (err) => {
    if (err) {
      console.error('[PaymentQR] Multer error:', err.message);
      return res.status(400).json({ success: false, message: 'อัปโหลดรูปภาพล้มเหลว: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { shopId } = req;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'กรุณาเลือกรูปภาพ QR Code' });
    }

    const imageUrl = req.file.path || req.file.secure_url || req.file.url;
    console.log(`[PaymentQR][${shopId}] Uploaded payment QR:`, imageUrl);

    // บันทึก URL ลง ShopSetting
    await ShopSetting.findOneAndUpdate(
      { shopId },
      { paymentQrUrl: imageUrl },
      { upsert: true, new: true }
    );

    res.json({ success: true, paymentQrUrl: imageUrl });
  } catch (error) {
    console.error('[PaymentQR] Error uploading:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * API ดึง URL ภาพ QR Code ชำระเงินของร้าน
 * ใช้โดย User Frontend (ต้องการแค่ shopId)
 */
app.get('/api/config/payment-qr', requireShopId, async (req, res) => {
  try {
    const { shopId } = req;
    const settings = await ShopSetting.findOne({ shopId }).lean();

    res.json({
      success: true,
      paymentQrUrl: settings?.paymentQrUrl || null
    });
  } catch (error) {
    console.error('[PaymentQR] Error fetching:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * API ตรวจสอบว่า user มีสิทธิ์ใช้ฟีเจอร์วันเกิดหรือไม่ (ครบยอดใช้จ่ายตามเงื่อนไข)
 * 🔥 Multi-tenant: ต้อง filter Ranking ด้วย shopId
 */
app.get("/api/birthday-eligibility/:email", requireShopId, async (req, res) => {
  try {
    const { shopId } = req; // 🔥 ได้จาก middleware
    const email = decodeURIComponent(req.params.email);

    if (!email || email === "guest" || email === "unknown") {
      return res.json({
        success: true,
        eligible: false,
        reason: "not_logged_in",
        totalSpent: 0,
        required: 100
      });
    }

    // ดึงยอดใช้จ่ายของ user จาก email 🔥 filter ด้วย shopId
    const userRanking = await Ranking.findOne({ email, shopId });
    const totalSpent = userRanking ? (userRanking.points || 0) : 0;

    // ดึงค่า requirement จาก ShopSetting Database 🔥 แทนการใช้ settings.json
    let settings = await ShopSetting.findOneAndUpdate(
      { shopId },
      {},
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const birthdayRequirement = settings.birthdaySpendingRequirement;

    const eligible = totalSpent >= birthdayRequirement;

    res.json({
      success: true,
      eligible,
      reason: eligible ? "eligible" : "insufficient_spending",
      totalSpent,
      required: birthdayRequirement
    });
  } catch (error) {
    console.error("Error checking birthday eligibility:", error);
    res.status(500).json({ success: false, message: "Failed to check eligibility" });
  }
});

/**
 * API สำหรับรับคำสั่งซื้อของขวัญจาก User Backend
 * บันทึกลง ImageQueue และจัดการ ranking ถ้า user login
 * 🔥 Multi-tenant: รับ shopId จาก Request
 */
app.post("/api/gifts/order", requireShopId, async (req, res) => {
  try {
    console.log("[Admin] Received gift order:", JSON.stringify(req.body, null, 2));

    const { shopId } = req; // 🔥 ได้จาก middleware
    const { orderId, sender, senderPhone, userId, email, avatar, tableNumber, note, items, totalPrice } = req.body;

    console.log("[Admin] Parsed data: shopId=", shopId, "userId=", userId, "sender=", sender, "price=", totalPrice);

    if (!orderId || !tableNumber || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "ข้อมูลคำสั่งซื้อไม่ครบ" });
    }

    // เติมข้อมูล image จาก GiftSetting ถ้าไม่มี (🔥 filter ด้วย shopId)
    const enrichedItems = await Promise.all(items.map(async (item) => {
      // ถ้ามี imageUrl อยู่แล้ว (ส่งมาจาก User backend) ใช้ได้เลย
      if (item.imageUrl && !item.image) {
        item.image = item.imageUrl;
      }

      if (!item.image) {
        try {
          const giftSetting = await GiftSetting.findOne({ _id: item.id, shopId });
          if (giftSetting && giftSetting.image) {
            console.log(`[Admin] Enriched item "${item.name}" with image:`, giftSetting.image);
            return { ...item, image: giftSetting.image };
          } else {
            console.warn(`[Admin] No image found for item:`, item.id, item.name);
          }
        } catch (err) {
          console.warn("[Admin] Could not find gift setting for:", item.id, item.name, err.message);
        }
      }
      return item;
    }));

    console.log("[Admin] Enriched items with images:", enrichedItems);

    const queueData = {
      shopId, // 🔥 Multi-tenant
      type: "gift",
      text: `ส่งของขวัญไปยังโต๊ะ ${tableNumber}`,
      time: 30,
      price: Number(totalPrice) || 0,
      sender: sender || "Guest",
      textColor: "#fff",
      socialType: null,
      socialName: null,
      filePath: null,
      composed: true,
      status: "pending",
      userId: userId || null,
      email: email || null,
      avatar: avatar || null,
      receivedAt: new Date(),
      giftOrder: {
        orderId,
        tableNumber,
        senderPhone: senderPhone || null,
        items: enrichedItems,
        totalPrice: Number(totalPrice) || 0,
        note: note || ""
      }
    };

    console.log("[Admin] Creating queue item in MongoDB...");
    const queueItem = await ImageQueue.create(queueData);
    console.log("[Admin] Queue item created:", queueItem._id);

    // Notify admins
    io.emit("new-upload", queueItem);

    // บันทึก ranking เฉพาะ user ที่ login แล้ว
    if (userId) {
      console.log("[Admin] Calling addRankingPoint for userId:", userId, "shopId:", shopId);
      addRankingPoint(userId, sender, Number(totalPrice) || 0, email, avatar, shopId); // 🔥 ส่ง shopId
    } else {
      console.log("[Admin] No userId provided, skipping ranking");
    }

    // 🔥 Emit ไปยัง Room ของ shop นี้
    io.to(shopId).emit("admin-update-queue");

    res.json({ success: true, queueItem });
  } catch (error) {

    console.error("Gift order push failed", error);
    res.status(500).json({ success: false, message: "บันทึกคำสั่งซื้อไม่สำเร็จ" });
  }
});

// ===== API แก้ไขรายการสินค้า Gift (Admin เปลี่ยนสินค้าที่หมด) =====
app.put("/api/queue/:id/gift-items", requireAdminAuth, requireShopId, async (req, res) => {
  try {
    const { id } = req.params;
    const { shopId } = req;
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "ต้องมีรายการสินค้าอย่างน้อย 1 รายการ" });
    }

    // คำนวณราคารวมใหม่
    const totalPrice = items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);

    const updated = await ImageQueue.findOneAndUpdate(
      { _id: id, shopId, type: "gift" },
      {
        "giftOrder.items": items,
        "giftOrder.totalPrice": totalPrice,
        price: totalPrice
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "ไม่พบรายการ gift นี้" });
    }

    console.log("[Admin] Gift items updated:", { id, itemCount: items.length, totalPrice });

    // แจ้ง Admin ทุกคนให้ refresh
    io.to(shopId).emit("admin-update-queue");

    res.json({ success: true, queueItem: updated });
  } catch (error) {
    console.error("Update gift items failed", error);
    res.status(500).json({ success: false, message: "แก้ไขรายการสินค้าไม่สำเร็จ" });
  }
});

// API สำหรับรับข้อมูลจาก User backend
// 🔥 Multi-tenant: รับ shopId จาก Request
app.post("/api/upload", requireShopId, uploadUser, async (req, res) => {
  try {
    const { shopId } = req; // 🔥 ได้จาก middleware
    console.log(`=== Upload request received from shop: ${shopId} ===`);
    const mainFile = req.files?.file?.[0];
    const qrFile = req.files?.qrCode?.[0];
    const imageUrl = req.body.imageUrl; // รับ Cloudinary URL จาก User Backend
    const qrCodeUrl = req.body.qrCodeUrl; // รับ QR Code URL จาก User Backend

    if (mainFile) {
      console.log("Main file received:", mainFile.originalname);
    }
    if (qrFile) {
      console.log("QR Code file received:", qrFile.originalname);
    }
    if (imageUrl) {
      console.log("Image URL received:", imageUrl);
    }
    if (qrCodeUrl) {
      console.log("QR Code URL received:", qrCodeUrl);
    }

    if (!mainFile && !req.body.text && !imageUrl) {
      console.log("No file, text, or imageUrl received");
    }

    const {
      type,
      text,
      time,
      price,
      sender,
      userId,
      email,
      avatar,
      textColor,
      socialColor,
      textLayout,
      socialType,
      socialName,
      composed
    } = req.body;

    // ตรวจสอบไฟล์ (ถ้าประเภทไม่ใช่ text หรือ gift ต้องมีไฟล์หรือ imageUrl)
    if (!mainFile && !imageUrl && type !== "text" && type !== "gift" && type !== "birthday") {
      console.error("[Admin] No file or imageUrl received in upload");
      return res.status(400).json({ success: false, error: "No file or imageUrl received" });
    }

    // ตรวจสอบเงื่อนไขการใช้งานฟีเจอร์วันเกิด
    if (type === "birthday") {
      console.log("[Admin] Birthday upload detected, checking spending requirement...");

      // ต้องมี userId เพื่อตรวจสอบยอดใช้จ่าย
      if (!userId || userId === "guest" || userId === "unknown") {
        console.log("[Admin] Birthday feature requires logged-in user");
        return res.status(403).json({
          success: false,
          error: "กรุณาเข้าสู่ระบบเพื่อใช้ฟีเจอร์วันเกิด"
        });
      }

      // ดึงข้อมูลยอดใช้จ่ายของผู้ใช้จาก Ranking
      const userRanking = await Ranking.findOne({ email });
      const totalSpent = userRanking ? (userRanking.points || 0) : 0;

      // ดึงค่า birthdaySpendingRequirement จาก settings
      let birthdayRequirement = 100;
      try {
        const settingsPath = path.join(__dirname, "settings.json");
        if (fs.existsSync(settingsPath)) {
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
          birthdayRequirement = settings.birthdaySpendingRequirement || 100;
        }
      } catch (err) {
        console.warn("[Admin] Could not read birthday requirement from settings:", err);
      }

      console.log(`[Admin] User ${email} total spent: ${totalSpent}, requirement: ${birthdayRequirement}`);

      if (totalSpent < birthdayRequirement) {
        console.log("[Admin] User does not meet birthday spending requirement");
        return res.status(403).json({
          success: false,
          error: `ต้องใช้จ่ายครบ ${birthdayRequirement} บาทก่อนจึงจะใช้ฟีเจอร์วันเกิดได้ (คุณใช้จ่ายไปแล้ว ${totalSpent} บาท)`,
          totalSpent,
          required: birthdayRequirement
        });
      }

      console.log("[Admin] User meets birthday spending requirement, proceeding...");
    }

    console.log("[Admin] สร้าง upload item ด้วยประเภท:", type);

    // สร้างข้อมูลสำหรับบันทึกลง ImageQueue
    const itemData = {
      shopId, // 🔥 Multi-tenant
      type: type || "image",
      text: text || "",
      time: Number(time) || 0,
      price: Number(price) || 0,
      sender: sender || "Unknown",
      textColor: textColor || "#ffffff",
      socialColor: socialColor || "#ffffff",
      textLayout: textLayout || "right",
      socialType: socialType || null,
      socialName: socialName || null,
      filePath: imageUrl || (mainFile ? mainFile.path : null), // ใช้ Cloudinary URL หรือ path จาก multer
      qrCodePath: qrCodeUrl || (qrFile ? qrFile.path : null), // ใช้ URL จาก User Backend หรือ upload ใหม่
      composed: composed === "1" || composed === "true",
      status: req.body.status || "pending", // ใช้ค่าจาก frontend หรือค่า default "pending"
      userId: userId || null,
      email: email || null,
      avatar: avatar || null,
      receivedAt: new Date()
    };

    const queueItem = await ImageQueue.create(itemData);

    // 🔥 Emit ไปยัง Room เฉพาะของ shop นี้
    io.to(shopId).emit("new-upload", queueItem);

    // ✅ บันทึก ranking: User backend เรียก /api/upload หลังจากการชำระเงินผ่านแล้ว
    // จึงบันทึก ranking ได้เลย (ยกเว้น birthday เพราะฟรี)
    if (userId && userId !== "guest" && userId !== "unknown" && type !== "birthday" && Number(price) > 0) {
      console.log(`[Ranking] Triggered from /api/upload: userId=${userId}, price=${price}, shopId=${shopId}`);
      addRankingPoint(userId, sender, Number(price) || 0, email, avatar, shopId);
    } else {
      console.log(`[Ranking] Skipped: userId=${userId}, type=${type}, price=${price}`);
    }
    console.log("[Admin] Upload item created and queued:", queueItem._id, "type:", queueItem.type);
    res.json({ success: true, uploadId: queueItem._id.toString() });
  } catch (e) {
    console.error("[Admin] Error in upload:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * API สำหรับดูคิวรูปภาพทั้งหมด - เรียงตามวันที่เวลา (เก่าไปใหม่)
 * ดึงเฉพาะรายการที่ยังไม่เสร็จ (pending, approved, playing)
 * 🔥 Multi-tenant: filter ด้วย shopId
 */
app.get("/api/queue", requireShopId, async (req, res) => {
  try {
    const { shopId } = req; // 🔥 ได้จาก middleware
    console.log(`=== Queue request from shop: ${shopId}`);

    // 🔥 ดึงเฉพาะรายการของ shop นี้ที่ยังไม่เสร็จ
    const queueItems = await ImageQueue.find({
      shopId,
      status: { $in: ['pending', 'approved', 'playing'] }
    })
      .sort({ receivedAt: 1 })
      .lean();

    console.log(`[${shopId}] Queue length: ${queueItems.length}`);
    res.json(queueItems);
  } catch (error) {
    console.error('Error fetching queue:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


/**
 * API สำหรับยืนยันการชำระเงินและเข้าคิว
 * เปลี่ยนสถานะจาก payment_pending เป็น pending
 * 🔥 Multi-tenant: filter ด้วย shopId
 */
app.post("/api/confirm-payment/:uploadId", requireShopId, async (req, res) => {
  try {
    const { shopId } = req; // 🔥 ได้จาก middleware
    const { uploadId } = req.params;
    const { userId, email, avatar } = req.body;

    console.log(`[Admin][${shopId}] ยืนยันการชำระเงินสำหรับ upload: ${uploadId}`);

    // ค้นหา queue item 🔥 filter ด้วย shopId
    const queueItem = await ImageQueue.findOne({ _id: uploadId, shopId });

    if (!queueItem) {
      console.log(`[Admin][${shopId}] ไม่พบข้อมูลการ upload`);
      return res.status(404).json({ success: false, error: "ไม่พบข้อมูลการอัปโหลด" });
    }

    if (queueItem.status !== "payment_pending") {
      console.log(`[Admin][${shopId}] ข้อมูลถูกประมวลผลแล้วหรือสถานะไม่ถูกต้อง:`, queueItem.status);
      return res.status(400).json({ success: false, error: "สถานะการอัปโหลดไม่ถูกต้อง" });
    }

    // เปลี่ยนสถานะเป็น pending เพื่อให้เข้าคิว
    queueItem.status = "pending";
    queueItem.confirmedAt = new Date();
    await queueItem.save();

    // บันทึก ranking เฉพาะ user ที่ login แล้ว (ไม่บันทึกสำหรับ birthday เพราะฟรี)
    if (userId && queueItem.type !== "birthday" && queueItem.price > 0) {
      addRankingPoint(userId, queueItem.sender, queueItem.price, email, avatar, queueItem.shopId); // 🔥 ส่ง shopId
    }

    console.log(`[Admin][${shopId}] ยืนยันการชำระเงินแล้ว, ย้าย item เข้าคิว`);
    res.json({ success: true, queueItem });
  } catch (error) {
    console.error("[Admin] Error confirming payment:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * API สำหรับอัพเดทสถานะรูปที่กำลังแสดง + broadcast ไป OBS overlay
 * Force complete รายการที่กำลังแสดงอยู่ก่่อนเพื่อป้องกัน stuck items
 * 🔥 Multi-tenant: filter ด้วย shopId
 */
app.post("/api/playing/:id", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const { id } = req.params;
    console.log("=== เปลี่ยนสถานะเป็นกำลังเล่น:", id, "Shop:", shopId);

    // 🔥 ค้นหารายการที่กำลังเล่นอยู่แล้วและบันทึกเสร็จก่อัน (Force complete) - เฉพาะ shop นี้
    const currentlyPlaying = await ImageQueue.find({ shopId, status: 'playing', _id: { $ne: id } });
    for (const playingItem of currentlyPlaying) {
      console.log(`[Auto-Complete] บันทึกเสร็จสิ้นอัตโนมัติสำหรับ item ที่ค้าง: ${playingItem._id}`);

      // ใช้ shared function
      await completeItem(playingItem);
    }

    // อัปเดตสถานะเป็น 'playing' (🔥 filter ด้วย shopId)
    const updated = await ImageQueue.findOneAndUpdate(
      { _id: id, shopId },
      {
        status: 'playing',
        playingAt: new Date()
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Item not found or unauthorized' });
    }

    // Debug: ตรวจสอบ type และ giftOrder
    console.log('[Playing] Updated item:', {
      id: updated._id,
      type: updated.type,
      hasGiftOrder: !!updated.giftOrder,
      giftOrderKeys: updated.giftOrder ? Object.keys(updated.giftOrder) : [],
      giftOrderItems: updated.giftOrder?.items?.length || 0
    });

    // ส่ง event ไป overlay ให้ OBS ทราบว่ามีรูปใหม่กำลังเล่น
    // ถ้าเป็น Gift ให้ใช้ event พิเศษและส่งข้อมูลเพิ่มเติม
    if (updated.type === "gift" && updated.giftOrder) {
      console.log('[Playing] ส่ง now-playing-gift event');
      // 🔥 Emit ไปยัง Room ของ shop นี้
      io.to(shopId).emit("now-playing-gift", {
        id: updated._id?.toString(),
        sender: updated.sender || "Guest",
        avatar: updated.avatar || null,
        tableNumber: updated.giftOrder.tableNumber || 1,
        items: updated.giftOrder.items || [],
        note: updated.giftOrder.note || "",
        totalPrice: updated.giftOrder.totalPrice || updated.price || 0,
        time: updated.time,
        type: "gift"
      });
    } else {
      console.log('[Playing] ส่ง now-playing-image event (ไม่ใช่ gift)');
      // 🔥 Emit ไปยัง Room ของ shop นี้
      io.to(shopId).emit("now-playing-image", {
        id: updated._id?.toString(),
        sender: updated.sender,
        price: updated.price,
        time: updated.time,
        filePath: updated.filePath,
        text: updated.text,
        textColor: updated.textColor || '#ffffff',
        socialColor: updated.socialColor || '#ffffff',
        textLayout: updated.textLayout || 'right',
        socialType: updated.socialType,
        socialName: updated.socialName,
        qrCodePath: updated.qrCodePath,
        width: updated.width,
        height: updated.height,
        type: updated.type || (updated.filePath ? "image" : "text")
      });
    }

    res.json({ success: true, message: 'Item marked as playing', data: updated });
  } catch (error) {
    console.error('Error marking as playing:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API สำหรับอนุมัติรูปภาพ (บันทึกลง CheckHistory Database)
// 🔥 Multi-tenant: filter ด้วย shopId
app.post("/api/approve/:id", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const { id } = req.params;
    const { width, height } = req.body; // รับค่า width, height จาก body
    console.log("=== Approving image:", id, "Shop:", shopId, "Size:", width, "x", height);

    // 🔥 filter ด้วย shopId
    const item = await ImageQueue.findOne({ _id: id, shopId });

    if (!item) {
      return res.status(404).json({ success: false, message: 'Image not found or unauthorized' });
    }

    // RACE CONDITION FIX: Only update status if NOT already 'playing'
    // This prevents overwriting 'playing' status when approve/playing calls race
    const updateData = {
      approvedAt: new Date(),
      width: width ? Number(width) : null,
      height: height ? Number(height) : null
    };

    // Only set status to 'approved' if current status is 'pending'
    if (item.status === 'pending') {
      updateData.status = 'approved';
    }
    // If status is already 'playing', don't touch it
    // If status is already 'approved', don't change it either

    await ImageQueue.findByIdAndUpdate(id, updateData);

    // 🔥 Notify admins ของ shop นี้เท่านั้น
    io.to(shopId).emit("admin-update-queue");

    res.json({ success: true, message: 'Item approved' });
  } catch (error) {
    console.error('Error approving image:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API สำหรับปฏิเสธรูปภาพ (บันทึกลง CheckHistory Database)
// 🔥 Multi-tenant: filter ด้วย shopId และบันทึก CheckHistory พร้อม shopId
app.post("/api/reject/:id", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const { id } = req.params;
    console.log("=== Rejecting image:", id, "Shop:", shopId);

    // 🔥 filter ด้วย shopId
    const item = await ImageQueue.findOne({ _id: id, shopId });

    if (!item) {
      return res.status(404).json({ success: false, message: 'Image not found or unauthorized' });
    }

    // บันทึกลง CheckHistory ก่อนลบ (🔥 พร้อม shopId)
    await CheckHistory.create({
      shopId: item.shopId, // 🔥 เพิ่ม shopId
      transactionId: item._id.toString(),
      type: item.type || (item.filePath ? 'image' : 'text'),
      sender: item.sender || 'Unknown',
      price: item.price || 0,
      status: 'rejected',
      content: item.text || '',
      mediaUrl: item.filePath || null,
      userId: item.userId || null,
      email: item.email || null,
      avatar: item.avatar || null,
      metadata: {
        duration: item.time,
        tableNumber: Number(item.giftOrder?.tableNumber) || 0,
        giftItems: item.giftOrder?.items || [],
        note: item.giftOrder?.note || '',
        theme: item.textColor || 'white',
        socialColor: item.socialColor || '#ffffff',
        textLayout: item.textLayout || 'right',
        qrCodePath: item.qrCodePath || null,
        social: {
          type: item.socialType || null,
          name: item.socialName || null
        }
      },
      receivedAt: item.receivedAt, // Keep original receive time
      approvalDate: new Date(), // Rejection is the check action
      duration: item.time,
      approvedBy: 'admin',
      notes: 'Rejected by admin'
    });

    // ลบไฟล์รูปภาพ
    if (item.filePath) {
      const imagePath = path.join(__dirname, item.filePath);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // ลบออกจากคิว
    await ImageQueue.findByIdAndDelete(id);

    // 🔥 Notify admins ของ shop นี้เท่านั้น
    io.to(shopId).emit("admin-update-queue");

    res.json({ success: true, message: 'Item rejected and saved to history' });
  } catch (error) {
    console.error('Error rejecting image:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API สำหรับบันทึกรูปที่เล่นจบแล้ว (เมื่อหมดเวลา)
// 🔥 Multi-tenant: filter ด้วย shopId
app.post("/api/complete/:id", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const { id } = req.params;
    console.log("=== Completing image manually:", id, "Shop:", shopId);

    // 🔥 filter ด้วย shopId
    const item = await ImageQueue.findOne({ _id: id, shopId });
    if (!item) {
      return res.json({ success: true, message: 'Already processed or not found' });
    }

    // Use shared function
    await completeItem(item);

    // Start 15s Delay
    console.log("[API] Manual complete, starting 15s delay...");
    nextPlayTime = Date.now() + 15000;
    // 🔥 Emit ไปยัง Room ของ shop นี้
    if (typeof io !== 'undefined' && shopId) io.to(shopId).emit('pause-display', { remaining: 15, isCountingDown: true });

    res.json({ success: true, message: 'Item completed and saved to history' });
  } catch (error) {
    console.error('Error completing image:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API สำหรับนำรายการจากประวัติกลับเข้าคิว
// 🔥 Multi-tenant: filter ด้วย shopId
app.post("/api/history/restore/:id", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const { id } = req.params;
    console.log("[Restore] Restoring history ID:", id, "Shop:", shopId);

    // 🔥 filter ด้วย shopId
    const historyItem = await CheckHistory.findOne({ _id: id, shopId });
    if (!historyItem) {
      return res.status(404).json({ success: false, message: 'History item not found' });
    }

    // สร้างรายการใหม่ใน ImageQueue พร้อมคืน QR Code และข้อมูล user
    const newQueueItem = await ImageQueue.create({
      shopId: historyItem.shopId, // 🔥 เพิ่ม shopId
      sender: historyItem.sender || 'Unknown',
      price: historyItem.price || 0,
      time: historyItem.duration || historyItem.metadata?.duration || 10,
      filePath: historyItem.mediaUrl || null,
      text: historyItem.content || '',
      textColor: historyItem.metadata?.theme || 'white',
      socialColor: historyItem.metadata?.socialColor || '#ffffff',
      textLayout: historyItem.metadata?.textLayout || 'right',
      socialType: historyItem.metadata?.social?.type || null,
      socialName: historyItem.metadata?.social?.name || null,
      qrCodePath: historyItem.metadata?.qrCodePath || null,
      type: historyItem.type || 'image',
      status: 'pending',
      receivedAt: historyItem.receivedAt || new Date(), // 🔧 ใช้เวลาเดิม → คืนตำแหน่งในคิวที่ถูกต้อง
      userId: historyItem.userId || null,
      email: historyItem.email || null,
      avatar: historyItem.avatar || null,
      giftOrder: historyItem.type === 'gift' ? {
        tableNumber: historyItem.metadata?.tableNumber || null,
        items: historyItem.metadata?.giftItems || [],
        note: historyItem.metadata?.note || ''
      } : null
    });

    await CheckHistory.findByIdAndDelete(id);

    console.log("[Restore] Successfully restored:", newQueueItem._id);
    res.json({ success: true, message: 'Item restored to queue', data: newQueueItem });
  } catch (error) {
    console.error('[Restore] Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// API สำหรับดึงประวัติการตรวจสอบ
// 🔥 Multi-tenant: filter ด้วย shopId
app.get("/api/check-history", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    // 🔥 filter ด้วย shopId และดึงเฉพาะของ 2 วันย้อนหลัง
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const history = await CheckHistory.find({
      shopId,
      createdAt: { $gte: twoDaysAgo }
    }).sort({ approvalDate: -1 });

    // Map data ให้ตรงกับที่ Frontend ต้องการ (รองรับทั้ง Schema เก่าและใหม่)
    const formattedHistory = history.map(item => {
      // Helper to clear legacy vs new
      const isNew = !!item.transactionId;

      return {
        id: item._id,
        giftId: isNew ? item.transactionId : item.giftId,
        text: isNew ? item.content : item.giftName,
        sender: isNew ? item.sender : item.senderName,
        price: isNew ? item.price : item.amount,
        status: (item.status === 'verified' || item.status === 'approved') ? 'approved' : item.status,
        checkedAt: item.approvalDate,
        createdAt: item.receivedAt || item.createdAt, // Fix: Use receivedAt for "Receive Data" time, fallback to createdAt
        type: item.type || (item.filePath ? 'image' : 'text'),
        filePath: isNew ? item.mediaUrl : item.filePath, // Use mediaUrl for new schema, filePath for legacy
        tableNumber: isNew ? (item.metadata?.tableNumber || 0) : item.tableNumber,

        // User information
        userId: item.userId || null,
        email: item.email || null,
        avatar: item.avatar || null,

        // New fields
        giftItems: isNew ? (item.metadata?.giftItems || []) : [],
        note: isNew ? (item.metadata?.note || '') : '',
        social: isNew ? (item.metadata?.social || {}) : {},
        theme: isNew ? (item.metadata?.theme || '') : '',
        startedAt: item.startedAt,
        endedAt: item.endedAt,
        duration: item.duration || (item.metadata?.duration)
      };
    });

    res.json(formattedHistory);
  } catch (error) {
    console.error('Error fetching check history:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ลบทีละรายการ
// 🔥 Multi-tenant: filter ด้วย shopId
app.post("/api/delete-history", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const { id } = req.body;

    // 🔥 Find before delete to remove image - ตรวจสอบ shopId ด้วย
    const deletedItem = await CheckHistory.findOneAndDelete({ _id: id, shopId });

    if (deletedItem) {
      // ตรวจสอบทั้ง mediaUrl และ filePath (legacy)
      const imagePath = deletedItem.mediaUrl || deletedItem.filePath;
      if (imagePath) {
        deleteImageFile(imagePath);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting history:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API สำหรับดูสถิติรายรับตามช่วงเวลา
app.get("/api/admin/income-stats", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: "Missing startDate or endDate" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const records = await CheckHistory.find({
      shopId,
      createdAt: { $gte: start, $lte: end },
      status: "completed" // นับเฉพาะที่ขึ้นจอแล้วหรืออนุมัติแล้ว
    }).lean();

    let totalIncome = 0;
    const userSet = new Set();
    const hourCounts = {};   // { "00": 5, "01": 2 ... }
    const dayCounts   = {};   // { 0: 12, 5: 30 ... }  0=Sun … 6=Sat
    const dailyMap   = {};   // { "2026-03-01": 1500, ... }
    const typeMap    = {};   // { image: 10, text: 5, ... }
    const userAmtMap = {};   // { userId/guest_name: { name, amount } }

    const TH_OFFSET = 7 * 60 * 60 * 1000; // UTC+7
    const DAY_NAMES = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัส","ศุกร์","เสาร์"];
    const TYPE_LABELS = { image: "รูปภาพ", text: "ข้อความ", gift: "ส่งของขวัญ", birthday: "วันเกิด" };
    const TYPE_COLORS = { image: "#6d28d9", text: "#4f46e5", gift: "#7c3aed", birthday: "#a78bfa" };

    records.forEach(r => {
      const price = r.price || 0;
      totalIncome += price;

      // Unique user count
      const uKey = (r.userId && r.userId !== "guest" && r.userId !== "unknown")
        ? r.userId
        : `guest_${r.sender || "unknown"}`;
      userSet.add(uKey);

      // Top users by spending
      if (!userAmtMap[uKey]) userAmtMap[uKey] = { name: r.sender || "ผู้ใช้", amount: 0 };
      userAmtMap[uKey].amount += price;

      // Activity type breakdown
      const t = r.type || "other";
      typeMap[t] = (typeMap[t] || 0) + 1;

      if (r.createdAt) {
        const localTime = new Date(r.createdAt.getTime() + TH_OFFSET);

        // Peak hour
        const hour = localTime.getUTCHours().toString().padStart(2, "0");
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;

        // Peak day of week
        const dow = localTime.getUTCDay();
        dayCounts[dow] = (dayCounts[dow] || 0) + 1;

        // Daily trend
        const y  = localTime.getUTCFullYear();
        const m  = String(localTime.getUTCMonth() + 1).padStart(2, "0");
        const d  = String(localTime.getUTCDate()).padStart(2, "0");
        const dateKey = `${y}-${m}-${d}`;
        dailyMap[dateKey] = (dailyMap[dateKey] || 0) + price;
      }
    });

    // Peak hours (top 3)
    const peakHours = Object.entries(hourCounts)
      .map(([hour, count]) => ({ hour: `${hour}:00`, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // Peak day name
    const peakDayEntry = Object.entries(dayCounts).sort(([, a], [, b]) => b - a)[0];
    const peakDay = peakDayEntry ? `วัน${DAY_NAMES[parseInt(peakDayEntry[0])]}` : null;

    // Daily trend (sorted by date)
    const dailyTrend = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));

    // Activity breakdown
    const totalRecords = records.length || 1;
    const activities = Object.entries(typeMap)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => ({
        label: TYPE_LABELS[type] || type,
        pct: Math.round((count / totalRecords) * 100),
        color: TYPE_COLORS[type] || "#94a3b8"
      }));
    // ปรับ pct สุดท้ายให้รวมกันเท่ากับ 100 พอดี
    if (activities.length > 0) {
      const sumPct = activities.reduce((s, a) => s + a.pct, 0);
      activities[activities.length - 1].pct += (100 - sumPct);
    }

    // Top users (top 5 by spending)
    const topUsers = Object.values(userAmtMap)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map(u => ({ name: u.name, totalAmount: u.amount }));

    res.json({
      success: true,
      data: {
        totalIncome,
        totalUsers: userSet.size,
        totalOrders: records.length,
        peakHours,
        peakDay,
        dailyTrend,
        activities,
        topUsers
      }
    });

  } catch (error) {
    console.error("Error fetching income stats:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// API สำหรับดึงประวัติ (สำหรับ ImageQueue history modal)
// 🔥 Multi-tenant: filter ด้วย shopId
app.get("/api/history", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    // 🔥 filter ด้วย shopId
    const history = await CheckHistory.find({ shopId }).sort({ approvalDate: -1 }).limit(50);
    res.json(history);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



// API สำหรับตรวจสอบสถานะออเดอร์ (สำหรับ User frontend)
// 🔥 Multi-tenant: filter ด้วย shopId
app.get("/api/order-status/:orderId", requireShopId, async (req, res) => {
  try {
    const { shopId } = req; // 🔥 ได้จาก middleware
    const { orderId } = req.params;
    console.log(`[OrderStatus][${shopId}] Checking status for:`, orderId);

    // 1. ค้นหาใน ImageQueue ตามสถานะต่างๆ 🔥 filter ด้วย shopId
    let query = { 'giftOrder.orderId': orderId, shopId };

    // ถ้า orderId เป็น valid ObjectId ให้ค้นหาด้วย _id ด้วย
    if (orderId.match(/^[0-9a-fA-F]{24}$/)) {
      query = {
        shopId, // 🔥 ต้องมี shopId เสมอ
        $or: [
          { _id: orderId },
          { 'giftOrder.orderId': orderId }
        ]
      };
    }

    console.log(`[OrderStatus][${shopId}] Query:`, JSON.stringify(query));

    const queueItem = await ImageQueue.findOne(query);

    if (!queueItem) {
      // ไม่พบใน ImageQueue -> ค้นหาใน CheckHistory (rejected/completed) 🔥 filter ด้วย shopId
      console.log(`[OrderStatus][${shopId}] Not found in ImageQueue, checking CheckHistory`);
      const historyItem = await CheckHistory.findOne({
        shopId, // 🔥 filter ด้วย shopId
        transactionId: orderId
      }).sort({ approvalDate: -1 });

      if (historyItem) {
        const statusText = historyItem.status === 'completed' ? 'แสดงเสร็จสิ้น' : 'รูปถูกปฏิเสธ';

        return res.json({
          success: true,
          status: historyItem.status,
          statusText: statusText,
          order: {
            id: historyItem._id,
            type: historyItem.type,
            sender: historyItem.sender,
            price: historyItem.price,
            content: historyItem.content,
            mediaUrl: historyItem.mediaUrl || null,
            receivedAt: historyItem.receivedAt || null,
            startedAt: historyItem.startedAt || null,
            endedAt: historyItem.endedAt || null,
            duration: historyItem.duration || historyItem.metadata?.duration || null,
            approvalDate: historyItem.approvalDate,
            tableNumber: historyItem.metadata?.tableNumber || null,
            giftItems: historyItem.metadata?.giftItems || null,
            note: historyItem.metadata?.note || null,
            textColor: historyItem.metadata?.theme || null,
            socialColor: historyItem.metadata?.socialColor || null,
            textLayout: historyItem.metadata?.textLayout || null,
            socialType: historyItem.metadata?.social?.type || null,
            socialName: historyItem.metadata?.social?.name || null
          }
        });
      }

      // ไม่พบทั้งใน ImageQueue และ CheckHistory
      return res.json({
        success: false,
        status: 'not_found',
        statusText: 'ไม่พบคำสั่งซื้อ',
        message: 'ไม่พบข้อมูลคำสั่งซื้อในระบบ'
      });
    }

    // 2. ตรวจสอบสถานะ
    if (queueItem.status === 'pending') {
      // สถานะรอตรวจสอบ - ไม่แสดงเวลาประมาณการ
      // 🔥 นับเฉพาะ pending ของ shop นี้
      const queuePosition = await ImageQueue.countDocuments({
        shopId, // 🔥 filter ด้วย shopId
        status: 'pending',
        receivedAt: { $lt: queueItem.receivedAt }
      });

      return res.json({
        success: true,
        status: 'pending',
        statusText: 'รอตรวจสอบ',
        order: {
          id: queueItem._id,
          type: queueItem.type,
          sender: queueItem.sender,
          price: queueItem.price,
          queueNumber: queuePosition + 1,
          queuePosition: queuePosition + 1,
          totalQueue: await ImageQueue.countDocuments({ status: 'pending', shopId }), // 🔥 filter shopId
          tableNumber: queueItem.giftOrder?.tableNumber || null,
          giftItems: queueItem.giftOrder?.items || null,
          mediaUrl: queueItem.filePath || null,
          receivedAt: queueItem.receivedAt || null,
          time: queueItem.time || null,
          text: queueItem.text || null,
          textColor: queueItem.textColor || null,
          socialType: queueItem.socialType || null,
          socialName: queueItem.socialName || null,
          note: queueItem.giftOrder?.note || null,
          waitingForApproval: true
        }
      });
    }

    if (queueItem.status === 'approved') {
      // สถานะอนุมัติแล้ว รอแสดง - คำนวณเวลาจาก playing + approved queue
      const statusText = 'อนุมัติแล้ว รอแสดง';

      // หาภาพที่กำลังแสดงอยู่ 🔥 filter ด้วย shopId
      const currentlyPlaying = await ImageQueue.findOne({ status: 'playing', shopId });

      let totalSecondsBefore = 0;

      // ถ้ามีรูปกำลังแสดง คำนวณเวลาที่เหลือ
      if (currentlyPlaying && currentlyPlaying.playingAt) {
        const playingDuration = currentlyPlaying.time; // วินาที
        const playingStartTime = new Date(currentlyPlaying.playingAt);
        const elapsedSeconds = (Date.now() - playingStartTime.getTime()) / 1000;
        const remainingSeconds = Math.max(0, playingDuration - elapsedSeconds);
        totalSecondsBefore += remainingSeconds;
      }

      // หาคิว approved ที่อยู่ก่อนหน้า (เรียงตาม approvedAt) 🔥 filter ด้วย shopId
      const approvedBefore = await ImageQueue.find({
        shopId, // 🔥 filter shopId
        status: 'approved',
        approvedAt: { $lt: queueItem.approvedAt }
      }).sort({ approvedAt: 1 });

      // รวมเวลาของคิว approved ที่อยู่ก่อนหน้า
      totalSecondsBefore += approvedBefore.reduce((sum, item) => {
        return sum + (item.time || 0);
      }, 0);

      // นับตำแหน่งคิว (approved + playing ที่เริ่มก่อน)
      const approvedPosition = approvedBefore.length + (currentlyPlaying ? 1 : 0) + 1;
      const totalApproved = await ImageQueue.countDocuments({ status: 'approved', shopId }); // 🔥 filter shopId

      const estimatedStartTime = new Date(Date.now() + totalSecondsBefore * 1000);
      const currentDuration = queueItem.time || 0;
      const estimatedEndTime = new Date(estimatedStartTime.getTime() + currentDuration * 1000);

      return res.json({
        success: true,
        status: 'approved',
        statusText: statusText,
        order: {
          id: queueItem._id,
          type: queueItem.type,
          sender: queueItem.sender,
          price: queueItem.price,
          queuePosition: approvedPosition,
          totalQueue: totalApproved + (currentlyPlaying ? 1 : 0),
          estimatedWaitSeconds: Math.round(totalSecondsBefore),
          estimatedStartTime: estimatedStartTime.toISOString(),
          estimatedEndTime: estimatedEndTime.toISOString(),
          tableNumber: queueItem.giftOrder?.tableNumber || null,
          giftItems: queueItem.giftOrder?.items || null,
          mediaUrl: queueItem.filePath || null,
          receivedAt: queueItem.receivedAt || null,
          time: queueItem.time || null,
          text: queueItem.text || null,
          textColor: queueItem.textColor || null,
          socialType: queueItem.socialType || null,
          socialName: queueItem.socialName || null,
          note: queueItem.giftOrder?.note || null
        }
      });
    }

    if (queueItem.status === 'playing') {
      // สถานะกำลังแสดง
      const playingDuration = queueItem.time; // วินาที
      const playingStartTime = new Date(queueItem.playingAt);
      const elapsedSeconds = (Date.now() - playingStartTime.getTime()) / 1000;
      const remainingSeconds = Math.max(0, playingDuration - elapsedSeconds);

      return res.json({
        success: true,
        status: 'playing',
        statusText: 'กำลังแสดง',
        order: {
          id: queueItem._id,
          type: queueItem.type,
          sender: queueItem.sender,
          price: queueItem.price,
          queuePosition: 1,
          totalQueue: 1,
          remainingSeconds: Math.round(remainingSeconds),
          tableNumber: queueItem.giftOrder?.tableNumber || null,
          giftItems: queueItem.giftOrder?.items || null,
          mediaUrl: queueItem.filePath || null,
          receivedAt: queueItem.receivedAt || null,
          startedAt: queueItem.playingAt || null,
          time: queueItem.time || null,
          text: queueItem.text || null,
          textColor: queueItem.textColor || null,
          socialType: queueItem.socialType || null,
          socialName: queueItem.socialName || null,
          note: queueItem.giftOrder?.note || null
        }
      });
    }

    // ถ้าถึงตรงนี้แสดงว่า queueItem ไม่ใช่ pending, approved, หรือ playing
    // ซึ่งไม่ควรเกิดขึ้นเพราะ enum จำกัดไว้แล้ว
    console.warn("[OrderStatus] Unexpected status:", queueItem.status);
    return res.json({
      success: false,
      status: 'unknown',
      statusText: 'สถานะไม่ทราบ',
      message: 'สถานะคำสั่งซื้อไม่ถูกต้อง'
    });

  } catch (error) {
    console.error('[OrderStatus] Error checking order status:', error);
    console.error('[OrderStatus] Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// API สำหรับลบ order ของ user (เฉพาะ pending)
app.delete("/api/user-delete-order/:orderId", requireShopId, async (req, res) => {
  try {
    const { shopId } = req;
    const { orderId } = req.params;
    console.log(`[UserDeleteOrder][${shopId}] Deleting order:`, orderId);

    // ค้นหา order ใน ImageQueue
    let query = { shopId };
    if (orderId.match(/^[0-9a-fA-F]{24}$/)) {
      query.$or = [
        { _id: orderId },
        { 'giftOrder.orderId': orderId }
      ];
    } else {
      query['giftOrder.orderId'] = orderId;
    }

    const item = await ImageQueue.findOne(query);
    if (!item) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
    }

    // อนุญาตลบเฉพาะ pending เท่านั้น
    if (item.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'ไม่สามารถลบรายการที่ดำเนินการแล้ว' });
    }

    // ลบไฟล์รูปภาพ (ถ้ามี)
    if (item.filePath) {
      try {
        // ถ้าเป็น Cloudinary URL ให้ลบจาก Cloudinary
        if (item.filePath.includes('cloudinary')) {
          const publicId = item.filePath.split('/').slice(-1)[0].split('.')[0];
          // cloudinary.uploader.destroy(publicId) - optional
        }
      } catch (e) {
        console.warn('[UserDeleteOrder] Error deleting file:', e.message);
      }
    }

    await ImageQueue.findByIdAndDelete(item._id);

    // แจ้ง admin UI อัปเดต
    if (typeof io !== 'undefined' && shopId) {
      io.to(shopId).emit('admin-update-queue');
    }

    console.log(`[UserDeleteOrder][${shopId}] ✓ Deleted order: ${orderId}`);
    res.json({ success: true, message: 'ลบรายการสำเร็จ' });
  } catch (error) {
    console.error('[UserDeleteOrder] Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ลบทั้งหมด
// 🔥 Multi-tenant: filter ด้วย shopId
app.post("/api/delete-all-history", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    // 🔥 ดึงข้อมูลทั้งหมดเพื่อลบรูป (เฉพาะ shop นี้)
    const allHistory = await CheckHistory.find({ shopId });

    // วนลบรูปภาพทีละรายการ
    for (const item of allHistory) {
      const imagePath = item.mediaUrl || item.filePath;
      if (imagePath) {
        deleteImageFile(imagePath);
      }
    }

    // ลบข้อมูลใน DB (🔥 เฉพาะ shop นี้)
    await CheckHistory.deleteMany({ shopId });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting all history:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API สำหรับลบรูปภาพที่ถูกปฏิเสธ
// 🔥 Multi-tenant: filter ด้วย shopId
app.delete("/api/delete/:id", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const { id } = req.params;
    // 🔥 filter ด้วย shopId
    const item = await ImageQueue.findOne({ _id: id, shopId });

    if (!item) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }

    // ลบไฟล์รูปภาพ
    if (item.filePath) {
      const imagePath = path.join(__dirname, item.filePath);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // ลบออกจากคิว
    await ImageQueue.findByIdAndDelete(id);

    res.json({ success: true, message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API สำหรับสถิติสลิป
app.get("/api/stat-slip", (req, res) => {
  // Feature ยังไม่ได้ implement การเก็บข้อมูล
  res.json([]);
});

app.post("/api/stat-slip", (req, res) => {
  console.log('Received stat-slip:', req.body);
  res.json({ success: true });
});

// API สำหรับดูรายงานจาก User backend
app.get("/api/admin/report", async (req, res) => {
  try {
    console.log("=== Admin report request received");

    const reportPath = path.join(__dirname, 'report.json');

    if (!fs.existsSync(reportPath)) {
      console.log("report.json not found");
      return res.json([]);
    }

    const data = await fs.promises.readFile(reportPath, 'utf8');
    const reportsFromFile = JSON.parse(data);

    console.log("Returning reports:", reportsFromFile.length);
    res.json(reportsFromFile);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    const queueLength = await ImageQueue.countDocuments({ status: { $in: ['pending', 'approved', 'playing'] } });
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      queueLength: queueLength,
      database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
    });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// OBS overlay (HTML) - served from /public
app.get("/obs-image-overlay.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "obs-image-overlay.html"));
});

// ----- Reports Storage (using Database) -----
// ----- Reports Storage (using Database) -----
// 🔥 Multi-tenant: User ส่ง reportId จาก User Frontend พร้อม shopId
app.post("/api/report", requireShopId, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const { reportId, category, detail } = req.body;

    // ตรวจสอบข้อมูล
    if (!category || !detail || !detail.trim()) {
      return res.status(400).json({ success: false, message: "INVALID_DATA" });
    }

    const report = await AdminReport.create({
      shopId, // 🔥 เพิ่ม shopId
      reportId: reportId || Date.now().toString(),
      category: category || "other",
      description: detail.trim(),
      status: "new"  // เปลี่ยนจาก open เป็น new ให้ตรงกับ Admin Frontend
    });

    console.log('Report saved successfully to database');
    // 🔥 แจ้ง Admin ของ shop นี้เท่านั้น
    io.to(req.shopId).emit('newReport', report);
    return res.json({ success: true, report });
  } catch (error) {
    console.error('Error saving report:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// GET: admin ดูรายการ
// 🔥 Multi-tenant: filter ด้วย shopId
app.get("/api/reports", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const reports = await AdminReport.find({ shopId }).sort({ createdAt: -1 });
    const formatted = reports.map(r => ({
      id: r._id, // Map _id to id
      reportId: r.reportId,
      detail: r.description,
      category: r.category,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));
    res.json(formatted);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH: admin อัปเดตสถานะ
// PATCH: admin อัปเดตสถานะ
// 🔥 Multi-tenant: filter ด้วย shopId
app.patch("/api/reports/:id", requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const { id } = req.params;
    const { status } = req.body;

    const report = await AdminReport.findOneAndUpdate(
      { _id: id, shopId }, // 🔥 filter ด้วย shopId
      { status, updatedAt: new Date() },
      { new: true }
    );

    if (!report) {
      return res.status(404).json({ success: false, message: "NOT_FOUND" });
    }

    // Map _id to id for consistency
    const formatted = {
      id: report._id,
      reportId: report.reportId,
      detail: report.description,
      category: report.category,
      status: report.status,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt
    };

    // 🔥 แจ้ง Admin ของ shop นี้เท่านั้น
    io.to(shopId).emit('reportUpdated', formatted);

    res.json({ success: true, report: formatted });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==========================================
// CONFIG SWITCHES APIs (จาก realtime-server.js)
// 🔥 Multi-tenant: แต่ละ shop มี config ของตัวเอง
// ==========================================
/**
 * API ดึง system config ของ shop
 */
app.get('/api/status', requireShopId, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware

    // หา settings ของ shop นี้ หรือสร้างใหม่ถ้ายังไม่มี (Atomic operation)
    let settings = await ShopSetting.findOneAndUpdate(
      { shopId },
      {},
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // รวม systemConfig (from file) กับ settings (from DB)
    const config = {
      ...systemConfig, // Legacy config from settings.json
      ...settings.systemConfig, // Shop-specific config
      shopId: settings.shopId,
      displayTime: settings.displayTime,
      autoPlayEnabled: settings.autoPlayEnabled,
      birthdaySpendingRequirement: settings.birthdaySpendingRequirement
    };

    res.json(config);
  } catch (error) {
    console.error('[Admin] Error fetching status:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch status' });
  }
});

/**
 * API อัปเดต system config ของ shop
 */
app.post('/api/config/update', requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const updates = req.body;

    // อัปเดตใน Database
    let settings = await ShopSetting.findOneAndUpdate(
      { shopId },
      { systemConfig: updates },
      { upsert: true, new: true }
    );

    console.log(`[Admin][${shopId}] System config updated:`, Object.keys(updates));

    // รวม config
    const config = {
      ...systemConfig,
      ...updates,
      shopId: settings.shopId,
      displayTime: settings.displayTime,
      autoPlayEnabled: settings.autoPlayEnabled
    };

    // 🔥 แจ้ง clients ของ shop นี้
    io.to(shopId).emit('status', config);
    io.to(shopId).emit('configUpdate', config);

    res.json({ success: true, config });
  } catch (error) {
    console.error('[Admin] Error updating config:', error);
    res.status(500).json({ success: false, message: 'Config update failed' });
  }
});

// ==========================================
// SHOP PROFILE API (สำหรับ User Frontend ดึงข้อมูลร้านค้า)
// ==========================================
/**
 * API ดึงข้อมูล Profile ของร้านค้า (ชื่อร้าน, โลโก้) ไปแสดงบนหน้า User Frontend
 * 🔥 Multi-tenant: filter ด้วย shopId
 */
app.get('/api/shop/profile', requireShopId, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware

    // ค้นห้าข้อมูลร้านจาก AdminUser collection (ถ้ามีเก็บ name, logo ไว้ในนั้น)
    // หรือถ้าไม่ได้เก็บ ให้ส่งค่าเริ่มต้นกลับไปก่อน
    const adminUser = await AdminUser.findOne({ shopId }).lean();

    if (!adminUser) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    res.json({
      success: true,
      shop: {
        shopId: adminUser.shopId,
        name: adminUser.shopId || adminUser.username || "Shop",
        logo: adminUser.avatar || null // ใช้ avatar ของแอดมินหรือ logo ของร้านถ้ามีฟิลด์
      }
    });

  } catch (error) {
    console.error(`[ShopProfile] Error fetching profile for ${req.shopId}:`, error);
    res.status(500).json({ success: false, message: 'Failed to fetch shop profile' });
  }
});

// ==========================================
// TIME HISTORY APIs (จาก realtime-server.js)
// ==========================================
// 🔥 Multi-tenant: Admin ดูประวัติเวลาใช้งานของ shop ตัวเอง
app.get('/api/time-history', requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const history = await TimeHistory.find({ shopId }).sort({ createdAt: -1 });
    const formatted = history.map(h => ({
      id: h.id,
      mode: h.mode,
      date: h.date,
      duration: h.duration,
      time: h.time,
      price: h.price
    }));
    res.json(formatted);
  } catch (error) {
    console.error('Error fetching time history:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Alias สำหรับ check-history (ใช้โดย realtime-server.js) - DEPRECATED
// 🔥 Route นี้ซ้ำซ้อนกับ GET /api/check-history ที่ใช้ CheckHistory Model จริง
// ควรลบออกหรือเปลี่ยนมาใช้ GET /api/time-history แทน
// app.get('/api/check-history', async (req, res) => {
//   try {
//     const history = await TimeHistory.find({}).sort({ createdAt: -1 });
//     const formatted = history.map(h => ({
//       id: h.id,
//       mode: h.mode,
//       date: h.date,
//       duration: h.duration,
//       time: h.time,
//       price: h.price
//     }));
//     res.json(formatted);
//   } catch (error) {
//     console.error('Error fetching check history:', error);
//     res.status(500).json([]);
//   }
// });

app.post('/api/time-history', requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    const setting = await TimeHistory.create({ ...req.body, shopId }); // 🔥 บันทึก shopId
    io.to(shopId).emit('settingAdded', setting);
    res.json({ success: true, setting });
  } catch (error) {
    console.error('Error creating time history:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.delete('/api/time-history/:id', requireAdminAuth, async (req, res) => {
  try {
    const { shopId } = req; // ได้จาก middleware
    await TimeHistory.findOneAndDelete({ id: req.params.id, shopId }); // 🔥 filter ด้วย shopId
    io.to(shopId).emit('settingRemoved', { id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting time history:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==========================================
// GLOBAL PUBLIC RANKING STATE
// ==========================================
let publicRankingType = 'alltime'; // Default public display mode

// ==========================================
// REALTIME CONFIG STATE (merged from realtime-server.js)
// ==========================================
const settingsJsonPath = path.join(__dirname, "settings.json");

let realtimeConfig = {
  systemOn: true,
  enableImage: true,
  enableText: true,
  enableGift: true,
  enableBirthday: true,
  birthdaySpendingRequirement: 100,
  price: 100,
  time: 10,
  settings: [],
  publicRankingType: 'alltime'
};

// โหลด config เริ่มต้นจาก DB (TimeHistory) + settings.json
async function loadInitialConfig() {
  try {
    // โหลดประวัติจาก DB
    const history = await TimeHistory.find({}).sort({ createdAt: -1 });
    console.log("[Realtime] โหลดประวัติจาก DB:", history.length, "รายการ");

    // ซ่อมแซมอัตโนมัติ: แก้ไขฟิลด์ 'time' ที่หายไป
    for (const h of history) {
      if (!h.time && h.duration) {
        let seconds = 0;
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
    realtimeConfig.settings = history.map(h => ({
      id: h.id,
      mode: h.mode,
      date: h.date,
      duration: h.duration,
      time: h.time,
      price: h.price
    }));

    // โหลด runtime config จากไฟล์ (switches เปิด/ปิด)
    if (fs.existsSync(settingsJsonPath)) {
      const savedFile = JSON.parse(fs.readFileSync(settingsJsonPath, "utf8"));
      const { settings, ...rest } = savedFile;
      realtimeConfig = { ...realtimeConfig, ...rest };
    }

    // sync publicRankingType
    realtimeConfig.publicRankingType = publicRankingType;
    console.log("[Realtime] Config loaded successfully");
  } catch (error) {
    console.error("[Realtime] เกิดข้อผิดพลาดในการโหลด config:", error);
  }
}

// บันทึก runtime config (switches) ลงไฟล์ JSON
function saveRuntimeConfig() {
  try {
    const { settings, ...runtimeConfig } = realtimeConfig;
    fs.writeFileSync(settingsJsonPath, JSON.stringify(runtimeConfig, null, 2));
  } catch (err) {
    console.error("[Realtime] Error saving runtime config:", err);
  }
}

// โหลด config เมื่อ MongoDB พร้อม (เรียกหลัง connectDB)
mongoose.connection.once('open', () => {
  loadInitialConfig();
});

// API สำหรับดึง settings history จาก DB (สำหรับ realtime config)
app.get("/api/settings-history", async (req, res) => {
  try {
    const history = await TimeHistory.find({}).sort({ createdAt: -1 });
    const formatted = history.map(h => ({
      id: h.id,
      mode: h.mode,
      date: h.date,
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

// ==========================================
// SOCKET.IO CONNECTION HANDLER
// 🔥 Multi-tenant: รองรับ Rooms แยกตาม shopId
// ==========================================

// Helper สำหรับรวม systemConfig เข้ากับ settings(TimeHistory) เพื่อส่งให้ User Frontend
const getSystemConfigWithSettings = async (shopId) => {
  try {
    if (!shopId) return systemConfig;
    const history = await TimeHistory.find({ shopId }).sort({ createdAt: -1 });
    const settings = history.map(h => ({
      id: h.id,
      mode: h.mode,
      date: h.date,
      duration: h.duration,
      time: h.time,
      price: h.price
    }));
    return { ...systemConfig, settings };
  } catch (error) {
    console.error('Error fetching settings for status:', error);
    return systemConfig;
  }
};

io.on('connection', (socket) => {
  console.log('[Socket.IO] Client connected:', socket.id);

  // 🔥 รับ shopId จาก query parameter และ join room
  const shopId = socket.handshake.query.shopId;

  if (shopId) {
    socket.join(shopId); // Join room ตาม shopId
    console.log(`[Socket.IO] Client ${socket.id} joined room: ${shopId}`);

    // เก็บ shopId ใน socket object สำหรับใช้ใน events อื่นๆ
    socket.shopId = shopId;

    // ส่ง config ปัจจุบันให้ client ที่เพิ่งเชื่อมต่อ (room-specific)
    getSystemConfigWithSettings(shopId).then(config => {
      socket.emit('status', config);
    });
    socket.emit('publicRankingTypeUpdated', { type: publicRankingType });
  } else {
    console.warn(`[Socket.IO] Client ${socket.id} connected without shopId`);
  }

  // === CONFIG MANAGEMENT EVENTS (จาก realtime-server.js) ===
  socket.on('updateStatus', (newStatus) => {
    systemConfig = { ...systemConfig, ...newStatus };
    saveSystemConfig();
    // 🔥 Emit เฉพาะ Room ของ shop นี้
    if (socket.shopId) {
      getSystemConfigWithSettings(socket.shopId).then(config => {
        io.to(socket.shopId).emit('status', config);
      });
    }
  });

  socket.on('getConfig', async () => {
    const config = await getSystemConfigWithSettings(socket.shopId);
    socket.emit('status', config);
  });

  socket.on('adminUpdateConfig', (newConfig) => {
    systemConfig = { ...systemConfig, ...newConfig };
    saveSystemConfig();
    // 🔥 Emit เฉพาะ Room ของ shop นี้
    if (socket.shopId) {
      io.to(socket.shopId).emit('configUpdate', systemConfig);
    }
  });

  // === TIMEHISTORY MANAGEMENT EVENTS ===
  socket.on('addPackage', async (setting) => {
    try {
      // 🔥 ต้องบันทึก shopId
      if (!socket.shopId) {
        console.warn('[Socket.IO] addPackage called without shopId');
        return;
      }

      await TimeHistory.create({
        shopId: socket.shopId, // 🔥 เพิ่ม shopId
        id: String(setting.id), // 🔥 แปลงจาก Number เป็น String ให้ตรงกับ Model

        mode: setting.mode,
        date: setting.date,
        duration: setting.duration,
        time: setting.time,
        price: setting.price
      });
      console.log('[Socket.IO] TimeHistory added:', setting.id);
      // 🔥 Emit เฉพาะ Room ของ shop นี้
      if (socket.shopId) {
        io.to(socket.shopId).emit('settingAdded', setting);
        // อัปเดต status ให้ User Frontend รีโหลดแพ็คเกจ
        const config = await getSystemConfigWithSettings(socket.shopId);
        io.to(socket.shopId).emit('status', config);
      }
    } catch (error) {
      console.error('[Socket.IO] Error adding TimeHistory:', error);
    }
  });

  socket.on('removeSetting', async (id) => {
    try {
      // 🔥 filter ด้วย shopId
      if (!socket.shopId) {
        console.warn('[Socket.IO] removeSetting called without shopId');
        return;
      }

      await TimeHistory.findOneAndDelete({ id, shopId: socket.shopId });
      console.log('[Socket.IO] TimeHistory removed:', id);
      // 🔥 Emit เฉพาะ Room ของ shop นี้
      if (socket.shopId) {
        io.to(socket.shopId).emit('settingRemoved', { id });
        // อัปเดต status ให้ User Frontend รีโหลดแพ็คเกจ
        const config = await getSystemConfigWithSettings(socket.shopId);
        io.to(socket.shopId).emit('status', config);
      }
    } catch (error) {
      console.error('[Socket.IO] Error removing TimeHistory:', error);
    }
  });

  // === PERKS BROADCAST EVENT ===
  socket.on('adminUpdatePerks', (data) => {
    const { perks } = data;
    if (perks && Array.isArray(perks)) {
      console.log(`[Socket.IO] Broadcasting perks update: ${perks.length} items`);
      // 🔥 Emit เฉพาะ Room ของ shop นี้
      if (socket.shopId) {
        io.to(socket.shopId).emit('perksUpdated', { perks });
      }
    } else {
      console.warn('[Socket.IO] Invalid perks data received:', data);
    }
  });


  // รับสัญญาณหยุดชั่วคราวจาก Admin Panel
  socket.on('pause-display', (data) => {
    console.log('[Socket.IO] Pause display event received:', data);
    // 🔥 ส่งต่อไป OBS เฉพาะ Room
    if (socket.shopId) {
      io.to(socket.shopId).emit('pause-display', data);
    }
  });

  // รับสัญญาณเริ่มต่อจาก Admin Panel
  socket.on('resume-display', (data) => {
    console.log('[Socket.IO] Resume display event received:', data);
    // 🔥 ส่งต่อไป OBS เฉพาะ Room
    if (socket.shopId) {
      io.to(socket.shopId).emit('resume-display', data);
    }
  });

  // รับสัญญาณข้ามคิวจาก Admin Panel
  socket.on('skip-current', async () => {
    console.log('[Socket.IO] Skip current event received');
    // 🔥 ส่งต่อไป OBS เฉพาะ Room
    if (socket.shopId) {
      io.to(socket.shopId).emit('skip-current');
    }

    // ล้างสถานะ playing items ทั้งหมด → กลับเป็น approved เพื่อเข้าคิวใหม่
    try {
      const shopFilter = socket.shopId ? { shopId: socket.shopId, status: 'playing' } : { status: 'playing' };
      const result = await ImageQueue.updateMany(
        shopFilter,
        { $set: { status: 'approved' }, $unset: { playingAt: '' } }
      );
      if (result.modifiedCount > 0) {
        console.log(`[Socket.IO] Reset ${result.modifiedCount} playing items back to approved`);
        if (socket.shopId) {
          io.to(socket.shopId).emit('admin-update-queue');
        }
      }
      // รีเซ็ต delay เพื่อให้ QueueWorker เล่น item ถัดไปทันที
      nextPlayTime = 0;
    } catch (err) {
      console.error('[Socket.IO] Error resetting playing items:', err);
    }
  });

  // Complete playing (from OBS)
  socket.on('complete-playing', async (imageId) => {
    console.log('[Socket.IO] Complete playing event received for:', imageId);
    try {
      const item = await ImageQueue.findById(imageId);
      if (item) {
        await completeItem(item);
        console.log('[Socket.IO] Completed via completeItem:', imageId);
        // Start 15s delay for next item — emit only to the correct shop room
        nextPlayTime = Date.now() + 15000;
        const targetRoom = socket.shopId || item.shopId;
        if (targetRoom) {
          io.to(targetRoom).emit('pause-display', { remaining: 15, isCountingDown: true });
        } else {
          io.emit('pause-display', { remaining: 15, isCountingDown: true });
        }
      } else {
        console.log('[Socket.IO] Item not found (already completed):', imageId);
      }
    } catch (err) {
      console.error('[Socket.IO] Error completing:', err);
    }
  });

  // Handle public ranking type broadcast from Admin
  socket.on('setPublicRankingType', (data) => {
    const { type } = data;
    if (['daily', 'monthly', 'alltime'].includes(type)) {
      publicRankingType = type;
      console.log(`[Socket.IO] Public ranking type updated to: ${type}`);
      // 🔥 Broadcast to shop room only
      if (socket.shopId) {
        io.to(socket.shopId).emit('publicRankingTypeUpdated', { type: publicRankingType });
      }
    } else {
      console.warn(`[Socket.IO] Invalid ranking type received: ${type}`);
    }
  });

  // Handle Queue Reorder from Admin
  // 🔥 Multi-tenant: เก็บ customQueueOrder per shop
  socket.on('admin-reorder-queue', (orderIds) => {
    if (Array.isArray(orderIds) && socket.shopId) {
      const state = getShopState(socket.shopId);
      state.customQueueOrder = orderIds;
      console.log(`[Socket.IO] Queue order updated for shop ${socket.shopId}:`, state.customQueueOrder.length, 'items');
      // 🔥 Emit ไปยัง Room เฉพาะ
      io.to(socket.shopId).emit('queue-reordered', { orderIds });
    }
  });

  socket.on('disconnect', () => {
    console.log('[Socket.IO] Client disconnected:', socket.id);
  });
});



// ==========================================
// SERVER-SIDE QUEUE LOGIC
// 🔥 Multi-tenant: Per-shop state management
// ==========================================

// Per-shop state: { shopId: { nextPlayTime, customQueueOrder } }
const shopStates = new Map();

/**
 * Get or initialize state สำหรับ shop
 */
function getShopState(shopId) {
  if (!shopStates.has(shopId)) {
    shopStates.set(shopId, {
      nextPlayTime: 0,
      customQueueOrder: []
    });
  }
  return shopStates.get(shopId);
}

/**
 * Queue worker สำหรับแต่ละ shop
 * 🔥 Multi-tenant: รับ shopId parameter และ process only that shop's queue
 */
async function processAutoQueue(shopId) {
  try {
    const state = getShopState(shopId);

    // Check wait time
    if (Date.now() < state.nextPlayTime) {
      if (typeof io !== 'undefined') {
        const remaining = Math.ceil((state.nextPlayTime - Date.now()) / 1000);
        io.to(shopId).emit('pause-display', { remaining, isCountingDown: true });
      }
      return;
    }

    // 1. Find currently playing item FOR THIS SHOP
    const playingItem = await ImageQueue.findOne({ status: 'playing', shopId });

    if (playingItem) {
      // Calculate elapsed time
      if (playingItem.playingAt) {
        const startTime = new Date(playingItem.playingAt).getTime();
        const now = Date.now();
        const durationSec = playingItem.time || 10; // default 10s safety
        const elapsedSec = (now - startTime) / 1000;

        // If time expired (+ small buffer 0.5s)
        if (elapsedSec >= durationSec) {
          console.log(`[QueueWorker][${shopId}] Item ${playingItem._id} expired (${elapsedSec.toFixed(1)}/${durationSec}s). Completing...`);
          await completeItem(playingItem);

          // Start 15s Delay instead of immediate play
          console.log(`[QueueWorker][${shopId}] Starting 15s delay...`);
          state.nextPlayTime = Date.now() + 15000;
          if (typeof io !== 'undefined') io.to(shopId).emit('pause-display', { remaining: 15, isCountingDown: true });
        }
      } else {
        // If no playingAt, set it now? Or treat as just started?
        // Ideally should have been set. If missing, fix it.
        console.log(`[QueueWorker][${shopId}] Item ${playingItem._id} has no playingAt. Setting now.`);
        await ImageQueue.findByIdAndUpdate(playingItem._id, { playingAt: new Date() });
      }
    } else {
      // If nothing is playing, check if we should start something?
      // Only if there are approved items waiting and we aren't paused (we don't have global pause state on server yet easily)
      // For now, let's auto-play if there are approved items waiting, to keep queue moving.
      // But we need to be careful not to start if queue is empty or manually paused?
      // User said: "เวลามีรูปภาพที่กำลังแสดงอยู่แล้วไม่ได้เปิดเว็บนั้นค้างไว้เวลาจะไม่นับคูลดาว"
      // So continuous play is desired.

      const nextApproved = await ImageQueue.findOne({ status: 'approved', shopId }).sort({ approvedAt: 1 });
      if (nextApproved) {
        console.log(`[QueueWorker][${shopId}] Nothing playing, found approved item. Auto-starting...`);
        await playNextItem(shopId);
      }
    }

  } catch (err) {
    console.error(`[QueueWorker][${shopId}] Error:`, err);
  }
}

/**
 * Helper function สำหรับบันทึก item ที่เล่นเสร็จแล้ว
 * 🔥 Multi-tenant: บันทึก CheckHistory พร้อม shopId และ emit ต่อ room
 */
async function completeItem(item) {
  try {
    // Delete from Queue (Atomic mostly, if concurrently deleted by API, findByIdAndDelete returns null)
    const deleted = await ImageQueue.findByIdAndDelete(item._id);
    if (!deleted) return; // Already processed

    // 🔥 Create History with shopId
    // สำหรับ gift ใช้ giftOrder.orderId เป็น transactionId เพื่อให้ order-status ค้นหาเจอ
    const txId = (item.type === 'gift' && item.giftOrder?.orderId) ? item.giftOrder.orderId : item._id.toString();
    await CheckHistory.create({
      shopId: item.shopId, // 🔥 Multi-tenant
      transactionId: txId,
      type: item.type || (item.filePath ? 'image' : 'text'),
      sender: item.sender || 'Unknown',
      price: item.price || 0,
      status: 'completed',
      content: item.text || '',
      mediaUrl: item.filePath || null,
      userId: item.userId || null,
      email: item.email || null,
      avatar: item.avatar || null,
      metadata: {
        duration: item.time,
        tableNumber: Number(item.giftOrder?.tableNumber) || 0,
        giftItems: item.giftOrder?.items || [],
        note: item.giftOrder?.note || '',
        theme: item.textColor || 'white',
        socialColor: item.socialColor || '#ffffff',
        textLayout: item.textLayout || 'right',
        social: {
          type: item.socialType || null,
          name: item.socialName || null
        },
        qrCodePath: item.qrCodePath || null // Persist QR Code Path
      },
      receivedAt: item.receivedAt,
      approvalDate: item.approvedAt || new Date(),
      startedAt: item.playingAt,
      endedAt: new Date(),
      duration: item.time,
      approvedBy: 'system',
      notes: 'Completed by QueueWorker'
    });

    console.log(`[QueueWorker] Completed item ${item._id} for shop ${item.shopId}`);

    // 🔥 Notify clients of this shop only
    if (item.shopId) {
      io.to(item.shopId).emit("item-completed", { id: item._id, transactionId: item._id });
      io.to(item.shopId).emit("admin-update-queue"); // Sync admin UI
    }

  } catch (err) {
    console.error("[QueueWorker] Error completing item:", err);
  }
}

/**
 * Play next approved item in queue
 * 🔥 Multi-tenant: รับ shopId parameter และ play เฉพาะ shop นั้น
 */
async function playNextItem(shopId) {
  try {
    const state = getShopState(shopId);

    // 1. Get all approved items FOR THIS SHOP
    const approvedItems = await ImageQueue.find({ status: 'approved', shopId });

    if (approvedItems.length === 0) {
      console.log(`[QueueWorker][${shopId}] No approved items waiting.`);
      // 🔥 Emit queue-empty event to this shop's room
      io.to(shopId).emit('queue-empty');
      return;
    }

    // 2. Sort based on customQueueOrder
    approvedItems.sort((a, b) => {
      const idA = a._id.toString();
      const idB = b._id.toString();
      const indexA = state.customQueueOrder.indexOf(idA);
      const indexB = state.customQueueOrder.indexOf(idB);

      // If both in custom order, sort by index
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      // If only A in custom order, A comes first
      if (indexA !== -1) return -1;
      // If only B in custom order, B comes first
      if (indexB !== -1) return 1;

      // Fallback: Default FIFO by approvedAt or receivedAt
      return new Date(a.approvedAt || a.receivedAt) - new Date(b.approvedAt || b.receivedAt);
    });

    const nextItem = approvedItems[0];
    console.log(`[QueueWorker][${shopId}] Starting next item: ${nextItem._id} (Order Index: ${state.customQueueOrder.indexOf(nextItem._id.toString())})`);

    // Update status to playing
    const updated = await ImageQueue.findByIdAndUpdate(
      nextItem._id,
      {
        status: 'playing',
        playingAt: new Date()
      },
      { new: true }
    );

    if (updated) {
      // Broadcast to Overlay & Client
      // ถ้าเป็น Gift ให้ใช้ event พิเศษและส่งข้อมูลเพิ่มเติม
      if (updated.type === "gift" && updated.giftOrder) {
        console.log(`[QueueWorker][${shopId}] Sending now-playing-gift event`);
        // 🔥 Emit ไปยัง Room ของ shop นี้
        io.to(shopId).emit("now-playing-gift", {
          id: updated._id?.toString(),
          sender: updated.sender || "Guest",
          avatar: updated.avatar || null,
          tableNumber: updated.giftOrder.tableNumber || 1,
          items: updated.giftOrder.items || [],
          note: updated.giftOrder.note || "",
          totalPrice: updated.giftOrder.totalPrice || updated.price || 0,
          time: updated.time,
          type: "gift",
          playingAt: updated.playingAt
        });
      } else {
        console.log(`[QueueWorker][${shopId}] Sending now-playing-image event`);
        // 🔥 Emit ไปยัง Room ของ shop นี้
        io.to(shopId).emit("now-playing-image", {
          id: updated._id.toString(),
          sender: updated.sender,
          price: updated.price,
          time: updated.time,
          filePath: updated.filePath,
          text: updated.text,
          textColor: updated.textColor || '#ffffff',
          socialColor: updated.socialColor || '#ffffff',
          textLayout: updated.textLayout || 'right',
          socialType: updated.socialType,
          socialName: updated.socialName,
          qrCodePath: updated.qrCodePath,
          width: updated.width,
          height: updated.height,
          type: updated.type || (updated.filePath ? "image" : "text"),
          playingAt: updated.playingAt
        });
      }

      // Update Admin UI
      // 🔥 Emit ไปยัง Room ของ shop นี้
      io.to(shopId).emit("admin-update-queue");
    }

  } catch (err) {
    console.error(`[QueueWorker][${shopId}] Error starting next item:`, err);
  }
}



// --- Lucky Wheel API ---
// 🔥 Multi-tenant: Lucky Wheel ของแต่ละ shop
app.post('/api/lucky-wheel/spin', requireAdminAuth, (req, res) => {
  const { shopId } = req; // ได้จาก middleware
  const { segments, winnerIndex, reward } = req.body;

  if (!segments || winnerIndex === undefined) {
    return res.status(400).json({ error: 'Missing segments or winnerIndex' });
  }
  console.log(`[LuckyWheel][${shopId}] Spin event received. Winner Index:`, winnerIndex);

  // Broadcast to connected clients of this shop (including OBS)
  io.to(shopId).emit('lucky-wheel-spin', {
    segments,
    winnerIndex,
    reward,
    timestamp: Date.now()
  });

  return res.json({ success: true, message: 'Spin event broadcasted' });
});

// To clear/hide the wheel on OBS manually if needed
// 🔥 Multi-tenant: Hide wheel ของแต่ละ shop
app.post('/api/lucky-wheel/hide', requireAdminAuth, (req, res) => {
  const { shopId } = req; // ได้จาก middleware
  io.to(shopId).emit('lucky-wheel-hide');
  return res.json({ success: true, message: 'Hide event broadcasted' });
});

// Broadcast preview/update event
// 🔥 Multi-tenant: Preview ของแต่ละ shop
app.post('/api/lucky-wheel/preview', requireAdminAuth, (req, res) => {
  const { shopId } = req; // ได้จาก middleware
  const { segments } = req.body;
  if (!segments) return res.status(400).json({ error: 'Missing segments' });

  io.to(shopId).emit('lucky-wheel-preview', { segments });
  return res.json({ success: true });
});

// ===== API: เปลี่ยน Shop ID (ชื่อร้านค้า) =====
app.post("/api/admin/change-shopid", requireAdminAuth, async (req, res) => {
  try {
    const { newShopId } = req.body;
    const adminId = req.adminId; // จาก token auth/middleware
    const oldShopId = req.shopId;

    if (!newShopId || typeof newShopId !== 'string') {
      return res.status(400).json({ success: false, message: "ระบุชื่อร้านค้าใหม่ไม่ถูกต้อง" });
    }

    const trimmedNewShopId = newShopId.trim();

    if (trimmedNewShopId.length > 40) {
      return res.status(400).json({ success: false, message: "ชื่อร้านค้าต้องไม่เกิน 40 ตัวอักษร" });
    }

    if (trimmedNewShopId === oldShopId) {
      return res.status(400).json({ success: false, message: "ชื่อร้านค้านี้กำลังใช้งานอยู่แล้ว" });
    }

    // 1. ตรวจสอบว่า Shop ID ใหม่ซ้ำกับของคนอื่นหรือไม่
    const existingAdmin = await AdminUser.findOne({ shopId: trimmedNewShopId });
    if (existingAdmin) {
      return res.status(400).json({ success: false, message: "ชื่อร้านค้านี้มีผู้ใช้งานแล้ว โปรดเลือกชื่ออื่น" });
    }

    // 2. อัปเดต Shop ID ใน AdminUser
    await AdminUser.findByIdAndUpdate(adminId, { shopId: trimmedNewShopId });

    // 3. ย้าย ShopSetting ไปยัง Shop ID ใหม่ (ถ้ามี)
    const oldSettings = await ShopSetting.findOne({ shopId: oldShopId });
    if (oldSettings) {
      // โคลน Setting เดิมและเปลี่ยน ID
      const settingsData = oldSettings.toObject();
      delete settingsData._id;
      delete settingsData.__v;
      settingsData.shopId = trimmedNewShopId;

      await ShopSetting.create(settingsData);
      // 🔥 Optional: หากต้องการลบอันเก่าออก
      await ShopSetting.deleteOne({ _id: oldSettings._id });
    }

    // แจ้งเตือนไปยัง socket ทุกคนที่อยู่ในห้องเก่า (ทาง frontend จะรีคอนเนกต์ใหม่เองเมื่อรับค่าใหม่)
    io.to(oldShopId).emit("shop-id-changed", { newShopId: trimmedNewShopId });

    res.json({
      success: true,
      message: "เปลี่ยนชื่อร้านค้าสำเร็จ",
      newShopId: trimmedNewShopId
    });
  } catch (error) {
    console.error("[Admin API] Error changing shopId:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
});

// ===== ADMIN LOGIN ENDPOINT =====
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอก Username และ Password'
      });
    }

    // Find admin user from DB
    const admin = await AdminUser.findOne({ username });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Username หรือ Password ไม่ถูกต้อง'
      });
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, admin.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Username หรือ Password ไม่ถูกต้อง'
      });
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Return success พร้อม shopId
    res.json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      user: {
        id: admin._id,
        username: admin.username,
        role: admin.role,
        shopId: admin.shopId // 🔥 Multi-tenant: ส่ง shopId กลับไป
      }
    });

  } catch (error) {
    console.error('[Login] Error:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ'
    });
  }
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5001;
server.listen(PORT, async () => {
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  console.log(`[Admin] Server + Socket.IO running on port ${PORT}`);
  console.log(`Health check: ${baseUrl}/health`);
  console.log(`Queue API: ${baseUrl}/api/queue`);
  console.log(`Login API: ${baseUrl}/login`);

  // โหลดและแสดงผู้ใช้ที่มีอยู่
  try {
    const users = await loadUsers();
    // Users loaded successfully
  } catch (error) {
    console.error("Error loading users:", error);
  }

  // Start Server-Side Queue Worker
  // 🔥 Multi-tenant: Loop through all active shops
  console.log("[QueueWorker] Starting 1s interval loop for all shops...");
  setInterval(async () => {
    try {
      // ดึงรายการ shopId ที่มี queue active (pending, approved, หรือ playing)
      const activeShops = await ImageQueue.distinct('shopId', {
        status: { $in: ['pending', 'approved', 'playing'] }
      });

      // Process queue for each shop
      for (const shopId of activeShops) {
        await processAutoQueue(shopId);
      }
    } catch (error) {
      console.error('[QueueWorker] Error in main loop:', error);
    }
  }, 1000);
});
