// นำเข้า React hooks และ component ที่จำเป็น
import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom"; // Import Link สำหรับการนำทาง
import { API_BASE_URL, REALTIME_URL } from "../config/apiConfig"; // URL ของ API และ Realtime Server
import adminFetch from "../config/authFetch"; // 🔒 Admin auth utility + 401 redirect
import "./LuckyWheel.css";

// ฟังก์ชันสุ่มเลขจำนวนเต็มระหว่าง min และ max
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// สีเริ่มต้นสำหรับแต่ละช่องของวงล้อ (10 สี หมุนเวียนใช้)
const defaultColors = [
  "#f87171", "#fbbf24", "#34d399", "#60a5fa", "#a78bfa", "#f472b6", "#facc15", "#4ade80", "#38bdf8", "#818cf8"
];

function LuckyWheel() {
  // ===== State Management =====
  const [segments, setSegments] = useState(["โต๊ะ 1", "โต๊ะ 2", "โต๊ะ 3"]); // รายการช่องในวงล้อ
  const [input, setInput] = useState(""); // ข้อความที่พิมพ์ใน textarea
  const [tableRange, setTableRange] = useState({ from: "", to: "" }); // ช่วงเลขโต๊ะที่ต้องการเพิ่ม
  const [spinning, setSpinning] = useState(false); // สถานะกำลังหมุนวงล้อหรือไม่
  const [winner, setWinner] = useState(null); // index ของผู้ชนะ
  const [editIndex, setEditIndex] = useState(null); // index ของช่องที่กำลังแก้ไข
  const [editValue, setEditValue] = useState(""); // ค่าใหม่ที่กำลังแก้ไข
  const [showPopup, setShowPopup] = useState(false); // แสดง popup ผู้ชนะหรือไม่
  const [popupEffect, setPopupEffect] = useState(false); // เอฟเฟกต์การแสดง popup
  const [reward, setReward] = useState(""); // ของรางวัล
  const [previewing, setPreviewing] = useState(false); // สถานะการแสดงผลบน OBS
  const textareaRef = useRef(null); // Reference ไปยัง textarea
  const wheelRef = useRef(null); // Reference ไปยัง element วงล้อ

  // ===== Effect Hook: อัปเดต OBS อัตโนมัติเมื่อมีการเปลี่ยนแปลงช่องขณะที่กำลัง preview =====
  useEffect(() => {
    // ถ้ากำลัง preview อยู่และมีช่องในวงล้อ ให้อัปเดตไปยัง OBS
    if (previewing && segments.length > 0) {
      adminFetch(`${REALTIME_URL}/api/lucky-wheel/preview`, {
        method: "POST",
        body: JSON.stringify({ segments })
      }).catch(err => console.error(err));
    }
  }, [segments, previewing]); // รันใหม่เมื่อ segments หรือ previewing เปลี่ยนแปลง

  // ===== ฟังก์ชัน: เปิด/ปิดการแสดงผลบน OBS =====
  const togglePreview = () => {
    const newState = !previewing;
    setPreviewing(newState);

    if (newState) {
      // เปิดการแสดงผล - ส่งข้อมูลวงล้อไปแสดงบน OBS
      adminFetch(`${REALTIME_URL}/api/lucky-wheel/preview`, {
        method: "POST",
        body: JSON.stringify({ segments })
      });
    } else {
      // ปิดการแสดงผล - ซ่อนวงล้อบน OBS
      adminFetch(`${REALTIME_URL}/api/lucky-wheel/hide`, {
        method: "POST"
      });
    }
  };

  // ===== ฟังก์ชัน: เพิ่มช่องจาก textarea (แบบพิมพ์ทีละบรรทัด) =====
  const handleAddFromTextarea = () => {
    // แยกข้อความตามบรรทัด, ตัด whitespace และกรองบรรทัดว่าง
    const lines = input
      .split("\n")
      .map(line => line.trim())
      .filter(line => line);
    if (lines.length > 0) {
      setSegments([...segments, ...lines]); // เพิ่มช่องใหม่เข้าไป
      setInput(""); // ล้าง textarea
    }
  };

  // ===== ฟังก์ชัน: เพิ่มช่องโต๊ะตามช่วงเลข (เช่น โต๊ะ 1-10) =====
  const handleAddTables = () => {
    const from = parseInt(tableRange.from);
    const to = parseInt(tableRange.to);
    // ตรวจสอบความถูกต้อง: ต้องเป็นตัวเลข, from <= to, เริ่มจาก 1, ไม่เกิน 200 โต๊ะ
    if (!isNaN(from) && !isNaN(to) && from <= to && from > 0 && to - from < 200) {
      const newTables = [];
      for (let i = from; i <= to; i++) {
        newTables.push(`โต๊ะ ${i}`);
      }
      setSegments([...segments, ...newTables]); // เพิ่มโต๊ะทั้งหมดเข้าไป
      setTableRange({ from: "", to: "" }); // ล้าง input
    }
  };

  // ===== ฟังก์ชัน: ลบช่องที่ระบุ =====
  const handleDelete = (idx) => {
    setSegments(segments.filter((_, i) => i !== idx));
    if (editIndex === idx) setEditIndex(null); // ยกเลิกการแก้ไขถ้ากำลังแก้ไขช่องที่ลบ
  };

  // ===== ฟังก์ชัน: ลบช่องทั้งหมด =====
  const handleDeleteAll = () => {
    if (window.confirm("ยืนยันการลบทั้งหมด?")) {
      setSegments([]);
      setEditIndex(null);
    }
  };

  // ===== ฟังก์ชัน: เริ่มแก้ไขช่องที่ระบุ =====
  const handleEdit = (idx) => {
    setEditIndex(idx);
    setEditValue(segments[idx]); // โหลดค่าเดิมมาแสดงใน input
  };

  // ===== ฟังก์ชัน: บันทึกการแก้ไขช่อง =====
  const handleEditSave = (idx) => {
    if (editValue.trim()) {
      const newSeg = [...segments];
      newSeg[idx] = editValue.trim();
      setSegments(newSeg);
      setEditIndex(null); // ออกจากโหมดแก้ไข
    }
  };

  // ===== ฟังก์ชัน: หมุนวงล้อและสุ่มผู้ชนะ =====
  const spinWheel = () => {
    // ตรวจสอบเงื่อนไข: ต้องมีอย่างน้อย 2 ช่องและไม่กำลังหมุนอยู่
    if (segments.length < 2 || spinning) return;

    // รีเซ็ตสถานะต่างๆ
    setWinner(null);
    setSpinning(true);
    setShowPopup(false);
    setPopupEffect(false);

    // สุ่มผู้ชนะ
    const winnerIdx = getRandomInt(0, segments.length - 1);
    const degPerSeg = 360 / segments.length; // องศาต่อช่อง
    // คำนวณมุมหมุนสุดท้าย: หมุน 30 รอบ + หยุดที่ผู้ชนะ (ใช้เวลา 25 วินาที)
    const finalDeg = 360 * 30 + (360 - winnerIdx * degPerSeg - degPerSeg / 2);

    // ส่งคำสั่งไปยัง Backend API เพื่อ sync กับ OBS
    adminFetch(`${REALTIME_URL}/api/lucky-wheel/spin`, {
      method: "POST",
      body: JSON.stringify({
        segments,        // รายการช่องทั้งหมด
        winnerIndex: winnerIdx,  // index ของผู้ชนะ
        reward          // ของรางวัล
      })
    }).then(res => res.json())
      .then(data => console.log('OBS Spin triggered:', data))
      .catch(err => console.error('Error triggering OBS:', err));

    // จัดการ animation การหมุนวงล้อบนหน้าเว็บ
    if (wheelRef.current) {
      // รีเซ็ตมุมหมุนเป็น 0 องศา (ไม่มี transition)
      wheelRef.current.style.transition = "none";
      wheelRef.current.style.transform = `rotate(0deg)`;
      setTimeout(() => {
        // เริ่มหมุน: ใช้เวลา 25 วินาที พร้อม easing แบบค่อยๆ หยุด
        wheelRef.current.style.transition = "transform 25s cubic-bezier(0.08, 0.8, 0.05, 1)";
        wheelRef.current.style.transform = `rotate(${finalDeg}deg)`;
      }, 50);
    }

    // แสดงผลลัพธ์หลังจากวงล้อหมุนเสร็จ (25 วินาที + buffer)
    setTimeout(() => {
      setSpinning(false);
      setWinner(winnerIdx); // กำหนดผู้ชนะ
      setShowPopup(true); // แสดง popup
      setTimeout(() => setPopupEffect(true), 50); // เพิ่มเอฟเฟกต์ animation
    }, 25100); // 25 วินาที + 0.1 วินาที buffer
  };

  // ===== ฟังก์ชัน: หมุนวงล้อด้วย segments ที่กำหนด (ใช้เมื่อตัดชื่อ+สุ่มใหม่) =====
  const spinWheelWithSegments = (segs) => {
    if (segs.length < 2 || spinning) return;

    setWinner(null);
    setSpinning(true);
    setShowPopup(false);
    setPopupEffect(false);

    const winnerIdx = getRandomInt(0, segs.length - 1);
    const degPerSeg = 360 / segs.length;
    const finalDeg = 360 * 30 + (360 - winnerIdx * degPerSeg - degPerSeg / 2);

    // ส่งคำสั่งไปยัง OBS
    adminFetch(`${REALTIME_URL}/api/lucky-wheel/spin`, {
      method: "POST",
      body: JSON.stringify({
        segments: segs,
        winnerIndex: winnerIdx,
        reward
      })
    }).then(res => res.json())
      .then(data => console.log('OBS Spin triggered:', data))
      .catch(err => console.error('Error triggering OBS:', err));

    // animation หมุนวงล้อ
    if (wheelRef.current) {
      wheelRef.current.style.transition = "none";
      wheelRef.current.style.transform = `rotate(0deg)`;
      setTimeout(() => {
        wheelRef.current.style.transition = "transform 25s cubic-bezier(0.08, 0.8, 0.05, 1)";
        wheelRef.current.style.transform = `rotate(${finalDeg}deg)`;
      }, 50);
    }

    // แสดงผลลัพธ์หลังหมุนเสร็จ
    setTimeout(() => {
      setSpinning(false);
      setWinner(winnerIdx);
      setShowPopup(true);
      setTimeout(() => setPopupEffect(true), 50);
    }, 25100);
  };

  // ===== ฟังก์ชัน: ปิด popup ผู้ชนะ =====
  const closePopup = () => {
    setPopupEffect(false); // ปิดเอฟเฟกต์ animation
    setTimeout(() => setShowPopup(false), 300); // รอ animation จบแล้วค่อยซ่อน popup
  };

  // ===== ฟังก์ชัน: ตัดชื่อผู้ชนะออกแล้วสุ่มใหม่ทันที =====
  const removeWinnerAndRespin = () => {
    if (winner === null) return;
    // ตัดชื่อผู้ชนะออก
    const newSegments = segments.filter((_, i) => i !== winner);
    setSegments(newSegments);
    // ปิด popup
    setPopupEffect(false);
    setShowPopup(false);
    setWinner(null);
    // ถ้ายังเหลือ >= 2 ช่อง ให้สุ่มใหม่ทันที (รอ segments อัปเดตก่อน)
    if (newSegments.length >= 2) {
      // ตั้ง previewing = true เพื่อให้ OBS แสดงอัตโนมัติ
      setPreviewing(true);
      // รอ state อัปเดตก่อนค่อยสุ่ม
      setTimeout(() => {
        // เรียก spinWheel โดยตรงไม่ได้เพราะ segments ยังไม่อัปเดต
        // ใช้ newSegments แทน
        spinWheelWithSegments(newSegments);
      }, 500);
    }
  };

  // ===== ฟังก์ชัน: วาดวงล้อด้วย SVG =====
  const renderWheel = () => {
    const segs = segments.length; // จำนวนช่อง
    const arc = 2 * Math.PI / segs; // มุมของแต่ละช่อง (เป็น radian)
    const radius = 160; // รัศมีของวงล้อ
    const viewBox = 360; // ขนาด viewBox ของ SVG
    const center = viewBox / 2; // จุดศูนย์กลาง
    return (
      <svg width={viewBox} height={viewBox} viewBox={`0 0 ${viewBox} ${viewBox}`}>
        <g transform={`translate(${center},${center})`}>
          {/* วาดแต่ละช่องของวงล้อ */}
          {segments.map((seg, i) => {
            // คำนวณมุมเริ่มต้นและสิ้นสุดของช่อง (หัก 90 องศาเพื่อเริ่มจากด้านบน)
            const startAngle = i * arc - Math.PI / 2;
            const endAngle = (i + 1) * arc - Math.PI / 2;
            // คำนวณพิกัด x, y ของจุดเริ่มต้นและสิ้นสุด
            const x1 = radius * Math.cos(startAngle);
            const y1 = radius * Math.sin(startAngle);
            const x2 = radius * Math.cos(endAngle);
            const y2 = radius * Math.sin(endAngle);
            const largeArc = arc > Math.PI ? 1 : 0; // flag สำหรับ arc ใหญ่
            // สร้าง path data สำหรับวาดช่อง (รูปวงกลมแบบแบ่งส่วน)
            const pathData = `
              M 0 0
              L ${x1} ${y1}
              A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}
              Z
            `;
            return (
              <g key={i}>
                {/* วาดช่องด้วยสีที่กำหนด */}
                <path
                  d={pathData}
                  fill={defaultColors[i % defaultColors.length]}
                  stroke="#fff"
                  strokeWidth="2"
                />
                {/* แสดงข้อความกลางช่อง */}
                <text
                  x={((radius + 20) / 2) * Math.cos(startAngle + arc / 2)}
                  y={((radius + 20) / 2) * Math.sin(startAngle + arc / 2)}
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  fontSize={segments.length > 20 ? 12 : 16} /* ลดขนาดตัวอักษรถ้ามีช่องเยอะ */
                  fill="#222"
                  transform={`rotate(${(startAngle + arc / 2) * 180 / Math.PI},${((radius + 20) / 2) * Math.cos(startAngle + arc / 2)},${((radius + 20) / 2) * Math.sin(startAngle + arc / 2)})`}
                  style={{ userSelect: "none", pointerEvents: "none" }}
                >
                  {seg.length > 16 ? seg.slice(0, 14) + "…" : seg} {/* ตัดข้อความยาวเกินไป */}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    );
  };

  // ===== Effect Hook: จัดการ keyboard shortcuts สำหรับ textarea =====
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleKeyDown = (e) => {
      // อนุญาตให้กดเว้นวรรคได้ตามปกติ
      if (e.key === " " && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        return;
      }
      // กด Ctrl+Enter เพื่อเพิ่มช่องทั้งหมดจาก textarea
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        handleAddFromTextarea();
      }
    };

    textarea.addEventListener("keydown", handleKeyDown);
    return () => textarea.removeEventListener("keydown", handleKeyDown);
  }, [input, segments]);

  return (
    <div className="lucky-wheel-page">
      <header className="lucky-wheel-header">
        <div className="header-content">
          <h1 className="header-title">🎡 Lucky Wheel</h1>
          <p className="header-subtitle">วงล้อเสี่ยงดวงสำหรับกิจกรรมพิเศษ</p>
        </div>
        <Link to="/home" className="back-home-btn">🏠 กลับหน้า Home</Link>
      </header>

      <div className="lucky-wheel-flex">
        <div className="lucky-wheel-left">
          <div className="wheel-area" style={{ width: 380, height: 380 }}>
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: 0,
                transform: "translateX(-50%)",
                width: 36,
                height: 36,
                zIndex: 2,
                pointerEvents: "none",
              }}
            >
              <svg width="36" height="36">
                <polygon
                  points="18,24 28,0 18,6 8,0"
                  fill="#fbbf24"
                  stroke="#eab308"
                  strokeWidth="2"
                />
              </svg>
            </div>
            <div
              className="wheel-svg"
              ref={wheelRef}
              style={{
                width: 360,
                height: 360,
                margin: "0 auto",
                borderRadius: "50%",
                background: "#fff",
                transition: "transform 4s cubic-bezier(.17,.67,.83,.67)"
              }}
            >
              {renderWheel()}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: 18, justifyContent: 'center' }}>
            <button
              className="spin-btn"
              onClick={togglePreview}
              disabled={spinning || segments.length === 0}
              style={{ fontSize: 20, padding: "8px 32px", margin: 0 }}
            >
              {previewing ? "👁️ ปิดจอ OBS" : "👁️ แสดงจอ OBS"}
            </button>

            <button
              className="spin-btn"
              onClick={spinWheel}
              disabled={spinning || segments.length < 2}
              style={{ fontSize: 20, padding: "8px 32px", margin: 0 }}
            >
              {spinning ? "🎡 กำลังหมุน..." : "🎯 หมุนวงล้อ"}
            </button>
          </div>

          <div className="reward-row">
            <label>🎁 ของรางวัล:</label>
            <input
              type="text"
              className="reward-input"
              placeholder="กรอกของรางวัล..."
              value={reward}
              onChange={e => setReward(e.target.value)}
              disabled={spinning}
            />
          </div>
        </div>
        <div className="lucky-wheel-right">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>⚙️ ตั้งค่า</h3>
            <button className="delete-all-btn" onClick={handleDeleteAll} disabled={spinning || segments.length === 0} style={{ fontSize: "12px", padding: "8px 4px" }}>ลบทั้งหมด</button>
          </div>
          <textarea
            ref={textareaRef}
            className="wheel-textarea"
            placeholder="พิมพ์ชื่อแต่ละช่อง↵"
            value={input}
            onChange={e => setInput(e.target.value)}
            rows={6}
            disabled={spinning}
            style={{ borderRadius: "10px", border: "2px solid #e0e0e0", padding: "10px", marginBottom: "8px", fontFamily: "inherit" }}
          />
          <button
            className="add-btn"
            onClick={handleAddFromTextarea}
            disabled={spinning || !input.trim()}
            style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "#fff", border: "none", borderRadius: "10px", padding: "8px", marginBottom: "8px", cursor: "pointer", fontWeight: "600", transition: "all 0.3s" }}
          >
            ➕ เพิ่มช่อง
          </button>
          <div className="table-range-row" style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
            <input
              type="number"
              placeholder="จาก"
              value={tableRange.from}
              onChange={e => setTableRange({ ...tableRange, from: e.target.value })}
              disabled={spinning}
              style={{ flex: 1, padding: "1px", border: "2px solid #e0e0e0", borderRadius: "8px" }}
            />
            <input
              type="number"
              placeholder="ถึง"
              value={tableRange.to}
              onChange={e => setTableRange({ ...tableRange, to: e.target.value })}
              disabled={spinning}
              style={{ flex: 1, padding: "1px", border: "2px solid #e0e0e0", borderRadius: "8px" }}
            />
            <button onClick={handleAddTables} disabled={spinning || !tableRange.from || !tableRange.to} style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "#fff", border: "none", borderRadius: "8px", padding: "8px 12px", cursor: "pointer", fontWeight: "600" }}>เพิ่มโต๊ะ</button>
          </div>
          <div className="wheel-edit-list small">
            {segments.map((seg, idx) => (
              <div key={idx} className="wheel-segment-edit small">
                {editIndex === idx ? (
                  <>
                    <input
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleEditSave(idx)}
                      autoFocus
                      style={{ width: 80, padding: "4px", border: "1px solid #fff", borderRadius: "4px", background: "rgba(255,255,255,0.2)", color: "#fff" }}
                    />
                    <button onClick={() => handleEditSave(idx)} style={{ background: "#fff", color: "#667eea", border: "none", borderRadius: "4px", padding: "2px 6px", cursor: "pointer", fontSize: "12px" }}>✓</button>
                    <button onClick={() => setEditIndex(null)} style={{ background: "rgba(255,255,255,0.3)", color: "#fff", border: "none", borderRadius: "4px", padding: "2px 6px", cursor: "pointer", fontSize: "12px" }}>✕</button>
                  </>
                ) : (
                  <>
                    <span>{seg}</span>
                    <button onClick={() => handleEdit(idx)} disabled={spinning} style={{ background: "rgba(255,255,255,0.3)", color: "#fff", border: "none", borderRadius: "4px", padding: "2px 6px", cursor: "pointer", fontSize: "12px" }}>✎</button>
                    <button onClick={() => handleDelete(idx)} disabled={spinning} style={{ background: "rgba(255,255,255,0.3)", color: "#fff", border: "none", borderRadius: "4px", padding: "2px 6px", cursor: "pointer", fontSize: "12px" }}>✕</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        {showPopup && winner !== null && (
          <div className={`winner-popup ${popupEffect ? "show" : ""}`} onClick={closePopup}>
            <div className="winner-popup-content" onClick={(e) => e.stopPropagation()}>
              <div className="winner-firework">✨</div>
              <div className="winner-title">🎉 ผลลัพธ์การสุ่ม</div>
              <div className="winner-name">{segments[winner]}</div>
              <div className="winner-reward">
                {reward && (
                  <>
                    <span>🎁 ของรางวัล:</span>
                    <span className="winner-reward-value">{reward}</span>
                  </>
                )}
              </div>
              <div className="winner-firework">✨</div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
                {segments.length > 2 && (
                  <button
                    className="winner-close-btn"
                    onClick={removeWinnerAndRespin}
                    style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', fontSize: '18px', padding: '10px 24px' }}
                  >
                    🔄 ตัดชื่อ + สุ่มใหม่
                  </button>
                )}
                <button className="winner-close-btn" onClick={closePopup}>ปิด</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LuckyWheel;
