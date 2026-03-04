import React, { useState, useContext, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ShopContext } from "../contexts/ShopContext";
import { API_BASE_URL } from "../config/apiConfig";
import adminFetch from "../config/authFetch";
import "./EditProfile.css";

// Emoji ที่ใช้บ่อยสำหรับชื่อร้าน
const EMOJI_LIST = [
    "🏪", "🏬", "🍜", "🍣", "🍕", "🍔", "☕", "🧋", "🍰", "🛍️",
    "💈", "🎯", "🎮", "🎸", "🌟", "✨", "🔥", "💎", "🏆", "👑",
    "🌺", "🌸", "🌻", "🍀", "🦋", "🐉", "🦁", "🐯", "🦊", "🐼",
    "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💫", "⚡",
];

function EditProfile() {
    const navigate = useNavigate();
    const { logout } = useContext(ShopContext);

    const adminId = localStorage.getItem("adminId") || "";
    const [adminShopId, setAdminShopId] = useState(localStorage.getItem("shopId") || "");
    const [username] = useState(localStorage.getItem("adminUsername") || "Admin");

    // Shop Logo State
    const [shopLogo, setShopLogo] = useState(null);
    const [logoPreview, setLogoPreview] = useState(null);
    const [logoLoading, setLogoLoading] = useState(false);
    const logoInputRef = useRef(null);

    // Shop Display Name State
    const [shopDisplayName, setShopDisplayName] = useState("");
    const [isEditingName, setIsEditingName] = useState(false);
    const [nameInput, setNameInput] = useState("");
    const [nameLoading, setNameLoading] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const emojiPickerRef = useRef(null);

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

    // Load current shop profile
    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await adminFetch(`${API_BASE_URL}/api/shop/profile`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.shop) {
                        setShopDisplayName(data.shop.name || adminShopId);
                        setNameInput(data.shop.name || adminShopId);
                        if (data.shop.logo) setLogoPreview(data.shop.logo);
                    }
                }
            } catch (err) {
                console.warn("[EditProfile] Failed to load shop profile:", err.message);
            }
        };
        if (adminShopId) fetchProfile();
    }, [adminShopId]);

    // Close emoji picker on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
                setShowEmojiPicker(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // ===== Logo Upload =====
    const handleLogoClick = () => {
        logoInputRef.current?.click();
    };

    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setMessage({ text: "กรุณาเลือกไฟล์รูปภาพเท่านั้น", type: "error" });
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setMessage({ text: "ไฟล์ต้องมีขนาดไม่เกิน 5MB", type: "error" });
            return;
        }
        setShopLogo(file);
        setLogoPreview(URL.createObjectURL(file));
    };

    const handleLogoUpload = async () => {
        if (!shopLogo) return;
        setLogoLoading(true);
        try {
            const formData = new FormData();
            formData.append("logo", shopLogo);
            const res = await adminFetch(`${API_BASE_URL}/api/shop/logo`, {
                method: "POST",
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                setLogoPreview(data.logo);
                setShopLogo(null);
                setMessage({ text: "อัปโหลดโลโก้ร้านสำเร็จ! 🎉", type: "success" });
            } else {
                setMessage({ text: data.message || "อัปโหลดล้มเหลว", type: "error" });
            }
        } catch (err) {
            setMessage({ text: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้", type: "error" });
        } finally {
            setLogoLoading(false);
        }
    };

    // ===== Shop Display Name =====
    const handleSaveName = async () => {
        if (!nameInput.trim()) {
            setMessage({ text: "กรุณาระบุชื่อร้านค้า", type: "error" });
            return;
        }
        setNameLoading(true);
        try {
            const res = await adminFetch(`${API_BASE_URL}/api/shop/name`, {
                method: "POST",
                body: JSON.stringify({ name: nameInput.trim() })
            });
            const data = await res.json();
            if (data.success) {
                setShopDisplayName(data.name);
                setIsEditingName(false);
                setShowEmojiPicker(false);
                setMessage({ text: "เปลี่ยนชื่อร้านสำเร็จ! ✨", type: "success" });
            } else {
                setMessage({ text: data.message || "เกิดข้อผิดพลาด", type: "error" });
            }
        } catch {
            setMessage({ text: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้", type: "error" });
        } finally {
            setNameLoading(false);
        }
    };

    const handleCancelEditName = () => {
        setIsEditingName(false);
        setShowEmojiPicker(false);
        setNameInput(shopDisplayName);
    };

    // ===== Change Password =====
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
            const res = await adminFetch(`${API_BASE_URL}/api/admin/change-password`, {
                method: "POST",
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

    // ===== Shop ID =====
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
            const res = await adminFetch(`${API_BASE_URL}/api/admin/change-shopid`, {
                method: "POST",
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
                {/* Header */}
                <div className="ep-header">
                    <button className="ep-btn-back" onClick={() => navigate("/home")}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                        <span>กลับสู่หน้าหลัก</span>
                    </button>
                </div>

                {/* ===== SHOP LOGO SECTION ===== */}
                <div className="ep-profile-section">
                    <div className="ep-avatar-wrapper" onClick={handleLogoClick} title="คลิกเพื่อเปลี่ยนโลโก้ร้าน" style={{ cursor: "pointer" }}>
                        {logoPreview ? (
                            <img
                                src={logoPreview}
                                alt="Shop Logo"
                                style={{
                                    width: "88px", height: "88px",
                                    borderRadius: "50%", objectFit: "cover",
                                    border: "3px solid rgba(255,255,255,0.3)"
                                }}
                            />
                        ) : (
                            <div className="ep-avatar-circle">{initials}</div>
                        )}
                        {/* Edit badge */}
                        <div className="ep-avatar-badge">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                        </div>
                    </div>

                    {/* Hidden file input */}
                    <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={handleLogoChange}
                    />

                    {/* Upload button (shows after selecting file) */}
                    {shopLogo && (
                        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                            <button
                                className="ep-btn-save"
                                style={{ padding: "6px 16px", fontSize: "0.85rem", marginTop: 0 }}
                                onClick={handleLogoUpload}
                                disabled={logoLoading}
                            >
                                {logoLoading ? "กำลังอัปโหลด..." : "💾 บันทึกโลโก้"}
                            </button>
                            <button
                                className="ep-btn-icon ep-btn-cancel"
                                style={{ padding: "6px 12px" }}
                                onClick={() => { setShopLogo(null); setLogoPreview(null); }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                    )}

                    <h2 className="ep-username">{username}</h2>

                    {/* ===== SHOP SETTINGS CARDS ===== */}
                    <div className="ep-shop-cards-container">
                        {/* 1. Shop Display Name Card */}
                        <div className="ep-shop-card">
                            <div className="ep-shop-card-header">
                                <div className="ep-shop-icon-wrapper">
                                    <span>🏪</span>
                                </div>
                                <div className="ep-shop-card-title-group">
                                    <h4>ชื่อร้านที่ลูกค้าเห็น</h4>
                                    <p>ชื่อนี้จะแสดงบนหน้าจอหลักของลูกค้า เปลี่ยนได้ตลอดเวลา</p>
                                </div>
                            </div>

                            <div className="ep-divider-dashed"></div>

                            <div className="ep-shop-card-content">
                                {isEditingName ? (
                                    <div className="ep-shop-edit-wrapper" ref={emojiPickerRef}>
                                        <input
                                            type="text"
                                            value={nameInput}
                                            onChange={(e) => setNameInput(e.target.value)}
                                            className="ep-shop-input"
                                            placeholder="ชื่อร้าน (ใส่อีโมจิได้)"
                                            maxLength="50"
                                            autoFocus
                                        />
                                        <div className="ep-shop-action-buttons">
                                            <button
                                                className="ep-btn-emoji"
                                                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                                title="แทรกอิโมจิ"
                                            >
                                                😀
                                            </button>
                                            <button className="ep-btn-icon ep-btn-confirm" onClick={handleSaveName} disabled={nameLoading} title="บันทึก" style={{ fontSize: "16px" }}>
                                                ✅
                                            </button>
                                            <button className="ep-btn-icon ep-btn-cancel" onClick={handleCancelEditName} disabled={nameLoading} title="ยกเลิก" style={{ fontSize: "16px" }}>
                                                ❌
                                            </button>
                                        </div>

                                        {showEmojiPicker && (
                                            <div className="ep-emoji-picker-dropdown">
                                                {["😀", "😂", "🥰", "😎", "🥺", "✨", "🔥", "❤️", "👍", "🙏", "🎉", "🍜", "☕", "🍺", "🍽️", "🎵"].map(emoji => (
                                                    <button
                                                        key={emoji}
                                                        className="ep-emoji-btn"
                                                        type="button"
                                                        title={emoji}
                                                        onClick={() => {
                                                            setNameInput(prev => prev + emoji);
                                                            setShowEmojiPicker(false);
                                                        }}
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="ep-shop-display-pill blue-pill">
                                        <span className="ep-shop-value-text" title={shopDisplayName || "ไม่ได้ระบุ"}>
                                            {shopDisplayName || "ไม่ได้ระบุ"}
                                        </span>
                                        <button className="ep-btn-edit-circle" onClick={() => { setIsEditingName(true); setNameInput(shopDisplayName); }} title="แก้ไขชื่อร้านที่แสดงผล" style={{ fontSize: "16px" }}>
                                            ✏️
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 2. Shop ID Card */}
                        <div className="ep-shop-card warning-card">
                            <div className="ep-shop-card-header">
                                <div className="ep-shop-icon-wrapper">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                                </div>
                                <div className="ep-shop-card-title-group">
                                    <h4>รหัสลิงก์ร้าน <br />(Shop ID)</h4>
                                    <p className="ep-warning-text">
                                        <span className="ep-warning-icon">⚠️</span> <strong>คำเตือน:</strong> หากเปลี่ยนรหัสลิงก์ จะต้องอัปเดต URL ใน OBS และ QR Code ใหม่ทั้งหมด
                                    </p>
                                </div>
                            </div>

                            <div className="ep-divider-dashed"></div>

                            <div className="ep-shop-card-content">
                                {isEditingShopId ? (
                                    <div className="ep-shop-edit-wrapper">
                                        <input
                                            type="text"
                                            value={newShopIdInput}
                                            onChange={(e) => setNewShopIdInput(e.target.value)}
                                            className="ep-shop-input"
                                            placeholder="ภาษาอังกฤษหรือเลข"
                                            maxLength="40"
                                            autoFocus
                                        />
                                        <div className="ep-shop-action-buttons">
                                            <button className="ep-btn-icon ep-btn-confirm" onClick={handleSaveShopId} disabled={shopIdLoading} title="บันทึก" style={{ fontSize: "16px" }}>
                                                ✅
                                            </button>
                                            <button className="ep-btn-icon ep-btn-cancel" onClick={handleCancelEditShopId} disabled={shopIdLoading} title="ยกเลิก" style={{ fontSize: "16px" }}>
                                                ❌
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="ep-shop-display-pill red-pill">
                                        <span className="ep-shop-value-text ep-shop-id-badge" title={adminShopId || "ไม่ได้ระบุ"}>
                                            {adminShopId || "ไม่ได้ระบุ"}
                                        </span>
                                        <button className="ep-btn-edit-circle" onClick={() => setIsEditingShopId(true)} title="แก้ไขรหัสลิงก์ร้าน" style={{ fontSize: "16px" }}>
                                            ✏️
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div> {/* End ep-profile-section */}
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
                                <input type="password" placeholder="กรอกรหัสผ่านปัจจุบันของคุณ" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="ep-input-field" />
                            </div>
                        </div>

                        <div className="ep-input-group">
                            <label>รหัสผ่านใหม่</label>
                            <div className="ep-input-wrapper">
                                <svg className="ep-input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                                <input type="password" placeholder="อย่างน้อย 6 ตัวอักษร" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="ep-input-field" />
                            </div>
                        </div>

                        <div className="ep-input-group">
                            <label>ยืนยันรหัสผ่านใหม่</label>
                            <div className="ep-input-wrapper">
                                <svg className="ep-input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                </svg>
                                <input type="password" placeholder="ยืนยันรหัสผ่านใหม่อีกครั้ง" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="ep-input-field" />
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
                            {loading ? <span className="ep-loader">กำลังบันทึก...</span> : "อัปเดตรหัสผ่าน"}
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
