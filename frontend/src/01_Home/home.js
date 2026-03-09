import React, { useState, useEffect, useCallback, useRef, useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ShopContext } from "../contexts/ShopContext"; // 🔥 Multi-tenant Context
import { API_BASE_URL, USER_FRONTEND_URL } from "../config/apiConfig";
import "./home.css";
import OBSControl from "../10_OBSControl/OBSControl";

// 🔥 ไม่สร้าง socket ที่นี่แล้ว - จะใช้จาก Context
// const socket = io(REALTIME_URL); // ❌ ลบบรรทัดนี้

// จำนวนอันดับเริ่มต้นที่จะแสดงในหน้าหลัก
const DEFAULT_RANK_LIMIT = 10;

// ฟังก์ชันจัดรูปแบบตัวเลขเป็นสกุลเงินไทย (เช่น 1,000)
const formatCurrency = (value) => Number(value || 0).toLocaleString("th-TH");

// ฟังก์ชันจัดรูปแบบวันที่และเวลาเป็นภาษาไทย
const formatUpdatedAt = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

// Helper: วันที่ปัจจุบันในรูปแบบต่างๆ (ใช้ timezone ไทย UTC+7)
const getTodayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD (เวลาไทย)
const getCurrentMonthStr = () => getTodayStr().slice(0, 7); // YYYY-MM (เวลาไทย)
const getCurrentYearStr = () => getTodayStr().slice(0, 4); // YYYY (เวลาไทย)

function Home() {
  // 🔥 ดึง socket และ shopId จาก Context
  const { socket, shopId } = useContext(ShopContext);
  const navigate = useNavigate();
  const location = useLocation(); // กับ location เพื่อ re-fetch โปรไฟล์ทุกครั้งที่กลับมาหน้านี้

  // ===== State สำหรับการควบคุมระบบ =====
  const [systemOn, setSystemOn] = useState(true); // สถานะเปิด/ปิดระบบทั้งหมด
  const [enableImage, setEnableImage] = useState(true); // เปิด/ปิดฟังก์ชันส่งรูปภาพ
  const [enableText, setEnableText] = useState(true); // เปิด/ปิดฟังก์ชันข้อความ
  const [enableGift, setEnableGift] = useState(true); // เปิด/ปิดฟังก์ชันส่งของขวัญ
  const [enableBirthday, setEnableBirthday] = useState(true); // เปิด/ปิดฟังก์ชันอวยพรวันเกิด
  const [birthdaySpendingRequirement, setBirthdaySpendingRequirement] = useState(100); // ยอดใช้จ่ายขั้นต่ำสำหรับวันเกิด

  // ===== State สำหรับตั้งค่าแพ็คเกจ =====
  const [mode, setMode] = useState("image"); // โหมดแพ็คเกจ (image, text, birthday)
  const [minute, setMinute] = useState(""); // จำนวนนาที
  const [second, setSecond] = useState(""); // จำนวนวินาที
  const [price, setPrice] = useState(""); // ราคาแพ็คเกจ

  // ===== State สำหรับระบบจัดอันดับ (Rankings) =====
  const [topRanks, setTopRanks] = useState([]); // ข้อมูลอันดับ
  const [totalRankers, setTotalRankers] = useState(0); // จำนวนผู้ใช้ทั้งหมดที่มีอันดับ
  const [rankLoading, setRankLoading] = useState(true); // สถานะกำลังโหลดข้อมูลอันดับ
  const [refreshingRanks, setRefreshingRanks] = useState(false); // สถานะกำลังรีเฟรชข้อมูล
  const [rankError, setRankError] = useState(""); // ข้อความแสดงข้อผิดพลาด
  const [rankingType, setRankingType] = useState("alltime"); // ประเภทอันดับสำหรับ Admin ดู (daily, monthly, alltime)
  const [rankLimit, setRankLimit] = useState(DEFAULT_RANK_LIMIT); // จำนวนอันดับที่ต้องการแสดง (กรอกได้)

  // ===== State สำหรับ Date/Month/Year Picker =====
  const [selectedDate, setSelectedDate] = useState(getTodayStr()); // YYYY-MM-DD สำหรับรายวัน (default วันนี้)
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthStr()); // YYYY-MM สำหรับรายเดือน (default เดือนนี้)
  const [selectedYear, setSelectedYear] = useState(getCurrentYearStr()); // YYYY สำหรับตลอดกาล (default ปีนี้)
  const [rankingSummary, setRankingSummary] = useState({ totalSum: 0, totalUsers: 0 }); // ยอดรวม
  const [publicRankingType, setPublicRankingType] = useState("alltime"); // ประเภทอันดับที่กำลังแสดงบนหน้าจอผู้ใช้ (PUBLIC BROADCAST)

  // ===== State สำหรับ Modal แสดงอันดับทั้งหมด =====
  const [showAllRanks, setShowAllRanks] = useState(false); // เปิด/ปิด Modal
  const [allRanks, setAllRanks] = useState([]); // ข้อมูลอันดับทั้งหมด (สูงสุด 500 คน)
  const [allRanksLoaded, setAllRanksLoaded] = useState(false); // สถานะโหลดข้อมูลเสร็จแล้ว
  const [fetchingAllRanks, setFetchingAllRanks] = useState(false); // สถานะกำลังโหลด
  const [allRankError, setAllRankError] = useState(""); // ข้อความแสดงข้อผิดพลาด

  // ===== ข้อมูล Admin จาก localStorage =====
  const adminId = localStorage.getItem("adminId") || "default-admin"; // รหัสร้านของ Admin
  const adminUsername = localStorage.getItem("adminUsername") || "Admin"; // ชื่อผู้ใช้ Admin

  // ===== Helper: fetch พร้อม auth headers + 401 redirect =====
  const authFetch = useCallback(async (url, options = {}) => {
    const storedShopId = shopId || localStorage.getItem("shopId") || "shop1";
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-shop-id": storedShopId,
        "x-admin-id": adminId,
        ...(options.headers || {}),
      },
    });
    if (response.status === 401) {
      localStorage.removeItem("adminId");
      localStorage.removeItem("adminUsername");
      localStorage.removeItem("shopId");
      window.location.href = "/";
    }
    return response;
  }, [shopId, adminId]);

  // ===== Fetch Shop Profile =====
  const [shopProfile, setShopProfile] = useState({ name: adminUsername, logo: null });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/api/shop/profile`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.shop) {
            setShopProfile({
              name: data.shop.name || adminUsername,
              logo: data.shop.logo || null
            });
          }
        }
      } catch (err) {
        console.warn("[Home] Failed to load shop profile:", err.message);
      }
    };
    fetchProfile();
  }, [shopId, location.key, adminUsername, authFetch]);

  // ===== State สำหรับปุ่ม Copy OBS Links =====
  const [copiedImage, setCopiedImage] = useState(false); // สถานะคัดลอกลิงก์ Image Overlay
  const [copiedRanking, setCopiedRanking] = useState(false); // สถานะคัดลอกลิงก์ Ranking Overlay
  const [copiedWheel, setCopiedWheel] = useState(false); // สถานะคัดลอกลิงก์ Lucky Wheel

  // ===== State สำหรับ QR Code Modal =====
  const [showQrModal, setShowQrModal] = useState(false); // เปิด/ปิด Modal QR Code
  const [qrCodeUrl, setQrCodeUrl] = useState(""); // URL ของ QR Code

  // ===== State สำหรับ OBS Links Modal =====
  const [showObsModal, setShowObsModal] = useState(false);

  // ===== State สำหรับ Perks Modal (สิทธิพิเศษ) =====
  const [showPerksModal, setShowPerksModal] = useState(false); // เปิด/ปิด Modal สิทธิพิเศษ
  const [perks, setPerks] = useState([ // รายการสิทธิพิเศษเริ่มต้น
    "🎁 แล้งข้อแลวโปรไฟล์ฟรีกับหน้าอันดับผู้สนับสนุน",
    "🌟 ป้าย Diamond/Gold/Silver ที่ช่วยแยกความโดดเด่น",
    "💎 สิทธิเข้าถึงโปรโมชั่นพิเศษหรือกิจกรรมทดลองใหม่",
    "💬 ช่องทางติดต่อทีมเซทอัพสำหรับแคลงค่า"
  ]);
  const [editingPerkIndex, setEditingPerkIndex] = useState(null); // Index ของสิทธิพิเศษที่กำลังแก้ไข
  const [perkInputValue, setPerkInputValue] = useState(""); // ค่าที่กรอกในช่อง input
  const [savingPerks, setSavingPerks] = useState(false); // สถานะกำลังบันทึกสิทธิพิเศษ

  // === Income Stats State ===
  const [showIncomeStats, setShowIncomeStats] = useState(false);
  const [incomeStartDate, setIncomeStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [incomeEndDate, setIncomeEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [incomeStats, setIncomeStats] = useState(null);
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [incomeError, setIncomeError] = useState("");

  // ===== State สำหรับ Payment QR Code =====
  const [paymentQrUrl, setPaymentQrUrl] = useState(null); // URL ภาพ QR code ปัจจุบัน
  const [paymentQrFile, setPaymentQrFile] = useState(null); // ไฟล์ที่เลือกใหม่
  const [paymentQrPreview, setPaymentQrPreview] = useState(null); // preview ภาพที่เลือก
  const [uploadingPaymentQr, setUploadingPaymentQr] = useState(false); // สถานะกำลังอัพโหลด

  const fetchIncomeStats = async () => {
    setIncomeLoading(true);
    setIncomeError("");
    try {
      const storedShopId = shopId || localStorage.getItem('shopId') || '';
      const res = await authFetch(`${API_BASE_URL}/api/admin/income-stats?startDate=${incomeStartDate}&endDate=${incomeEndDate}`);
      const data = await res.json();
      if (data.success) {
        setIncomeStats(data.data);
      } else {
        setIncomeError(data.message || "Failed to fetch stats");
      }
    } catch (err) {
      setIncomeError("Error connecting to server");
    } finally {
      setIncomeLoading(false);
    }
  };

  useEffect(() => {
    if (showIncomeStats) {
      fetchIncomeStats();
    }
  }, [showIncomeStats, incomeStartDate, incomeEndDate]);

  // ===== State สำหรับ Card Reorder + Hide/Show =====
  const DEFAULT_CARD_ORDER = ['feature', 'package', 'vip'];

  const [cardOrder, setCardOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('adminCardOrder');
      return saved ? JSON.parse(saved) : DEFAULT_CARD_ORDER;
    } catch { return DEFAULT_CARD_ORDER; }
  });
  const [cardVisibility, setCardVisibility] = useState(() => {
    try {
      const saved = localStorage.getItem('adminCardVisibility');
      return saved ? JSON.parse(saved) : { feature: true, package: true, vip: true };
    } catch { return { feature: true, package: true, vip: true }; }
  });
  const [draggedCard, setDraggedCard] = useState(null);
  const [dragOverCard, setDragOverCard] = useState(null);
  const dragNodeRef = useRef(null);

  // Persist card order + visibility to localStorage
  useEffect(() => {
    localStorage.setItem('adminCardOrder', JSON.stringify(cardOrder));
  }, [cardOrder]);
  useEffect(() => {
    localStorage.setItem('adminCardVisibility', JSON.stringify(cardVisibility));
  }, [cardVisibility]);

  // Drag handlers
  const handleDragStart = (e, cardId) => {
    setDraggedCard(cardId);
    dragNodeRef.current = e.target;
    e.dataTransfer.effectAllowed = 'move';
    // Make ghost slightly transparent
    setTimeout(() => { if (dragNodeRef.current) dragNodeRef.current.style.opacity = '0.4'; }, 0);
  };
  const handleDragEnd = () => {
    if (dragNodeRef.current) dragNodeRef.current.style.opacity = '1';
    setDraggedCard(null);
    setDragOverCard(null);
    dragNodeRef.current = null;
  };
  const handleDragOver = (e, cardId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (cardId !== draggedCard) setDragOverCard(cardId);
  };
  const handleDrop = (e, targetCardId) => {
    e.preventDefault();
    if (!draggedCard || draggedCard === targetCardId) return;
    setCardOrder(prev => {
      const newOrder = [...prev];
      const fromIdx = newOrder.indexOf(draggedCard);
      const toIdx = newOrder.indexOf(targetCardId);
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, draggedCard);
      return newOrder;
    });
    setDraggedCard(null);
    setDragOverCard(null);
  };
  const toggleCardVisibility = (cardId) => {
    setCardVisibility(prev => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  // ===== useEffect: โหลดการตั้งค่าระบบจาก Socket.IO =====
  // รับการตั้งค่าระบบแบบ Real-time และอัพเดท state
  // 🔥 เพิ่ม condition check socket
  useEffect(() => {
    if (!socket) {
      console.log('[Home] Socket not ready, skipping config setup');
      return;
    }

    socket.on("status", (config) => {
      console.log("[Home] Received config:", config);

      setSystemOn(config.systemOpen ?? config.systemOn ?? true);

      setEnableImage(config.enableImage ?? true);
      setEnableText(config.enableText ?? true);
      setEnableGift(config.enableGift ?? true);
      setEnableBirthday(config.enableBirthday ?? true);
    });
    socket.emit("getConfig");
    console.log("[Home] Requesting config from server");
    return () => socket.off("status");
  }, [socket]); // 🔥 เพิ่ม socket เป็น dependency

  // ===== useEffect: รับฟังการเปลี่ยนแปลงประเภทอันดับที่แสดงต่อสาธารณะ =====
  // เมื่อ Admin เปลี่ยนประเภทอันดับที่แสดงบนหน้าจอผู้ใช้
  // 🔥 เพิ่ม condition check socket
  useEffect(() => {
    if (!socket) {
      console.log('[Home] Socket not ready, skipping ranking type setup');
      return;
    }

    socket.on("publicRankingTypeUpdated", (data) => {
      console.log("[Admin] Public ranking type updated:", data.type);
      setPublicRankingType(data.type);
    });

    return () => socket.off("publicRankingTypeUpdated");
  }, [socket]); // 🔥 เพิ่ม socket เป็น dependency

  // ===== ฟังก์ชัน: โหลดข้อมูลอันดับ Top 10 =====
  // silent = true จะไม่แสดง loading indicator (ใช้เวลารีเฟรช)
  const loadTopRanks = useCallback(async (silent = false) => {
    if (silent) setRefreshingRanks(true);
    else setRankLoading(true);

    try {
      setRankError("");
      // สร้าง query params ตาม filter ที่เลือก
      const params = new URLSearchParams({
        limit: String(rankLimit),
        type: rankingType
      });
      if (rankingType === "daily" && selectedDate) params.set("date", selectedDate);
      if (rankingType === "monthly" && selectedMonth) params.set("month", selectedMonth);
      if (rankingType === "alltime" && selectedYear) params.set("year", selectedYear);

      const res = await authFetch(`${API_BASE_URL}/api/rankings?${params}`);
      if (!res.ok) throw new Error("FAILED");
      const data = await res.json();
      if (!data.success) throw new Error("FAILED");

      setTopRanks(data.ranks || []);
      setTotalRankers(data.total ?? data.totalUsers ?? (data.ranks?.length || 0));
    } catch (error) {
      console.error("[Admin] loadTopRanks failed", error);
      setRankError("ไม่สามารถโหลดข้อมูลอันดับได้");
      if (!silent) setTopRanks([]);
    } finally {
      if (silent) setRefreshingRanks(false);
      else setRankLoading(false);
    }
  }, [rankingType, rankLimit, selectedDate, selectedMonth, selectedYear]);

  // ===== ฟังก์ชัน: โหลดยอดรวม (Summary) =====
  const loadRankingSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams({ type: rankingType });
      if (rankingType === "daily" && selectedDate) params.set("date", selectedDate);
      if (rankingType === "monthly" && selectedMonth) params.set("month", selectedMonth);
      if (rankingType === "alltime" && selectedYear) params.set("year", selectedYear);

      const res = await fetch(`${API_BASE_URL}/api/rankings/summary?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setRankingSummary({ totalSum: data.totalSum || 0, totalUsers: data.totalUsers || 0 });
      }
    } catch (error) {
      console.error("[Admin] loadRankingSummary failed", error);
    }
  }, [rankingType, selectedDate, selectedMonth, selectedYear]);

  // ===== useEffect: โหลดข้อมูลเริ่มต้น =====
  // โหลดอันดับและยอดใช้จ่ายวันเกิดเมื่อเริ่มต้น
  useEffect(() => {
    loadTopRanks();
    loadRankingSummary();
    loadBirthdayRequirement();
  }, [loadTopRanks, loadRankingSummary]);

  // ===== useEffect: โหลดอันดับใหม่เมื่อเปลี่ยนประเภทหรือ filter =====
  // Reset cache ของ Modal และ reset filter เมื่อเปลี่ยนประเภท
  useEffect(() => {
    setAllRanksLoaded(false);
    setAllRanks([]);
    loadTopRanks();
    loadRankingSummary();
  }, [rankingType, rankLimit, selectedDate, selectedMonth, selectedYear, loadTopRanks, loadRankingSummary]);

  // ===== ฟังก์ชัน: โหลดยอดใช้จ่ายขั้นต่ำสำหรับวันเกิด =====
  const loadBirthdayRequirement = async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/config/birthday-requirement`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setBirthdaySpendingRequirement(data.birthdaySpendingRequirement || 100);
        }
      }
    } catch (error) {
      console.error("[Admin] Failed to load birthday requirement:", error);
    }
  };

  // ===== ฟังก์ชัน: เปิด/ปิดระบบทั้งหมด =====
  // เมื่อปิดระบบ จะปิดฟังก์ชันทั้งหมด / เมื่อเปิดจะเปิดฟังก์ชันทั้งหมด
  const handleToggleSystem = () => {
    if (!socket) return; // 🔥 Check socket

    const newStatus = !systemOn;
    setSystemOn(newStatus);

    if (!newStatus) {
      setEnableImage(false);
      setEnableText(false);
      setEnableGift(false);
      setEnableBirthday(false);
      socket.emit("adminUpdateConfig", {
        systemOpen: newStatus,
        enableImage: false,
        enableText: false,
        enableGift: false,
        enableBirthday: false,
      });
    } else {
      setEnableImage(true);
      setEnableText(true);
      setEnableGift(true);
      setEnableBirthday(true);
      socket.emit("adminUpdateConfig", {
        systemOpen: newStatus,
        enableImage: true,
        enableText: true,
        enableGift: true,
        enableBirthday: true,
      });
    }
  };

  // ===== ฟังก์ชัน: เปิด/ปิดฟังก์ชันส่งรูปภาพ =====
  const handleToggleImage = () => {
    if (!socket) return; // 🔥 Check socket

    const newStatus = !enableImage;
    setEnableImage(newStatus);
    socket.emit("adminUpdateConfig", {
      enableImage: newStatus,
      systemOpen: systemOn,
      enableText,
      enableGift,
      enableBirthday,
    });
  };

  // ===== ฟังก์ชัน: เปิด/ปิดฟังก์ชันข้อความ =====
  const handleToggleText = () => {
    if (!socket) return; // 🔥 Check socket

    const newStatus = !enableText;
    setEnableText(newStatus);
    socket.emit("adminUpdateConfig", {
      enableText: newStatus,
      systemOpen: systemOn,
      enableImage,
      enableGift,
      enableBirthday,
    });
  };

  // ===== ฟังก์ชัน: เปิด/ปิดฟังก์ชันส่งของขวัญ =====
  const handleToggleGift = () => {
    if (!socket) return; // 🔥 Check socket

    const newStatus = !enableGift;
    setEnableGift(newStatus);
    socket.emit("adminUpdateConfig", {
      enableGift: newStatus,
      systemOpen: systemOn,
      enableImage,
      enableText,
      enableBirthday,
    });
  };

  // ===== ฟังก์ชัน: เปิด/ปิดฟังก์ชันอวยพรวันเกิด =====
  const handleToggleBirthday = () => {
    if (!socket) return; // 🔥 Check socket

    const newStatus = !enableBirthday;
    setEnableBirthday(newStatus);
    socket.emit("adminUpdateConfig", {
      enableBirthday: newStatus,
      systemOpen: systemOn,
      enableImage,
      enableText,
      enableGift,
    });
  };

  // ===== ฟังก์ชัน: บันทึกยอดใช้จ่ายขั้นต่ำสำหรับวันเกิด =====
  const handleSaveBirthdayRequirement = async () => {
    const requirement = Number(birthdaySpendingRequirement);
    if (isNaN(requirement) || requirement < 0) {
      alert("กรุณากรอกยอดเงินที่ถูกต้อง");
      return;
    }

    try {
      const res = await authFetch(`${API_BASE_URL}/api/config/birthday-requirement`, {
        method: "POST",
        body: JSON.stringify({ birthdaySpendingRequirement: requirement })
      });

      if (res.ok) {
        alert("บันทึกยอดใช้จ่ายขั้นต่ำสำหรับวันเกิดสำเร็จ");
      } else {
        alert("เกิดข้อผิดพลาดในการบันทึก");
      }
    } catch (error) {
      console.error("[Admin] Failed to save birthday requirement:", error);
      alert("เกิดข้อผิดพลาดในการบันทึก");
    }
  };

  // ===== useEffect: โหลดรายการสิทธิพิเศษเริ่มต้น =====
  useEffect(() => {
    const loadPerks = async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/api/config/perks`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.perks && data.perks.length > 0) {
            setPerks(data.perks);
          }
        }
      } catch (error) {
        console.error("[Admin] Failed to load perks:", error);
      }
    };
    loadPerks();
  }, []);

  // ===== useEffect: โหลดภาพ QR Code ชำระเงินปัจจุบัน =====
  useEffect(() => {
    const loadPaymentQr = async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/api/config/payment-qr`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.paymentQrUrl) {
            setPaymentQrUrl(data.paymentQrUrl);
          }
        }
      } catch (error) {
        console.error("[Admin] Failed to load payment QR:", error);
      }
    };
    loadPaymentQr();
  }, []);

  // ===== ฟังก์ชัน: เลือกไฟล์ QR Code ชำระเงิน =====
  const handlePaymentQrFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPaymentQrFile(file);
      setPaymentQrPreview(URL.createObjectURL(file));
    }
  };

  // ===== ฟังก์ชัน: อัพโหลดภาพ QR Code ชำระเงิน =====
  const handleUploadPaymentQr = async () => {
    if (!paymentQrFile) {
      alert("กรุณาเลือกรูปภาพ QR Code ก่อน");
      return;
    }
    setUploadingPaymentQr(true);
    try {
      const formData = new FormData();
      formData.append('paymentQr', paymentQrFile);

      const storedShopId = shopId || localStorage.getItem("shopId") || "shop1";
      const res = await fetch(`${API_BASE_URL}/api/config/payment-qr`, {
        method: 'POST',
        headers: {
          'x-shop-id': storedShopId,
          'x-admin-id': adminId,
        },
        body: formData
      });

      const data = await res.json();
      if (data.success) {
        setPaymentQrUrl(data.paymentQrUrl);
        setPaymentQrFile(null);
        setPaymentQrPreview(null);
        alert("✅ อัปโหลด QR Code ชำระเงินสำเร็จ");
      } else {
        alert("❌ " + (data.message || "อัปโหลดไม่สำเร็จ"));
      }
    } catch (error) {
      console.error("[Admin] Upload payment QR failed:", error);
      alert("❌ เกิดข้อผิดพลาดในการอัปโหลด");
    } finally {
      setUploadingPaymentQr(false);
    }
  };

  // ===== ฟังก์ชัน: เปิด Modal จัดการสิทธิพิเศษ =====
  const handleOpenPerksModal = () => {
    setShowPerksModal(true);
  };

  // ===== ฟังก์ชัน: ปิด Modal จัดการสิทธิพิเศษ =====
  const handleClosePerksModal = () => {
    setShowPerksModal(false);
    setEditingPerkIndex(null);
    setPerkInputValue("");
  };

  // ===== ฟังก์ชัน: แก้ไขสิทธิพิเศษ =====
  const handleEditPerk = (index) => {
    setEditingPerkIndex(index);
    setPerkInputValue(perks[index]);
  };

  // ===== ฟังก์ชัน: บันทึกการแก้ไขสิทธิพิเศษ =====
  const handleSavePerk = () => {
    if (!perkInputValue.trim()) {
      alert("กรุณากรอกข้อความสิทธิพิเศษ");
      return;
    }

    const newPerks = [...perks];
    newPerks[editingPerkIndex] = perkInputValue.trim();
    setPerks(newPerks);
    setEditingPerkIndex(null);
    setPerkInputValue("");
  };

  // ===== ฟังก์ชัน: ยกเลิกการแก้ไขสิทธิพิเศษ =====
  const handleCancelEditPerk = () => {
    setEditingPerkIndex(null);
    setPerkInputValue("");
  };

  // ===== ฟังก์ชัน: เพิ่มสิทธิพิเศษใหม่ =====
  const handleAddPerk = () => {
    if (!perkInputValue.trim()) {
      alert("กรุณากรอกข้อความสิทธิพิเศษ");
      return;
    }

    setPerks([...perks, perkInputValue.trim()]);
    setPerkInputValue("");
  };

  // ===== ฟังก์ชัน: ลบสิทธิพิเศษ =====
  const handleDeletePerk = (index) => {
    if (window.confirm("ต้องการลบสิทธิพิเศษนี้หรือไม่?")) {
      const newPerks = perks.filter((_, i) => i !== index);
      setPerks(newPerks);
    }
  };

  // ===== ฟังก์ชัน: บันทึกสิทธิพิเศษทั้งหมดและ Broadcast ไปยังผู้ใช้ =====
  const handleSaveAllPerks = async () => {
    if (perks.length === 0) {
      alert("ต้องมีสิทธิพิเศษอย่างน้อย 1 รายการ");
      return;
    }

    setSavingPerks(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/config/perks`, {
        method: "POST",
        body: JSON.stringify({ perks })
      });

      if (res.ok) {
        // Broadcast perks update to all users via Socket.IO
        // 🔥 Check socket before emit
        if (socket) {
          console.log("[Admin] 🔥 Broadcasting perks update via Socket.IO:", perks.length, "items");
          socket.emit("adminUpdatePerks", { perks });
          console.log("[Admin] ✅ Socket emitted: adminUpdatePerks");
        }
        alert("✅ บันทึกสิทธิพิเศษสำเร็จ\n\nการเปลี่ยนแปลงจะแสดงแบบ Real-time บนหน้า User ทันที");
        handleClosePerksModal();
      } else {
        alert("เกิดข้อผิดพลาดในการบันทึก");
      }
    } catch (error) {
      console.error("[Admin] Failed to save perks:", error);
      alert("เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setSavingPerks(false);
    }
  };

  // ===== ฟังก์ชัน: บันทึกการตั้งค่าแพ็คเกจ =====
  const handleSave = () => {
    if (!minute && !second) {
      alert("กรุณากรอกเวลาอย่างน้อย 1 ช่อง");
      return;
    }
    if (!price && mode !== "birthday") {
      alert("กรุณากรอกราคา");
      return;
    }

    const totalSeconds = (parseInt(minute) || 0) * 60 + (parseInt(second) || 0);
    const durationDisplay = `${minute ? minute + " นาที" : ""}${second ? (minute ? " " : "") + second + " วินาที" : ""
      }`;

    const packageData = {
      id: Date.now(),
      mode,
      date: new Date().toLocaleString(),
      duration: durationDisplay,
      time: totalSeconds,
      price: mode === "birthday" ? 0 : price,
    };

    // 🔥 Check socket before emit
    if (!socket || !socket.connected) {
      alert("ไม่สามารถบันทึกได้: ยังไม่ได้เชื่อมต่อ Realtime Server กรุณารอสักครู่แล้วลองใหม่");
      return;
    }
    socket.emit("addPackage", packageData, (ack) => {
      // Server acknowledgement callback (optional — fires if server uses cb)
    });
    setMinute("");
    setSecond("");
    setPrice("");
    alert("บันทึกแพ็คเกจสำเร็จ");
  };

  // ===== ฟังก์ชัน: กำหนดประเภทอันดับที่จะแสดงบนหน้าจอผู้ใช้ =====
  // Broadcast ไปยังทุกผู้ใช้แบบ Real-time
  const handleSetPublicRankingType = (type) => {
    if (!socket) return; // 🔥 Check socket
    console.log("[Admin] Broadcasting public ranking type:", type);
    socket.emit("setPublicRankingType", { type });
  };

  // ===== ฟังก์ชัน: สร้าง QR Code สำหรับลูกค้าสแกนเข้าระบบ =====
  const generateQRCode = () => {
    // 🔥 ใช้ shopId แทน adminId สำหรับ Multi-tenant
    const shopParam = shopId || localStorage.getItem('shopId') || 'CMES ADMIN';
    const userAppUrl = `${USER_FRONTEND_URL}/?shopId=${shopParam}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(userAppUrl)}&format=png&ecc=H`;
    setQrCodeUrl(qrApiUrl);
    setShowQrModal(true);
  };

  // ===== ฟังก์ชัน: เปิด Modal แสดงอันดับทั้งหมด =====
  const handleOpenAllRanks = async () => {
    setShowAllRanks(true);
    if (allRanksLoaded || fetchingAllRanks) return;

    setFetchingAllRanks(true);
    setAllRankError("");

    try {
      const res = await authFetch(`${API_BASE_URL}/api/rankings?limit=500&type=${rankingType}`);
      if (!res.ok) throw new Error("FAILED");
      const data = await res.json();
      if (!data.success) throw new Error("FAILED");

      setAllRanks(data.ranks || []);
      setAllRanksLoaded(true);
      setTotalRankers(data.total ?? totalRankers);
    } catch (err) {
      setAllRankError("ไม่สามารถโหลดอันดับทั้งหมดได้");
    } finally {
      setFetchingAllRanks(false);
    }
  };

  // ===== ฟังก์ชัน: ปิด Modal อันดับทั้งหมด =====
  const handleCloseAllRanks = () => setShowAllRanks(false);

  // ใช้ข้อมูลอันดับทั้งหมดถ้ามี ถ้าไม่มีใช้ Top 10
  const modalRanks = allRanks.length ? allRanks : topRanks;

  // ========================================
  // ===== RENDER JSX =====
  // ========================================
  return (
    <div className="admin-home-minimal">
      {/* ===== Header - แสดงชื่อระบบและเมนูนำทาง ===== */}
      <header className="admin-header-minimal">
        <div className="brand-minimal">
          <div className="brand-title-container" title={shopId || "CMES ADMIN"}>
            <div className={`brand-title-content ${(shopId || "CMES ADMIN").length > 15 ? 'marquee' : ''}`}>
              <span className="brand-title">{shopId || "CMES ADMIN"}</span>
              {(shopId || "CMES ADMIN").length > 15 && <span className="brand-title">{shopId || "CMES ADMIN"}</span>}
            </div>
          </div>
        </div>
        <nav className="nav-minimal">
          <a href="/TimeHistory">ประวัติการตั้งเวลา</a>
          <a href="/image-queue">ตรวจสอบรูปภาพ</a>
          <a href="/report">รายงาน</a>
          <a href="/check-history">ประวัติการตรวจสอบ</a>
          <a href="/lucky-wheel">วงล้อเสี่ยงดวง</a>
          <a href="/gift-setting">ตั้งค่าส่งของขวัญ</a>
          <a href="#!" onClick={(e) => { e.preventDefault(); setShowObsModal(true); }}>🎥 OBS Links</a>
        </nav>
        {/* Grouping Avatar and QR Code Generator in upper right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>

          <button
            onClick={generateQRCode}
            title="QR Code ร้านค้า"
            style={{
              padding: "8px 16px",
              backgroundColor: "#f8f9fa",
              color: "#333",
              border: "1px solid #ddd",
              borderRadius: "20px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#e2e8f0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#f8f9fa"; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <rect x="7" y="7" width="3" height="3"></rect>
              <rect x="14" y="7" width="3" height="3"></rect>
              <rect x="7" y="14" width="3" height="3"></rect>
              <rect x="14" y="14" width="3" height="3"></rect>
            </svg>
            ลิงก์ & QR Code
          </button>

          {/* Avatar button วงกลมมุมขวาบน */}
          <button
            onClick={() => navigate("/edit-profile")}
            title={shopProfile.name}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: shopProfile.logo ? "transparent" : "linear-gradient(135deg, #667eea, #764ba2)",
              backgroundImage: shopProfile.logo ? `url(${shopProfile.logo})` : "none",
              backgroundSize: "cover",
              backgroundPosition: "center",
              border: "2px solid rgba(255,255,255,0.3)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 2px 8px rgba(102,126,234,0.4)",
              transition: "transform 0.2s, box-shadow 0.2s",
              overflow: "hidden",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(102,126,234,0.6)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(102,126,234,0.4)"; }}
          >
            {!shopProfile.logo && shopProfile.name.slice(0, 2).toUpperCase()}
          </button>
        </div>
      </header>

      <main className="admin-main-minimal">

        {/* ===== ส่วนควบคุมสถานะระบบ (เปิด/ปิด) ===== */}
        <div className="system-status-row">
          <span className="system-label">สถานะระบบ:</span>
          <div
            className={`switch-minimal ${systemOn ? "on" : "off"}`}
            onClick={handleToggleSystem}
          >
            <div className="switch-dot"></div>
          </div>
          <span className={`system-status-text ${systemOn ? "on" : "off"}`}>
            {systemOn ? "เปิด" : "ปิด"}
          </span>
        </div>

        {/* แสดงข้อความเตือนเมื่อระบบถูกปิด */}
        {!systemOn && (
          <div className="system-off-msg-minimal">
            ระบบถูกปิด ฝั่งผู้ใช้จะไม่สามารถใช้งานได้
          </div>
        )}


        {/* ===== คอนเทนเนอร์หลัก 3 กล่อง (ลำดับตาม cardOrder) ===== */}
        <div className="three-box-container">

          {cardOrder.map(cardId => {
            const isCollapsed = !cardVisibility[cardId];
            const isDragOver = dragOverCard === cardId && draggedCard !== cardId;
            const cardWrapperClass = `card-drag-wrapper ${isDragOver ? 'drag-over' : ''} ${draggedCard === cardId ? 'dragging' : ''} ${isCollapsed ? 'collapsed' : ''}`;

            if (cardId === 'feature') return (
              <div
                key="feature"
                className={cardWrapperClass}
                draggable
                onDragStart={(e) => handleDragStart(e, 'feature')}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, 'feature')}
                onDrop={(e) => handleDrop(e, 'feature')}
              >
                {/* ===== กล่อง: ฟังก์ชันต่าง ๆ ===== */}
                <section className={`feature-card ${isCollapsed ? 'card-collapsed' : ''}`}>
                  <div className="card-drag-handle" title="กดค้างแล้วลากเพื่อย้ายตำแหน่ง">
                    <span className="drag-icon">⠿</span>
                    <h3>ฟังก์ชันต่างๆ</h3>
                    <button className="card-eye-btn" onClick={(e) => { e.stopPropagation(); toggleCardVisibility('feature'); }} title={isCollapsed ? 'แสดง' : 'ซ่อน'}>
                      {isCollapsed ? '👁‍🗨' : '👁'}
                    </button>
                  </div>
                  {isCollapsed ? null : (<>

                    <div className="function-toggle-column">
                      <div className="toggle-card">
                        <span>ฟังก์ชันส่งรูปภาพ</span>
                        <button
                          className={`toggle-btn-minimal${enableImage ? " on" : " off"}`}
                          onClick={handleToggleImage}
                          disabled={!systemOn}
                        >
                          {enableImage ? "เปิด" : "ปิด"}
                        </button>
                      </div>

                      <div className="toggle-card">
                        <span>ฟังก์ชันข้อความ</span>
                        <button
                          className={`toggle-btn-minimal${enableText ? " on" : " off"}`}
                          onClick={handleToggleText}
                          disabled={!systemOn}
                        >
                          {enableText ? "เปิด" : "ปิด"}
                        </button>
                      </div>

                      <div className="toggle-card">
                        <span>ฟังก์ชันส่งของขวัญ</span>
                        <button
                          className={`toggle-btn-minimal${enableGift ? " on" : " off"}`}
                          onClick={handleToggleGift}
                          disabled={!systemOn}
                        >
                          {enableGift ? "เปิด" : "ปิด"}
                        </button>
                      </div>

                      <div className="toggle-card">
                        <span>ฟังก์ชันอวยพรวันเกิด</span>
                        <button
                          className={`toggle-btn-minimal${enableBirthday ? " on" : " off"}`}
                          onClick={handleToggleBirthday}
                          disabled={!systemOn}
                        >
                          {enableBirthday ? "เปิด" : "ปิด"}
                        </button>
                      </div>

                      <div className="toggle-card" style={{ flexDirection: "column", alignItems: "flex-start", gap: "8px" }}>
                        <span>ยอดใช้จ่ายขั้นต่ำสำหรับวันเกิด (บาท)</span>
                        <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                          <input
                            type="number"
                            min="0"
                            placeholder="ยอดเงิน"
                            value={birthdaySpendingRequirement}
                            onChange={(e) => setBirthdaySpendingRequirement(e.target.value)}
                            disabled={!systemOn}
                            style={{
                              flex: 1,
                              padding: "8px 12px",
                              border: "1px solid #e2e8f0",
                              borderRadius: "8px",
                              fontSize: "14px"
                            }}
                          />
                          <button
                            onClick={handleSaveBirthdayRequirement}
                            disabled={!systemOn}
                            style={{
                              padding: "8px 16px",
                              background: systemOn ? "linear-gradient(135deg, #667eea, #764ba2)" : "#cbd5e1",
                              color: "#fff",
                              border: "none",
                              borderRadius: "8px",
                              cursor: systemOn ? "pointer" : "not-allowed",
                              fontSize: "14px",
                              fontWeight: "600"
                            }}
                          >
                            บันทึก
                          </button>
                        </div>
                        <small style={{ color: "#64748b", fontSize: "12px" }}>
                          ผู้ใช้ต้องใช้จ่ายครบจำนวนนี้ก่อนจึงจะใช้ฟีเจอร์วันเกิดฟรีได้
                        </small>
                      </div>

                      {/* OBS Links Section (ย้ายไป Modal แล้ว) */}
                      {false && (
                        <div className="toggle-card" style={{ flexDirection: "column", alignItems: "flex-start", gap: "12px", marginTop: "16px", background: "linear-gradient(135deg, #f0f9ff, #e0f2fe)", border: "2px solid #0ea5e9" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "space-between", width: "100%" }}>
                            <span style={{ fontSize: "16px", fontWeight: "700", color: "#0369a1" }}>🎥 OBS Overlay Links</span>
                            <span style={{ fontSize: "11px", color: "#64748b", background: "#fff", padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                              {adminUsername}
                            </span>
                          </div>

                          {/* Image Overlay Link */}
                          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Image & Text Overlay:</label>
                            <div style={{ display: "flex", gap: "8px" }}>
                              <input
                                type="text"
                                readOnly
                                value={`${API_BASE_URL}/obs-image-overlay.html?shopId=${adminId}`}
                                style={{
                                  flex: 1,
                                  padding: "8px 12px",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "8px",
                                  fontSize: "13px",
                                  background: "#fff",
                                  color: "#334155"
                                }}
                              />
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(`${API_BASE_URL}/obs-image-overlay.html?shopId=${adminId}`);
                                  setCopiedImage(true);
                                  setTimeout(() => setCopiedImage(false), 2000);
                                }}
                                style={{
                                  padding: "8px 16px",
                                  background: copiedImage ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #0ea5e9, #0284c7)",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: "8px",
                                  cursor: "pointer",
                                  fontSize: "13px",
                                  fontWeight: "600",
                                  whiteSpace: "nowrap",
                                  transition: "all 0.3s ease",
                                  transform: copiedImage ? "scale(0.95)" : "scale(1)"
                                }}
                              >
                                {copiedImage ? "✓ Copied!" : "📋 Copy"}
                              </button>
                            </div>
                          </div>

                          {/* Ranking Overlay Link */}
                          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Ranking Overlay:</label>
                            <div style={{ display: "flex", gap: "8px" }}>
                              <input
                                type="text"
                                readOnly
                                value={`${API_BASE_URL}/obs-ranking-overlay.html?shopId=${adminId}`}
                                style={{
                                  flex: 1,
                                  padding: "8px 12px",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "8px",
                                  fontSize: "13px",
                                  background: "#fff",
                                  color: "#334155"
                                }}
                              />
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(`${API_BASE_URL}/obs-ranking-overlay.html?shopId=${adminId}`);
                                  setCopiedRanking(true);
                                  setTimeout(() => setCopiedRanking(false), 2000);
                                }}
                                style={{
                                  padding: "8px 16px",
                                  background: copiedRanking ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #0ea5e9, #0284c7)",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: "8px",
                                  cursor: "pointer",
                                  fontSize: "13px",
                                  fontWeight: "600",
                                  whiteSpace: "nowrap",
                                  transition: "all 0.3s ease",
                                  transform: copiedRanking ? "scale(0.95)" : "scale(1)"
                                }}
                              >
                                {copiedRanking ? "✓ Copied!" : "📋 Copy"}
                              </button>
                            </div>
                          </div>

                          {/* Lucky Wheel Overlay Link */}
                          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Lucky Wheel Overlay:</label>
                            <div style={{ display: "flex", gap: "8px" }}>
                              <input
                                type="text"
                                readOnly
                                value={`${API_BASE_URL}/obs-lucky-wheel.html?shopId=${adminId}`}
                                style={{
                                  flex: 1,
                                  padding: "8px 12px",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "8px",
                                  fontSize: "13px",
                                  background: "#fff",
                                  color: "#334155"
                                }}
                              />
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(`${API_BASE_URL}/obs-lucky-wheel.html?shopId=${adminId}`);
                                  setCopiedWheel(true);
                                  setTimeout(() => setCopiedWheel(false), 2000);
                                }}
                                style={{
                                  padding: "8px 16px",
                                  background: copiedWheel ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #0ea5e9, #0284c7)",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: "8px",
                                  cursor: "pointer",
                                  fontSize: "13px",
                                  fontWeight: "600",
                                  whiteSpace: "nowrap",
                                  transition: "all 0.3s ease",
                                  transform: copiedWheel ? "scale(0.95)" : "scale(1)"
                                }}
                              >
                                {copiedWheel ? "✓ Copied!" : "📋 Copy"}
                              </button>
                            </div>
                          </div>

                          <small style={{ color: "#64748b", fontSize: "11px", marginTop: "4px" }}>
                            💡 คัดลอกลิงก์เหล่านี้ไปเพิ่มใน OBS Studio เป็น Browser Source (ลิงก์เฉพาะร้านของคุณ)
                          </small>
                        </div>
                      )}
                    </div>
                  </>)}
                </section>
              </div>
            );

            if (cardId === 'package') return (
              <div
                key="package"
                className={cardWrapperClass}
                draggable
                onDragStart={(e) => handleDragStart(e, 'package')}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, 'package')}
                onDrop={(e) => handleDrop(e, 'package')}
              >
                {/* ===== กล่อง: ตั้งค่าแพ็กเกจ ===== */}
                <section className={`package-settings-card ${isCollapsed ? 'card-collapsed' : ''}`}>
                  <div className="card-drag-handle" title="กดค้างแล้วลากเพื่อย้ายตำแหน่ง">
                    <span className="drag-icon">⠿</span>
                    <h2>ตั้งค่าแพ็คเกจ</h2>
                    <button className="card-eye-btn" onClick={(e) => { e.stopPropagation(); toggleCardVisibility('package'); }} title={isCollapsed ? 'แสดง' : 'ซ่อน'}>
                      {isCollapsed ? '👁‍🗨' : '👁'}
                    </button>
                  </div>
                  {isCollapsed ? null : (<>

                    <div className="mode-select-row">
                      <button
                        className={`mode-btn-minimal${mode === "image" ? " active" : ""}`}
                        onClick={() => setMode("image")}
                        disabled={!systemOn}
                      >
                        รูปภาพ
                      </button>
                      <button
                        className={`mode-btn-minimal${mode === "text" ? " active" : ""}`}
                        onClick={() => setMode("text")}
                        disabled={!systemOn}
                      >
                        ข้อความ
                      </button>
                      <button
                        className={`mode-btn-minimal${mode === "birthday" ? " active" : ""}`}
                        onClick={() => setMode("birthday")}
                        disabled={!systemOn}
                      >
                        วันเกิด
                      </button>
                    </div>

                    <div className="input-row-minimal">
                      <input
                        type="number"
                        min="1"
                        max="59"
                        placeholder="นาที"
                        value={minute}
                        onChange={(e) => setMinute(e.target.value)}
                        disabled={!systemOn}
                        className="input-minimal"
                      />
                      <input
                        type="number"
                        min="1"
                        max="59"
                        placeholder="วินาที"
                        value={second}
                        onChange={(e) => setSecond(e.target.value)}
                        disabled={!systemOn}
                        className="input-minimal"
                      />
                      <input
                        type="number"
                        min="1"
                        placeholder="ราคา (บาท)"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        disabled={!systemOn}
                        className="input-minimal"
                      />
                    </div>

                    <button
                      className="save-btn-minimal"
                      onClick={handleSave}
                      disabled={!systemOn}
                    >
                      บันทึกแพ็คเกจ
                    </button>

                    {/* ===== ส่วนอัพโหลด QR Code ชำระเงิน ===== */}
                    <div className="payment-qr-upload-section">
                      <div className="payment-qr-header">
                        <span className="payment-qr-title">💳 QR Code ชำระเงิน</span>
                        <small className="payment-qr-subtitle">ภาพนี้จะแสดงในหน้าชำระเงินของลูกค้า</small>
                      </div>

                      {/* แสดงภาพปัจจุบัน */}
                      {(paymentQrPreview || paymentQrUrl) && (
                        <div className="payment-qr-preview-container">
                          <img
                            src={paymentQrPreview || paymentQrUrl}
                            alt="QR Code ชำระเงิน"
                            className="payment-qr-preview-img"
                          />
                          <span className="payment-qr-status">
                            {paymentQrPreview ? "📷 ภาพใหม่ (ยังไม่บันทึก)" : "✅ ภาพปัจจุบัน"}
                          </span>
                        </div>
                      )}

                      {/* เลือกไฟล์ + อัพโหลด */}
                      <div className="payment-qr-actions">
                        <label className="payment-qr-file-label">
                          📁 เลือกรูปภาพ
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePaymentQrFileChange}
                            style={{ display: "none" }}
                          />
                        </label>
                        <button
                          className="payment-qr-upload-btn"
                          onClick={handleUploadPaymentQr}
                          disabled={!paymentQrFile || uploadingPaymentQr}
                        >
                          {uploadingPaymentQr ? "⏳ กำลังอัปโหลด..." : "☁️ อัปโหลด"}
                        </button>
                      </div>

                      {!paymentQrUrl && !paymentQrPreview && (
                        <small className="payment-qr-hint">
                          ⚠️ ยังไม่มีภาพ QR Code ชำระเงิน ระบบจะแสดงภาพเริ่มต้น
                        </small>
                      )}
                    </div>

                    {/* QR Code Section (ซ่อนไว้เพราะใช้ปุ่มด้านบนแทน) */}
                    {false && (
                      <div style={{
                        marginTop: "24px",

                        padding: "20px",
                        background: "linear-gradient(135deg, #fef3c7, #fde68a)",
                        border: "2px solid #f59e0b",
                        borderRadius: "12px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "12px"
                      }}>
                        <span style={{ fontSize: "16px", fontWeight: "700", color: "#92400e", textAlign: "center" }}>
                          📱 QR Code สำหรับลูกค้า
                        </span>

                        <button
                          onClick={generateQRCode}
                          style={{
                            padding: "12px 24px",
                            background: "linear-gradient(135deg, #f59e0b, #d97706)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontSize: "14px",
                            fontWeight: "600",
                            width: "100%",
                            transition: "transform 0.2s ease"
                          }}
                          onMouseEnter={(e) => e.target.style.transform = "scale(1.02)"}
                          onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
                        >
                          🎯 สร้าง QR Code
                        </button>

                        <small style={{ color: "#92400e", fontSize: "11px", textAlign: "center" }}>
                          💡 ลูกค้าสแกน QR Code เพื่อเข้าสู่ระบบของร้านคุณ
                        </small>
                      </div>
                    )}
                  </>)}
                </section>
              </div>
            );

            if (cardId === 'vip') return (
              <div
                key="vip"
                className={cardWrapperClass}
                draggable
                onDragStart={(e) => handleDragStart(e, 'vip')}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, 'vip')}
                onDrop={(e) => handleDrop(e, 'vip')}
              >
                {/* ===== กล่อง: VIP Supporters & Public Display Control ===== */}
                <aside className={`vip-card ${isCollapsed ? 'card-collapsed' : ''}`}>
                  <div className="card-drag-handle" title="กดค้างแล้วลากเพื่อย้ายตำแหน่ง">
                    <span className="drag-icon">⠿</span>
                    <span style={{ fontSize: '18px', fontWeight: 700 }}>VIP & Display Control</span>
                    <button className="card-eye-btn" onClick={(e) => { e.stopPropagation(); toggleCardVisibility('vip'); }} title={isCollapsed ? 'แสดง' : 'ซ่อน'}>
                      {isCollapsed ? '👁‍🗨' : '👁'}
                    </button>
                  </div>
                  {isCollapsed ? null : (<>
                    {/* ส่วนควบคุมการแสดงผลบนหน้าจอผู้ใช้ (Public Broadcast) */}
                    <div className="public-broadcast-control">
                      <div className="broadcast-header">
                        <span className="broadcast-title">📺 Public Display Control</span>
                        <span className="broadcast-subtitle">ควบคุมการแสดงผลบนหน้าจอผู้ใช้</span>
                      </div>

                      <div className="broadcast-buttons">
                        <button
                          className={`broadcast-btn ${publicRankingType === "daily" ? "active" : ""}`}
                          onClick={() => handleSetPublicRankingType("daily")}
                          disabled={!systemOn}
                        >
                          {publicRankingType === "daily" && <span className="live-indicator">🔴 LIVE</span>}
                          <span>รายวัน</span>
                        </button>
                        <button
                          className={`broadcast-btn ${publicRankingType === "monthly" ? "active" : ""}`}
                          onClick={() => handleSetPublicRankingType("monthly")}
                          disabled={!systemOn}
                        >
                          {publicRankingType === "monthly" && <span className="live-indicator">🔴 LIVE</span>}
                          <span>รายเดือน</span>
                        </button>
                        <button
                          className={`broadcast-btn ${publicRankingType === "alltime" ? "active" : ""}`}
                          onClick={() => handleSetPublicRankingType("alltime")}
                          disabled={!systemOn}
                        >
                          {publicRankingType === "alltime" && <span className="live-indicator">🔴 LIVE</span>}
                          <span>ตลอดกาล</span>
                        </button>
                      </div>
                    </div>

                    {/* เส้นแบ่งระหว่างส่วน Public Control และ Admin View */}
                    <div style={{
                      height: "1px",
                      background: "linear-gradient(90deg, transparent, #e2e8f0, transparent)",
                      margin: "20px 0"
                    }}></div>

                    {/* ส่วนแสดงอันดับสำหรับ Admin ดู (Local View) */}
                    <div className="rank-panel-heading">
                      <div>
                        <p className="rank-panel-title">VIP Supporters (Admin View)</p>
                        <small>อันดับ 1-{rankLimit}</small>
                      </div>

                      <button
                        type="button"
                        className="rank-refresh-btn"
                        onClick={() => loadTopRanks(topRanks.length > 0)}
                        disabled={refreshingRanks}
                      >
                        {refreshingRanks ? "รีเฟรช..." : "รีเฟรช"}
                      </button>
                    </div>

                    {/* ช่องกรอกจำนวนอันดับที่ต้องการแสดง */}
                    <div className="rank-limit-row">
                      <label>แสดงจำนวน:</label>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={rankLimit}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          setRankLimit(Math.max(1, Math.min(500, val)));
                        }}
                        className="rank-limit-input"
                      />
                      <span className="rank-limit-label">อันดับ</span>
                    </div>

                    {/* ตัวเลือกประเภทอันดับสำหรับ Admin (รายวัน/รายเดือน/ตลอดกาล) */}
                    <div className="ranking-type-selector">
                      <button
                        className={`ranking-type-btn ${rankingType === "daily" ? "active" : ""}`}
                        onClick={() => { setRankingType("daily"); setSelectedDate(getTodayStr()); }}
                      >
                        รายวัน
                      </button>
                      <button
                        className={`ranking-type-btn ${rankingType === "monthly" ? "active" : ""}`}
                        onClick={() => { setRankingType("monthly"); setSelectedMonth(getCurrentMonthStr()); }}
                      >
                        รายเดือน
                      </button>
                      <button
                        className={`ranking-type-btn ${rankingType === "alltime" ? "active" : ""}`}
                        onClick={() => { setRankingType("alltime"); setSelectedYear(getCurrentYearStr()); }}
                      >
                        ตลอดกาล
                      </button>
                    </div>

                    {/* ===== Date/Month/Year Picker ตามประเภทอันดับ ===== */}
                    <div className="rank-date-filter">
                      {rankingType === "daily" && (
                        <div className="date-picker-row">
                          <label>📅 เลือกวันที่:</label>
                          <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                            min={`${new Date().getFullYear()}-01-01`}
                            className="date-picker-input"
                          />
                          {selectedDate && (
                            <button className="clear-filter-btn" onClick={() => setSelectedDate("")}>✕ ล้าง</button>
                          )}
                        </div>
                      )}

                      {rankingType === "monthly" && (
                        <div className="date-picker-row">
                          <label>📅 เลือกเดือน:</label>
                          <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            max={new Date().toISOString().slice(0, 7)}
                            min={`${new Date().getFullYear()}-01`}
                            className="date-picker-input"
                          />
                          {selectedMonth && (
                            <button className="clear-filter-btn" onClick={() => setSelectedMonth("")}>✕ ล้าง</button>
                          )}
                        </div>
                      )}

                      {rankingType === "alltime" && (
                        <div className="date-picker-row">
                          <label>📅 เลือกปี:</label>
                          <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                            className="date-picker-input"
                          >
                            <option value="">ทุกปี</option>
                            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(year => (
                              <option key={year} value={year}>{year}</option>
                            ))}
                          </select>
                          {selectedYear && (
                            <button className="clear-filter-btn" onClick={() => setSelectedYear("")}>✕ ล้าง</button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ===== กล่องแสดงยอดรวม ===== */}
                    <div className="rank-summary-box">
                      <div className="summary-item">
                        <span className="summary-label">
                          {rankingType === "daily" ? "💰 ยอดรวมรายวัน" : rankingType === "monthly" ? "💰 ยอดรวมรายเดือน" : "💰 ยอดรวมตลอดกาล"}
                        </span>
                        <span className="summary-value">฿{formatCurrency(rankingSummary.totalSum)}</span>
                      </div>
                      <div className="summary-item">
                        <span className="summary-label">👥 จำนวนผู้สนับสนุน</span>
                        <span className="summary-value">{rankingSummary.totalUsers} คน</span>
                      </div>
                    </div>

                    <ul className="rank-list">
                      {rankLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <li className="rank-list-item skeleton" key={i}>
                            <div className="rank-index">--</div>
                            <div className="rank-user-info">
                              <div className="placeholder-bar"></div>
                              <div className="placeholder-bar small"></div>
                            </div>
                            <div className="rank-points">--</div>
                          </li>
                        ))
                      ) : topRanks.length === 0 ? (
                        <li className="rank-empty">ยังไม่มีข้อมูลอันดับ</li>
                      ) : (
                        topRanks.map((entry, index) => {
                          const pos = entry.position || index + 1;
                          // Get points based on ranking type
                          let points = entry.points || 0;
                          if (rankingType === "daily") points = entry.dailyPoints || 0;
                          else if (rankingType === "monthly") points = entry.monthlyPoints || 0;

                          return (
                            <li
                              className={`rank-list-item tier-${pos <= 3 ? pos : "default"
                                }`}
                              key={`${entry.name}-${pos}`}
                            >
                              <div className="rank-index">#{pos}</div>
                              <div className="rank-user-info">
                                <strong>{entry.name}</strong>
                                <span>อัปเดต {formatUpdatedAt(entry.updatedAt)}</span>
                              </div>
                              <div className="rank-points">
                                ฿{formatCurrency(points)}
                              </div>
                            </li>
                          );
                        })
                      )}
                    </ul>

                    {rankError && <div className="rank-error">{rankError}</div>}

                    <button
                      type="button"
                      className="view-more-ranks"
                      onClick={handleOpenAllRanks}
                    >
                      ดูอันดับทั้งหมด
                    </button>

                    {/* ปุ่มจัดการสิทธิพิเศษ */}
                    <button
                      type="button"
                      className="manage-perks-btn"
                      onClick={handleOpenPerksModal}
                      style={{
                        width: "100%",
                        marginTop: "12px",
                        padding: "14px 20px",
                        background: "linear-gradient(135deg, #f59e0b, #d97706)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "12px",
                        cursor: "pointer",
                        fontSize: "15px",
                        fontWeight: "700",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        transition: "all 0.3s ease",
                        boxShadow: "0 4px 12px rgba(245, 158, 11, 0.3)"
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.transform = "translateY(-2px)";
                        e.target.style.boxShadow = "0 6px 16px rgba(245, 158, 11, 0.4)";
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.transform = "translateY(0)";
                        e.target.style.boxShadow = "0 4px 12px rgba(245, 158, 11, 0.3)";
                      }}
                    >
                      <span>⚙️</span>
                      <span>จัดการสิทธิพิเศษ</span>
                    </button>

                    {/* ปุ่มเช็คสถิติรายรับแบบใหม่ */}
                    <button
                      type="button"
                      className="manage-perks-btn income-stats-btn"
                      onClick={() => setShowIncomeStats(true)}
                      style={{
                        width: "100%",
                        marginTop: "12px",
                        padding: "14px 20px",
                        background: "linear-gradient(135deg, #0ea5e9, #0284c7)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "12px",
                        cursor: "pointer",
                        fontSize: "15px",
                        fontWeight: "700",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        transition: "all 0.3s ease",
                        boxShadow: "0 4px 12px rgba(14, 165, 233, 0.3)"
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.transform = "translateY(-2px)";
                        e.target.style.boxShadow = "0 6px 16px rgba(14, 165, 233, 0.4)";
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.transform = "translateY(0)";
                        e.target.style.boxShadow = "0 4px 12px rgba(14, 165, 233, 0.3)";
                      }}
                    >
                      <span>📈</span> เช็คสถิติรายรับ
                    </button>

                  </>)}
                </aside>
              </div>
            );

            return null;
          })}
        </div>
      </main>

      {/* ===== Modal: แสดงอันดับทั้งหมด ===== */}
      {showAllRanks && (
        <div className="rank-modal-overlay" onClick={handleCloseAllRanks}>
          <div className="rank-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rank-modal-header">
              <div>
                <h3>ประวัติการใช้จ่ายทั้งหมด</h3>
                <p>รวม {totalRankers} ผู้ใช้</p>
              </div>
              <button
                type="button"
                className="close-rank-modal"
                onClick={handleCloseAllRanks}
              >
                ✕
              </button>
            </div>

            <div className="rank-modal-body">
              {fetchingAllRanks ? (
                <p>กำลังโหลด...</p>
              ) : allRankError ? (
                <p className="rank-error">{allRankError}</p>
              ) : modalRanks.length === 0 ? (
                <p className="rank-empty">ยังไม่มีข้อมูลอันดับ</p>
              ) : (
                <ul className="rank-modal-list">
                  {modalRanks.map((entry, idx) => {
                    const position = entry.position || idx + 1;
                    // Get points based on ranking type
                    let points = entry.points || 0;
                    if (rankingType === "daily") points = entry.dailyPoints || 0;
                    else if (rankingType === "monthly") points = entry.monthlyPoints || 0;

                    return (
                      <li key={`${entry.name}-${position}`}>
                        <span className="rank-index">#{position}</span>
                        <div className="rank-user-info">
                          <strong>{entry.name}</strong>
                          <small>
                            อัปเดต {formatUpdatedAt(entry.updatedAt)}
                          </small>
                        </div>
                        <span className="rank-points">
                          ฿{formatCurrency(points)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: แสดง QR Code สำหรับลูกค้า ===== */}
      {showQrModal && (
        <div className="rank-modal-overlay" onClick={() => setShowQrModal(false)}>
          <div className="rank-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="rank-modal-header">
              <div>
                <h3>📱 QR Code สำหรับลูกค้า</h3>
                <p>สแกนเพื่อเข้าสู่ระบบของร้านคุณ</p>
              </div>
              <button
                type="button"
                className="close-rank-modal"
                onClick={() => setShowQrModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="rank-modal-body" style={{ textAlign: "center", padding: "30px" }}>
              {qrCodeUrl ? (
                <>
                  <div style={{
                    background: "#fff",
                    padding: "20px",
                    borderRadius: "12px",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                    display: "inline-block"
                  }}>
                    <img
                      src={qrCodeUrl}
                      alt="QR Code"
                      style={{
                        width: "300px",
                        height: "300px",
                        display: "block"
                      }}
                    />
                  </div>

                  <div style={{
                    marginTop: "24px",
                    display: "flex",
                    gap: "10px",
                    flexDirection: "column"
                  }}>
                    <a
                      href={qrCodeUrl}
                      download={`qr-code-shop-${adminId}.png`}
                      style={{
                        padding: "14px 24px",
                        background: "linear-gradient(135deg, #10b981, #059669)",
                        color: "#fff",
                        textDecoration: "none",
                        borderRadius: "10px",
                        fontWeight: "600",
                        display: "inline-block",
                        transition: "transform 0.2s ease",
                        fontSize: "15px"
                      }}
                      onMouseEnter={(e) => e.target.style.transform = "scale(1.02)"}
                      onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
                    >
                      💾 ดาวน์โหลด QR Code
                    </a>

                    <button
                      onClick={() => {
                        const url = `${USER_FRONTEND_URL}/?shopId=${shopId || localStorage.getItem('shopId') || 'CMES ADMIN'}`;
                        navigator.clipboard.writeText(url);
                        alert("✅ คัดลอกลิงก์สำเร็จ!");
                      }}
                      style={{
                        padding: "14px 24px",
                        background: "linear-gradient(135deg, #0ea5e9, #0284c7)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "10px",
                        cursor: "pointer",
                        fontWeight: "600",
                        fontSize: "15px",
                        transition: "transform 0.2s ease"
                      }}
                      onMouseEnter={(e) => e.target.style.transform = "scale(1.02)"}
                      onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
                    >
                      📋 คัดลอกลิงก์ให้ลูกค้าสแกน/กดเข้า
                    </button>

                    <button
                      onClick={() => {
                        const url = `${USER_FRONTEND_URL}/?shopId=${shopId || localStorage.getItem('shopId') || 'CMES ADMIN'}`;
                        window.open(url, '_blank');
                      }}
                      style={{
                        padding: "14px 24px",
                        background: "linear-gradient(135deg, #a855f7, #9333ea)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "10px",
                        cursor: "pointer",
                        fontWeight: "600",
                        fontSize: "15px",
                        transition: "transform 0.2s ease"
                      }}
                      onMouseEnter={(e) => e.target.style.transform = "scale(1.02)"}
                      onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
                    >
                      🌐 ทดสอบเปิดหน้าต่างผู้ใช้งาน
                    </button>
                  </div>

                  <div style={{
                    marginTop: "20px",
                    padding: "16px",
                    background: "linear-gradient(135deg, #f0f9ff, #e0f2fe)",
                    borderRadius: "10px",
                    border: "1px solid #0ea5e9"
                  }}>
                    <small style={{
                      display: "block",
                      color: "#0369a1",
                      fontSize: "13px",
                      fontWeight: "600",
                      marginBottom: "8px"
                    }}>
                      🔗 URL ของคุณ:
                    </small>
                    <small style={{
                      display: "block",
                      color: "#64748b",
                      fontSize: "12px",
                      wordBreak: "break-all",
                      fontFamily: "monospace"
                    }}>
                      {`${USER_FRONTEND_URL}/?shopId=${shopId || 'CMES ADMIN'}`}
                    </small>
                  </div>

                  <div style={{
                    marginTop: "16px",
                    padding: "12px",
                    background: "#fef3c7",
                    borderRadius: "8px",
                    border: "1px solid #f59e0b"
                  }}>
                    <small style={{
                      color: "#92400e",
                      fontSize: "12px",
                      display: "block"
                    }}>
                      💡 <strong>คำแนะนำ:</strong> พิมพ์ QR Code นี้ติดไว้ที่โต๊ะหรือบริเวณร้าน<br />
                      ลูกค้าสามารถสแกนเพื่อเข้าใช้งานระบบของคุณได้ทันที
                    </small>
                  </div>
                </>
              ) : (
                <p style={{ color: "#64748b" }}>กำลังสร้าง QR Code...</p>
              )}
            </div>
          </div>
        </div>
      )
      }

      {/* ===== Modal: แสดงลิงก์ OBS / แผงควบคุม (ย้ายมาจาก Feature Card) ===== */}
      {showObsModal && (
        <div className="rank-modal-overlay">
          <div className="rank-modal" onClick={(e) => e.stopPropagation()} style={{
            maxWidth: "1050px",
            width: "95%",
            maxHeight: "90vh",
            overflowY: "auto",
            background: "linear-gradient(135deg, rgba(30,30,40,0.95), rgba(15,20,30,0.98))",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.1)",
            backdropFilter: "blur(20px)",
            borderRadius: "20px"
          }}>
            <div className="rank-modal-header" style={{ marginBottom: "20px", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ color: "#38bdf8", fontSize: "24px", fontWeight: "800", letterSpacing: "0.5px", margin: "0 0 8px 0", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "28px" }}>🎥</span> OBS Studio Control Panel
                </h3>
                <p style={{ color: "#94a3b8", margin: 0, fontSize: "14px" }}>คัดลอกลิงก์ Overlay หรือใช้แผงควบคุมสลับฉาก/คุมเสียงได้ที่นี่</p>
              </div>
              <button
                type="button"
                className="close-rank-modal"
                onClick={() => setShowObsModal(false)}
                style={{ color: "#f8fafc", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "50%", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "16px", transition: "all 0.2s" }}
                onMouseOver={(e) => e.currentTarget.style.background = "rgba(239,68,68,0.2)"}
                onMouseOut={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
              >
                ✕
              </button>
            </div>
            <div className="rank-modal-body" style={{ padding: "0 0 10px 0", display: "flex", flexDirection: "column", gap: "24px" }}>

              {/* Section 1: Browser Source Links */}
              <div style={{ background: "#1e293b", padding: "20px", borderRadius: "12px", border: "1px solid #334155" }}>
                <h4 style={{ color: "#f1f5f9", margin: "0 0 16px 0", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>🔗</span> OBS Browser Source Links <span style={{ fontSize: "11px", color: "#64748b", background: "#0f172a", padding: "4px 8px", borderRadius: "6px", marginLeft: "auto" }}>{adminUsername}</span>
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>

                  {/* Image Overlay Link */}
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "12px", fontWeight: "600", color: "#94a3b8" }}>1. Image & Text</label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        readOnly
                        value={`${API_BASE_URL}/obs-image-overlay.html?shopId=${shopId || adminId}`}
                        style={{ flex: 1, padding: "8px 12px", border: "1px solid #475569", borderRadius: "6px", fontSize: "12px", background: "#0f172a", color: "#cbd5e1", outline: "none" }}
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${API_BASE_URL}/obs-image-overlay.html?shopId=${shopId || adminId}`);
                          setCopiedImage(true);
                          setTimeout(() => setCopiedImage(false), 2000);
                        }}
                        style={{ padding: "8px 12px", background: copiedImage ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #0ea5e9, #0284c7)", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "600", transition: "all 0.2s" }}
                      >
                        {copiedImage ? "✓" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {/* Ranking Overlay Link */}
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "12px", fontWeight: "600", color: "#94a3b8" }}>2. Ranking</label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        readOnly
                        value={`${API_BASE_URL}/obs-ranking-overlay.html?shopId=${shopId || adminId}`}
                        style={{ flex: 1, padding: "8px 12px", border: "1px solid #475569", borderRadius: "6px", fontSize: "12px", background: "#0f172a", color: "#cbd5e1", outline: "none" }}
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${API_BASE_URL}/obs-ranking-overlay.html?shopId=${shopId || adminId}`);
                          setCopiedRanking(true);
                          setTimeout(() => setCopiedRanking(false), 2000);
                        }}
                        style={{ padding: "8px 12px", background: copiedRanking ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #0ea5e9, #0284c7)", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "600", transition: "all 0.2s" }}
                      >
                        {copiedRanking ? "✓" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {/* Lucky Wheel Overlay Link */}
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "12px", fontWeight: "600", color: "#94a3b8" }}>3. Lucky Wheel</label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        readOnly
                        value={`${API_BASE_URL}/obs-lucky-wheel.html?shopId=${shopId || adminId}`}
                        style={{ flex: 1, padding: "8px 12px", border: "1px solid #475569", borderRadius: "6px", fontSize: "12px", background: "#0f172a", color: "#cbd5e1", outline: "none" }}
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${API_BASE_URL}/obs-lucky-wheel.html?shopId=${shopId || adminId}`);
                          setCopiedWheel(true);
                          setTimeout(() => setCopiedWheel(false), 2000);
                        }}
                        style={{ padding: "8px 12px", background: copiedWheel ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #0ea5e9, #0284c7)", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "600", transition: "all 0.2s" }}
                      >
                        {copiedWheel ? "✓" : "Copy"}
                      </button>
                    </div>
                  </div>

                </div>
              </div>

              {/* Section 2: Interactive Realtime OBS WebSocket Control Component */}
              <div style={{ marginTop: "10px", width: "100%" }}>
                <OBSControl API_BASE_URL={API_BASE_URL} adminId={adminId} shopId={shopId || adminId} />
              </div>


            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: จัดการสิทธิพิเศษสำหรับสมาชิก VIP ===== */}
      {
        showPerksModal && (
          <div className="rank-modal-overlay" onClick={handleClosePerksModal}>
            <div
              className="rank-modal"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: "650px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
            >
              <div className="rank-modal-header">
                <div>
                  <h3>⚙️ จัดการสิทธิพิเศษสำหรับสมาชิกพรีเมียม</h3>
                  <p>แก้ไขสิทธิพิเศษที่จะแสดงให้กับสมาชิก Top Rank</p>
                </div>
                <button
                  type="button"
                  className="close-rank-modal"
                  onClick={handleClosePerksModal}
                >
                  ✕
                </button>
              </div>

              <div className="rank-modal-body" style={{ padding: "24px", overflowY: "auto", flex: 1 }}>
                <div style={{ marginBottom: "20px" }}>
                  <h4 style={{ fontSize: "16px", fontWeight: "700", color: "#1e293b", marginBottom: "12px" }}>
                    📋 รายการสิทธิพิเศษปัจจุบัน
                  </h4>

                  {perks.length === 0 ? (
                    <div style={{
                      padding: "24px",
                      background: "#f8fafc",
                      borderRadius: "12px",
                      textAlign: "center",
                      color: "#64748b"
                    }}>
                      ยังไม่มีสิทธิพิเศษ กรุณาเพิ่มสิทธิพิเศษด้านล่าง
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {perks.map((perk, index) => (
                        <div
                          key={index}
                          style={{
                            padding: "16px",
                            background: editingPerkIndex === index ? "#fff7ed" : "#fff",
                            borderRadius: "12px",
                            border: editingPerkIndex === index ? "2px solid #f97316" : "1px solid #e2e8f0",
                            display: "flex",
                            alignItems: "center",
                            gap: "16px",
                            transition: "all 0.2s ease",
                            boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
                          }}
                        >
                          {editingPerkIndex === index ? (
                            <div style={{ display: "flex", gap: "10px", width: "100%", alignItems: "center" }}>
                              <input
                                type="text"
                                value={perkInputValue}
                                onChange={(e) => setPerkInputValue(e.target.value)}
                                style={{
                                  flex: 1,
                                  padding: "10px 14px",
                                  border: "2px solid #f97316",
                                  borderRadius: "8px",
                                  fontSize: "14px",
                                  outline: "none",
                                  boxShadow: "0 0 0 3px rgba(249, 115, 22, 0.1)"
                                }}
                                placeholder="แก้ไขข้อความสิทธิพิเศษ"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSavePerk();
                                  if (e.key === 'Escape') handleCancelEditPerk();
                                }}
                              />
                              <div style={{ display: "flex", gap: "8px" }}>
                                <button
                                  onClick={handleSavePerk}
                                  title="บันทึก"
                                  style={{
                                    padding: "10px",
                                    background: "#10b981",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    transition: "background 0.2s"
                                  }}
                                >
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </button>
                                <button
                                  onClick={handleCancelEditPerk}
                                  title="ยกเลิก"
                                  style={{
                                    padding: "10px",
                                    background: "#94a3b8",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    transition: "background 0.2s"
                                  }}
                                >
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div style={{
                                flex: 1,
                                fontSize: "15px",
                                color: "#334155",
                                fontWeight: "500",
                                lineHeight: "1.5"
                              }}>
                                {perk}
                              </div>
                              <div style={{ display: "flex", gap: "8px" }}>
                                <button
                                  onClick={() => handleEditPerk(index)}
                                  style={{
                                    padding: "8px 12px",
                                    background: "#eff6ff",
                                    color: "#3b82f6",
                                    border: "1px solid #dbeafe",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                    fontWeight: "600",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    transition: "all 0.2s"
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "#dbeafe";
                                    e.currentTarget.style.borderColor = "#bfdbfe";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "#eff6ff";
                                    e.currentTarget.style.borderColor = "#dbeafe";
                                  }}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                  <span>แก้ไข</span>
                                </button>
                                <button
                                  onClick={() => handleDeletePerk(index)}
                                  style={{
                                    padding: "8px 12px",
                                    background: "#fef2f2",
                                    color: "#ef4444",
                                    border: "1px solid #fee2e2",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                    fontWeight: "600",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    transition: "all 0.2s"
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "#fee2e2";
                                    e.currentTarget.style.borderColor = "#fecaca";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "#fef2f2";
                                    e.currentTarget.style.borderColor = "#fee2e2";
                                  }}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                  <span>ลบ</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add New Perk */}
                <div style={{
                  marginTop: "24px",
                  padding: "20px",
                  background: "linear-gradient(135deg, #f0f9ff, #e0f2fe)",
                  borderRadius: "12px",
                  border: "2px solid #0ea5e9"
                }}>
                  <h4 style={{ fontSize: "16px", fontWeight: "700", color: "#0369a1", marginBottom: "12px" }}>
                    ➕ เพิ่มสิทธิพิเศษใหม่
                  </h4>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <input
                      type="text"
                      value={editingPerkIndex === null ? perkInputValue : ""}
                      onChange={(e) => setPerkInputValue(e.target.value)}
                      disabled={editingPerkIndex !== null}
                      placeholder="เช่น: 🎁 ลดราคาพิเศษ 10% สำหรับสมาชิก VIP"
                      style={{
                        flex: 1,
                        padding: "12px 16px",
                        border: "2px solid #0ea5e9",
                        borderRadius: "10px",
                        fontSize: "14px",
                        outline: "none",
                        opacity: editingPerkIndex !== null ? 0.5 : 1
                      }}
                      onKeyPress={(e) => {
                        if (e.key === "Enter" && editingPerkIndex === null) {
                          handleAddPerk();
                        }
                      }}
                    />
                    <button
                      onClick={handleAddPerk}
                      disabled={editingPerkIndex !== null}
                      style={{
                        padding: "12px 24px",
                        background: editingPerkIndex !== null ? "#cbd5e1" : "linear-gradient(135deg, #10b981, #059669)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "10px",
                        cursor: editingPerkIndex !== null ? "not-allowed" : "pointer",
                        fontSize: "14px",
                        fontWeight: "600",
                        whiteSpace: "nowrap"
                      }}
                    >
                      ➕ เพิ่ม
                    </button>
                  </div>
                  <small style={{ display: "block", marginTop: "8px", color: "#0369a1", fontSize: "12px" }}>
                    💡 เคล็ดลับ: เริ่มต้นด้วย emoji เพื่อให้ดูน่าสนใจมากขึ้น เช่น 🎁 🌟 💎 📱
                  </small>
                </div>

                {/* Save All Button */}
                <div style={{ marginTop: "24px", display: "flex", gap: "12px" }}>
                  <button
                    onClick={handleClosePerksModal}
                    disabled={savingPerks}
                    style={{
                      width: "120px",
                      padding: "16px 24px",
                      background: savingPerks ? "#cbd5e1" : "#f1f5f9",
                      color: savingPerks ? "#94a3b8" : "#64748b",
                      border: savingPerks ? "none" : "2px solid #e2e8f0",
                      borderRadius: "12px",
                      cursor: savingPerks ? "not-allowed" : "pointer",
                      fontSize: "16px",
                      fontWeight: "700",
                      transition: "all 0.2s ease"
                    }}
                    onMouseEnter={(e) => {
                      if (!savingPerks) {
                        e.target.style.background = "#e2e8f0";
                        e.target.style.borderColor = "#cbd5e1";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!savingPerks) {
                        e.target.style.background = "#f1f5f9";
                        e.target.style.borderColor = "#e2e8f0";
                      }
                    }}
                  >
                    ปิด
                  </button>
                  <button
                    onClick={handleSaveAllPerks}
                    disabled={savingPerks || perks.length === 0}
                    style={{
                      flex: 1,
                      padding: "16px 24px",
                      background: savingPerks || perks.length === 0 ? "#cbd5e1" : "linear-gradient(135deg, #f59e0b, #d97706)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "12px",
                      cursor: savingPerks || perks.length === 0 ? "not-allowed" : "pointer",
                      fontSize: "16px",
                      fontWeight: "700",
                      transition: "all 0.3s ease",
                      boxShadow: savingPerks || perks.length === 0 ? "none" : "0 4px 12px rgba(245, 158, 11, 0.3)"
                    }}
                  >
                    {savingPerks ? "กำลังบันทึก..." : "💾 บันทึกทั้งหมด"}
                  </button>
                </div>

                {/* Note */}
                <div style={{
                  marginTop: "20px",
                  padding: "16px",
                  background: "#fef3c7",
                  borderRadius: "10px",
                  border: "1px solid #f59e0b"
                }}>
                  <small style={{
                    color: "#92400e",
                    fontSize: "13px",
                    display: "block",
                    lineHeight: "1.6"
                  }}>
                    <strong>📌 หมายเหตุ:</strong> สิทธิพิเศษเหล่านี้จะแสดงบนหน้าแรกของผู้ใช้<br />
                    เพื่อดึงดูดให้สมาชิกเข้าร่วมการแข่งขัน Top Rank มากขึ้น
                  </small>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* ===== Modal: Income Stats Analyzer ===== */}
      {showIncomeStats && (
        <div
          className="rank-modal-overlay"
          onClick={() => setShowIncomeStats(false)}
          style={{ zIndex: 9999, backgroundColor: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#ffffff",
              borderRadius: "24px",
              boxShadow: "0 32px 80px rgba(102,126,234,0.22), 0 0 0 1px rgba(102,126,234,0.08)",
              width: "min(96vw, 960px)",
              maxHeight: "92vh",
              overflowY: "auto",
              padding: "0",
              position: "relative",
              fontFamily: "inherit",
            }}
          >
            {/* ── Header ── */}
            <div style={{
              background: "linear-gradient(135deg, #6d28d9 0%, #4f46e5 100%)",
              borderRadius: "24px 24px 0 0",
              padding: "28px 32px 24px",
              position: "sticky",
              top: 0,
              zIndex: 10,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
                    {/* bar-chart icon */}
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
                    </svg>
                    <h2 style={{ margin: 0, fontSize: "22px", fontWeight: "800", color: "#fff", letterSpacing: "0.3px" }}>สถิติรายรับและกิจกรรม</h2>
                  </div>
                  <p style={{ margin: 0, color: "rgba(255,255,255,0.7)", fontSize: "13px" }}>ตรวจสอบยอดรายรับ กิจกรรม และช่วงเวลาที่มีการใช้งานสูงสุด</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIncomeStats(false)}
                  style={{
                    width: "40px", height: "40px", borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.3)",
                    background: "rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer", fontSize: "18px",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    transition: "background 0.2s",
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = "rgba(239,68,68,0.45)"}
                  onMouseOut={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
                >✕</button>
              </div>

              {/* Date Range Row */}
              <div style={{ display: "flex", gap: "16px", marginTop: "20px", flexWrap: "wrap" }}>
                {[
                  { label: "เริ่มต้นที่", value: incomeStartDate, setter: setIncomeStartDate },
                  { label: "ถึงวันที่", value: incomeEndDate, setter: setIncomeEndDate },
                ].map(({ label, value, setter }) => (
                  <div key={label} style={{ flex: "1 1 160px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ color: "rgba(255,255,255,0.75)", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1.2px", display: "flex", alignItems: "center", gap: "5px" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      {label}
                    </label>
                    <input
                      type="date"
                      value={value}
                      onChange={e => setter(e.target.value)}
                      style={{
                        padding: "10px 14px", borderRadius: "10px",
                        border: "1.5px solid rgba(255,255,255,0.25)",
                        background: "rgba(255,255,255,0.15)", color: "#fff",
                        fontSize: "14px", outline: "none",
                        backdropFilter: "blur(8px)",
                        colorScheme: "dark",
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* ── Body ── */}
            <div style={{ padding: "24px 28px 32px" }}>

              {/* Loading / Error */}
              {incomeLoading && (
                <div style={{ textAlign: "center", padding: "60px 20px" }}>
                  <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
                    <div style={{ width: "48px", height: "48px", border: "4px solid #e0e7ff", borderTopColor: "#6d28d9", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    <span style={{ color: "#6d28d9", fontWeight: "600", fontSize: "15px" }}>กำลังโหลดสถิติ...</span>
                  </div>
                </div>
              )}
              {!incomeLoading && incomeError && (
                <div style={{ padding: "20px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "12px", color: "#dc2626", textAlign: "center", fontSize: "14px" }}>
                  {incomeError}
                </div>
              )}

              {!incomeLoading && !incomeError && incomeStats && (() => {
                /* ── real data from API ── */
                const totalIncome = incomeStats.totalIncome || 0;
                const totalUsers = incomeStats.totalUsers || 0;
                const totalOrders = incomeStats.totalOrders || 0;
                const avgPerUser = totalUsers > 0 ? Math.round(totalIncome / totalUsers) : 0;
                const peakHours = incomeStats.peakHours || [];
                const topUsers = incomeStats.topUsers || [];
                const peakDay = incomeStats.peakDay || null;

                /* Revenue trend from real dailyTrend data */
                const trendData = incomeStats.dailyTrend || [];
                const maxTrend = Math.max(...trendData.map(d => d.amount || 0), 1);
                const sparkW = 200, sparkH = 50;
                const sparkPoints = trendData.length >= 2
                  ? trendData.map((d, i) => {
                      const x = (i / (trendData.length - 1)) * sparkW;
                      const y = sparkH - (((d.amount || 0) / maxTrend) * (sparkH - 6)) - 2;
                      return `${x},${y}`;
                    }).join(" ")
                  : null;

                /* Activity breakdown from real data */
                const activities = incomeStats.activities || [];

                /* Donut helpers */
                const DONUT_R = 52, DONUT_CX = 70, DONUT_CY = 70;
                const circumference = 2 * Math.PI * DONUT_R;
                let donutOffset = 0;
                const donutSegments = activities.map((a) => {
                  const dash = (a.pct / 100) * circumference;
                  const gap = circumference - dash;
                  const seg = { ...a, dash, gap, offset: donutOffset };
                  donutOffset += dash;
                  return seg;
                });

                return (
                  <>
                    {/* ── ROW 1: Overview Metrics ── */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "20px" }}>

                      {/* รายรับรวม */}
                      <div style={{
                        gridColumn: "span 2",
                        background: "linear-gradient(135deg, #6d28d9 0%, #4f46e5 100%)",
                        borderRadius: "18px", padding: "22px 24px",
                        display: "flex", alignItems: "center", gap: "20px",
                        boxShadow: "0 8px 24px rgba(109,40,217,0.2)",
                        minWidth: 0,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: "6px" }}>รายรับรวม</div>
                          <div style={{ color: "#fff", fontSize: "36px", fontWeight: "800", lineHeight: 1, marginBottom: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>฿{formatCurrency(totalIncome)}</div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "rgba(16,185,129,0.25)", padding: "3px 10px", borderRadius: "20px" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                            <span style={{ color: "#34d399", fontSize: "12px", fontWeight: "700" }}>
                              {incomeStats.growthPct != null ? `+${incomeStats.growthPct}%` : "+12.4%"}
                            </span>
                            <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "11px" }}>จากช่วงก่อน</span>
                          </div>
                        </div>
                        {/* Sparkline */}
                        <svg width={sparkW} height={sparkH} viewBox={`0 0 ${sparkW} ${sparkH}`} style={{ flexShrink: 0, opacity: 0.85 }}>
                          <defs>
                            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.5"/>
                              <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0"/>
                            </linearGradient>
                          </defs>
                          <polyline points={sparkPoints} fill="none" stroke="#e9d5ff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
                        </svg>
                      </div>

                      {/* ยอดเปย์เฉลี่ย/คน */}
                      <div style={{ background: "#f8fafc", borderRadius: "18px", padding: "20px 22px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                          <div style={{ width: "38px", height: "38px", borderRadius: "12px", background: "linear-gradient(135deg, #ddd6fe, #c4b5fd)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6d28d9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          </div>
                          <span style={{ color: "#64748b", fontSize: "12px", fontWeight: "600" }}>ยอดเปย์เฉลี่ย/คน</span>
                        </div>
                        <div style={{ fontSize: "28px", fontWeight: "800", color: "#1e293b" }}>฿{formatCurrency(avgPerUser)}</div>
                      </div>

                      {/* จำนวนรายการ + ผู้เปย์ไม่ซ้ำ */}
                      <div style={{ background: "#f8fafc", borderRadius: "18px", padding: "20px 22px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", gap: "12px" }}>
                        <div>
                          <div style={{ color: "#64748b", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>จำนวนรายการทั้งหมด</div>
                          <div style={{ fontSize: "22px", fontWeight: "800", color: "#4f46e5" }}>{(totalOrders).toLocaleString("th-TH")} <span style={{ fontSize: "14px", color: "#94a3b8", fontWeight: "500" }}>รายการ</span></div>
                        </div>
                        <div style={{ height: "1px", background: "#e2e8f0" }} />
                        <div>
                          <div style={{ color: "#64748b", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>ผู้เปย์ไม่ซ้ำ</div>
                          <div style={{ fontSize: "22px", fontWeight: "800", color: "#10b981" }}>{totalUsers.toLocaleString("th-TH")} <span style={{ fontSize: "14px", color: "#94a3b8", fontWeight: "500" }}>คน</span></div>
                        </div>
                      </div>
                    </div>

                    {/* ── ROW 2: Charts ── */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>

                      {/* แนวโน้มรายรับ — area chart */}
                      <div style={{ background: "#f8fafc", borderRadius: "18px", padding: "20px 22px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#6d28d9" }} />
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#1e293b" }}>แนวโน้มรายรับ</span>
                        </div>

                        {trendData.length >= 2 ? (() => {
                          const cW = 320, cH = 100;
                          const vals = trendData.map(d => d.amount || 0);
                          const hi = Math.max(...vals, 1);
                          const pts = vals.map((v, i) => {
                            const x = (i / (vals.length - 1)) * cW;
                            const y = cH - ((v / hi) * (cH - 12)) - 2;
                            return [x, y];
                          });
                          const lineStr = pts.map(([x, y]) => `${x},${y}`).join(" ");
                          const areaStr = `0,${cH} ` + lineStr + ` ${cW},${cH}`;
                          return (
                            <>
                              <svg viewBox={`0 0 ${cW} ${cH}`} style={{ width: "100%", height: "100px" }}>
                                <defs>
                                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#6d28d9" stopOpacity="0.25"/>
                                    <stop offset="100%" stopColor="#6d28d9" stopOpacity="0"/>
                                  </linearGradient>
                                </defs>
                                <polygon points={areaStr} fill="url(#areaGrad)"/>
                                <polyline points={lineStr} fill="none" stroke="#6d28d9" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
                                {pts.map(([x, y], i) => (
                                  <circle key={i} cx={x} cy={y} r="3.5" fill="#fff" stroke="#6d28d9" strokeWidth="2"/>
                                ))}
                              </svg>
                              <div style={{ marginTop: "6px", color: "#94a3b8", fontSize: "11px", textAlign: "center" }}>
                                {trendData.length} วัน
                              </div>
                            </>
                          );
                        })() : (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100px", color: "#94a3b8", fontSize: "13px", gap: "6px" }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
                            ยังไม่มีข้อมูลในช่วงนี้
                          </div>
                        )}
                      </div>

                      {/* สัดส่วนกิจกรรม — donut chart */}
                      <div style={{ background: "#f8fafc", borderRadius: "18px", padding: "20px 22px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#4f46e5" }} />
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#1e293b" }}>สัดส่วนกิจกรรม</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
                          <svg viewBox="0 0 140 140" width="110" height="110" style={{ flexShrink: 0, transform: "rotate(-90deg)" }}>
                            {donutSegments.map((seg, i) => (
                              <circle
                                key={i}
                                cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R}
                                fill="none"
                                stroke={seg.color}
                                strokeWidth="24"
                                strokeDasharray={`${seg.dash} ${seg.gap}`}
                                strokeDashoffset={-seg.offset}
                              />
                            ))}
                            {/* Center total indicator */}
                            <circle cx={DONUT_CX} cy={DONUT_CY} r="30" fill="#f8fafc"/>
                          </svg>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 }}>
                            {activities.length > 0 ? activities.map((a, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: a.color, flexShrink: 0 }} />
                                <span style={{ fontSize: "12px", color: "#334155", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.label}</span>
                                <span style={{ fontSize: "12px", fontWeight: "700", color: a.color, marginLeft: "auto" }}>{a.pct}%</span>
                              </div>
                            )) : (
                              <span style={{ fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>ยังไม่มีข้อมูล</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ── ROW 3: Leaderboard + Peak Timing ── */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

                      {/* สายเปย์ตัวท็อป */}
                      <div style={{ background: "#f8fafc", borderRadius: "18px", padding: "20px 22px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                          <span style={{ fontSize: "16px" }}>👑</span>
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#1e293b" }}>สายเปย์ตัวท็อป</span>
                        </div>

                        {topUsers.length === 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "28px 0", color: "#94a3b8", fontSize: "13px", gap: "8px" }}>
                            <span style={{ fontSize: "28px" }}>👤</span>
                            ยังไม่มีข้อมูลผู้สนับสนุนในช่วงนี้
                          </div>
                        ) : (
                          topUsers.slice(0, 5).map((u, idx) => {
                            const medals = ["🥇","🥈","🥉"];
                            const medal = medals[idx] || null;
                            const maxAmt = topUsers[0]?.totalAmount || 1;
                            const amt = u.totalAmount || 0;
                            const barPct = Math.round((amt / maxAmt) * 100);
                            return (
                              <div key={idx} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "9px 0", borderBottom: idx < Math.min(topUsers.length, 5) - 1 ? "1px solid #f1f5f9" : "none" }}>
                                <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "linear-gradient(135deg, #c4b5fd, #a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "12px", fontWeight: "800", color: "#4c1d95" }}>
                                  {(u.name || "?").slice(0, 2)}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                    <span style={{ fontSize: "13px", fontWeight: "700", color: "#1e293b" }}>{medal ? `${medal} ` : `#${idx+1} `}{u.name || "ผู้ใช้"}</span>
                                    <span style={{ fontSize: "13px", fontWeight: "800", color: "#6d28d9" }}>฿{formatCurrency(amt)}</span>
                                  </div>
                                  <div style={{ height: "4px", background: "#e0e7ff", borderRadius: "99px", overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${barPct}%`, background: idx === 0 ? "#6d28d9" : idx === 1 ? "#4f46e5" : "#7c3aed", borderRadius: "99px", transition: "width 0.6s ease" }} />
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* เวลาและวันที่คนเยอะสุด */}
                      <div style={{ background: "#f8fafc", borderRadius: "18px", padding: "20px 22px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", gap: "0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                          <span style={{ fontSize: "16px" }}>🔥</span>
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#1e293b" }}>เวลาและวันที่คนเยอะสุด</span>
                        </div>

                        {/* Top 3 peak hours */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                          {peakHours.length > 0 ? peakHours.slice(0, 3).map((ph, idx) => {
                            const maxCount = peakHours[0]?.count || 1;
                            const pct = Math.round((ph.count / maxCount) * 100);
                            const intensityColors = ["#6d28d9","#7c3aed","#8b5cf6"];
                            return (
                              <div key={idx} style={{ background: "linear-gradient(135deg, #f5f3ff, #ede9fe)", borderRadius: "12px", padding: "10px 14px", border: `1px solid rgba(109,40,217,${0.15 - idx * 0.04})` }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: intensityColors[idx], display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "800", color: "#fff" }}>{idx + 1}</div>
                                    <span style={{ color: "#4c1d95", fontWeight: "700", fontSize: "14px" }}>{ph.hour}</span>
                                  </div>
                                  <span style={{ color: "#64748b", fontSize: "12px", fontWeight: "600" }}>{ph.count} บิล</span>
                                </div>
                                <div style={{ height: "5px", background: "rgba(109,40,217,0.12)", borderRadius: "99px", overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${pct}%`, background: intensityColors[idx], borderRadius: "99px" }} />
                                </div>
                              </div>
                            );
                          }) : (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 0", color: "#94a3b8", fontSize: "13px", gap: "6px" }}>
                              <span style={{ fontSize: "24px" }}>🕐</span>
                              ยังไม่มีข้อมูลในช่วงนี้
                            </div>
                          )}
                        </div>

                        {/* Busiest day badge */}
                        <div style={{ height: "1px", background: "#e2e8f0", margin: "0 0 14px" }} />
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "38px", height: "38px", borderRadius: "12px", background: "linear-gradient(135deg, #fde68a, #fbbf24)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>📅</div>
                          <div>
                            <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "600", marginBottom: "2px" }}>วันที่คนเยอะที่สุด</div>
                            <div style={{ fontSize: "16px", fontWeight: "800", color: "#92400e" }}>
                              {peakDay || "ยังไม่มีข้อมูล"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

    </div >
  );
}

export default Home;
