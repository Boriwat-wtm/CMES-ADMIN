// ==========================================
// 📦 นำเข้า Dependencies และ Modules
// ==========================================
import React, { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { ShopContext } from "../contexts/ShopContext"; // 🔥 Multi-tenant Context
import { API_BASE_URL, REALTIME_URL } from "../config/apiConfig";
import "./Register.css";

// ==========================================
// 🔐 Component หน้าล็อกอินสำหรับแอดมิน
// ==========================================
function Register() {
  // ==========================================
  // 📌 State Management
  // ==========================================
  const [username, setUsername] = useState(""); // เก็บค่า username ที่กรอก
  const [password, setPassword] = useState(""); // เก็บค่า password ที่กรอก
  const [showPassword, setShowPassword] = useState(false); // สถานะแสดง/ซ่อนรหัสผ่าน
  const [errorMessage, setErrorMessage] = useState(""); // ข้อความแสดงข้อผิดพลาด
  const [isLoading, setIsLoading] = useState(false); // สถานะกำลังโหลด
  const navigate = useNavigate(); // ใช้สำหรับเปลี่ยนหน้า

  // 🔥 ดึง setShopId จาก Context
  const { setShopId } = useContext(ShopContext);

  // ==========================================
  // 🔑 ฟังก์ชันจัดการการล็อกอิน
  // ==========================================
  const handleLogin = async (e) => {
    e.preventDefault(); // ป้องกันการ reload หน้า

    // ล้างข้อความแสดงข้อผิดพลาดก่อนหน้า
    setErrorMessage("");

    // ตรวจสอบความถูกต้องของข้อมูล
    if (!username.trim()) {
      setErrorMessage("กรุณากรอก Username");
      return;
    }
    if (!password) {
      setErrorMessage("กรุณากรอก Password");
      return;
    }

    setIsLoading(true); // เริ่มสถานะกำลังโหลด

    try {
      // ส่งคำขอล็อกอินไปยัง API
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }), // ส่งข้อมูล username และ password
      });

      const data = await response.json(); // แปลงข้อมูลที่ได้รับเป็น JSON

      // ตรวจสอบว่าล็อกอินสำเร็จหรือไม่
      if (response.ok && data.success) {
        // บันทึกข้อมูลแอดมินใน localStorage
        if (data.user && data.user.id) {
          localStorage.setItem("adminId", data.user.id);
          localStorage.setItem("adminUsername", data.user.username);

          // 🔥 บันทึก shopId และเริ่ม Socket connection
          if (data.user.shopId) {
            console.log(`[Login] Shop ID: ${data.user.shopId}`);
            localStorage.setItem("shopId", data.user.shopId); // 🔥 บันทึกลง localStorage
            setShopId(data.user.shopId); // Context จะจัดการ socket connection อัตโนมัติ
          } else {
            console.warn('[Login] ⚠️ No shopId in response');
            setErrorMessage("ไม่พบข้อมูล Shop ID กรุณาติดต่อผู้ดูแลระบบ");
            setIsLoading(false);
            return;
          }
        }

        // ล้างข้อมูลฟอร์ม
        setUsername("");
        setPassword("");

        // นำทางไปหน้าหลัก
        navigate("/home");
      } else {
        // แสดงข้อความแจ้งเตือนเมื่อล็อกอินไม่สำเร็จ
        setErrorMessage(data.message || "Username หรือ Password ไม่ถูกต้อง");
      }
    } catch (error) {
      // จัดการข้อผิดพลาดที่เกิดขึ้นระหว่างการเชื่อมต่อ API
      console.error("Error during login:", error);
      setErrorMessage("เกิดข้อผิดพลาดในการเข้าสู่ระบบ โปรดลองอีกครั้ง");
    } finally {
      setIsLoading(false); // หยุดสถานะกำลังโหลด
    }
  };

  // ==========================================
  // ⌨️ ฟังก์ชันจัดการการกดปุ่ม Enter
  // ==========================================
  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleLogin(e); // กด Enter เพื่อล็อกอิน
    }
  };

  // ==========================================
  // 🎨 Render UI
  // ==========================================
  return (
    <div className="register-container">
      <h1>ADMIN LOGIN</h1>
      <p>ยินดีต้อนรับเข้าสู่ระบบบริหารจัดการ</p>

      {/* ฟอร์มล็อกอิน */}
      <form className="register-form" onSubmit={handleLogin}>
        {/* ช่องกรอก Username */}
        <div>
          <label htmlFor="username">👤 Username</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="กรอก Username ของคุณ"
            disabled={isLoading} // ปิดการใช้งานขณะกำลังโหลด
            autoFocus // โฟกัสอัตโนมัติเมื่อเปิดหน้า
          />
        </div>

        {/* ช่องกรอก Password */}
        <div>
          <label htmlFor="password">🔒 Password</label>
          <div className="password-container">
            <input
              type={showPassword ? "text" : "password"} // สลับระหว่างแสดง/ซ่อนรหัสผ่าน
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="กรอก Password ของคุณ"
              disabled={isLoading} // ปิดการใช้งานขณะกำลังโหลด
            />
            {/* ไอคอนแสดง/ซ่อนรหัสผ่าน */}
            <span
              className="toggle-password-icon"
              onClick={() => setShowPassword(!showPassword)} // สลับสถานะแสดง/ซ่อน
              title={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            >
              {showPassword ? (
                <i className="fas fa-eye"></i> // ไอคอนแสดงรหัสผ่าน
              ) : (
                <i className="fas fa-eye-slash"></i> // ไอคอนซ่อนรหัสผ่าน
              )}
            </span>
          </div>
        </div>

        {/* แสดงข้อความแจ้งเตือนข้อผิดพลาด (ถ้ามี) */}
        {errorMessage && <p className="error-message">⚠️ {errorMessage}</p>}

        {/* ปุ่มเข้าสู่ระบบ */}
        <button type="submit" disabled={isLoading}>
          {isLoading ? (
            <span>
              <i className="fas fa-spinner fa-spin"></i> กำลังเข้าสู่ระบบ...
            </span>
          ) : (
            "เข้าสู่ระบบ"
          )}
        </button>
      </form>
    </div>
  );
}

// ส่งออก Component
export default Register;