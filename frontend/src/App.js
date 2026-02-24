import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ShopProvider } from "./contexts/ShopContext"; // 🔥 Multi-tenant Context
import Register from "./07_Register/Register"; // นำเข้า Register
import Home from "./01_Home/home.js"; // นำเข้า Home
import Report from "./05_Report/AdminReport.js"; // นำเข้า Report
import AdminStatSlip from "./Stat-slip"; // ชื่อ component ต้องตรงกับที่ export
import ImageQueue from "./02_ImageQueue/ImageQueue";
import TimeHistory from "./08_TimeHistory/TimeHistory.js";
import CheckHistory from "./03_CheckHistory/CheckHistory";  // นำเข้า CheckHistory
import LuckyWheel from "./06_LuckyWheel/LuckyWheel.js";
import Giftsetting from "./04_Gift/Giftsetting.js";
import EditProfile from "./09_EditProfile/EditProfile.js";

function App() {
  return (
    <ShopProvider> {/* 🔥 Wrap ด้วย ShopProvider */}
      <Router>
        <Routes>
          <Route path="/" element={<Register />} /> {/* หน้าแรกสุด */}
          <Route path="/home" element={<Home />} /> {/* หน้า Home */}
          <Route path="/report" element={<Report />} /> {/* หน้า Report */}
          <Route path="/stat-slip" element={<AdminStatSlip />} />
          <Route path="/image-queue" element={<ImageQueue />} />
          <Route path="/TimeHistory" element={<TimeHistory />} />
          <Route path="/check-history" element={<CheckHistory />} /> {/* เส้นทางใหม่ */}
          <Route path="/lucky-wheel" element={<LuckyWheel />} />
          <Route path="/gift-setting" element={<Giftsetting />} />
          <Route path="/edit-profile" element={<EditProfile />} />
        </Routes>
      </Router>
    </ShopProvider>
  );
}

export default App;
