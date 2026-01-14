import React, { useState, useEffect, useCallback } from "react";
import { io } from "socket.io-client";
import "./home.css";

const socket = io("http://localhost:4005");
const API_BASE_URL = (() => {
  const envUrl = (process.env.REACT_APP_ADMIN_API_BASE || "").trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const origin = window.location.origin.replace(/\/$/, "");
    if (!origin.includes("localhost")) {
      return origin;
    }
  }
  return "http://localhost:5001";
})();
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

  const [showAllRanks, setShowAllRanks] = useState(false);
  const [allRanks, setAllRanks] = useState([]);
  const [allRanksLoaded, setAllRanksLoaded] = useState(false);
  const [fetchingAllRanks, setFetchingAllRanks] = useState(false);
  const [allRankError, setAllRankError] = useState("");

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
   * Load ranking top 10
   */
  const loadTopRanks = useCallback(async (silent = false) => {
    if (silent) setRefreshingRanks(true);
    else setRankLoading(true);

    try {
      setRankError("");
      const res = await fetch(`${API_BASE_URL}/api/rankings?limit=${RANK_LIMIT}`);
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
  }, []);

  useEffect(() => {
    loadTopRanks();
    loadBirthdayRequirement();
  }, [loadTopRanks]);

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
   * Ranking modal
   */
  const handleOpenAllRanks = async () => {
    setShowAllRanks(true);
    if (allRanksLoaded || fetchingAllRanks) return;

    setFetchingAllRanks(true);
    setAllRankError("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/rankings?limit=500`);
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
          <span className="brand-title">CMS ADMIN</span>
        </div>
        <nav className="nav-minimal">
          <a href="/TimeHistory">ประวัติการตั้งเวลา</a>
          <a href="/image-queue">ตรวจสอบรูปภาพ</a>
          <a href="/report">รายงาน</a>
          <a href="/check-history">ประวัติการตรวจสอบ</a>
          <a href="/lucky-wheel">วงล้อเสี่ยงดวง</a>
          <a href="/gift-setting">ตั้งค่าส่งของขวัญ</a>
          <a href="http://localhost:5001/obs-image-overlay.html" target="_blank" rel="noreferrer">OBS Image Overlay</a>
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
          </section>

          {/* กล่องขวา - VIP Supporters */}
          <aside className="vip-card">
            <div className="rank-panel-heading">
              <div>
                <p className="rank-panel-title">VIP Supporters</p>
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
                        ฿{formatCurrency(entry.points)}
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
                          ฿{formatCurrency(entry.points)}
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
    </div>
  );
}

export default Home;
