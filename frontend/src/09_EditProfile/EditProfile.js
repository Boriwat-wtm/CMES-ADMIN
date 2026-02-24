import React, { useState, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ShopContext } from "../contexts/ShopContext";
import { API_BASE_URL } from "../config/apiConfig";
import "./EditProfile.css";

function EditProfile() {
    const navigate = useNavigate();
    const { logout } = useContext(ShopContext);

    const adminId = localStorage.getItem("adminId") || "";
    const [adminShopId, setAdminShopId] = useState(localStorage.getItem("shopId") || "");
    const [username] = useState(localStorage.getItem("adminUsername") || "Admin");

    // Edit Shop ID State
    const [isEditingShopId, setIsEditingShopId] = useState(false);
    const [newShopIdInput, setNewShopIdInput] = useState(adminShopId);
    const [shopIdLoading, setShopIdLoading] = useState(false);

    // Form State
    const [currentPw, setCurrentPw] = useState("");
    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [message, setMessage] = useState({ text: "", type: "" });
    const [loading, setLoading] = useState(false);

    // Auto hide message after 5 seconds
    useEffect(() => {
        if (message.text) {
            const timer = setTimeout(() => setMessage({ text: "", type: "" }), 5000);
            return () => clearTimeout(timer);
        }
    }, [message]);

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (!currentPw || !newPw || !confirmPw) {
            setMessage({ text: "กรุณากรอกข้อมูลให้ครบถ้วน", type: "error" });
            return;
        }
        if (newPw !== confirmPw) {
            setMessage({ text: "รหัสผ่านใหม่และการยืนยันไม่ตรงกัน", type: "error" });
            return;
        }
        if (newPw.length < 6) {
            setMessage({ text: "รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร", type: "error" });
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/change-password`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-shop-id": adminShopId,
                    "x-admin-id": adminId,
                },
                body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ text: "อัปเดตรหัสผ่านใหม่เรียบร้อยแล้ว", type: "success" });
                setCurrentPw("");
                setNewPw("");
                setConfirmPw("");
            } else {
                setMessage({ text: data.message || "เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน", type: "error" });
            }
        } catch {
            setMessage({ text: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ในขณะนี้", type: "error" });
        } finally {
            setLoading(false);
        }
    };

    const handleSaveShopId = async () => {
        if (!newShopIdInput.trim()) {
            setMessage({ text: "กรุณาระบุชื่อร้านค้า", type: "error" });
            return;
        }
        if (newShopIdInput.trim() === adminShopId) {
            setIsEditingShopId(false);
            return;
        }

        if (newShopIdInput.trim().length > 40) {
            setMessage({ text: "ชื่อร้านค้าต้องไม่เกิน 40 ตัวอักษร", type: "error" });
            return;
        }

        setShopIdLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/change-shopid`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-shop-id": adminShopId,
                    "x-admin-id": adminId,
                },
                body: JSON.stringify({ newShopId: newShopIdInput }),
            });
            const data = await res.json();
            if (data.success) {
                localStorage.setItem("shopId", data.newShopId);
                setAdminShopId(data.newShopId);
                setIsEditingShopId(false);
                setMessage({ text: "เปลี่ยนชื่อร้านค้าสำเร็จ! (ระบบอาจรีเฟรชการเชื่อมต่อสักครู่)", type: "success" });
            } else {
                setMessage({ text: data.message || "เกิดข้อผิดพลาดในการเปลี่ยนชื่อร้านค้า", type: "error" });
            }
        } catch {
            setMessage({ text: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้", type: "error" });
        } finally {
            setShopIdLoading(false);
        }
    };

    const handleCancelEditShopId = () => {
        setNewShopIdInput(adminShopId);
        setIsEditingShopId(false);
    };

    const handleLogout = () => {
        logout();
        navigate("/");
    };

    const initials = username.slice(0, 2).toUpperCase();

    return (
        <div className="ep-container">
            {/* Decorative background elements */}
            <div className="ep-blob ep-blob-1"></div>
            <div className="ep-blob ep-blob-2"></div>

            <div className="ep-glass-card">
                {/* Header Options */}
                <div className="ep-header">
                    <button className="ep-btn-back" onClick={() => navigate("/home")}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                        <span>กลับสู่หน้าหลัก</span>
                    </button>
                </div>

                {/* Profile Info Section */}
                <div className="ep-profile-section">
                    <div className="ep-avatar-wrapper">
                        <div className="ep-avatar-circle">
                            {initials}
                        </div>
                        {/* Optional badge/edit icon on avatar */}
                        <div className="ep-avatar-badge">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                        </div>
                    </div>
                    <h2 className="ep-username">{username}</h2>
                    <div className="ep-shop-section">
                        <div className="ep-shop-badge">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                <polyline points="9 22 9 12 15 12 15 22" />
                            </svg>
                            <span>ชื่อร้านค้า : </span>
                            {isEditingShopId ? (
                                <div className="ep-shop-edit-group">
                                    <input
                                        type="text"
                                        value={newShopIdInput}
                                        onChange={(e) => setNewShopIdInput(e.target.value)}
                                        className="ep-shop-input"
                                        placeholder="ภาษาอังกฤษหรือตัวเลข"
                                        maxLength="40"
                                        autoFocus
                                    />
                                    <button className="ep-btn-icon ep-btn-confirm" onClick={handleSaveShopId} disabled={shopIdLoading}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </button>
                                    <button className="ep-btn-icon ep-btn-cancel" onClick={handleCancelEditShopId} disabled={shopIdLoading}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <span style={{ marginLeft: "4px" }}>{adminShopId || "ไม่ได้ระบุ"}</span>
                                    <button className="ep-btn-edit-shop" onClick={() => setIsEditingShopId(true)} title="แก้ไขชื่อร้านค้า">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Change Password Form */}
                <div className="ep-form-container">
                    <h3 className="ep-section-title">ตั้งค่าความปลอดภัย</h3>
                    <form className="ep-form" onSubmit={handleChangePassword}>
                        <div className="ep-input-group">
                            <label>รหัสผ่านปัจจุบัน</label>
                            <div className="ep-input-wrapper">
                                <svg className="ep-input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                                <input
                                    type="password"
                                    placeholder="กรอกรหัสผ่านปัจจุบันของคุณ"
                                    value={currentPw}
                                    onChange={(e) => setCurrentPw(e.target.value)}
                                    className="ep-input-field"
                                />
                            </div>
                        </div>

                        <div className="ep-input-group">
                            <label>รหัสผ่านใหม่</label>
                            <div className="ep-input-wrapper">
                                <svg className="ep-input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                                <input
                                    type="password"
                                    placeholder="อย่างน้อย 6 ตัวอักษร"
                                    value={newPw}
                                    onChange={(e) => setNewPw(e.target.value)}
                                    className="ep-input-field"
                                />
                            </div>
                        </div>

                        <div className="ep-input-group">
                            <label>ยืนยันรหัสผ่านใหม่</label>
                            <div className="ep-input-wrapper">
                                <svg className="ep-input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                </svg>
                                <input
                                    type="password"
                                    placeholder="ยืนยันรหัสผ่านใหม่อีกครั้ง"
                                    value={confirmPw}
                                    onChange={(e) => setConfirmPw(e.target.value)}
                                    className="ep-input-field"
                                />
                            </div>
                        </div>

                        {/* Notification Message */}
                        <div className={`ep-message-alert ${message.text ? 'ep-message-show' : ''} ep-message-${message.type}`}>
                            {message.type === 'success' ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                            ) : message.type === 'error' ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                            ) : null}
                            <span>{message.text}</span>
                        </div>

                        <button type="submit" className="ep-btn-save" disabled={loading}>
                            {loading ? (
                                <span className="ep-loader">กำลังบันทึก...</span>
                            ) : "อัปเดตรหัสผ่าน"}
                        </button>
                    </form>
                </div>

                {/* Footer Actions */}
                <div className="ep-footer">
                    <button className="ep-btn-logout" onClick={handleLogout}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                            <polyline points="16 17 21 12 16 7"></polyline>
                            <line x1="21" y1="12" x2="9" y2="12"></line>
                        </svg>
                        ออกจากระบบ
                    </button>
                </div>
            </div>
        </div>
    );
}

export default EditProfile;
