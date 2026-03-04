import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL, REALTIME_URL } from "../config/apiConfig";
import adminFetch from "../config/authFetch";
import "./AdminReport.css";

const API_BASE = API_BASE_URL;

const STATUS_META = {
  new: { label: "ใหม่", badge: "status-new" },
  reading: { label: "กำลังตรวจสอบ", badge: "status-reading" },
  resolved: { label: "แก้ไขแล้ว", badge: "status-resolved" }
};

const CATEGORY_META = {
  technical: { label: "ปัญหาทางเทคนิค", icon: "⚡" },
  display: { label: "ปัญหาการแสดงผล", icon: "🖼️" },
  payment: { label: "ปัญหาการเงิน", icon: "💰" },
  upload: { label: "ปัญหาอัปโหลด", icon: "📁" },
  account: { label: "บัญชีผู้ใช้", icon: "👤" },
  suggestion: { label: "ข้อเสนอแนะ", icon: "💡" },
  other: { label: "อื่นๆ", icon: "📝" }
};

const statusFilters = [
  { id: "all", label: "กำลังดำเนินการ" },
  { id: "new", label: "ใหม่" },
  { id: "reading", label: "กำลังตรวจสอบ" },
  { id: "resolved", label: "แก้ไขแล้ว" }
];

function AdminReport() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [activeReport, setActiveReport] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  // ===== ข้อมูล Admin สำหรับ Authentication Headers =====
  const shopId = localStorage.getItem("shopId") || "";
  const adminId = localStorage.getItem("adminId") || "";

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(`${API_BASE}/api/reports`);
      if (!res.ok) throw new Error("FAILED");
      const data = await res.json();
      const sorted = (data || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setReports(sorted);
    } catch (err) {
      console.error("โหลดรายงานไม่สำเร็จ", err);
      setError("ไม่สามารถโหลดรายการรายงานได้");
    } finally {
      setLoading(false);
    }
  };

  const filteredReports = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return reports.filter((report) => {
      const normalizedDetail = (report.detail || "").toLowerCase();
      const categoryLabel = (CATEGORY_META[report.category]?.label || report.category || "").toLowerCase();
      const matchStatus = filter === "all" ? report.status !== "resolved" : report.status === filter;
      const matchKeyword = !keyword || normalizedDetail.includes(keyword) || categoryLabel.includes(keyword);
      return matchStatus && matchKeyword;
    });
  }, [reports, filter, search]);

  const stats = useMemo(() => {
    const summary = { total: reports.length, new: 0, reading: 0, resolved: 0 };
    reports.forEach((r) => {
      summary[r.status] = (summary[r.status] || 0) + 1;
    });
    return summary;
  }, [reports]);

  const handleStatusChange = async (report, status) => {
    if (report.status === status) return;
    setUpdatingId(report.id);
    try {
      const res = await adminFetch(`${API_BASE}/api/reports/${report.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error("PATCH_FAILED");
      const data = await res.json();
      setReports((prev) => prev.map((item) => (item.id === data.report.id ? data.report : item)));
      if (activeReport && activeReport.id === data.report.id) {
        setActiveReport(data.report);
      }
    } catch (err) {
      console.error("อัปเดตสถานะไม่สำเร็จ", err);
      setError("ไม่สามารถอัปเดตสถานะได้");
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  };

  const renderStatusPill = (status) => {
    const meta = STATUS_META[status] || { label: status, badge: "status-new" };
    return <span className={`status-pill ${meta.badge}`}>{meta.label}</span>;
  };

  const viewDescription = filter === "resolved" ? "แสดงเฉพาะงานที่ปิดไปแล้ว" : "แสดงเฉพาะงานที่ยังรอดำเนินการ";

  return (
    <div className="admin-report-page">
      <header className="admin-report-header">
        <div className="header-texts">
          <p className="eyebrow">ระบบรายงาน</p>
          <h1>ศูนย์ติดตามปัญหา</h1>
          <p className="subtitle">ข้อมูลเชื่อมต่อจากฝั่งผู้ใช้ทันที ปรับสถานะงานได้ตามจริง</p>
        </div>
        <div className="header-actions">
          <Link to="/home" className="ghost-btn">กลับหน้า Home</Link>
          <button className="primary-btn" onClick={loadReports}>รีเฟรชข้อมูล</button>
        </div>
      </header>

      <section className="summary-grid">
        <div className="summary-card">
          <span className="summary-label">รายงานทั้งหมด</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">ใหม่</span>
          <strong>{stats.new || 0}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">กำลังตรวจสอบ</span>
          <strong>{stats.reading || 0}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">แก้ไขแล้ว</span>
          <strong>{stats.resolved || 0}</strong>
        </div>
      </section>

      <section className="report-controls">
        <div className="search-box">
          <span role="img" aria-label="search">🔍</span>
          <input
            type="text"
            placeholder="ค้นหาจากหมวดหมู่หรือคำอธิบาย"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-group">
          {statusFilters.map((item) => (
            <button
              key={item.id}
              className={`filter-chip ${filter === item.id ? "active" : ""}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <p className="view-hint">{viewDescription}</p>

      {error && <div className="error-banner-lite">{error}</div>}

      {loading ? (
        <div className="state-card">กำลังโหลดข้อมูล...</div>
      ) : filteredReports.length === 0 ? (
        <div className="state-card">
          {filter === "resolved" ? "ยังไม่มีงานที่ปิดแล้ว" : "ยังไม่มีรายงานในหมวดนี้"}
        </div>
      ) : (
        <div className="report-list">
          {filteredReports.map((report) => {
            const category = CATEGORY_META[report.category] || CATEGORY_META.other;
            return (
              <article key={report.id} className="report-card" onClick={() => setActiveReport(report)}>
                <div className="report-card-top">
                  <div className="category-chip">
                    <span>{category.icon}</span>
                    <span>{category.label}</span>
                  </div>
                  {renderStatusPill(report.status)}
                </div>
                <p className="report-detail">{report.detail}</p>
                <div className="report-meta">
                  <span>{formatDate(report.createdAt)}</span>
                  <button
                    className="link-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveReport(report);
                    }}
                  >
                    ดูรายละเอียด
                  </button>
                </div>
                <div className="report-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`action-btn ghost ${report.status === "new" ? "active" : ""}`}
                    onClick={() => handleStatusChange(report, "new")}
                    disabled={updatingId === report.id}
                  >
                    ใหม่
                  </button>
                  <button
                    className={`action-btn ghost ${report.status === "reading" ? "active" : ""}`}
                    onClick={() => handleStatusChange(report, "reading")}
                    disabled={updatingId === report.id}
                  >
                    ตรวจสอบอยู่
                  </button>
                  <button
                    className={`action-btn success ${report.status === "resolved" ? "active" : ""}`}
                    onClick={() => handleStatusChange(report, "resolved")}
                    disabled={updatingId === report.id}
                  >
                    ปิดงาน
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {activeReport && (
        <div className="report-drawer" role="dialog">
          <div className="drawer-header">
            <div>
              <p>รายละเอียดรายงาน</p>
              <h3>{CATEGORY_META[activeReport.category]?.label || "ไม่ทราบ"}</h3>
            </div>
            <button className="icon-btn" onClick={() => setActiveReport(null)}>✕</button>
          </div>
          <div className="drawer-body">
            <div className="drawer-section">
              <span className="section-label">สถานะปัจจุบัน</span>
              {renderStatusPill(activeReport.status)}
            </div>
            <div className="drawer-section">
              <span className="section-label">รายละเอียด</span>
              <p className="drawer-detail">{activeReport.detail}</p>
            </div>
            <div className="drawer-timeline">
              <div>
                <span>สร้างเมื่อ</span>
                <strong>{formatDate(activeReport.createdAt)}</strong>
              </div>
              {activeReport.updatedAt && (
                <div>
                  <span>อัปเดตล่าสุด</span>
                  <strong>{formatDate(activeReport.updatedAt)}</strong>
                </div>
              )}
            </div>
          </div>
          <div className="drawer-actions">
            <button
              className="ghost-btn"
              onClick={() => handleStatusChange(activeReport, "reading")}
              disabled={updatingId === activeReport.id}
            >
              ทำเครื่องหมายว่ากำลังตรวจสอบ
            </button>
            <button
              className="primary-btn"
              onClick={() => handleStatusChange(activeReport, "resolved")}
              disabled={updatingId === activeReport.id}
            >
              ปิดงานนี้
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminReport;