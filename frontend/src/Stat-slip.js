// ==========================================
// 📦 นำเข้า Dependencies และ Modules
// ==========================================
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL, REALTIME_URL } from "./config/apiConfig"; 

// ==========================================
// 📊 Component แสดงสถิติสลิปการโอนเงิน
// ==========================================
function AdminStatSlip() {
  // ==========================================
  // 📌 State Management
  // ==========================================
  const [statSlips, setStatSlips] = useState([]); // เก็บข้อมูลรายการ stat-slip ทั้งหมด // เก็บข้อมูลรายการ stat-slip ทั้งหมด

  // ==========================================
  // 🔄 ดึงข้อมูลจาก API เมื่อโหลดหน้า
  // ==========================================
  useEffect(() => {
    // เรียก API เพื่อดึงข้อมูล stat-slip
    axios.get(`${API_BASE_URL}/api/stat-slip`).then((res) => {
      setStatSlips(res.data); // เก็บข้อมูลที่ได้ลงใน state
    });
  }, []); // [] = ทำงานครั้งเดียวตอน mount // [] = ทำงานครั้งเดียวตอน mount

  // ==========================================
  // 🎨 Render UI
  // ==========================================
  return (
    <div style={{ maxWidth: 800, margin: "40px auto", padding: 24, background: "#fff", borderRadius: 12, boxShadow: "0 2px 12px rgba(30,41,59,0.08)" }}>
      
      {/* ========================================== */}
      {/* 🔘 ส่วนปุ่มนำทาง (Header Buttons) */}
      {/* ========================================== */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        {/* ปุ่มกลับหน้า Home */}
        <Link to="/home">
          <button
            style={{
              width: 140,
              background: "#64748b",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 0",
              fontWeight: 500,
              fontSize: "1rem",
              boxShadow: "0 2px 8px rgba(30,41,59,0.08)",
              transition: "background 0.2s, box-shadow 0.2s",
              cursor: "pointer"
            }}
            onMouseOver={e => e.currentTarget.style.background = "#475569"} // สีเข้มขึ้นเมื่อ hover
            onMouseOut={e => e.currentTarget.style.background = "#64748b"} // กลับเป็นสีเดิม
          >
            Home
          </button>
        </Link>
        
        {/* ปุ่มไปหน้า Admin Report */}
        <Link to="/report">
          <button
            style={{
              width: 140,
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 0",
              fontWeight: 500,
              fontSize: "1rem",
              boxShadow: "0 2px 8px rgba(30,41,59,0.08)",
              transition: "background 0.2s, box-shadow 0.2s",
              cursor: "pointer"
            }}
            onMouseOver={e => e.currentTarget.style.background = "#1d4ed8"} // สีเข้มขึ้นเมื่อ hover
            onMouseOut={e => e.currentTarget.style.background = "#2563eb"} // กลับเป็นสีเดิม
          >
            Admin Report
          </button>
        </Link>
      </div>
      
      {/* ========================================== */}
      {/* 📋 ส่วนตารางแสดงข้อมูล Stat-slip */}
      {/* ========================================== */}
      <h2 style={{ textAlign: "center", color: "#1a237e", marginBottom: 24 }}>รายการ Stat-slip</h2>
      
      {/* ตารางข้อมูล */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "1rem" }}>
        {/* ส่วนหัวตาราง */}
        <thead>
          <tr style={{ background: "#e3e8f0" }}>
            <th style={{ padding: "10px 6px", border: "1px solid #cbd5e1" }}>เวลา</th>
            <th style={{ padding: "10px 6px", border: "1px solid #cbd5e1" }}>สถานะ</th>
            <th style={{ padding: "10px 6px", border: "1px solid #cbd5e1" }}>รายละเอียด</th>
            <th style={{ padding: "10px 6px", border: "1px solid #cbd5e1" }}>จำนวนเงิน</th>
          </tr>
        </thead>
        
        {/* ส่วนเนื้อหาตาราง */}
        {/* ส่วนเนื้อหาตาราง */}
        <tbody>
          {/* ตรวจสอบว่ามีข้อมูลหรือไม่ */}
          {statSlips.length === 0 ? (
            // กรณีไม่มีข้อมูล - แสดงข้อความ
            <tr>
              <td colSpan={4} style={{ textAlign: "center", padding: 24, color: "#888" }}>
                ไม่มีข้อมูล Stat-slip
              </td>
            </tr>
          ) : (
            // กรณีมีข้อมูล - แสดงรายการทั้งหมด
            statSlips.map((r, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#f8fafc" : "#fff" }}> {/* สลับสีแถว */}
                {/* คอลัมน์เวลา */}
                <td style={{ padding: "8px 6px", border: "1px solid #e2e8f0" }}>
                  {new Date(r.time).toLocaleString()} {/* แปลงเวลาเป็นรูปแบบที่อ่านง่าย */}
                </td>
                
                {/* คอลัมน์สถานะ - สีเขียวถ้า success, สีแดงถ้าไม่ใช่ */}
                <td style={{ padding: "8px 6px", border: "1px solid #e2e8f0", color: r.status === "success" ? "green" : "red", fontWeight: "bold" }}>
                  {r.status}
                </td>
                
                {/* คอลัมน์รายละเอียด */}
                <td style={{ padding: "8px 6px", border: "1px solid #e2e8f0" }}>{r.detail}</td>
                
                {/* คอลัมน์จำนวนเงิน */}
                <td style={{ padding: "8px 6px", border: "1px solid #e2e8f0" }}>{r.amount}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ส่งออก Component
export default AdminStatSlip;