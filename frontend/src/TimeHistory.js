import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import { Link } from "react-router-dom";
import "./TimeHistory.css";

function TimeHistory() {
  const [history, setHistory] = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch("http://localhost:4005/api/check-history");
        if (response.ok) {
          const data = await response.json();
          console.log("[TimeHistory] Fetched history:", data);
          setHistory(data);
        }
      } catch (error) {
        console.error("[TimeHistory] Error fetching history:", error);
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 5000);

    socketRef.current = io("http://localhost:4005");
    socketRef.current.on("status", (data) => {
      console.log("[TimeHistory] Received status event, refetching...");
      fetchHistory();
    });
    
    return () => {
      clearInterval(interval);
      socketRef.current.disconnect();
    };
  }, []);

  const textHistory = history.filter((item) => item.mode === "text");
  const imageHistory = history.filter((item) => item.mode === "image");
  const birthdayHistory = history.filter((item) => item.mode === "birthday");

  const handleRemove = (id) => {
    socketRef.current.emit("removeSetting", id);
  };

  return (
    <div className="th-minimal-container">
      <header className="th-minimal-header">
        <Link to="/home" className="th-minimal-back-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 19l-7-7 7-7" />
          </svg>
          <span>ย้อนกลับ</span>
        </Link>
        <h1 className="th-minimal-title">ประวัติการตั้งเวลา</h1>
        <div style={{ width: "120px" }}></div>
      </header>

      <main className="th-minimal-main">
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
                  <span>{item.price} บาท</span>
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
                  <span>{item.price} บาท</span>
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
                  <span>{item.price} บาท</span>
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
