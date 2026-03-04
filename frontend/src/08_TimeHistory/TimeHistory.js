import React, { useEffect, useState, useContext } from "react";
import { Link } from "react-router-dom"; // สำหรับการนำทางกลับหน้า Home
import { API_BASE_URL } from "../config/apiConfig"; // ใช้ API_BASE_URL จาก config
import adminFetch from "../config/authFetch"; // 🔒 Admin auth utility + 401 redirect
import { ShopContext } from "../contexts/ShopContext"; // 🔧 Multi-tenant: นำเข้า ShopContext สำหรับจัดการ socket และ shopId
import "./TimeHistory.css"; // ไฟล์ CSS สำหรับตกแต่งหน้านี้

// Component หน้าประวัติการตั้งเวลา - แสดงประวัติการตั้งค่าทั้งหมด (ข้อความ, รูปภาพ, วันเกิด)
function TimeHistory() {
  // ===== State Management =====
  const [history, setHistory] = useState([]); // เก็บข้อมูลประวัติการตั้งค่าทั้งหมด
  // 🔧 Multi-tenant: ใช้ socket จาก ShopContext แทนการสร้าง connection เอง
  const { socket, isSocketConnected } = useContext(ShopContext);

  // ===== Effect Hook: ดึงข้อมูลประวัติและตั้งค่า Real-time Connection =====
  useEffect(() => {
    // ฟังก์ชันดึงข้อมูลประวัติจาก API
    const fetchHistory = async () => {
      try {
        const response = await adminFetch(`${API_BASE_URL}/api/time-history`);
        if (response.ok) {
          const data = await response.json();
          console.log("[TimeHistory] Fetched history:", data);
          setHistory(data); // อัปเดต state ด้วยข้อมูลที่ได้
        }
      } catch (error) {
        console.error("[TimeHistory] Error fetching history:", error);
      }
    };

    // ดึงข้อมูลครั้งแรกเมื่อ Component โหลด
    fetchHistory();
    // ตั้งเวลาดึงข้อมูลใหม่ทุกๆ 5 วินาที
    const interval = setInterval(fetchHistory, 5000);

    // 🔧 Multi-tenant: ตรวจสอบว่า socket จาก Context พร้อมใช้งาน
    if (!socket) {
      console.log("[TimeHistory] Socket not available yet");
      return () => clearInterval(interval);
    }

    // รับฟัง event "status" จาก Server เพื่ออัปเดตข้อมูลทันที
    socket.on("status", (data) => {
      console.log("[TimeHistory] Received status event, refetching...");
      fetchHistory(); // ดึงข้อมูลใหม่เมื่อมีการเปลี่ยนแปลง
    });

    // Cleanup function: ยกเลิก interval และ socket listeners
    return () => {
      clearInterval(interval);
      // 🔧 Multi-tenant: ตรวจสอบว่า socket ยังมีอยู่ก่อน cleanup (Context จัดการ disconnect)
      if (socket) {
        socket.off("status");
      }
    };
    // 🔧 Multi-tenant: เพิ่ม socket ใน dependencies เพื่อ re-subscribe เมื่อ socket เปลี่ยน
  }, [socket]);

  // ===== กรองข้อมูลประวัติตามประเภท (Mode) =====
  const textHistory = history.filter((item) => item.mode === "text"); // ประวัติการตั้งค่าข้อความ
  const imageHistory = history.filter((item) => item.mode === "image"); // ประวัติการตั้งค่ารูปภาพ
  const birthdayHistory = history.filter((item) => item.mode === "birthday"); // ประวัติการตั้งค่าวันเกิด

  // ===== ฟังก์ชัน: ลบประวัติตาม ID =====
  const handleRemove = (id) => {
    // ส่ง event removeSetting ไปยัง Realtime Server เพื่อลบข้อมูล
    // 🔧 Multi-tenant: ตรวจสอบว่า socket พร้อมใช้งานก่อน emit
    if (socket) {
      socket.emit("removeSetting", id);
    } else {
      console.warn("[TimeHistory] Cannot remove - socket not connected");
    }
  };

  // ===== Render UI =====
  return (
    <div className="th-minimal-container">
      {/* Header พร้อมปุ่มย้อนกลับ */}
      <header className="th-minimal-header">
        <Link to="/home" className="th-minimal-back-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 19l-7-7 7-7" />
          </svg>
          <span>ย้อนกลับ</span>
        </Link>
        <h1 className="th-minimal-title">ประวัติการตั้งเวลา</h1>
        <div style={{ width: "120px" }}></div> {/* Spacer สำหรับจัดตำแหน่ง */}
      </header>

      {/* Main Content: แสดงประวัติแบ่งเป็น 3 หมวด */}
      <main className="th-minimal-main">
        {/* Card แสดงประวัติข้อความ */}
        <div className="th-minimal-card th-card-text">
          <h2 className="th-minimal-card-title th-text">📝 ข้อความ</h2>
          {textHistory.length === 0 ? (
            <p className="th-minimal-empty">ไม่มีประวัติการตั้งค่าข้อความ</p>
          ) : (
            textHistory.map((item) => (
              <div key={item.id} className="th-minimal-item th-item-text">
                <div>
                  <span className="th-minimal-label">🕒 วันที่:</span>
                  <span>{item.date}</span>
                </div>
                <div>
                  <span className="th-minimal-label">⏱ ระยะเวลา:</span>
                  <span>{item.duration}</span>
                </div>
                <div>
                  <span className="th-minimal-label">💵 ราคา:</span>
                  <span>{item.price === 0 ? 'ฟรี' : `${item.price} บาท`}</span>
                </div>
                <button
                  className="th-minimal-remove-btn"
                  onClick={() => handleRemove(item.id)}
                >
                  🗑️ ลบ
                </button>
              </div>
            ))
          )}
        </div>

        {/* Card แสดงประวัติรูปภาพ */}
        <div className="th-minimal-card th-card-image">
          <h2 className="th-minimal-card-title th-image">🖼️ รูปภาพ</h2>
          {imageHistory.length === 0 ? (
            <p className="th-minimal-empty">ไม่มีประวัติการตั้งค่ารูปภาพ</p>
          ) : (
            imageHistory.map((item) => (
              <div key={item.id} className="th-minimal-item th-item-image">
                <div>
                  <span className="th-minimal-label">🕒 วันที่:</span>
                  <span>{item.date}</span>
                </div>
                <div>
                  <span className="th-minimal-label">⏱ ระยะเวลา:</span>
                  <span>{item.duration}</span>
                </div>
                <div>
                  <span className="th-minimal-label">💵 ราคา:</span>
                  <span>{item.price === 0 ? 'ฟรี' : `${item.price} บาท`}</span>
                </div>
                <button
                  className="th-minimal-remove-btn"
                  onClick={() => handleRemove(item.id)}
                >
                  🗑️ ลบ
                </button>
              </div>
            ))
          )}
        </div>

        {/* Card แสดงประวัติวันเกิด */}
        <div className="th-minimal-card th-card-birthday">
          <h2 className="th-minimal-card-title th-birthday">🎂 วันเกิด</h2>
          {birthdayHistory.length === 0 ? (
            <p className="th-minimal-empty">ไม่มีประวัติการตั้งค่าวันเกิด</p>
          ) : (
            birthdayHistory.map((item) => (
              <div key={item.id} className="th-minimal-item th-item-birthday">
                <div>
                  <span className="th-minimal-label">🕒 วันที่:</span>
                  <span>{item.date}</span>
                </div>
                <div>
                  <span className="th-minimal-label">⏱ ระยะเวลา:</span>
                  <span>{item.duration}</span>
                </div>
                <div>
                  <span className="th-minimal-label">💵 ราคา:</span>
                  <span>{item.price === 0 ? 'ฟรี' : `${item.price} บาท`}</span>
                </div>
                <button
                  className="th-minimal-remove-btn"
                  onClick={() => handleRemove(item.id)}
                >
                  🗑️ ลบ
                </button>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

export default TimeHistory;
