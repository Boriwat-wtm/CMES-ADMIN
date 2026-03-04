/**
 * คอมโพเนนต์สำหรับแสดงประวัติการตรวจสอบทั้งหมด
 * รวมถึงข้อความ รูปภาพ ของขวัญ และวันเกิด
 */
import React, { useEffect, useState, useContext } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL, REALTIME_URL } from "../config/apiConfig";
import adminFetch from "../config/authFetch";
import { ShopContext } from "../contexts/ShopContext";
import "./CheckHistory.css";

function CheckHistory() {
  const { shopId } = useContext(ShopContext);
  const adminId = localStorage.getItem('adminId') || '';
  // state สำหรับเก็บประวัติทั้งหมด
  const [history, setHistory] = useState([]);
  // state สำหรับเก็บรายการที่เลือกดูรายละเอียด
  const [selected, setSelected] = useState(null);
  // state สำหรับควบคุมการแสดง/ซ่อน modal รายละเอียด
  const [showModal, setShowModal] = useState(false);
  // state สำหรับเปิด/ปิดโหมดแก้ไข (แสดงปุ่มลบ)
  const [editMode, setEditMode] = useState(false);

  // โหลดประวัติเมื่อคอมโพเนนต์ถูก mount และเมื่อ shopId พร้อม
  useEffect(() => {
    if (shopId) {
      fetchHistory();
    }
  }, [shopId]);

  /**
   * ฟังก์ชันสำหรับดึงข้อมูลประวัติการตรวจสอบจาก API
   */
  const fetchHistory = () => {
    adminFetch(`${API_BASE_URL}/api/check-history`)
      .then((res) => res.json())
      .then((data) => {
        console.log("[CheckHistory] Fetched data:", data);
        // Debug: ตรวจสอบว่ารูปภาพมี filePath หรือไม่
        const imagesWithPath = data.filter(item => item.type === 'image');
        console.log("[CheckHistory] Images with filePath:", imagesWithPath.map(i => ({
          id: i.id,
          filePath: i.filePath,
          fullUrl: i.filePath ? `${API_BASE_URL}${i.filePath}` : 'NO PATH'
        })));
        setHistory(data);
      })
      .catch((err) => {
        console.error("[CheckHistory] Error fetching history:", err);
      });
  };

  /**
   * ฟังก์ชันสำหรับลบรายการประวัติทีละรายการ
   * @param {number} id - ID ของรายการที่ต้องการลบ
   */
  const handleDelete = async (id) => {
    if (!window.confirm("ยืนยันการลบรายการนี้?")) return;
    await adminFetch(`${API_BASE_URL}/api/delete-history`, {
      method: "POST",
      body: JSON.stringify({ id }),
    });
    // โหลดข้อมูลใหม่หหลังจากลบ
    fetchHistory();
  };

  /**
   * ฟังก์ชันสำหรับลบประวัติทั้งหมด
   */
  const handleDeleteAll = async () => {
    if (!window.confirm("ยืนยันการลบประวัติทั้งหมด?")) return;
    await adminFetch(`${API_BASE_URL}/api/delete-all-history`, {
      method: "POST"
    });
    // โหลดข้อมูลใหม่หลังจากลบ
    fetchHistory();
  };

  // แยกประวัติตามประเภท
  const textHistory = history.filter((item) => item.type === "text");
  const imageHistory = history.filter((item) => item.type === "image");
  const giftHistory = history.filter((item) => item.type === "gift");
  const birthdayHistory = history.filter((item) => item.type === "birthday");

  /**
   * ฟังก์ชันสำหรับแปลง filePath ให้เป็น URL เต็มรูปแบบ
   * @param {string} filePath - path ของไฟล์รูปภาพ
   * @returns {string|null} - URL เต็มรูปแบบหรือ null
   */
  const getImageUrl = (filePath) => {
    if (!filePath) return null;
    // ถ้า filePath เป็น URL เต็มรูปแบบอยู่แล้ว (Cloudinary, etc.) ให้ใช้ตรง ๆ
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    // ถ้าไม่ใช่ ให้เติม base URL เข้าไป
    const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    return `${API_BASE_URL}${normalizedPath}`;
  };

  /**
   * ฟังก์ชันสำหรับแปลงวันที่เป็นรูปแบบภาษาไทย
   * @param {string} dateString - วันที่ในรูปแบบ ISO string
   * @returns {string} - วันที่ในรูปแบบที่จัดรูปแบบแล้ว
   */
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("th-TH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  /**
   * ฟังก์ชันสำหรับ render การ์ดแสดงประวัติตามประเภท
   * @param {string} title - ชื่อประเภทประวัติ
   * @param {string} color - สีของหัวข้อ
   * @param {array} items - รายการประวัติ
   * @param {string} emptyMessage - ข้อความเมื่อไม่มีข้อมูล
   */
  const renderHistoryCard = (title, color, items, emptyMessage) => (
    <div className="ch-card">
      <div className="ch-card-header">
        รายละเอียดการตรวจสอบ <span style={{ color: color }}>{title}</span>
      </div>
      {items.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            color: "#94a3b8",
            padding: "3rem 0",
            fontSize: "1.125rem",
          }}
        >
          {emptyMessage}
        </div>
      ) : (
        items.map((item) => (
          <div className="ch-card-section" key={item.id}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <div style={{ color: "#1e293b" }}>
                <b>เวลา:</b> {formatDate(item.checkedAt)}
              </div>
              {item.text && (
                <div style={{ color: "#1e293b" }}>
                  <b>รายละเอียด:</b> {item.text}
                </div>
              )}
              {/* แสดงรายการของขวัญ (ถ้ามี) */}
              {item.giftItems && item.giftItems.length > 0 && (
                <div style={{ color: "#1e293b", background: "#f8fafc", padding: "8px", borderRadius: "6px", fontSize: "0.9rem" }}>
                  <div style={{ fontWeight: "bold", marginBottom: "4px", color: "#f59e0b" }}>รายการของขวัญ:</div>
                  <ul style={{ margin: "0 0 0 20px", padding: 0 }}>
                    {item.giftItems.map((g, i) => (
                      <li key={i}>{g.name} x{g.quantity}</li>
                    ))}
                  </ul>
                </div>
              )}
              {item.price !== undefined && (
                <div style={{ color: "#1e293b" }}>
                  <b>ราคา:</b> {item.price === 0 ? 'ฟรี' : `${item.price} บาท`}
                </div>
              )}
              {/* แสดงสถานะ */}
              <div style={{ color: "#1e293b" }}>
                <b>สถานะ:</b> {
                  item.status === "approved" ? "อนุมัติ" :
                    item.status === "completed" ? "แสดงเสร็จสิ้น" :
                      "ปฏิเสธ"
                }
              </div>
              {/* แสดงรูปภาพ (ถ้ามี) */}
              {item.filePath && (
                <div>
                  <img
                    src={getImageUrl(item.filePath)}
                    alt="img"
                    style={{
                      maxWidth: 180,
                      marginTop: 8,
                      borderRadius: 8,
                      boxShadow: "0 1px 4px 0 rgba(30,41,59,.08)",
                    }}
                    onError={(e) => {
                      console.error("[CheckHistory] Image failed to load:", getImageUrl(item.filePath));
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'block';
                    }}
                  />
                  <div style={{ display: 'none', color: '#ef4444', fontSize: '0.875rem', marginTop: '8px' }}>
                    ⚠️ ไม่สามารถโหลดรูปภาพได้
                  </div>
                </div>
              )}
              {/* ปุ่มดูรายละเอียดเพิ่มเติม */}
              <button
                className="ch-btn-detail"
                onClick={() => {
                  setSelected(item);
                  setShowModal(true);
                }}
              >
                ตรวจสอบรายละเอียด
              </button>
            </div>
            {/* แสดงปุ่มลบเมื่ออยู่ในโหมดแก้ไข */}
            {editMode && (
              <button
                className="ch-btn-delete"
                onClick={() => handleDelete(item.id)}
              >
                ลบ
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );

  // ส่วนแสดงผล UI หลัก
  return (
    <div className="ch-main-bg">
      <header className="ch-header">
        <Link to="/home" className="back-nav-btn" title="กลับหน้าหลัก">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="ch-header-center">ประวัติการตรวจสอบ</div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            className={`ch-btn ch-btn-edit${editMode ? " active" : ""}`}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? "ปิดแก้ไข" : "แก้ไข"}
          </button>
          <button
            className="ch-btn ch-btn-deleteall"
            onClick={handleDeleteAll}
          >
            ลบทั้งหมด
          </button>
        </div>
      </header>
      <main style={{ marginTop: "100px", width: "100%" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: "2rem",
            width: "100%",
            justifyContent: "center",
            alignItems: "flex-start",
            flexWrap: "wrap",
            padding: "0 2rem 2rem 2rem"
          }}
        >
          {renderHistoryCard("ข้อความ", "#ec4899", textHistory, "ไม่มีประวัติข้อความ")}
          {renderHistoryCard("รูปภาพ", "#6366f1", imageHistory, "ไม่มีประวัติรูปภาพ")}
          {renderHistoryCard("ของขวัญ", "#f59e0b", giftHistory, "ไม่มีประวัติของขวัญ")}
          {renderHistoryCard("วันเกิด", "#ef4444", birthdayHistory, "ไม่มีประวัติวันเกิด")}
        </div>
      </main>
      {/* Modal สำหรับแสดงรายละเอียดเต็มรูปแบบ */}
      {showModal && selected && (
        <div className="ch-modal-bg">
          <div className="ch-modal-content">
            <h2
              style={{
                fontSize: 20,
                marginBottom: 16,
                color: "#1e293b",
              }}
            >
              รายละเอียดรายการ
            </h2>
            <div style={{ marginBottom: 8 }}>
              <b>ID:</b> {selected.id}
            </div>
            {/* ฟิลด์ข้อมูลทั่วไป */}
            {selected.type && (
              <div style={{ marginBottom: 8 }}>
                <b>ประเภท:</b> {selected.type}
              </div>
            )}

            {/* ฟิลด์เนื้อหา */}
            {selected.text && (
              <div style={{ marginBottom: 8 }}>
                <b>ข้อความ:</b> {selected.text}
              </div>
            )}
            {selected.note && (
              <div style={{ marginBottom: 8 }}>
                <b>โน้ตเพิ่มเติม:</b> {selected.note}
              </div>
            )}

            {/* สื่อ (รูปภาพ) */}
            {selected.filePath && (
              <div style={{ marginBottom: 8 }}>
                <b>รูปภาพ:</b>
                <br />
                <img
                  src={getImageUrl(selected.filePath)}
                  alt="img"
                  style={{
                    maxWidth: 180,
                    borderRadius: 8,
                    marginTop: 4,
                  }}
                  onError={(e) => {
                    console.error("[CheckHistory Modal] Image failed to load:", getImageUrl(selected.filePath));
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
                <div style={{ display: 'none', color: '#ef4444', fontSize: '0.875rem', marginTop: '4px' }}>
                  ⚠️ ไม่สามารถโหลดรูปภาพได้
                </div>
              </div>
            )}

            {/* สถานะและข้อมูลผู้ใช้ */}
            <div style={{ marginBottom: 8 }}>
              <b>สถานะ:</b> {
                selected.status === "approved" ? "อนุมัติ" :
                  selected.status === "completed" ? "แสดงเสร็จสิ้น" :
                    "ปฏิเสธ"
              }
            </div>

            {selected.sender && (
              <div style={{ marginBottom: 8 }}>
                <b>ผู้ส่ง:</b> {selected.sender}
              </div>
            )}

            {/* ข้อมูล Social Media */}
            {selected.social && selected.social.type && (
              <div style={{ marginBottom: 8 }}>
                <b>Social:</b> {selected.social.type} ({selected.social.name})
              </div>
            )}

            {/* ข้อมูลเฉพาะของขวัญ */}
            {selected.tableNumber > 0 && (
              <div style={{ marginBottom: 8 }}>
                <b>โต๊ะ:</b> {selected.tableNumber}
              </div>
            )}

            {selected.giftItems && selected.giftItems.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <b>รายการของขวัญ:</b>
                <ul style={{ margin: "4px 0 0 20px", padding: 0 }}>
                  {selected.giftItems.map((g, i) => (
                    <li key={i}>{g.name} x{g.quantity}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* ราคา */}
            {selected.price !== undefined && (
              <div style={{ marginBottom: 8 }}>
                <b>ราคา:</b> {selected.price === 0 ? 'ฟรี' : `${selected.price} บาท`}
              </div>
            )}

            {/* ข้อมูลเวลาต่าง ๆ */}
            <div style={{ marginTop: 12, borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
              {selected.createdAt && (
                <div style={{ marginBottom: 4, fontSize: "0.9em" }}>
                  <b>รับข้อมูล:</b> {formatDate(selected.createdAt)}
                </div>
              )}
              {selected.checkedAt && (
                <div style={{ marginBottom: 4, fontSize: "0.9em" }}>
                  <b>ตรวจสอบ:</b> {formatDate(selected.checkedAt)}
                </div>
              )}
              {selected.startedAt && (
                <div style={{ marginBottom: 4, fontSize: "0.9em" }}>
                  <b>เริ่มแสดง:</b> {formatDate(selected.startedAt)}
                </div>
              )}
              {selected.endedAt && (
                <div style={{ marginBottom: 4, fontSize: "0.9em" }}>
                  <b>จบการแสดง:</b> {formatDate(selected.endedAt)}
                </div>
              )}
              {selected.duration && (
                <div style={{ marginBottom: 4, fontSize: "0.9em" }}>
                  <b>ระยะเวลา:</b> {selected.duration} วินาที
                </div>
              )}
            </div>
            <button
              className="ch-btn"
              style={{ background: "#64748b", marginTop: 16 }}
              onClick={() => setShowModal(false)}
            >
              ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CheckHistory;
