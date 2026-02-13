import React, { useState, useEffect, useCallback } from "react";
import { io } from "socket.io-client";
import { API_BASE_URL, REALTIME_URL } from "./config/apiConfig";
import "./home.css";

// Realtime Server URL
const socket = io(REALTIME_URL);

const RANK_LIMIT = 10;

const formatCurrency = (value) => Number(value || 0).toLocaleString("th-TH");
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
  const [systemOn, setSystemOn] = useState(true);
  const [enableImage, setEnableImage] = useState(true);
  const [enableText, setEnableText] = useState(true);
  const [enableGift, setEnableGift] = useState(true);
  const [enableBirthday, setEnableBirthday] = useState(true);
  const [birthdaySpendingRequirement, setBirthdaySpendingRequirement] = useState(100);
  const [mode, setMode] = useState("image");
  const [minute, setMinute] = useState("");
  const [second, setSecond] = useState("");
  const [price, setPrice] = useState("");

  const [topRanks, setTopRanks] = useState([]);
  const [totalRankers, setTotalRankers] = useState(0);
  const [rankLoading, setRankLoading] = useState(true);
  const [refreshingRanks, setRefreshingRanks] = useState(false);
  const [rankError, setRankError] = useState("");
  const [rankingType, setRankingType] = useState("alltime"); // daily, monthly, alltime (LOCAL ADMIN VIEW)
  const [publicRankingType, setPublicRankingType] = useState("alltime"); // PUBLIC BROADCAST STATE

  const [showAllRanks, setShowAllRanks] = useState(false);
  const [allRanks, setAllRanks] = useState([]);
  const [allRanksLoaded, setAllRanksLoaded] = useState(false);
  const [fetchingAllRanks, setFetchingAllRanks] = useState(false);
  const [allRankError, setAllRankError] = useState("");

  // 🔥 ดึง adminId จาก localStorage
  const adminId = localStorage.getItem("adminId") || "default-admin";
  const adminUsername = localStorage.getItem("adminUsername") || "Admin";

  // Copy button states
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedRanking, setCopiedRanking] = useState(false);
  const [copiedWheel, setCopiedWheel] = useState(false);

  // QR Code Modal states
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  /*
   * Load system config from socket.io
   */
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

  /*
   * Listen for public ranking type updates
   */
  useEffect(() => {
    socket.on("publicRankingTypeUpdated", (data) => {
      console.log("[Admin] Public ranking type updated:", data.type);
      setPublicRankingType(data.type);
    });

    return () => socket.off("publicRankingTypeUpdated");
  }, []);

  /*
   * Load ranking top 10
   */
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

  useEffect(() => {
    loadTopRanks();
    loadBirthdayRequirement();
  }, [loadTopRanks]);

  // Reload rankings when type changes
  useEffect(() => {
    setAllRanksLoaded(false); // Reset modal cache when type changes
    setAllRanks([]);
    loadTopRanks();
  }, [rankingType, loadTopRanks]);

  /*
   * Load birthday spending requirement
   */
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

  /* Toggle System */
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

  /* Feature toggles */
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

  /*
   * Save birthday spending requirement
   */
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

  /*
   * Save package settings
   */
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

  /*
   * Broadcast public ranking type change
   */
  const handleSetPublicRankingType = (type) => {
    console.log("[Admin] Broadcasting public ranking type:", type);
    socket.emit("setPublicRankingType", { type });
  };

  /*
   * Generate QR Code for User App
   */
  const generateQRCode = () => {
    const userAppUrl = `https://cmesuserfrontend.vercel.app/?shopId=${adminId}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(userAppUrl)}&format=png&ecc=H`;
    setQrCodeUrl(qrApiUrl);
    setShowQrModal(true);
  };

  /*
   * Ranking modal
   */
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

  const handleCloseAllRanks = () => setShowAllRanks(false);
  const modalRanks = allRanks.length ? allRanks : topRanks;

  /* ------------------------------------------------------
   * RENDER
   * ------------------------------------------------------ */
  return (
    <div className="admin-home-minimal">
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

        {/* System toggle */}
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

        {!systemOn && (
          <div className="system-off-msg-minimal">
            ระบบถูกปิด ฝั่งผู้ใช้จะไม่สามารถใช้งานได้
          </div>
        )}

        {/* ⭐⭐ กล่อง 3 กล่อง (เรียงแนวนอน) ⭐⭐ */}
        <div className="three-box-container">

          {/* กล่องซ้าย - ฟังก์ชันต่าง ๆ */}
          <section className="feature-card">
            <h3>ฟังก์ชันต่างๆ</h3>

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
          </section>

          {/* กล่องกลาง - ตั้งค่าแพ็กเกจ */}
          <section className="package-settings-card">
            <h2>ตั้งค่าแพ็คเกจ</h2>

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
          </section>

          {/* กล่องขวา - VIP Supporters */}
          <aside className="vip-card">
            {/* 🔴 PUBLIC DISPLAY CONTROL SECTION */}
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

            {/* Divider */}
            <div style={{
              height: "1px",
              background: "linear-gradient(90deg, transparent, #e2e8f0, transparent)",
              margin: "20px 0"
            }}></div>

            {/* ADMIN LOCAL VIEW SECTION */}
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

            {/* Ranking Type Selector (LOCAL ADMIN VIEW) */}
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
          </aside>
        </div>
      </main>

      {/* Modal */}
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

      {/* QR Code Modal */}
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
                      💡 <strong>คำแนะนำ:</strong> พิมพ์ QR Code นี้ติดไว้ที่โต๊ะหรือบริเวณร้าน<br/>
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
    </div>
  );
}

export default Home;
