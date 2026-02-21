import React, { useState, useEffect, useCallback, useRef } from "react";
import { io } from "socket.io-client";
import { API_BASE_URL, REALTIME_URL } from "./config/apiConfig";
import "./home.css";

// เชื่อมต่อกับ Realtime Server สำหรับการอัพเดทแบบ Real-time
const socket = io(REALTIME_URL);

// จำนวนอันดับสูงสุดที่จะแสดงในหน้าหลัก (Top 10)
const RANK_LIMIT = 10;

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

function Home() {
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
  const [topRanks, setTopRanks] = useState([]); // ข้อมูลอันดับ Top 10
  const [totalRankers, setTotalRankers] = useState(0); // จำนวนผู้ใช้ทั้งหมดที่มีอันดับ
  const [rankLoading, setRankLoading] = useState(true); // สถานะกำลังโหลดข้อมูลอันดับ
  const [refreshingRanks, setRefreshingRanks] = useState(false); // สถานะกำลังรีเฟรชข้อมูล
  const [rankError, setRankError] = useState(""); // ข้อความแสดงข้อผิดพลาด
  const [rankingType, setRankingType] = useState("alltime"); // ประเภทอันดับสำหรับ Admin ดู (daily, monthly, alltime)
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

  // ===== State สำหรับปุ่ม Copy OBS Links =====
  const [copiedImage, setCopiedImage] = useState(false); // สถานะคัดลอกลิงก์ Image Overlay
  const [copiedRanking, setCopiedRanking] = useState(false); // สถานะคัดลอกลิงก์ Ranking Overlay
  const [copiedWheel, setCopiedWheel] = useState(false); // สถานะคัดลอกลิงก์ Lucky Wheel

  // ===== State สำหรับ QR Code Modal =====
  const [showQrModal, setShowQrModal] = useState(false); // เปิด/ปิด Modal QR Code
  const [qrCodeUrl, setQrCodeUrl] = useState(""); // URL ของ QR Code

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
  useEffect(() => {
    socket.on("status", (config) => {
      setSystemOn(config.systemOn);
      setEnableImage(config.enableImage);
      setEnableText(config.enableText);
      setEnableGift(config.enableGift ?? true);
      setEnableBirthday(config.enableBirthday ?? true);
    });
    socket.emit("getConfig");
    return () => socket.off("status");
  }, []);

  // ===== useEffect: รับฟังการเปลี่ยนแปลงประเภทอันดับที่แสดงต่อสาธารณะ =====
  // เมื่อ Admin เปลี่ยนประเภทอันดับที่แสดงบนหน้าจอผู้ใช้
  useEffect(() => {
    socket.on("publicRankingTypeUpdated", (data) => {
      console.log("[Admin] Public ranking type updated:", data.type);
      setPublicRankingType(data.type);
    });

    return () => socket.off("publicRankingTypeUpdated");
  }, []);

  // ===== ฟังก์ชัน: โหลดข้อมูลอันดับ Top 10 =====
  // silent = true จะไม่แสดง loading indicator (ใช้เวลารีเฟรช)
  const loadTopRanks = useCallback(async (silent = false) => {
    if (silent) setRefreshingRanks(true);
    else setRankLoading(true);

    try {
      setRankError("");
      const res = await fetch(`${API_BASE_URL}/api/rankings?limit=${RANK_LIMIT}&type=${rankingType}`);
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
  }, [rankingType]);

  // ===== useEffect: โหลดข้อมูลเริ่มต้น =====
  // โหลดอันดับและยอดใช้จ่ายวันเกิดเมื่อเริ่มต้น
  useEffect(() => {
    loadTopRanks();
    loadBirthdayRequirement();
  }, [loadTopRanks]);

  // ===== useEffect: โหลดอันดับใหม่เมื่อเปลี่ยนประเภท =====
  // Reset cache ของ Modal และโหลดข้อมูลใหม่
  useEffect(() => {
    setAllRanksLoaded(false); // Reset modal cache when type changes
    setAllRanks([]);
    loadTopRanks();
  }, [rankingType, loadTopRanks]);

  // ===== ฟังก์ชัน: โหลดยอดใช้จ่ายขั้นต่ำสำหรับวันเกิด =====
  const loadBirthdayRequirement = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/config/birthday-requirement`);
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
    const newStatus = !systemOn;
    setSystemOn(newStatus);

    if (!newStatus) {
      setEnableImage(false);
      setEnableText(false);
      setEnableGift(false);
      setEnableBirthday(false);
      socket.emit("adminUpdateConfig", {
        systemOn: newStatus,
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
        systemOn: newStatus,
        enableImage: true,
        enableText: true,
        enableGift: true,
        enableBirthday: true,
      });
    }
  };

  // ===== ฟังก์ชัน: เปิด/ปิดฟังก์ชันส่งรูปภาพ =====
  const handleToggleImage = () => {
    const newStatus = !enableImage;
    setEnableImage(newStatus);
    socket.emit("adminUpdateConfig", {
      enableImage: newStatus,
      systemOn,
      enableText,
      enableGift,
      enableBirthday,
    });
  };

  // ===== ฟังก์ชัน: เปิด/ปิดฟังก์ชันข้อความ =====
  const handleToggleText = () => {
    const newStatus = !enableText;
    setEnableText(newStatus);
    socket.emit("adminUpdateConfig", {
      enableText: newStatus,
      systemOn,
      enableImage,
      enableGift,
      enableBirthday,
    });
  };

  // ===== ฟังก์ชัน: เปิด/ปิดฟังก์ชันส่งของขวัญ =====
  const handleToggleGift = () => {
    const newStatus = !enableGift;
    setEnableGift(newStatus);
    socket.emit("adminUpdateConfig", {
      enableGift: newStatus,
      systemOn,
      enableImage,
      enableText,
      enableBirthday,
    });
  };

  // ===== ฟังก์ชัน: เปิด/ปิดฟังก์ชันอวยพรวันเกิด =====
  const handleToggleBirthday = () => {
    const newStatus = !enableBirthday;
    setEnableBirthday(newStatus);
    socket.emit("adminUpdateConfig", {
      enableBirthday: newStatus,
      systemOn,
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
      const res = await fetch(`${API_BASE_URL}/api/config/birthday-requirement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        const res = await fetch(`${API_BASE_URL}/api/config/perks`);
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
      const res = await fetch(`${API_BASE_URL}/api/config/perks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perks })
      });

      if (res.ok) {
        // Broadcast perks update to all users via Socket.IO
        console.log("[Admin] 🔥 Broadcasting perks update via Socket.IO:", perks.length, "items");
        socket.emit("adminUpdatePerks", { perks });
        console.log("[Admin] ✅ Socket emitted: adminUpdatePerks");
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

    socket.emit("addSetting", packageData);
    setMinute("");
    setSecond("");
    setPrice("");
    alert("บันทึกแพ็คเกจสำเร็จ");
  };

  // ===== ฟังก์ชัน: กำหนดประเภทอันดับที่จะแสดงบนหน้าจอผู้ใช้ =====
  // Broadcast ไปยังทุกผู้ใช้แบบ Real-time
  const handleSetPublicRankingType = (type) => {
    console.log("[Admin] Broadcasting public ranking type:", type);
    socket.emit("setPublicRankingType", { type });
  };

  // ===== ฟังก์ชัน: สร้าง QR Code สำหรับลูกค้าสแกนเข้าระบบ =====
  const generateQRCode = () => {
    const userAppUrl = `https://cmesuserfrontend.vercel.app/?shopId=${adminId}`;
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
      const res = await fetch(`${API_BASE_URL}/api/rankings?limit=500&type=${rankingType}`);
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
          <span className="brand-title">CMES ADMIN</span>
        </div>
        <nav className="nav-minimal">
          <a href="/TimeHistory">ประวัติการตั้งเวลา</a>
          <a href="/image-queue">ตรวจสอบรูปภาพ</a>
          <a href="/report">รายงาน</a>
          <a href="/check-history">ประวัติการตรวจสอบ</a>
          <a href="/lucky-wheel">วงล้อเสี่ยงดวง</a>
          <a href="/gift-setting">ตั้งค่าส่งของขวัญ</a>
        </nav>
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

                      {/* OBS Links Section */}
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

                    {/* QR Code Section */}
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
                        <small>อันดับ 1-10 • รวม {totalRankers} คน</small>
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

                    {/* ตัวเลือกประเภทอันดับสำหรับ Admin (รายวัน/รายเดือน/ตลอดกาล) */}
                    <div className="ranking-type-selector">
                      <button
                        className={`ranking-type-btn ${rankingType === "daily" ? "active" : ""}`}
                        onClick={() => setRankingType("daily")}
                      >
                        รายวัน
                      </button>
                      <button
                        className={`ranking-type-btn ${rankingType === "monthly" ? "active" : ""}`}
                        onClick={() => setRankingType("monthly")}
                      >
                        รายเดือน
                      </button>
                      <button
                        className={`ranking-type-btn ${rankingType === "alltime" ? "active" : ""}`}
                        onClick={() => setRankingType("alltime")}
                      >
                        ตลอดกาล
                      </button>
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
                        navigator.clipboard.writeText(`https://cmesuserfrontend.vercel.app/?shopId=${adminId}`);
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
                      📋 คัดลอกลิงก์
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
                      https://cmesuserfrontend.vercel.app/?shopId={adminId}
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
      )}

      {/* ===== Modal: จัดการสิทธิพิเศษสำหรับสมาชิก VIP ===== */}
      {showPerksModal && (
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
      )}
    </div>
  );
}

export default Home;
