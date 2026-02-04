import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL, REALTIME_URL } from "./config/apiConfig"; 

function AdminStatSlip() {
  const [statSlips, setStatSlips] = useState([]);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/stat-slip`).then((res) => {
      setStatSlips(res.data);
    });
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", padding: 24, background: "#fff", borderRadius: 12, boxShadow: "0 2px 12px rgba(30,41,59,0.08)" }}>
      {/* Header ปุ่ม */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
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
            onMouseOver={e => e.currentTarget.style.background = "#475569"}
            onMouseOut={e => e.currentTarget.style.background = "#64748b"}
          >
            Home
          </button>
        </Link>
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
            onMouseOver={e => e.currentTarget.style.background = "#1d4ed8"}
            onMouseOut={e => e.currentTarget.style.background = "#2563eb"}
          >
            Admin Report
          </button>
        </Link>
      </div>
      {/* ตาราง Stat-slip */}
      <h2 style={{ textAlign: "center", color: "#1a237e", marginBottom: 24 }}>รายการ Stat-slip</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "1rem" }}>
        <thead>
          <tr style={{ background: "#e3e8f0" }}>
            <th style={{ padding: "10px 6px", border: "1px solid #cbd5e1" }}>เวลา</th>
            <th style={{ padding: "10px 6px", border: "1px solid #cbd5e1" }}>สถานะ</th>
            <th style={{ padding: "10px 6px", border: "1px solid #cbd5e1" }}>รายละเอียด</th>
            <th style={{ padding: "10px 6px", border: "1px solid #cbd5e1" }}>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {statSlips.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ textAlign: "center", padding: 24, color: "#888" }}>
                ไม่มีข้อมูล Stat-slip
              </td>
            </tr>
          ) : (
            statSlips.map((r, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#f8fafc" : "#fff" }}>
                <td style={{ padding: "8px 6px", border: "1px solid #e2e8f0" }}>
                  {new Date(r.time).toLocaleString()}
                </td>
                <td style={{ padding: "8px 6px", border: "1px solid #e2e8f0", color: r.status === "success" ? "green" : "red", fontWeight: "bold" }}>
                  {r.status}
                </td>
                <td style={{ padding: "8px 6px", border: "1px solid #e2e8f0" }}>{r.detail}</td>
                <td style={{ padding: "8px 6px", border: "1px solid #e2e8f0" }}>{r.amount}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default AdminStatSlip;