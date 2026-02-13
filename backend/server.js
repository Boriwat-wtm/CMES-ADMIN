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
import AdminUser from './models/AdminUser.js'; // Keep AdminUser import
import ImageQueue from './models/ImageQueue.js'; // 🔥 Image Queue Model
import { verifyPassword, hashPassword } from './hashPasswords.js'; // Keep password utilities import

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*" }
});

// เชื่อมต่อ MongoDB
async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      dbName: 'cmes-admin'
    });
    console.log(`[MongoDB] Connected to ${conn.connection.host} (DB: cmes-admin)`);
  } catch (error) {
    console.error('[MongoDB] Connection failed:', error.message);
    process.exit(1);
  }
}
connectDB();

// ===== CLOUDINARY CONFIGURATION =====
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dfcqbb9pt', 
  api_key: process.env.CLOUDINARY_API_KEY || '396185692714272', 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log("[Admin] ✓ Cloudinary configured:", {
  cloud_name: cloudinary.config().cloud_name,
  api_key: cloudinary.config().api_key ? '***' + cloudinary.config().api_key.slice(-4) : 'NOT SET'
});

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
    // อนุญาต requests ที่ไม่มี origin (เช่น Render internal calls)
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
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// JSON Body Parser Middleware (สำคัญ!)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static overlay assets
app.use(express.static(path.join(__dirname, "public")));

// สร้างโฟลเดอร์ถ้ายังไม่มี
const giftUploadDir = path.join(__dirname, 'uploads/gifts');
const userUploadDir = path.join(__dirname, 'uploads/user-uploads');

if (!fs.existsSync(giftUploadDir)) fs.mkdirSync(giftUploadDir, { recursive: true });
if (!fs.existsSync(userUploadDir)) fs.mkdirSync(userUploadDir, { recursive: true });

// Serve static files
app.use("/uploads/gifts", express.static(giftUploadDir));
app.use("/uploads/user-uploads", express.static(userUploadDir));
app.use("/uploads/qr-codes", express.static(path.join(__dirname, 'uploads/qr-codes')));
// Legacy support
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- Cloudinary Storage Configuration ---

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

// 2. User Upload Storage (Cloudinary)
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

// Note: Cron cleanup removed - Cloudinary manages storage automatically

// ----- Ranking Storage (using Database) -----
async function addRankingPoint(userId, name, amount, email = null, avatar = null) {
  try {
    console.log(`[Ranking] addRankingPoint called: userId=${userId}, name=${name}, amount=${amount}, email=${email}`);

    const points = Number(amount);
    if (isNaN(points) || points <= 0) {
      console.log("[Ranking] Skipping: invalid points");
      return;
    }

    // ต้องมี userId จึงจะบันทึก ranking
    if (!userId || userId === "guest" || userId === "unknown") {
      console.log("[Ranking] Skipping guest/unknown user");
      return;
    }

    const userName = (name || "Guest").trim() || "Guest";
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    let ranking = await Ranking.findOne({ userId });
    if (ranking) {
      // Update all-time points
      ranking.points = (ranking.points || 0) + points;

      // Update daily points (reset if date changed)
      if (ranking.dailyDate !== today) {
        ranking.dailyPoints = points;
        ranking.dailyDate = today;
      } else {
        ranking.dailyPoints = (ranking.dailyPoints || 0) + points;
      }

      // Update monthly points (reset if month changed)
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
      console.log(`[Ranking] Updated ${userName} (${userId}): +${points} points, total: ${ranking.points}, daily: ${ranking.dailyPoints}, monthly: ${ranking.monthlyPoints}`);
    } else {
      ranking = await Ranking.create({
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
      console.log(`[Ranking] Created ${userName} (${userId}): ${points} points`);
    }

    // Broadcast ranking update
    const topRankings = await Ranking.find({}).sort({ points: -1 }).limit(10);
    // Re-calculate ranks just in case (though pre-save handles it, bulk fetch is safer for display)
    const formattedRankings = topRankings.map((r, index) => ({
      ...r.toObject(),
      rank: index + 1
    }));
    // Use global io instance if available, otherwise we need to pass it or export it
    // Assuming 'io' is available in this scope (it is defined at top level but this function is outside?)
    // Wait, 'io' is defined in server.js scope.
    // But addRankingPoint is defined at the bottom. Let's check scope.
    // 'io' is defined at line 28. 'addRankingPoint' is at line 126.
    // However, 'io' is const. It should be available if addRankingPoint is in the same file.
    // But wait, I need to make sure 'io' is accessible.
    // Let's check if I can access 'io'.
    // Actually, I'll just emit if io is defined.
    if (typeof io !== 'undefined') {
      io.emit("ranking-update", formattedRankings);
    }
  } catch (error) {
    console.error("[Ranking] Error adding points:", error.message);
  }
}

// 🔥 ImageQueue now uses MongoDB (see ImageQueue model)
let giftSettings = {
  tableCount: 10,
  items: []
};

// Load gift settings
const giftSettingsPath = path.join(__dirname, "gift-settings.json");
if (fs.existsSync(giftSettingsPath)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(giftSettingsPath, "utf8"));
    giftSettings = { ...giftSettings, ...loaded };
  } catch (error) {
    console.warn("Failed to read gift-settings.json, using defaults", error);
  }
} else {
  fs.writeFileSync(giftSettingsPath, JSON.stringify(giftSettings, null, 2));
}

function saveGiftSettings() {
  fs.writeFileSync(giftSettingsPath, JSON.stringify(giftSettings, null, 2));
}

// เก็บประวัติการตรวจสอบ (using Database)
// เปลี่ยนจาก JSON array เป็น checkHistoryIndex สำหรับความสำดวก
let checkHistoryIndex = {};

// ฟังก์ชันโหลดข้อมูลผู้ใช้จาก users.json
async function loadUsers() {
  try {
    const data = await fs.promises.readFile("users.json", "utf8");
    return JSON.parse(data);
  } catch (error) {
    // สร้างผู้ใช้เริ่มต้นถ้าไม่มีไฟล์
    const defaultUsers = [
      { username: "admin", password: await hashPassword("admin123") },
      { username: "cms1", password: await hashPassword("dfhy1785") },
      { username: "cms2", password: await hashPassword("sdgsd5996") },
    ];

    await fs.promises.writeFile("users.json", JSON.stringify(defaultUsers, null, 2));
    return defaultUsers;
  }
}

// ฟังก์ชันค้นหาผู้ใช้
async function findUser(username) {
  try {
    const user = await AdminUser.findOne({ username });
    return user;
  } catch (error) {
    console.error('[Admin] Error finding user:', error.message);
    return null;
  }
}

// ===== GIFT SETTINGS API =====
app.get("/api/gifts/settings", async (req, res) => {
  try {
    const gifts = await GiftSetting.find({});
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

// Helper to sync JSON with DB
async function syncGiftSettingsFromDB() {
  const gifts = await GiftSetting.find({});
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

app.post("/api/gifts/items", async (req, res) => {
  try {
    const { name, price, description, imageUrl } = req.body;
    if (!name || !price) {
      return res.status(400).json({ success: false, message: "กรุณาระบุชื่อสินค้าและราคา" });
    }

    const newGift = new GiftSetting({
      giftId: Date.now().toString(),
      giftName: name.trim(),
      price: Number(price) || 0,
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

    // Sync with DB to ensure consistency
    await syncGiftSettingsFromDB();

    res.json({ success: true, item, settings: giftSettings });
  } catch (error) {
    console.error("Error creating gift:", error);
    res.status(500).json({ success: false, message: "Failed to create gift" });
  }
});

app.put("/api/gifts/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, description, imageUrl } = req.body;

    const updatedGift = await GiftSetting.findByIdAndUpdate(
      id,
      {
        ...(name && { giftName: name.trim() }),
        ...(price !== undefined && { price: Number(price) || 0 }),
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

    // Sync with DB to ensure consistency
    await syncGiftSettingsFromDB();

    res.json({ success: true, item, settings: giftSettings });
  } catch (error) {
    console.error("Error updating gift:", error);
    res.status(500).json({ success: false, message: "Failed to update gift" });
  }
});

// Helper function to delete image
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

app.delete("/api/gifts/items/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deletedGift = await GiftSetting.findByIdAndDelete(id);

    if (!deletedGift) {
      return res.status(404).json({ success: false, message: "ไม่พบรายการ" });
    }

    // Delete image file if exists
    if (deletedGift.image) {
      deleteImageFile(deletedGift.image);
    }

    // Sync with DB to ensure consistency
    await syncGiftSettingsFromDB();

    res.json({ success: true, settings: giftSettings });
  } catch (error) {
    console.error("Error deleting gift:", error);
    res.status(500).json({ success: false, message: "Failed to delete gift" });
  }
});

app.patch("/api/gifts/table-count", (req, res) => {
  const { tableCount } = req.body;
  const parsed = Number(tableCount);
  if (!parsed || parsed < 1) {
    return res.status(400).json({ success: false, message: "จำนวนโต๊ะไม่ถูกต้อง" });
  }
  giftSettings.tableCount = parsed;
  saveGiftSettings();
  res.json({ success: true, tableCount: parsed });
});

// API สำหรับอัปโหลดรูปภาพ Gift (ใช้ giftStorage)
app.post("/api/gifts/upload", uploadGift.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    // Cloudinary returns URL in req.file.path
    const fileUrl = req.file.path;
    console.log("[Admin] ✓ Gift image uploaded to Cloudinary:", fileUrl);
    res.json({ success: true, url: fileUrl });
  } catch (error) {
    console.error("Error uploading gift:", error);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
});

// ===== Ranking APIs =====

// ดึง ranking ทั้งหมดหรือตามจำนวนที่กำหนด (รองรับทั้ง daily, monthly, alltime)
app.get("/api/rankings", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const type = req.query.type || "alltime"; // daily, monthly, alltime

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    let query = {};
    let sortField = { points: -1 };

    if (type === "daily") {
      query = { dailyDate: today };
      sortField = { dailyPoints: -1 };
    } else if (type === "monthly") {
      query = { monthlyPeriod: currentMonth };
      sortField = { monthlyPoints: -1 };
    }

    const rankings = await Ranking.find(query)
      .sort(sortField)
      .limit(limit)
      .lean();

    // Add position field
    const ranksWithPosition = rankings.map((r, idx) => ({
      ...r,
      position: idx + 1
    }));

    res.json({
      success: true,
      ranks: ranksWithPosition,
      total: await Ranking.countDocuments(query),
      totalUsers: await Ranking.countDocuments(query),
      type: type
    });
  } catch (error) {
    console.error("Error fetching rankings:", error);
    res.status(500).json({ success: false, message: "Failed to fetch rankings" });
  }
});

// ดึง top 3 สำหรับ backward compatibility
app.get("/api/rankings/top", async (req, res) => {
  try {
    const type = req.query.type || "alltime";
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = new Date().toISOString().slice(0, 7);

    let query = {};
    let sortField = { points: -1 };

    if (type === "daily") {
      query = { dailyDate: today };
      sortField = { dailyPoints: -1 };
    } else if (type === "monthly") {
      query = { monthlyPeriod: currentMonth };
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

// อัปเดต avatar ของ user ใน ranking (ถูกเรียกจาก User Backend เมื่อมีการเปลี่ยน avatar)
app.put("/api/rankings/update-avatar", async (req, res) => {
  try {
    const { userId, email, avatar, username } = req.body;

    if (!userId && !email) {
      return res.status(400).json({
        success: false,
        message: "userId or email is required"
      });
    }

    // หา ranking record โดยใช้ userId หรือ email
    let query = {};
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
      console.log(`[Ranking] Avatar updated for user ${ranking.name} (${ranking.userId})`);
      
      return res.json({
        success: true,
        message: "Avatar updated successfully"
      });
    } else {
      // ถ้ายังไม่มี ranking record ก็ไม่ต้องสร้าง (จะสร้างตอนซื้อครั้งแรก)
      console.log(`[Ranking] No ranking record found for user, will create on first purchase`);
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

// ===== Birthday Spending Requirement APIs =====

// ดึงค่า birthday spending requirement
app.get("/api/config/birthday-requirement", (req, res) => {
  try {
    const settingsPath = path.join(__dirname, "settings.json");
    let birthdayRequirement = 100; // default

    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      birthdayRequirement = settings.birthdaySpendingRequirement || 100;
    }

    res.json({
      success: true,
      birthdaySpendingRequirement: birthdayRequirement
    });
  } catch (error) {
    console.error("Error fetching birthday requirement:", error);
    res.status(500).json({ success: false, message: "Failed to fetch birthday requirement" });
  }
});

// อัปเดตค่า birthday spending requirement
app.post("/api/config/birthday-requirement", (req, res) => {
  try {
    const { birthdaySpendingRequirement } = req.body;
    const requirement = Number(birthdaySpendingRequirement);

    if (isNaN(requirement) || requirement < 0) {
      return res.status(400).json({
        success: false,
        message: "ยอดเงินไม่ถูกต้อง"
      });
    }

    const settingsPath = path.join(__dirname, "settings.json");
    let settings = {};

    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    }

    settings.birthdaySpendingRequirement = requirement;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    console.log(`[Admin] Birthday spending requirement updated to: ${requirement}`);

    res.json({
      success: true,
      birthdaySpendingRequirement: requirement
    });
  } catch (error) {
    console.error("Error updating birthday requirement:", error);
    res.status(500).json({ success: false, message: "Failed to update birthday requirement" });
  }
});

// ===== Perks Management APIs =====

// ดึงรายการสิทธิพิเศษ
app.get("/api/config/perks", (req, res) => {
  try {
    const settingsPath = path.join(__dirname, "settings.json");
    let perks = [
      "🎁 แล้งข้อแลวโปรไฟล์ฟรีกับหน้าอันดับผู้สนับสนุน",
      "🌟 ป้าย Diamond/Gold/Silver ที่ช่วยแยกความโดดเด่น",
      "💎 สิทธิเข้าถึงโปรโมชั่นพิเศษหรือกิจกรรมทดลองใหม่",
      "💬 ช่องทางติดต่อทีมเซทอัพสำหรับแคลงค่า"
    ]; // default perks

    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (settings.perks && Array.isArray(settings.perks) && settings.perks.length > 0) {
        perks = settings.perks;
      }
    }

    res.json({
      success: true,
      perks: perks
    });
  } catch (error) {
    console.error("Error fetching perks:", error);
    res.status(500).json({ success: false, message: "Failed to fetch perks" });
  }
});

// อัปเดตรายการสิทธิพิเศษ
app.post("/api/config/perks", (req, res) => {
  try {
    const { perks } = req.body;

    if (!Array.isArray(perks) || perks.length === 0) {
      return res.status(400).json({
        success: false,
        message: "ต้องมีสิทธิพิเศษอย่างน้อย 1 รายการ"
      });
    }

    // Validate each perk is a non-empty string
    const validPerks = perks.filter(perk => typeof perk === 'string' && perk.trim().length > 0);

    if (validPerks.length === 0) {
      return res.status(400).json({
        success: false,
        message: "สิทธิพิเศษต้องเป็นข้อความที่ไม่ว่างเปล่า"
      });
    }

    const settingsPath = path.join(__dirname, "settings.json");
    let settings = {};

    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    }

    settings.perks = validPerks;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    console.log(`[Admin] Perks updated. Total: ${validPerks.length} perks`);

    res.json({
      success: true,
      perks: validPerks
    });
  } catch (error) {
    console.error("Error updating perks:", error);
    res.status(500).json({ success: false, message: "Failed to update perks" });
  }
});

// ตรวจสอบว่า user มีสิทธิ์ใช้ฟีเจอร์วันเกิดหรือไม่
app.get("/api/birthday-eligibility/:email", async (req, res) => {
  try {
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

    // ดึงยอดใช้จ่ายของ user จาก email
    const userRanking = await Ranking.findOne({ email });
    const totalSpent = userRanking ? (userRanking.points || 0) : 0;

    // ดึงค่า requirement
    const settingsPath = path.join(__dirname, "settings.json");
    let birthdayRequirement = 100;

    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      birthdayRequirement = settings.birthdaySpendingRequirement || 100;
    }

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


app.post("/api/gifts/order", async (req, res) => {
  try {
    console.log("[Admin] Received gift order:", JSON.stringify(req.body, null, 2));

    const { orderId, sender, userId, email, avatar, tableNumber, note, items, totalPrice } = req.body;

    console.log("[Admin] Parsed data: userId=", userId, "sender=", sender, "price=", totalPrice);

    if (!orderId || !tableNumber || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "ข้อมูลคำสั่งซื้อไม่ครบ" });
    }

    // เติมข้อมูล image จาก GiftSetting ถ้าไม่มี
    const enrichedItems = await Promise.all(items.map(async (item) => {
      if (!item.image && item.id) {
        try {
          const giftSetting = await GiftSetting.findById(item.id);
          if (giftSetting && giftSetting.image) {
            return { ...item, image: giftSetting.image };
          }
        } catch (err) {
          console.warn("[Admin] Could not find gift setting for:", item.id);
        }
      }
      return item;
    }));

    console.log("[Admin] Enriched items with images:", enrichedItems);

    const queueData = {
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
      console.log("[Admin] Calling addRankingPoint for userId:", userId);
      addRankingPoint(userId, sender, Number(totalPrice) || 0, email, avatar);
    } else {
      console.log("[Admin] No userId provided, skipping ranking");
    }

    res.json({ success: true, queueItem });
  } catch (error) {

    console.error("Gift order push failed", error);
    res.status(500).json({ success: false, message: "บันทึกคำสั่งซื้อไม่สำเร็จ" });
  }
});

// API สำหรับรับข้อมูลจาก User backend
app.post("/api/upload", uploadUser, async (req, res) => {
  try {
    console.log("=== Upload request received ===");
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

    console.log("[Admin] Creating upload item with type:", type);

    const itemData = {
      type: type || "image",
      text: text || "",
      time: Number(time) || 0,
      price: Number(price) || 0,
      sender: sender || "Unknown",
      textColor: textColor || "white",
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

    // Notify admins for real-time update
    io.emit("new-upload", queueItem);

    // บันทึก ranking เฉพาะ user ที่ login แล้ว (ไม่บันทึกสำหรับ birthday เพราะฟรี)
    // ย้ายไปทำหลังชำระเงินแล้ว
    // if (userId && type !== "birthday") {
    //   addRankingPoint(userId, sender, Number(price) || 0, email, avatar);
    // }
    console.log("[Admin] Upload item created and queued:", queueItem._id, "type:", queueItem.type);
    res.json({ success: true, uploadId: queueItem._id.toString() });
  } catch (e) {
    console.error("[Admin] Error in upload:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// API สำหรับดูคิวรูปภาพ - เรียงตามวันที่เวลา (เก่าไปใหม่)
app.get("/api/queue", async (req, res) => {
  try {
    console.log("=== Queue request received");

    // ดึงรายการที่ยังไม่เสร็จ (pending + approved + playing) - ไม่รวม payment_pending
    const queueItems = await ImageQueue.find({ status: { $in: ['pending', 'approved', 'playing'] } })
      .sort({ receivedAt: 1 })
      .lean();

    console.log("Current queue length:", queueItems.length);
    console.log("Returning sorted images from MongoDB");
    res.json(queueItems);
  } catch (error) {
    console.error('Error fetching queue:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API สำหรับยืนยันการชำระเงินและเข้าคิว
app.post("/api/confirm-payment/:uploadId", async (req, res) => {
  try {
    const { uploadId } = req.params;
    const { userId, email, avatar } = req.body;

    console.log(`[Admin] Confirming payment for upload: ${uploadId}`);

    // ค้นหา queue item
    const queueItem = await ImageQueue.findById(uploadId);

    if (!queueItem) {
      console.log("[Admin] Upload not found");
      return res.status(404).json({ success: false, error: "ไม่พบข้อมูลการอัปโหลด" });
    }

    if (queueItem.status !== "payment_pending") {
      console.log("[Admin] Upload already processed or invalid status:", queueItem.status);
      return res.status(400).json({ success: false, error: "สถานะการอัปโหลดไม่ถูกต้อง" });
    }

    // เปลี่ยนสถานะเป็น pending เพื่อให้เข้าคิว
    queueItem.status = "pending";
    queueItem.confirmedAt = new Date();
    await queueItem.save();

    // บันทึก ranking เฉพาะ user ที่ login แล้ว (ไม่บันทึกสำหรับ birthday เพราะฟรี)
    if (userId && queueItem.type !== "birthday" && queueItem.price > 0) {
      addRankingPoint(userId, queueItem.sender, queueItem.price, email, avatar);
    }

    console.log("[Admin] Payment confirmed, item moved to queue");
    res.json({ success: true, queueItem });
  } catch (error) {
    console.error("[Admin] Error confirming payment:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API สำหรับอัพเดทสถานะรูปที่กำลังแสดง + broadcast ไป OBS overlay
app.post("/api/playing/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("=== Marking as playing:", id);

    // Find any currently playing items and complete them first (Force complete)
    const currentlyPlaying = await ImageQueue.find({ status: 'playing', _id: { $ne: id } });
    for (const playingItem of currentlyPlaying) {
      console.log(`[Auto-Complete] Force completing stuck item: ${playingItem._id}`);

      // Use shared function
      await completeItem(playingItem);
    }

    // Update status to 'playing'
    const updated = await ImageQueue.findByIdAndUpdate(
      id,
      {
        status: 'playing',
        playingAt: new Date()
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Item not found' });
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
      console.log('[Playing] Sending now-playing-gift event');
      io.emit("now-playing-gift", {
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
      console.log('[Playing] Sending now-playing-image event (not gift)');
      io.emit("now-playing-image", {
        id: updated._id?.toString(),
        sender: updated.sender,
        price: updated.price,
        time: updated.time,
        filePath: updated.filePath,
        text: updated.text,
        textColor: updated.textColor,
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
app.post("/api/approve/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { width, height } = req.body; // รับค่า width, height จาก body
    console.log("=== Approving image:", id, "Size:", width, "x", height);

    const item = await ImageQueue.findById(id);

    if (!item) {
      return res.status(404).json({ success: false, message: 'Image not found' });
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

    // Notify all admins to update their lists
    io.emit("admin-update-queue");

    res.json({ success: true, message: 'Item approved' });
  } catch (error) {
    console.error('Error approving image:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API สำหรับปฏิเสธรูปภาพ (บันทึกลง CheckHistory Database)
app.post("/api/reject/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("=== Rejecting image:", id);

    const item = await ImageQueue.findById(id);

    if (!item) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }

    // บันทึกลง CheckHistory ก่อนลบ
    await CheckHistory.create({
      transactionId: item._id.toString(),
      type: item.type || (item.filePath ? 'image' : 'text'),
      sender: item.sender || 'Unknown',
      price: item.price || 0,
      status: 'rejected',
      content: item.text || '',
      mediaUrl: item.filePath || null,
      metadata: {
        duration: item.time,
        tableNumber: Number(item.giftOrder?.tableNumber) || 0,
        giftItems: item.giftOrder?.items || [],
        note: item.giftOrder?.note || '',
        theme: item.textColor || 'white',
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

    // Notify all admins to update their lists
    io.emit("admin-update-queue");

    res.json({ success: true, message: 'Item rejected and saved to history' });
  } catch (error) {
    console.error('Error rejecting image:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API สำหรับบันทึกรูปที่เล่นจบแล้ว (เมื่อหมดเวลา)
app.post("/api/complete/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("=== Completing image manually:", id);

    const item = await ImageQueue.findById(id);
    if (!item) {
      return res.json({ success: true, message: 'Already processed or not found' });
    }

    // Use shared function
    await completeItem(item);

    // Start 15s Delay
    console.log("[API] Manual complete, starting 15s delay...");
    nextPlayTime = Date.now() + 15000;
    if (typeof io !== 'undefined') io.emit('pause-display', { remaining: 15, isCountingDown: true });

    res.json({ success: true, message: 'Item completed and saved to history' });
  } catch (error) {
    console.error('Error completing image:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API สำหรับนำรายการจากประวัติกลับเข้าคิว
app.post("/api/history/restore/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("[Restore] Restoring history ID:", id);

    const historyItem = await CheckHistory.findById(id);
    if (!historyItem) {
      return res.status(404).json({ success: false, message: 'History item not found' });
    }

    // สร้างรายการใหม่ใน ImageQueue พร้อมคืน QR Code
    const newQueueItem = await ImageQueue.create({
      sender: historyItem.sender || 'Unknown',
      price: historyItem.price || 0,
      time: historyItem.duration || historyItem.metadata?.duration || 10,
      filePath: historyItem.mediaUrl || null,
      text: historyItem.content || '',
      textColor: historyItem.metadata?.theme || 'white',
      socialType: historyItem.metadata?.social?.type || null,
      socialName: historyItem.metadata?.social?.name || null,
      qrCodePath: historyItem.metadata?.qrCodePath || null,
      type: historyItem.type || 'image',
      status: 'pending',
      receivedAt: new Date(),
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
app.get("/api/check-history", async (req, res) => {
  try {
    const history = await CheckHistory.find({}).sort({ approvalDate: -1 });

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
app.post("/api/delete-history", async (req, res) => {
  try {
    const { id } = req.body;

    // Find before delete to remove image
    const deletedItem = await CheckHistory.findByIdAndDelete(id);

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

// API สำหรับดึงประวัติ (สำหรับ ImageQueue history modal)
app.get("/api/history", async (req, res) => {
  try {
    const history = await CheckHistory.find({}).sort({ approvalDate: -1 }).limit(50);
    res.json(history);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



// API สำหรับตรวจสอบสถานะออเดอร์ (สำหรับ User frontend)
app.get("/api/order-status/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    console.log("[OrderStatus] Checking status for:", orderId);

    // 1. ค้นหาใน ImageQueue ตามสถานะต่างๆ
    let query = { 'giftOrder.orderId': orderId };

    // ถ้า orderId เป็น valid ObjectId ให้ค้นหาด้วย _id ด้วย
    if (orderId.match(/^[0-9a-fA-F]{24}$/)) {
      query = {
        $or: [
          { _id: orderId },
          { 'giftOrder.orderId': orderId }
        ]
      };
    }

    console.log("[OrderStatus] Query:", JSON.stringify(query));

    const queueItem = await ImageQueue.findOne(query);

    if (!queueItem) {
      // ไม่พบใน ImageQueue -> ค้นหาใน CheckHistory (rejected/completed)
      console.log("[OrderStatus] Not found in ImageQueue, checking CheckHistory");
      const historyItem = await CheckHistory.findOne({
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
            approvalDate: historyItem.approvalDate,
            tableNumber: historyItem.metadata?.tableNumber || null,
            giftItems: historyItem.metadata?.giftItems || null
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
      const queuePosition = await ImageQueue.countDocuments({
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
          totalQueue: await ImageQueue.countDocuments({ status: 'pending' }),
          tableNumber: queueItem.giftOrder?.tableNumber || null,
          giftItems: queueItem.giftOrder?.items || null,
          waitingForApproval: true
        }
      });
    }

    if (queueItem.status === 'approved') {
      // สถานะอนุมัติแล้ว รอแสดง - คำนวณเวลาจาก playing + approved queue
      const statusText = 'อนุมัติแล้ว รอแสดง';

      // หาภาพที่กำลังแสดงอยู่
      const currentlyPlaying = await ImageQueue.findOne({ status: 'playing' });

      let totalSecondsBefore = 0;

      // ถ้ามีรูปกำลังแสดง คำนวณเวลาที่เหลือ
      if (currentlyPlaying && currentlyPlaying.playingAt) {
        const playingDuration = currentlyPlaying.time; // วินาที
        const playingStartTime = new Date(currentlyPlaying.playingAt);
        const elapsedSeconds = (Date.now() - playingStartTime.getTime()) / 1000;
        const remainingSeconds = Math.max(0, playingDuration - elapsedSeconds);
        totalSecondsBefore += remainingSeconds;
      }

      // หาคิว approved ที่อยู่ก่อนหน้า (เรียงตาม approvedAt)
      const approvedBefore = await ImageQueue.find({
        status: 'approved',
        approvedAt: { $lt: queueItem.approvedAt }
      }).sort({ approvedAt: 1 });

      // รวมเวลาของคิว approved ที่อยู่ก่อนหน้า
      totalSecondsBefore += approvedBefore.reduce((sum, item) => {
        return sum + (item.time || 0);
      }, 0);

      // นับตำแหน่งคิว (approved + playing ที่เริ่มก่อน)
      const approvedPosition = approvedBefore.length + (currentlyPlaying ? 1 : 0) + 1;
      const totalApproved = await ImageQueue.countDocuments({ status: 'approved' });

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
          giftItems: queueItem.giftOrder?.items || null
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
          giftItems: queueItem.giftOrder?.items || null
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

// ลบทั้งหมด
app.post("/api/delete-all-history", async (req, res) => {
  try {
    // ดึงข้อมูลทั้งหมดเพื่อลบรูป
    const allHistory = await CheckHistory.find({});

    // วนลบรูปภาพทีละรายการ
    for (const item of allHistory) {
      const imagePath = item.mediaUrl || item.filePath;
      if (imagePath) {
        deleteImageFile(imagePath);
      }
    }

    // ลบข้อมูลใน DB
    await CheckHistory.deleteMany({});
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting all history:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API สำหรับลบรูปภาพที่ถูกปฏิเสธ
app.delete("/api/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const item = await ImageQueue.findById(id);

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
app.post("/api/report", async (req, res) => {
  try {
    const { reportId, category, detail } = req.body;

    // ตรวจสอบข้อมูล
    if (!category || !detail || !detail.trim()) {
      return res.status(400).json({ success: false, message: "INVALID_DATA" });
    }

    const report = await AdminReport.create({
      reportId: reportId || Date.now().toString(),
      category: category || "other",
      description: detail.trim(),
      status: "new"  // เปลี่ยนจาก open เป็น new ให้ตรงกับ Admin Frontend
    });

    console.log('Report saved successfully to database');
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
app.get("/api/reports", async (req, res) => {
  try {
    const reports = await AdminReport.find({}).sort({ createdAt: -1 });
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
app.patch("/api/reports/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const report = await AdminReport.findByIdAndUpdate(
      id,
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

    res.json({ success: true, report: formatted });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==========================================
// GLOBAL PUBLIC RANKING STATE
// ==========================================
let publicRankingType = 'alltime'; // Default public display mode

// ==========================================
// SOCKET.IO CONNECTION HANDLER
// ==========================================
io.on('connection', (socket) => {
  console.log('[Socket.IO] Client connected:', socket.id);

  // Send current public ranking type to newly connected client
  socket.emit('publicRankingTypeUpdated', { type: publicRankingType });

  // รับสัญญาณหยุดชั่วคราวจาก Admin Panel
  socket.on('pause-display', (data) => {
    console.log('[Socket.IO] Pause display event received:', data);
    // ส่งต่อไป OBS
    io.emit('pause-display', data);
  });

  // รับสัญญาณเริ่มต่อจาก Admin Panel
  socket.on('resume-display', (data) => {
    console.log('[Socket.IO] Resume display event received:', data);
    // ส่งต่อไป OBS
    io.emit('resume-display', data);
  });

  // รับสัญญาณข้ามคิวจาก Admin Panel
  socket.on('skip-current', () => {
    console.log('[Socket.IO] Skip current event received');
    // ส่งต่อไป OBS ให้ซ่อนการแสดงทันที
    io.emit('skip-current');
  });

  // Complete playing (from OBS)
  socket.on('complete-playing', async (imageId) => {
    console.log('[Socket.IO] Complete playing event received for:', imageId);
    try {
      await ImageQueue.findByIdAndUpdate(imageId, { status: 'completed' });
      console.log('[Socket.IO] Marked as completed:', imageId);
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
      // Broadcast to ALL clients (Admin + Users)
      io.emit('publicRankingTypeUpdated', { type: publicRankingType });
    } else {
      console.warn(`[Socket.IO] Invalid ranking type received: ${type}`);
    }
  });

  // Handle Queue Reorder from Admin
  socket.on('admin-reorder-queue', (orderIds) => {
    if (Array.isArray(orderIds)) {
      customQueueOrder = orderIds;
      console.log('[Socket.IO] Queue order updated:', customQueueOrder.length, 'items');
    }
  });

  socket.on('disconnect', () => {
    console.log('[Socket.IO] Client disconnected:', socket.id);
  });
});



// ==========================================
// SERVER-SIDE QUEUE LOGIC
// ==========================================

let nextPlayTime = 0; // Global delay tracker
let customQueueOrder = []; // Store admin's custom queue order

async function processAutoQueue() {
  try {
    // Check wait time
    if (Date.now() < nextPlayTime) {
      if (typeof io !== 'undefined') {
        const remaining = Math.ceil((nextPlayTime - Date.now()) / 1000);
        io.emit('pause-display', { remaining, isCountingDown: true });
      }
      return;
    }

    // 1. Find currently playing item
    const playingItem = await ImageQueue.findOne({ status: 'playing' });

    if (playingItem) {
      // Calculate elapsed time
      if (playingItem.playingAt) {
        const startTime = new Date(playingItem.playingAt).getTime();
        const now = Date.now();
        const durationSec = playingItem.time || 10; // default 10s safety
        const elapsedSec = (now - startTime) / 1000;

        // If time expired (+ small buffer 0.5s)
        if (elapsedSec >= durationSec) {
          console.log(`[QueueWorker] Item ${playingItem._id} expired (${elapsedSec.toFixed(1)}/${durationSec}s). Completing...`);
          await completeItem(playingItem);

          // Start 15s Delay instead of immediate play
          console.log("[QueueWorker] Starting 15s delay...");
          nextPlayTime = Date.now() + 15000;
          if (typeof io !== 'undefined') io.emit('pause-display', { remaining: 15, isCountingDown: true });
        }
      } else {
        // If no playingAt, set it now? Or treat as just started?
        // Ideally should have been set. If missing, fix it.
        console.log(`[QueueWorker] Item ${playingItem._id} has no playingAt. Setting now.`);
        await ImageQueue.findByIdAndUpdate(playingItem._id, { playingAt: new Date() });
      }
    } else {
      // If nothing is playing, check if we should start something?
      // Only if there are approved items waiting and we aren't paused (we don't have global pause state on server yet easily)
      // For now, let's auto-play if there are approved items waiting, to keep queue moving.
      // But we need to be careful not to start if queue is empty or manually paused?
      // User said: "เวลามีรูปภาพที่กำลังแสดงอยู่แล้วไม่ได้เปิดเว็บนั้นค้างไว้เวลาจะไม่นับคูลดาว"
      // So continuous play is desired.

      const nextApproved = await ImageQueue.findOne({ status: 'approved' }).sort({ approvedAt: 1 });
      if (nextApproved) {
        console.log("[QueueWorker] Nothing playing, found approved item. Auto-starting...");
        await playNextItem();
      }
    }

  } catch (err) {
    console.error("[QueueWorker] Error:", err);
  }
}

async function completeItem(item) {
  try {
    // Delete from Queue (Atomic mostly, if concurrently deleted by API, findByIdAndDelete returns null)
    const deleted = await ImageQueue.findByIdAndDelete(item._id);
    if (!deleted) return; // Already processed

    // Create History
    await CheckHistory.create({
      transactionId: item._id.toString(),
      type: item.type || (item.filePath ? 'image' : 'text'),
      sender: item.sender || 'Unknown',
      price: item.price || 0,
      status: 'completed',
      content: item.text || '',
      mediaUrl: item.filePath || null,
      metadata: {
        duration: item.time,
        tableNumber: Number(item.giftOrder?.tableNumber) || 0,
        giftItems: item.giftOrder?.items || [],
        note: item.giftOrder?.note || '',
        theme: item.textColor || 'white',
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

    console.log(`[QueueWorker] Completed item ${item._id}`);

    // Notify clients that item is done (optional, but good for UI sync)
    io.emit("item-completed", { id: item._id, transactionId: item._id });
    io.emit("admin-update-queue"); // Sync admin UI

  } catch (err) {
    console.error("[QueueWorker] Error completing item:", err);
  }
}

async function playNextItem() {
  try {
    // 1. Get all approved items
    const approvedItems = await ImageQueue.find({ status: 'approved' });

    if (approvedItems.length === 0) {
      console.log("[QueueWorker] No approved items waiting.");
      io.emit("queue-empty");
      return;
    }

    // 2. Sort based on customQueueOrder
    approvedItems.sort((a, b) => {
      const idA = a._id.toString();
      const idB = b._id.toString();
      const indexA = customQueueOrder.indexOf(idA);
      const indexB = customQueueOrder.indexOf(idB);

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
    console.log(`[QueueWorker] Starting next item: ${nextItem._id} (Order Index: ${customQueueOrder.indexOf(nextItem._id.toString())})`);

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
        console.log('[QueueWorker] Sending now-playing-gift event');
        io.emit("now-playing-gift", {
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
        console.log('[QueueWorker] Sending now-playing-image event');
        io.emit("now-playing-image", {
          id: updated._id.toString(),
          sender: updated.sender,
          price: updated.price,
          time: updated.time,
          filePath: updated.filePath,
          text: updated.text,
          textColor: updated.textColor,
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
      io.emit("admin-update-queue");
    }

  } catch (err) {
    console.error("[QueueWorker] Error starting next item:", err);
  }
}



// --- Lucky Wheel API ---
app.post('/api/lucky-wheel/spin', (req, res) => {
  const { segments, winnerIndex, reward } = req.body;

  if (!segments || winnerIndex === undefined) {
    return res.status(400).json({ error: 'Missing segments or winnerIndex' });
  }

  console.log('[LuckyWheel] Spin event received. Winner Index:', winnerIndex);

  // Broadcast to all connected clients (including OBS)
  io.emit('lucky-wheel-spin', {
    segments,
    winnerIndex,
    reward,
    timestamp: Date.now()
  });

  return res.json({ success: true, message: 'Spin event broadcasted' });
});

// To clear/hide the wheel on OBS manually if needed
app.post('/api/lucky-wheel/hide', (req, res) => {
  io.emit('lucky-wheel-hide');
  return res.json({ success: true, message: 'Hide event broadcasted' });
});

// Broadcast preview/update event
app.post('/api/lucky-wheel/preview', (req, res) => {
  const { segments } = req.body;
  if (!segments) return res.status(400).json({ error: 'Missing segments' });

  io.emit('lucky-wheel-preview', { segments });
  return res.json({ success: true });
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

    // Return success
    res.json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      user: {
        id: admin._id,
        username: admin.username,
        role: admin.role
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
  console.log("[QueueWorker] Starting 1s interval loop...");
  setInterval(processAutoQueue, 1000);
});
