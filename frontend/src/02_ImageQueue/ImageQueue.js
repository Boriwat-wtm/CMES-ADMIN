// นำเข้า React hooks และ libraries ที่จำเป็น
import React, { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom"; // สำหรับการนำทางกลับหน้า Home
import { ShopContext } from "../contexts/ShopContext"; // 🔥 Multi-tenant Context
import "./ImageQueue.css"; // ไฟล์ CSS สำหรับตกแต่งหน้านี้
// นำเข้า logo ของ social media ต่างๆ
import igLogo from "../data-icon/ig-logo.png";
import fbLogo from "../data-icon/facebook-logo.png";
import lineLogo from "../data-icon/line-logo.png";
import tiktokLogo from "../data-icon/tiktok-logo.png";
import { API_BASE_URL, REALTIME_URL, USER_API_URL } from "../config/apiConfig"; // URL ของ API
import adminFetch from "../config/authFetch"; // 🔒 Admin auth utility + 401 redirect

// 🔥 ลบการสร้าง socket แบบ global
// const socket = io(API_BASE_URL, { transports: ['websocket', 'polling'] });

// Component หลักสำหรับจัดการคิวรูปภาพและการแสดงบน OBS
function ImageQueue() {
  // 🔥 ดึง socket จาก Context
  const { socket, shopId, isSocketConnected } = useContext(ShopContext);

  // ===== State Management: ข้อมูลรูปภาพและ UI =====
  const [images, setImages] = useState([]); // รายการรูปภาพที่รอการอนุมัติ
  const [loading, setLoading] = useState(true); // สถานะกำลังโหลดข้อมูล
  const [selectedImage, setSelectedImage] = useState(null); // รูปภาพที่เลือกดูรายละเอียด
  const [showModal, setShowModal] = useState(false); // แสดง Modal รายละเอียดหรือไม่
  const [showHistory, setShowHistory] = useState(false); // แสดง Modal ประวัติหรือไม่
  const [historyItems, setHistoryItems] = useState([]); // รายการประวัติการอนุมัติ/ปฏิเสธ
  const [categoryFilter, setCategoryFilter] = useState("all"); // ตัวกรองประเภทเนื้อหา (all, image, text, birthday, gift)
  const [giftSettings, setGiftSettings] = useState([]); // ตั้งค่าของขวัญจาก Backend

  // ===== State: แก้ไขขนาดรูปภาพ =====
  const [editWidth, setEditWidth] = useState(""); // ความกว้างที่ต้องการแสดงบน OBS
  const [editHeight, setEditHeight] = useState(""); // ความสูงที่ต้องการแสดงบน OBS

  // ===== State: แก้ไขรายการสินค้า Gift =====
  const [editGiftItems, setEditGiftItems] = useState([]); // รายการสินค้าที่กำลังแก้ไข
  const [isEditingGift, setIsEditingGift] = useState(false); // กำลังอยู่ในโหมดแก้ไขหรือไม่
  const [showAddGiftItem, setShowAddGiftItem] = useState(false); // แสดง dropdown เพิ่มสินค้า
  const [savingGiftItems, setSavingGiftItems] = useState(false); // กำลังบันทึก

  // ===== State: ระบบ Preview และ Queue =====
  const [currentPreview, setCurrentPreview] = useState(null); // รูปภาพที่กำลังแสดงบน OBS
  const [previewQueue, setPreviewQueue] = useState([]); // คิวรูปภาพที่รออนุมัติแล้วรอแสดง
  const [timeLeft, setTimeLeft] = useState(0); // เวลาที่เหลือในการแสดงรูปภาพปัจจุบัน (วินาที)
  const [isActive, setIsActive] = useState(false); // กำลังแสดงรูปภาพอยู่หรือไม่
  const [isPaused, setIsPaused] = useState(false); // อยู่ในช่วงหน่วงเวลาระหว่างรูปหรือไม่
  const [pauseTimeLeft, setPauseTimeLeft] = useState(0); // เวลาหน่วงที่เหลือก่อนแสดงรูปถัดไป (วินาที)

  // คำนวณระยะเวลาทั้งหมดของรูปภาพปัจจุบัน (ขั้นต่ำ 1 วินาที)
  const totalDuration = currentPreview ? Math.max(currentPreview.time || 0, 1) : 1;
  // คำนวณเปอร์เซ็นต์ความคืบหน้าการแสดงรูป (0-1)
  const progressRatio = Math.max(0, Math.min(1, (totalDuration - timeLeft) / totalDuration));

  // ===== ฟังก์ชัน Helper: สร้าง URL ของรูปภาพอย่างปลอดภัย =====
  const getImageUrl = (filePath, baseUrl = API_BASE_URL) => {
    if (!filePath) return null; // ถ้าไม่มี path คืนค่า null
    // ถ้าเป็น URL เต็มอยู่แล้ว ให้ใช้เลย
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    // ปรับ path ให้ขึ้นต้นด้วย / แล้วรวมกับ base URL
    const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    return `${baseUrl}${normalizedPath}`;
  };

  // ===== Effect Hook: โหลดข้อมูลและตั้งค่า Socket Listeners =====
  useEffect(() => {
    // โหลดรายการรูปภาพและตั้งค่าของขวัญเมื่อ Component โหลด
    fetchImages();
    fetchGiftSettings();

    // 🔧 Multi-tenant: ตรวจสอบว่า socket จาก Context พร้อมใช้งาน
    if (!socket) {
      console.log("[ImageQueue] Socket not available yet");
      return;
    }

    // ฟัง Socket Events สำหรับ Real-time updates
    socket.on('admin-update-queue', fetchImages); // เมื่อคิวมีการเปลี่ยนแปลง
    socket.on('new-upload', fetchImages); // เมื่อมีรูปภาพใหม่อัพโหลด

    // ฟังเหตุการณ์ Pause จาก Server (ระหว่างการแสดงรูปภาพ)
    socket.on('pause-display', (data) => {
      if (data && data.remaining !== undefined) {
        // Server สั่งสัญญาณ Pause: ล้างรูปภาพที่กำลังแสดงและแสดง Countdown
        setIsActive(false);
        setCurrentPreview(null);
        localStorage.removeItem("currentPreview");
        localStorage.removeItem("isActive");

        // ตั้งค่า Pause mode และนับถอยหลังเวลาคงเหลือ
        setIsPaused(true);
        setPauseTimeLeft(data.remaining);
      }
    });

    // ฟังเหตุการณ์ Resume จาก Server (เริ่มแสดงรูปใหม่)
    socket.on('resume-display', () => {
      setIsPaused(false);
      setPauseTimeLeft(0);
    });

    // ฟังเหตุการณ์เมื่อรูปภาพแสดงครบ - ล้างการแสดงเมื่อ Server ยืนยัน
    socket.on('item-completed', (data) => {
      console.log("[Socket] Item completed:", data);

      // 🔧 FIX: ใช้ currentPreviewRef แทน currentPreview state (แก้ stale closure)
      const savedPreview = localStorage.getItem("currentPreview");
      const liveCurrentPreview = currentPreviewRef.current;

      if (savedPreview) {
        try {
          const preview = JSON.parse(savedPreview);
          const previewId = preview._id || preview.id;
          const completedId = data.id || data._id;

          // ลบการแสดงเฉพาะเมื่อ ID ตรงกัน
          if (previewId !== completedId) {
            console.log("[Socket] ID mismatch - ignoring. Expected:", previewId, "Got:", completedId);
            return;
          }
        } catch (err) {
          console.error("[Socket] Error parsing preview:", err);
        }
      }

      // 🔧 FIX: ตรวจสอบทั้งจาก ref และ localStorage (ไม่ใช้ stale state แล้ว)
      if (!liveCurrentPreview && !localStorage.getItem("currentPreview")) {
        console.log("[Socket] Already cleared - ignoring duplicate event");
        return;
      }

      // ล้างการแสดงรูปภาพปัจจุบัน
      setCurrentPreview(null);
      setIsActive(false);
      setTimeLeft(0);
      setIsPaused(false);
      setPauseTimeLeft(0);
      isCompletingRef.current = false;

      // ล้าง localStorage
      localStorage.removeItem("currentPreview");
      localStorage.removeItem("isActive");
      localStorage.removeItem("startTimestamp");
      localStorage.removeItem("duration");

      // โหลดคิวใหม่ และ refresh ประวัติ
      fetchImages();
      fetchHistory(); // 🔧 Refresh ประวัติเมื่อรายการเล่นเสร็จ
    });

    // Cleanup function: เมื่อ Component unmount ให้ยกเลิกการฟัง Socket events
    return () => {
      // 🔧 Multi-tenant: ตรวจสอบว่า socket ยังมีอยู่ก่อน cleanup
      if (socket) {
        socket.off('admin-update-queue');
        socket.off('new-upload');
        socket.off('pause-display');
        socket.off('resume-display');
        socket.off('item-completed');
      }
    };
    // 🔧 Multi-tenant: เพิ่ม socket ใน dependencies เพื่อ re-subscribe เมื่อ socket เปลี่ยน
  }, [socket]);

  // 🔧 FIX: Polling fallback สำหรับกรณีที่ socket event หาย — ดึงข้อมูลใหม่ทุก 5 วินาที
  useEffect(() => {
    const pollInterval = setInterval(() => {
      fetchImages();
    }, 5000);
    return () => clearInterval(pollInterval);
  }, []);


  // ===== ฟังก์ชัน: เริ่มการแสดงรูปภาพใหม่ =====
  const startPreview = async (image) => {
    const now = Date.now();
    const imageId = image._id || image.id;

    // สำคัญ: ตั้งค่า status เป็น 'playing' ใน local เพื่อป้องกันปัญหาการ sync
    const playingImage = { ...image, status: 'playing' };

    // ตั้งค่า state และ localStorage สำหรับการแสดง
    setCurrentPreview(playingImage);
    setTimeLeft(image.time);
    setIsActive(true);
    localStorage.setItem("currentPreview", JSON.stringify(playingImage));
    localStorage.setItem("startTimestamp", now);
    localStorage.setItem("duration", image.time);
    localStorage.setItem("isActive", true);

    // อัปเดต images ใน local state เพื่อป้องกันการ sync เพิ่มคิวซ้ำ
    setImages(prev => prev.map(img => {
      if ((img._id === imageId) || (img.id === imageId)) {
        return { ...img, status: 'playing' };
      }
      return img;
    }));

    // อัปเดตสถานะเป็น 'playing' ใน Database
    try {
      await adminFetch(`${API_BASE_URL}/api/playing/${imageId}`, {
        method: "POST",
      });
      console.log("[Playing] Marked as playing:", imageId);
    } catch (err) {
      console.error("Error marking as playing:", err);
    }
  };

  // ===== Ref: ป้องกันการเสร็จสิ้นซ้ำ =====
  const isCompletingRef = React.useRef(false); // Guard ป้องกันการเสร็จสิ้นรูปซ้ำ

  // เก็บ ID ของรูปที่เสร็จสิ้นแล้ว เพื่อป้องกันการเพิ่มกลับคิว
  const completedIdsRef = React.useRef(new Set());

  // Ref สำหรับเก็บ previewQueue ปัจจุบัน สำหรับใช้ใน callbacks
  const previewQueueRef = React.useRef(previewQueue);

  // 🔧 FIX: Ref สำหรับเก็บ currentPreview (แก้ปัญหา stale closure ใน socket handlers)
  const currentPreviewRef = React.useRef(currentPreview);

  // รักษาความสอดคล้องระหว่าง ref และ state
  useEffect(() => {
    previewQueueRef.current = previewQueue;
    console.log("[Ref Sync] previewQueueRef updated, length:", previewQueue.length);
  }, [previewQueue]);

  // 🔧 FIX: Sync currentPreviewRef เมื่อ state เปลี่ยน
  useEffect(() => {
    currentPreviewRef.current = currentPreview;
  }, [currentPreview]);

  // ===== ฟังก์ชัน: เริ่มแสดงรูปถัดไปจากคิว =====
  const processNextFromQueue = () => {
    const currentQueue = previewQueueRef.current;
    console.log("[ProcessNext] Called. Queue length:", currentQueue.length);

    if (currentQueue.length > 0) {
      const nextImage = currentQueue[0];
      console.log("[ProcessNext] Starting:", nextImage._id || nextImage.id);

      // ลบรูปแรกออกจากคิว
      setPreviewQueue(prev => prev.slice(1));

      // จากนั้นเริ่มเล่นรูปภาพ
      startPreview(nextImage);
      setIsPaused(false);
      setPauseTimeLeft(0);
    } else {
      console.log("[ProcessNext] Queue empty, fetching images");
      setIsPaused(false);
      setPauseTimeLeft(0);
      fetchImages();
    }
  };

  // ===== ฟังก์ชัน: จัดการเมื่อรูปภาพแสดงครบ =====
  const completeCurrentItem = async (imageId) => {
    console.log("[Complete] Completing item:", imageId);

    // เรียก API เพื่อบอก Backend ว่ารูปภาพแสดงครบแล้ว
    try {
      const response = await adminFetch(`${API_BASE_URL}/api/complete/${imageId}`, {
        method: "POST",
      });
      const result = await response.json();
      console.log("[Complete] API Result:", result);
      completedIdsRef.current.add(imageId); // เพิ่ม ID เข้า Set เพื่อป้องกันการเพิ่มกลับคิว
    } catch (err) {
      console.error("[Complete] API Error:", err);
    }

    // ล้าง state ของการแสดงรูปภาพปัจจุบัน
    setIsActive(false);
    setCurrentPreview(null);
    localStorage.removeItem("currentPreview");
    localStorage.removeItem("startTimestamp");
    localStorage.removeItem("duration");
    localStorage.removeItem("isActive");

    // ปลดล็อกเพื่อให้สามารถเสร็จสิ้นครั้งต่อไปได้
    isCompletingRef.current = false;

    // ตรวจสอบว่ามีรูปภาพที่รออยู่ในคิวหรือไม่
    const queueLength = previewQueueRef.current.length;
    console.log("[Complete] Queue has", queueLength, "items waiting");

    if (queueLength > 0) {
      console.log("[Complete] Queue has items, moving to next immediately");
      setIsPaused(false);
      setPauseTimeLeft(0);

      // โหลดข้อมูลใหม่เพื่อ Sync กับ Server (Server จะจัดการเล่น Auto)
      setTimeout(fetchImages, 500);
    } else {
      console.log("[Complete] No queue, fetching images");
      fetchImages();
    }
  };

  // ===== Effect Hook: Timer สำหรับ Countdown เวลาการแสดงรูปภาพ =====
  useEffect(() => {
    let interval = null;
    if (isActive && currentPreview) {
      // ตั้ง Interval นับถอยหลังทุก 1 วินาที
      interval = setInterval(() => {
        // ดึงข้อมูลจาก localStorage เพื่อคำนวณเวลาที่เหลือ
        const startTimestamp = Number(localStorage.getItem("startTimestamp"));
        const duration = Number(localStorage.getItem("duration"));
        const now = Date.now();
        const elapsed = Math.floor((now - startTimestamp) / 1000);
        const left = duration - elapsed;
        setTimeLeft(left > 0 ? left : 0);

        // ถ้าหมดเวลาแล้ว รอ Server จัดการ (ไม่ให้ Client จัดการเอง)
        if (left <= 0 && !isCompletingRef.current) {
          // ล็อกเพื่อป้องกันการเสร็จสิ้นซ้ำ
          isCompletingRef.current = true;
          clearInterval(interval);

          // เก็บ imageId ก่อนที่ state จะเปลี่ยน
          const imageId = currentPreview._id || currentPreview.id;

          // รอ Server จัดการ timeout (ไม่ให้ Client เรียกฟังก์ชัน complete)
          setTimeout(() => {
            console.log("[Client] Timer up. Waiting for server to complete item...");
          }, 0);
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, currentPreview]);

  // ===== Effect Hook: Countdown สำหรับหน่วงเวลาระหว่างรูปภาพ =====
  useEffect(() => {
    let countdownTimer = null;

    if (isPaused && pauseTimeLeft > 0) {
      console.log("[Countdown] Starting from", pauseTimeLeft);

      // ตั้ง Timer นับถอยหลังเวลาหน่วง
      countdownTimer = setInterval(() => {
        setPauseTimeLeft(prev => {
          const newVal = prev - 1;
          console.log("[Countdown] Time:", newVal);

          if (newVal <= 0) {
            clearInterval(countdownTimer);
            // ล้าง Pause state เมื่อ Countdown สิ้นสุด
            setTimeout(() => {
              console.log("[Countdown] Finished, clearing pause state");
              setIsPaused(false);
              setPauseTimeLeft(0);
              // ให้ Server เป็นผู้ควบคุมการเล่นรูปถัดไป เพื่อป้องกัน Race Condition
            }, 100);
            return 0;
          }
          return newVal;
        });
      }, 1000);
    }

    return () => {
      if (countdownTimer) {
        clearInterval(countdownTimer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused]); // รันเฉพาะเมื่อ isPaused เปลี่ยน

  // ===== ฟังก์ชัน: ดึงข้อมูลคิวรูปภาพจาก Server =====
  const fetchImages = async () => {
    try {
      const response = await adminFetch(`${API_BASE_URL}/api/queue`);
      if (response.ok) {
        const data = await response.json();
        setImages(data); // อัปเดตรายการรูปภาพ

        // ตรวจสอบว่ามีรูปภาพที่กำลังเล่นอยู่บน Server หรือไม่
        const playingOnServer = data.find(img => img.status === 'playing');

        // ถ้าพบรูปภาพที่กำลังเล่น และ local ไม่มี preview หรือ ID ตรงกัน
        if (playingOnServer && (!currentPreviewRef.current || (currentPreviewRef.current._id || currentPreviewRef.current.id) === (playingOnServer._id || playingOnServer.id))) {

          // คำนวณเวลาที่เหลือ
          const duration = playingOnServer.time || 10;
          let remaining = duration;

          if (playingOnServer.playingAt) {
            const elapsed = (Date.now() - new Date(playingOnServer.playingAt).getTime()) / 1000;
            remaining = Math.max(0, duration - elapsed);
          }

          // Force sync state
          console.log("[QueueSync] Found playing item from server:", playingOnServer._id, "Remaining:", remaining);

          if (!isActive || !currentPreviewRef.current) {
            // New item started: Clear pause state and show item
            setIsPaused(false);
            setPauseTimeLeft(0);

            setCurrentPreview(playingOnServer);
            setIsActive(true);
            setTimeLeft(remaining);

            // Update localStorage to match server reality
            localStorage.setItem("currentPreview", JSON.stringify(playingOnServer));
            localStorage.setItem("isActive", true);
            // Approximate start timestamp for local interval
            localStorage.setItem("startTimestamp", Date.now() - ((duration - remaining) * 1000));
            localStorage.setItem("duration", duration);
          }
        } else if (!playingOnServer && currentPreviewRef.current) {
          // 🔧 FIX: Server ไม่มี item กำลังเล่น แต่ UI ยังค้างอยู่ => ล้าง Stale State
          console.log("[QueueSync] No playing item on server but UI is stuck — clearing stale state");
          setCurrentPreview(null);
          setIsActive(false);
          setTimeLeft(0);
          // ❌ อย่าล้าง isPaused/pauseTimeLeft ที่นี่ — ให้ server pause-display event ควบคุมเอง
          // setIsPaused(false);  ← ถ้าล้างตรงนี้จะทับ countdown ที่รับจาก pause-display
          // setPauseTimeLeft(0); ←
          isCompletingRef.current = false;
          localStorage.removeItem("currentPreview");
          localStorage.removeItem("isActive");
          localStorage.removeItem("startTimestamp");
          localStorage.removeItem("duration");
        }
      }
    } catch (error) {
      console.error("Error fetching images:", error);
    } finally {
      setLoading(false);
    }
  };

  // ===== ฟังก์ชัน: ดึงประวัติการอนุมัติ/ปฏิเสธ =====
  const fetchHistory = async () => {
    try {
      const response = await adminFetch(`${API_BASE_URL}/api/check-history`);
      if (response.ok) {
        const data = await response.json();
        setHistoryItems(data);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
    }
  };

  // ===== ฟังก์ชัน: ดึงตั้งค่าของขวัญจาก Backend =====
  const fetchGiftSettings = async () => {
    try {
      const response = await adminFetch(`${API_BASE_URL}/api/gifts/settings`);
      if (response.ok) {
        const data = await response.json();
        // โครงสร้างข้อมูล: { tableCount, items: [...] }
        setGiftSettings(data.items || []);
        console.log("[GiftSettings] Loaded:", data.items);
      }
    } catch (error) {
      console.error("Error fetching gift settings:", error);
    }
  };



  // ===== ฟังก์ชัน: ข้ามรูปภาพที่กำลังแสดง =====
  const handleSkipCurrent = async () => {
    if (!currentPreview) return; // ถ้าไม่มีรูบที่กำลังแสดง ไม่ต้องทำอะไร
    const imageId = currentPreview._id || currentPreview.id;

    console.log("[Skip] Current Queue Length:", previewQueue.length);
    console.log("[Skip] Queue Items:", previewQueue.map(q => q._id || q.id));

    // แจ้ง Backend ว่ารูปนี้เสร็จสิ้นแล้ว
    try {
      await adminFetch(`${API_BASE_URL}/api/complete/${imageId}`, {
        method: "POST",
      });
    } catch (err) {
      console.error("Error skipping current image:", err);
    }

    // ส่งสัญญาณไป OBS ให้ซ่อนการแสดงทันที
    // 🔧 Multi-tenant: ตรวจสอบว่า socket พร้อมใช้งานก่อน emit
    if (socket) {
      socket.emit('skip-current');
    }

    // 🔧 FIX: เก็บ queueOrder ก่อนลบ localStorage
    const savedQueueOrder = localStorage.getItem('queueOrder');

    // รีเซ็ต state ของการแสดงรูปภาพปัจจุบัน
    setIsActive(false);
    setIsPaused(false);
    setCurrentPreview(null);
    setTimeLeft(0);
    setPauseTimeLeft(0);

    // ล้าง localStorage (แต่จะคืนค่า queueOrder กลับ)
    localStorage.removeItem("currentPreview");
    localStorage.removeItem("startTimestamp");
    localStorage.removeItem("duration");
    localStorage.removeItem("isActive");
    localStorage.removeItem("timeLeft");
    localStorage.removeItem("isPaused");
    localStorage.removeItem("pauseTimeLeft");

    // 🔧 FIX: คืนค่า queueOrder กลับไป
    if (savedQueueOrder) {
      localStorage.setItem('queueOrder', savedQueueOrder);
      console.log("[Skip] ✅ Restored queueOrder:", savedQueueOrder);
    }

    // เล่นคิวถัดไป
    if (previewQueue.length > 0) {
      console.log("[Skip] ✅ Playing next queue item");
      const nextImage = previewQueue[0];
      setPreviewQueue(prev => prev.slice(1));
      startPreview(nextImage);
    } else {
      console.log("[Skip] ⚠️ Queue empty, refetching");
      fetchImages();
    }
  };

  // ===== ฟังก์ชัน: นำรูปภาพจากประวัติกลับมาเข้าคิว =====
  const handleRestoreToQueue = async (historyId) => {
    try {
      console.log("[Frontend] Restoring history ID:", historyId);
      const response = await adminFetch(`${API_BASE_URL}/api/history/restore/${historyId}`, {
        method: "POST",
      });
      if (response.ok) {
        const result = await response.json();
        console.log("[Frontend] Restore success:", result);

        // โหลดข้อมูลทั้งประวัติและคิวใหม่
        await fetchHistory();
        await fetchImages();

        // ปิด modal หลังจาก restore สำเร็จ
        setShowHistory(false);
      } else {
        console.error("[Frontend] Restore failed:", response.status);
        alert("ไม่สามารถนำกลับเข้าคิวได้");
      }
    } catch (error) {
      console.error("Error restoring to queue:", error);
      alert("เกิดข้อผิดพลาด: " + error.message);
    }
  };

  // ===== ฟังก์ชัน: คลิกรูปภาพเพื่อดูรายละเอียด =====
  const handleImageClick = (image) => {
    setSelectedImage(image); // เก็บข้อมูลรูปภาพที่เลือก
    setEditWidth(image.width || ""); // โหลดค่าความกว้าง
    setEditHeight(image.height || ""); // โหลดค่าความสูง
    setShowModal(true); // เปิด Modal
    // ถ้าเป็น gift ให้ init editGiftItems
    if (image.type === 'gift' && image.giftOrder && image.giftOrder.items) {
      setEditGiftItems(image.giftOrder.items.map(item => ({ ...item })));
      setIsEditingGift(false);
      setShowAddGiftItem(false);
    }
  };

  // ===== Drag and Drop: จัดการลำดับคิวด้วยการลาก =====
  const [draggedIndex, setDraggedIndex] = useState(null); // Index ของรายการที่กำลังถูกลาก

  // เมื่อเริ่มลากรายการ
  const handleDragStart = (e, index) => {
    setDraggedIndex(index); // บันทึก index ของรายการที่ถูกเลือก
    e.dataTransfer.effectAllowed = 'move';
    e.target.style.opacity = '0.5'; // ทำให้โปร่งใสเพื่อแสดงว่ากำลังถูกลาก
  };

  // เมื่อลากเสร็จ
  const handleDragEnd = (e) => {
    e.target.style.opacity = '1'; // คืนค่าความโปร่งใส

    // บันทึกลำดับสุดท้ายลง localStorage
    const queueOrder = previewQueue.map(item => item._id || item.id);
    localStorage.setItem('queueOrder', JSON.stringify(queueOrder));

    // ส่งลำดับไปยัง Server
    // 🔧 Multi-tenant: ตรวจสอบว่า socket พร้อมใช้งานก่อน emit
    if (socket) {
      socket.emit('admin-reorder-queue', queueOrder);
    }

    setDraggedIndex(null);
  };

  // เมื่อลากไปเหนือรายการอื่น
  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedIndex === null || draggedIndex === index) return; // ถ้าเป็นตำแหน่งเดียวกัน ไม่ต้องสลับ

    // จัดเรียงลำดับใหม่
    const newQueue = [...previewQueue];
    const draggedItem = newQueue[draggedIndex];
    newQueue.splice(draggedIndex, 1); // ลบจากตำแหน่งเดิม
    newQueue.splice(index, 0, draggedItem); // แทรกที่ตำแหน่งใหม่

    setPreviewQueue(newQueue);
    setDraggedIndex(index);
  };

  // เมื่อวางรายการ
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  /* 
   * Queue Persistence & Sync
   * Sync 'approved' items from backend to previewQueue on load/refresh
   */
  useEffect(() => {
    if (loading) return;
    // Stop sync during drag
    if (draggedIndex !== null) return;

    // 1. Get truly approved items from server state
    const approvedItemsFromServer = images.filter(img => img.status === "approved");
    const approvedIds = new Set(approvedItemsFromServer.map(img => img._id || img.id));

    // Get saved queue order from localStorage
    const savedOrderJson = localStorage.getItem('queueOrder');
    const savedOrder = savedOrderJson ? JSON.parse(savedOrderJson) : [];

    setPreviewQueue(prev => {
      // 2. Remove items from local queue that are no longer in the approved list from server
      const cleanedQueue = prev.filter(item => {
        const id = item._id || item.id;
        return approvedIds.has(id);
      });

      // 3. Add new valid items
      const currentIds = new Set(cleanedQueue.map(p => p._id || p.id));
      const currentPlayingId = currentPreview ? (currentPreview._id || currentPreview.id) : null;

      const newItems = approvedItemsFromServer.filter(item => {
        const itemId = item._id || item.id;
        if (currentIds.has(itemId)) return false;
        if (currentPlayingId && currentPlayingId === itemId) return false;
        if (completedIdsRef.current.has(itemId)) return false;
        return true;
      });

      // Merge: cleanedQueue (which preserves user order) + newItems (newly approved)
      let mergedQueue = [...cleanedQueue, ...newItems];

      // ALWAYS sort by saved order if available to recover order after refresh
      if (savedOrder.length > 0) {
        mergedQueue.sort((a, b) => {
          const aId = a._id || a.id;
          const bId = b._id || b.id;
          const aIndex = savedOrder.indexOf(aId);
          const bIndex = savedOrder.indexOf(bId);

          if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
          if (aIndex !== -1) return -1;
          if (bIndex !== -1) return 1;

          return new Date(a.receivedAt || a.createdAt) - new Date(b.receivedAt || b.createdAt);
        });
      } else {
        // Default sort
        mergedQueue.sort((a, b) => new Date(a.receivedAt || a.createdAt) - new Date(b.receivedAt || b.createdAt));
      }

      // Check for changes efficiently
      const prevIds = prev.map(i => i._id || i.id).join(',');
      const newIds = mergedQueue.map(i => i._id || i.id).join(',');

      if (prevIds !== newIds) return mergedQueue;
      return prev;
    });
  }, [images, loading, currentPreview, draggedIndex]);

  const handleApprove = async (id) => {
    try {
      console.log('[Approve] Approving image with ID:', id);

      // 1. Optimistic Update: Immediately mark locally as approved (removes from left list)
      setImages(prev => prev.map(img => {
        if ((img._id === id) || (img.id === id)) {
          return { ...img, status: 'approved', width: editWidth, height: editHeight };
        }
        return img;
      }));
      setShowModal(false);

      // 2. Add to Queue Locally - DISABLED!
      // Server-Driven Architecture: We do NOT force startPreview here anymore.
      // We just approve it, and the server's QueueWorker will pick it up 
      // based on the queue order (custom or FIFO).
      /*
      const imageToApprove = { ...selectedImage, width: editWidth, height: editHeight, status: 'approved' };
      if (!currentPreview && !isActive) {
        startPreview(imageToApprove);
      } else {
        setPreviewQueue(prev => {
          if (prev.find(p => (p._id || p.id) === (imageToApprove._id || imageToApprove.id))) return prev;
          return [...prev, imageToApprove];
        });
      }
      */

      // 3. Send Request
      const response = await adminFetch(`${API_BASE_URL}/api/approve/${id}`, {
        method: "POST",
        body: JSON.stringify({
          width: editWidth,
          height: editHeight
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
        // If fail, should revert? For now assume success or user refreshes.
      }

      // 4. Background Fetch to sync completely
      fetchImages();

    } catch (error) {
      console.error("Error approving image:", error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
      fetchImages(); // Revert state on error
    }
  };

  // ===== ฟังก์ชัน: ปฏิเสธรูปภาพ =====
  const handleReject = async (id) => {
    try {
      console.log('[Reject] Rejecting image with ID:', id);
      const response = await adminFetch(`${API_BASE_URL}/api/reject/${id}`, {
        method: "POST",
      });
      if (response.ok) {
        fetchImages(); // โหลดคิวใหม่
        setShowModal(false); // ปิด Modal
      } else {
        console.error('[Reject] Failed:', await response.text());
        alert('ไม่สามารถปฏิเสธได้');
      }
    } catch (error) {
      console.error("Error rejecting image:", error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  // ===== ฟังก์ชัน Helper: จัดรูปแบบวันที่แบบไทย =====
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // ===== ฟังก์ชัน Helper: แปลงวินาทีเป็นรูปแบบ MM:SS =====
  const formatTime = (seconds) => {
    const s = Math.floor(seconds); // ปัดเศษทศนิยม
    const mins = Math.floor(s / 60); // คำนวณนาที
    const secs = s % 60; // คำนวณวินาทีที่เหลือ
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`; // คืนค่าแบบ MM:SS
  };

  // ===== Effect Hook: กู้คืน State เมื่อกลับมาจากการ Refresh หน้า =====
  useEffect(() => {
    // ดึงข้อมูลจาก localStorage
    const savedPreview = localStorage.getItem("currentPreview");
    const savedIsActive = localStorage.getItem("isActive");
    const startTimestamp = Number(localStorage.getItem("startTimestamp"));
    const duration = Number(localStorage.getItem("duration"));

    // ถ้ามีข้อมูลบันทึกไว้ ให้กู้คืน state
    if (savedPreview && savedIsActive === "true" && startTimestamp && duration) {
      const now = Date.now();
      const elapsed = Math.floor((now - startTimestamp) / 1000);
      const left = duration - elapsed;

      if (left > 0) {
        // ยังคงเหลือเวลา - กู้คืน state
        setCurrentPreview(JSON.parse(savedPreview));
        setTimeLeft(left);
        setIsActive(true);
      } else {
        // หมดเวลาแล้ว - ล้าง state
        setCurrentPreview(null);
        setIsActive(false);
        localStorage.removeItem("currentPreview");
        localStorage.removeItem("startTimestamp");
        localStorage.removeItem("duration");
        localStorage.removeItem("isActive");
      }
    }
  }, []);

  // ===== Effect Hook: บันทึก State ลง localStorage ทุกครั้งที่มีการเปลี่ยนแปลง =====
  useEffect(() => {
    if (currentPreview && isActive) {
      // ถ้ากำลังเล่นรูปภาพ บันทึกลง localStorage
      localStorage.setItem("currentPreview", JSON.stringify(currentPreview));
      localStorage.setItem("timeLeft", timeLeft);
      localStorage.setItem("isActive", isActive);
      localStorage.setItem("isPaused", isPaused);
      localStorage.setItem("pauseTimeLeft", pauseTimeLeft);
    } else {
      // ถ้าไม่มี preview แล้ว ลบข้อมูลออก
      localStorage.removeItem("currentPreview");
      localStorage.removeItem("timeLeft");
      localStorage.removeItem("isActive");
      localStorage.removeItem("isPaused");
      localStorage.removeItem("pauseTimeLeft");
    }
  }, [currentPreview, timeLeft, isActive, isPaused, pauseTimeLeft]);

  // ===== ฟังก์ชัน Render: แสดง Logo Social Media พร้อมชื่อ =====
  function renderSocialOnImage(socialType, socialName, socialColor) {
    // Map ระหว่างประเภท social กับ logo ที่นำเข้า
    const logoMap = {
      ig: igLogo,
      fb: fbLogo,
      line: lineLogo,
      tiktok: tiktokLogo
    };

    const logoSrc = logoMap[socialType];
    if (!logoSrc) return null; // ถ้าไม่มี logo คืนค่า null

    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <img
          src={logoSrc}
          alt={socialType.toUpperCase()}
          style={{ width: "22px", height: "22px", objectFit: "contain" }}
        />
        <span style={{
          fontWeight: "700",
          fontSize: "20px",
          color: socialColor || "#fff",
          textShadow: "0 2px 6px rgba(0,0,0,0.8)"
        }}>{socialName}</span>
      </span>
    );
  }

  // ===== ฟังก์ชัน Render: แสดงการ์ดของขวัญแบบย่อ (สำหรับ Queue Section) =====
  function renderGiftOrder(item) {
    const gift = item.giftOrder || {}; // ข้อมูลคำสั่งของขวัญ
    const senderInfo = item.sender || 'ผู้ส่ง'; // ชื่อผู้ส่ง
    const targetTable = gift.tableNumber || '-'; // หมายเลขโต๊ะปลายทาง

    return (
      <div className="gift-order-card-simple">
        <div className="gift-simple-header">
          <span className="gift-icon">🎁</span>
          <h3>คำสั่งของขวัญ</h3>
        </div>

        <div className="gift-simple-info">
          <div className="gift-info-row">
            <span className="label">👤 ผู้ส่ง:</span>
            <span className="value">{senderInfo}</span>
          </div>
          <div className="gift-info-row">
            <span className="label">📍 โต๊ะ:</span>
            <span className="value highlight">{targetTable}</span>
          </div>
          {gift.note && (
            <div className="gift-info-row message">
              <span className="label">💬 ข้อความ:</span>
              <span className="value message-text">"{gift.note}"</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== ฟังก์ชัน Render: แสดงการ์ดของขวัญแบบเต็ม (สำหรับ Modal และ Preview) =====
  function renderGiftOrderFull(item, isCompact = false) {
    const gift = item.giftOrder || {}; // ข้อมูลคำสั่งของขวัญ
    const senderInfo = item.sender || 'ผู้ส่ง'; // ชื่อผู้ส่ง
    const targetTable = gift.tableNumber || '-'; // หมายเลขโต๊ะปลายทาง
    const avatarUrl = item.avatar || null; // รูปโปรไฟล์ผู้ส่ง

    // Debug: ตรวจสอบข้อมูลสินค้า
    console.log('[Gift Card] Rendering gift:', gift);
    console.log('[Gift Card] Items:', gift.items);

    return (
      <div className={`gift-order-card-new ${isCompact ? 'compact' : ''}`}>
        {/* Header with animation */}
        <div className="gift-header-sparkle">
          <span className="sparkle">✨</span>
          <span className="sparkle">🍻</span>
          <h2 className="gift-title">NEW GIFT INCOMING!</h2>
          <span className="sparkle">🍻</span>
          <span className="sparkle">✨</span>
        </div>

        {/* Sender Info with Avatar */}
        <div className="gift-sender-section">
          <div className="avatar-ring">
            <div className="avatar-circle">
              {avatarUrl ? (
                <img
                  src={getImageUrl(avatarUrl, USER_API_URL)}
                  alt={senderInfo}
                  className="avatar-user-image"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <span
                className="avatar-text"
                style={{ display: avatarUrl ? 'none' : 'flex' }}
              >
                {senderInfo.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
          <h3 className="sender-name">⭐ คุณ {senderInfo} ⭐</h3>
        </div>

        {/* Arrow Down */}
        <div className="gift-arrow">
          <span>⬇️ จัดส่งให้ ⬇️</span>
        </div>

        {/* Target Table */}
        <div className="gift-target-table">
          <div className="table-badge">โต๊ะ {targetTable}</div>
        </div>

        {/* Divider */}
        <div className="gift-divider"></div>

        {/* Gift Items with Images */}
        <div className="gift-items-gallery">
          {(gift.items || []).map((giftItem, idx) => {
            console.log('[Gift Card] Rendering item:', giftItem);
            console.log('[Gift Card] giftSettings count:', giftSettings.length);
            console.log('[Gift Card] All giftSettings:', giftSettings);

            // Try to get image from item first, then lookup in giftSettings
            let itemImage = giftItem.image || giftItem.imageUrl;
            if (!itemImage && giftSettings.length > 0) {
              console.log('[Gift Card] Looking for id:', giftItem.id, 'name:', giftItem.name);
              // 1. ค้นหาด้วย id
              let setting = giftSettings.find(s => s.id === giftItem.id);
              // 2. ถ้าไม่เจอ ลองค้นหาด้วยชื่อ
              if (!setting) {
                setting = giftSettings.find(s => s.name === giftItem.name);
              }
              console.log('[Gift Card] Found setting:', setting);
              if (setting && setting.imageUrl) {
                itemImage = setting.imageUrl;
                console.log('[Gift Card] Found image from settings:', itemImage);
              }
            }

            return (
              <div key={`${item._id || item.id}-${giftItem.id || idx}`} className="gift-item-card">
                {itemImage ? (
                  <img
                    src={getImageUrl(itemImage)}
                    alt={giftItem.name}
                    className="gift-item-image"
                    onError={(e) => {
                      console.error('[Gift Card] Image load failed:', itemImage);
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div className="gift-item-placeholder" style={{ display: itemImage ? 'none' : 'flex' }}>
                  {giftItem.name ? giftItem.name.charAt(0) : '?'}
                </div>
                <span className="gift-item-quantity">x{giftItem.quantity}</span>
                <p className="gift-item-name">{giftItem.name}</p>
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div className="gift-divider"></div>

        {/* Note Message */}
        {gift.note && (
          <div className="gift-note-section">
            <span className="quote-icon">💬</span>
            <p className="gift-note-text">"{gift.note}"</p>
            <span className="quote-icon">💬</span>
          </div>
        )}
      </div>
    );
  }

  // ===== แสดง Loading Spinner ระหว่างโหลดข้อมูล =====
  if (loading) {
    return (
      <div className="queue-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  // ===== Main Component Return: แสดง UI หลักของ Image Queue =====
  return (
    <div className="queue-container">
      {/* CSS Styles สำหรับ Modern Dashboard */}
      <style>{`
        :root {
          --glass-bg: rgba(255, 255, 255, 0.95);
          --glass-border: 1px solid rgba(255, 255, 255, 0.2);
          --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
          --accent-primary: #6366f1;
          --accent-secondary: #8b5cf6;
          --accent-success: #10b981;
          --accent-warning: #f59e0b;
          --accent-pink: #ec4899;
          --text-primary: #1e293b;
          --text-secondary: #64748b;
          --bg-dashboard: #f8fafc;
        }

        .queue-container {
          background-color: var(--bg-dashboard);
          min-height: 100vh;
        }

        /* Header */
        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 32px;
          background: var(--glass-bg);
          backdrop-filter: blur(12px);
          position: sticky;
          top: 0;
          z-index: 100;
          border-bottom: 1px solid rgba(0,0,0,0.05);
          box-shadow: 0 4px 20px rgba(0,0,0,0.03);
        }

        .header-title-group {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .back-nav-btn {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          background: white;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          cursor: pointer;
          text-decoration: none;
        }
        .back-nav-btn:hover {
          background: var(--accent-primary);
          color: white;
          border-color: var(--accent-primary);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
        }

        .header-title {
          font-size: 24px;
          font-weight: 800;
          background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin: 0;
        }

        .header-controls {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .stat-capsule {
          background: white;
          padding: 6px 16px;
          border-radius: 100px;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
          border: 1px solid #e2e8f0;
        }

        .stat-label { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
        .stat-value { font-size: 16px; font-weight: 800; color: var(--accent-primary); }

        .action-btn {
          height: 40px;
          padding: 0 20px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          background: white;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }
        .action-btn:hover {
          background: #f8fafc;
          transform: translateY(-2px);
          color: var(--accent-primary);
          border-color: var(--accent-primary);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
        }

        .icon-btn {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          border: none;
          background: white;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }
        .icon-btn:hover {
          background: #f8fafc;
          transform: translateY(-2px);
          color: var(--accent-primary);
        }

        /* Filter Tabs */
        .filter-bar {
          display: flex;
          gap: 12px;
          padding: 20px 32px;
          overflow-x: auto;
          scrollbar-width: none;
          background: white;
          border-bottom: 1px solid #f1f5f9;
        }
        
        .filter-pill {
          padding: 8px 20px;
          border-radius: 100px;
          border: 1px solid #e2e8f0;
          background: white;
          color: var(--text-secondary);
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .filter-pill:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }

        .filter-pill.active {
          background: var(--accent-primary);
          color: white;
          border-color: var(--accent-primary);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
        }
        .filter-pill[data-type="text"].active { background: #22c55e; border-color: #22c55e; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.2); }
        .filter-pill[data-type="birthday"].active { background: var(--accent-pink); border-color: var(--accent-pink); box-shadow: 0 4px 12px rgba(236, 72, 153, 0.2); }
        .filter-pill[data-type="gift"].active { background: var(--accent-warning); border-color: var(--accent-warning); box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2); }

        .filter-count {
          background: rgba(0,0,0,0.05);
          color: inherit;
          padding: 2px 8px;
          border-radius: 99px;
          font-size: 12px;
        }
        .filter-pill.active .filter-count { background: rgba(255,255,255,0.2); }
      `}</style>

      <header className="dashboard-header">
        <div className="header-title-group">
          <Link to="/home" className="back-nav-btn" title="กลับหน้าหลัก">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 19l-7-7 7-7" /></svg>
          </Link>
          <h1 className="header-title">ตรวจสอบเนื้อหา</h1>
        </div>

        <div className="header-controls">
          <div className="stat-capsule">
            <span className="stat-label">คิวรอตรวจสอบ</span>
            <span className="stat-value">{images.length}</span>
          </div>
          <button onClick={() => { fetchHistory(); setShowHistory(true); }} className="action-btn" title="ประวัติการอนุมัติ">
            <span style={{ fontSize: "16px" }}>📜</span>
            <span>ประวัติ</span>
          </button>
          <button onClick={fetchImages} className="action-btn" title="โหลดข้อมูลใหม่">
            <span style={{ fontSize: "16px" }}>🔄</span>
            <span>รีเฟรช</span>
          </button>
        </div>
      </header>

      <div className="filter-bar">
        {["all", "image", "text", "birthday", "gift"].map(type => (
          <button
            key={type}
            onClick={() => setCategoryFilter(type)}
            className={`filter-pill ${categoryFilter === type ? 'active' : ''}`}
            data-type={type}
          >
            {type === 'all' && '📑 ทั้งหมด'}
            {type === 'image' && '🖼️ รูปภาพ'}
            {type === 'text' && '💬 ข้อความ'}
            {type === 'birthday' && '🎂 วันเกิด'}
            {type === 'gift' && '🎁 ของขวัญ'}
            <span className="filter-count">
              {type === 'all' ? images.length : images.filter(img => (type === 'image' ? (img.type === 'image' || !img.type) : img.type === type)).length}
            </span>
          </button>
        ))}
      </div>

      <main className="main-layout">
        {/* ฝั่งซ้าย - Queue (70%) */}
        <div className="queue-section">
          <div className="queue-content">
            {images.length === 0 ? (
              <div className="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                <p>ไม่มีรูปภาพส่งมา</p>
              </div>
            ) : (
              <div className="images-grid">
                {images
                  .filter(image => image.status === 'pending') // Only show pending items
                  .filter(image => categoryFilter === "all" || image.type === categoryFilter || (categoryFilter === "image" && !image.type))
                  .map((image, index) => {
                    const categoryColor =
                      image.type === "gift" ? "#f59e0b" :
                        image.type === "birthday" ? "#ec4899" :
                          image.type === "text" ? "#22c55e" :
                            "#6366f1";

                    // เช็คว่าเป็นประเภทที่ต้องการแสดงแค่รูปหรือไม่ (Image, Birthday)
                    const isImageOnly = image.type === "image" || image.type === "birthday" || !image.type;

                    return (
                      <div
                        key={image._id || image.id}
                        className="image-card"
                        onClick={() => handleImageClick(image)}
                        style={{ borderTop: `4px solid ${categoryColor}` }}
                      >
                        <div className="card-header" style={{
                          padding: "12px 16px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          borderBottom: "1px solid #f1f5f9",
                          gap: "12px"
                        }}>
                          <span className="queue-number" style={{
                            background: categoryColor,
                            color: "white",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: "700",
                            flexShrink: 0
                          }}>#{index + 1}</span>

                          {/* Avatar + Sender */}
                          <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            flex: 1,
                            minWidth: 0
                          }}>
                            {/* Avatar */}
                            <div style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "50%",
                              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              overflow: "hidden"
                            }}>
                              {image.avatar ? (
                                <img
                                  src={getImageUrl(image.avatar, USER_API_URL)}
                                  alt={image.sender}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover"
                                  }}
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    const initial = document.createElement('span');
                                    initial.textContent = (image.sender || 'U').charAt(0).toUpperCase();
                                    initial.style.fontSize = '14px';
                                    initial.style.fontWeight = '700';
                                    initial.style.color = '#fff';
                                    e.target.parentElement.appendChild(initial);
                                  }}
                                />
                              ) : (
                                <span style={{
                                  fontSize: "14px",
                                  fontWeight: "700",
                                  color: "#fff"
                                }}>
                                  {(image.sender || 'U').charAt(0).toUpperCase()}
                                </span>
                              )}
                            </div>

                            {/* Sender Name */}
                            <span className="sender" style={{
                              fontSize: "14px",
                              fontWeight: "600",
                              color: "#334155",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}>{image.sender}</span>
                          </div>
                        </div>

                        {/* Main Content */}
                        <div className="image-preview-container" style={{
                          position: "relative",
                          background: isImageOnly ? "#e2e8f0" : undefined
                        }}>
                          {image.type === "gift" ? (
                            renderGiftOrder(image)
                          ) : image.filePath ? (
                            <>
                              <img
                                src={getImageUrl(image.filePath)}
                                alt="Preview"
                                className="preview-image"
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "contain",
                                  display: "block"
                                }}
                              />

                              {/* แสดง Overlay เฉพาะถ้าไม่ใช่ Type Image/Birthday */}
                              {!isImageOnly && (!image.composed && image.composed !== "1" && ((image.socialType && image.socialName) || image.text)) && (
                                <div className="preview-overlay-center" style={{
                                  position: "absolute",
                                  bottom: "10px",
                                  left: "0",
                                  right: "0",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  zIndex: 2
                                }}>
                                  {image.socialType && image.socialName && (
                                    <div className="preview-social-overlay" style={{
                                      marginBottom: "4px",
                                      color: "#fff",
                                      padding: "4px 12px",
                                      background: "rgba(0,0,0,0.4)",
                                      borderRadius: "20px",
                                      fontWeight: "600",
                                      fontSize: "14px",
                                      backdropFilter: "blur(4px)",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px"
                                    }}>
                                      {renderSocialOnImage(image.socialType, image.socialName, image.socialColor)}
                                    </div>
                                  )}
                                  {image.text && (
                                    <div className="preview-text-overlay" style={{
                                      color: image.textColor,
                                      background: "rgba(0,0,0,0.6)",
                                      borderRadius: "8px",
                                      padding: "8px 16px",
                                      fontWeight: "500",
                                      fontSize: "16px",
                                      marginTop: "4px",
                                      maxWidth: "90%",
                                      textAlign: "center",
                                      backdropFilter: "blur(2px)"
                                    }}>
                                      {image.text}
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            // กรณีข้อความล้วน (Type Text)
                            <div
                              className="text-only-card"
                              style={{
                                background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "20px"
                              }}
                            >
                              {image.socialType && image.socialName && (
                                <div
                                  style={{
                                    marginBottom: "12px",
                                    color: "#fff",
                                    padding: "6px 16px",
                                    background: "rgba(255,255,255,0.2)",
                                    borderRadius: "20px",
                                    fontWeight: "700",
                                    fontSize: "16px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px"
                                  }}
                                >
                                  {renderSocialOnImage(image.socialType, image.socialName, image.socialColor)}
                                </div>
                              )}
                              <div
                                style={{
                                  color: image.textColor || "#fff",
                                  fontWeight: "600",
                                  fontSize: "20px",
                                  textAlign: "center",
                                  wordBreak: "break-word",
                                  textShadow: "0 2px 4px rgba(0,0,0,0.2)"
                                }}
                              >
                                {image.text}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="card-footer" style={{
                          padding: "12px 16px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          background: "#f8fafc",
                          borderTop: "1px solid #f1f5f9"
                        }}>
                          <div className="time-price" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                            <span className="time" style={{ fontSize: "12px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                              ⏱️ {image.time}s
                            </span>
                            {image.textLayout && image.textLayout !== 'right' && (
                              <span style={{
                                fontSize: "11px",
                                color: "#6366f1",
                                background: "#eef2ff",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontWeight: "600"
                              }}>
                                📐 {image.textLayout === 'left' ? 'ซ้าย' : image.textLayout === 'top' ? 'บน' : image.textLayout === 'bottom' ? 'ล่าง' : image.textLayout === 'center' ? 'กลาง' : image.textLayout}
                              </span>
                            )}
                            {image.socialColor && image.socialColor !== '#ffffff' && image.socialColor !== 'white' && (
                              <span style={{
                                display: "inline-block",
                                width: "14px",
                                height: "14px",
                                background: image.socialColor,
                                borderRadius: "50%",
                                border: "2px solid #e2e8f0",
                                verticalAlign: "middle"
                              }} title={`สี Social: ${image.socialColor}`}></span>
                            )}
                          </div>
                          <div className="price" style={{ fontWeight: "700", color: "#10b981", fontSize: "14px" }}>
                            {image.price === 0 ? 'ฟรี' : `฿${image.price}`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* ฝั่งขวา - Preview (30%) */}
        <div className="preview-section">
          <div className="preview-panel">
            <h2>รูปภาพที่กำลังแสดง</h2>

            {currentPreview ? (
              <>
                <div className="preview-image-container" style={{ position: "relative", minHeight: "400px", maxHeight: "400px" }}>
                  {/* Countdown Overlay for Next Queue */}
                  {isPaused && pauseTimeLeft > 0 && (
                    <div style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: "rgba(0, 0, 0, 0.85)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 20,
                      borderRadius: "12px"
                    }}>
                      <div style={{
                        fontSize: "18px",
                        color: "#a78bfa",
                        fontWeight: "600",
                        marginBottom: "20px",
                        textTransform: "uppercase",
                        letterSpacing: "2px"
                      }}>
                        คิวถัดไป
                      </div>
                      <div style={{
                        fontSize: "120px",
                        fontWeight: "700",
                        color: "white",
                        lineHeight: 1,
                        marginBottom: "16px",
                        textShadow: "0 0 40px rgba(139, 92, 246, 0.6)",
                        animation: pauseTimeLeft <= 5 ? "pulse 1s ease-in-out infinite" : "none"
                      }}>
                        {pauseTimeLeft}
                      </div>
                      <div style={{
                        fontSize: "16px",
                        color: "#d1d5db",
                        fontWeight: "500"
                      }}>
                        เริ่มแสดงในอีก {pauseTimeLeft} วินาที
                      </div>
                      {/* Progress Circle */}
                      <div style={{
                        marginTop: "30px",
                        width: "120px",
                        height: "8px",
                        background: "rgba(255, 255, 255, 0.1)",
                        borderRadius: "4px",
                        overflow: "hidden"
                      }}>
                        <div style={{
                          width: `${((15 - pauseTimeLeft) / 15) * 100}%`,
                          height: "100%",
                          background: "linear-gradient(90deg, #8b5cf6 0%, #6366f1 100%)",
                          transition: "width 1s linear",
                          borderRadius: "4px"
                        }}></div>
                      </div>
                      {/* Next Queue Preview */}
                      {previewQueue[0] && previewQueue[0].filePath && (
                        <div style={{
                          marginTop: "30px",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "12px 20px",
                          background: "rgba(255, 255, 255, 0.05)",
                          borderRadius: "12px",
                          border: "1px solid rgba(255, 255, 255, 0.1)"
                        }}>  <img
                            src={getImageUrl(previewQueue[0]?.filePath)}
                            alt="Next preview"
                            style={{
                              width: "60px",
                              height: "60px",
                              objectFit: "cover",
                              borderRadius: "8px"
                            }}
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                          <div style={{ textAlign: "left" }}>
                            <div style={{ color: "white", fontWeight: "600", fontSize: "14px" }}>
                              {previewQueue[0].sender}
                            </div>
                            <div style={{ color: "#9ca3af", fontSize: "12px", marginTop: "2px" }}>
                              {previewQueue[0].time} วินาที · {previewQueue[0].price === 0 ? 'ฟรี' : `฿${previewQueue[0].price}`}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {currentPreview.type === "gift" ? (
                    renderGiftOrderFull(currentPreview, true)
                  ) : currentPreview.filePath ? (
                    <img
                      src={getImageUrl(currentPreview.filePath)}
                      alt="Preview"
                      className="preview-image"
                      style={{ width: "100%", height: "400px", objectFit: "contain" }}
                      onError={(e) => {
                        e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1zbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y5ZmFmYiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE0cHgiIGZpbGw9IiM5Y2EzYWYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5No Image</text></svg>';
                      }}
                    />
                  ) : (
                    // กรณีไม่มีรูป (ฟังก์ชันส่งข้อความ)
                    <div
                      style={{
                        background: "linear-gradient(135deg,#233046 60%,#1e293b 100%)",
                        borderRadius: "18px",
                        minHeight: "120px",
                        minWidth: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                        padding: "24px 0"
                      }}
                    >
                      {currentPreview.socialType && currentPreview.socialName && (
                        <div
                          style={{
                            marginBottom: "16px",
                            marginTop: "8px",
                            color: "#fff",
                            padding: "6px 18px",
                            borderRadius: "8px",
                            fontWeight: "700",
                            fontSize: "20px",
                            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                            maxWidth: "100%",
                            wordBreak: "break-all",
                            display: "inline-flex",
                            alignItems: "center"
                          }}
                        >
                          {renderSocialOnImage(currentPreview.socialType, currentPreview.socialName, currentPreview.socialColor)}
                        </div>
                      )}
                      <div
                        style={{
                          color: currentPreview.textColor || "#fff",
                          borderRadius: "8px",
                          padding: "6px 16px",
                          fontWeight: "400",
                          fontSize: "18px",
                          textShadow: currentPreview.textColor === "white"
                            ? "0 2px 8px rgba(0,0,0,0.8)"
                            : "0 2px 8px rgba(255,255,255,0.8)",
                          textAlign: "center",
                          wordBreak: "break-all"
                        }}
                      >
                        {currentPreview.text}
                      </div>
                    </div>
                  )}
                </div>

                <div className="countdown-section">
                  <div className="countdown-label">
                    {isPaused ? "หน่วงเวลาระหว่างรูป:" : "เวลาที่เหลือ:"}
                  </div>
                  <div className={`countdown-timer ${(timeLeft <= 10 && !isPaused) || (pauseTimeLeft <= 5 && isPaused) ? 'warning' : ''}`}>
                    {isPaused ? formatTime(pauseTimeLeft) : formatTime(timeLeft)}
                  </div>
                  {timeLeft === 0 && !isPaused && (
                    <div className="time-up-message">หมดเวลาแล้ว!</div>
                  )}
                  {isPaused && pauseTimeLeft > 0 && (
                    <div className="pause-message">กำลังเปลี่ยนรูป...</div>
                  )}
                  <button
                    onClick={handleSkipCurrent}
                    className="refresh-button"
                    style={{ marginTop: "8px", width: "100%", padding: "10px", background: "#ef4444", color: "white" }}
                    disabled={!currentPreview}
                  >
                    ยกเลิกการแสดง / ข้ามคิวนี้
                  </button>
                </div>

                <div className="info-section">
                  <div className="info-row">
                    <span className="info-label">คิว:</span>
                    <span className="info-value">กำลังแสดง</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">เวลาการแสดง:</span>
                    <span className="info-value">{currentPreview.time} วินาที</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">แอปโมชั่น:</span>
                    <span className="info-value">ไม่มี</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">ข้อความ:</span>
                    <span className="info-value">{currentPreview.text || 'ไม่มี'}</span>
                  </div>
                </div>

                {!isPaused && (
                  <div className="progress-section">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${progressRatio * 100}%`
                        }}
                      ></div>
                    </div>
                    <div className="progress-text">
                      {Math.round(progressRatio * 100)}% เสร็จสิ้น
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="no-preview" style={isPaused && pauseTimeLeft > 0 ? { minHeight: '450px', background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.05)' } : {}}>
                {isPaused && pauseTimeLeft > 0 ? (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '40px 0',
                    width: '100%'
                  }}>
                    <div style={{
                      fontSize: '20px',
                      color: '#6366f1',
                      fontWeight: '700',
                      marginBottom: '20px',
                      textTransform: 'uppercase',
                      letterSpacing: '1px'
                    }}>
                      รอคิวถัดไป
                    </div>
                    <div style={{
                      fontSize: '100px',
                      fontWeight: '800',
                      color: '#6366f1',
                      lineHeight: 1,
                      marginBottom: '10px',
                      fontVariantNumeric: 'tabular-nums',
                      animation: pauseTimeLeft <= 5 ? 'pulse 1s ease-in-out infinite' : 'none'
                    }}>
                      {pauseTimeLeft}
                    </div>
                    <div style={{
                      fontSize: '16px',
                      color: '#64748b',
                      fontWeight: '500',
                      marginBottom: '30px'
                    }}>
                      วินาที
                    </div>
                    {previewQueue[0] && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '15px',
                        padding: '15px 25px',
                        background: 'white',
                        borderRadius: '16px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                        border: '1px solid #f1f5f9'
                      }}>  <img
                          src={getImageUrl(previewQueue[0].filePath)}
                          alt="Next"
                          style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '10px',
                            objectFit: 'cover'
                          }}
                        />
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>กำลังจะแสดง:</div>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b' }}>
                            {previewQueue[0].sender || 'ไม่ระบุชื่อ'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                    <p>ยังไม่มีรูปภาพที่อนุมัติ</p>
                    <span>กดอนุมัติรูปภาพเพื่อแสดง Preview</span>
                  </>
                )}
              </div>
            )}

            {/* แสดงคิวที่รออยู่ */}
            {previewQueue.length > 0 && (
              <div className="waiting-queue">
                <h3>คิวที่รออยู่ ({previewQueue.length})</h3>
                <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', marginBottom: '12px' }}>
                  💡 ลากเพื่อจัดเรียงลำดับคิว
                </p>
                <div className="queue-list">
                  {previewQueue.map((queueImage, index) => (
                    <div
                      key={queueImage._id || queueImage.id}
                      className="queue-item"
                      draggable="true"
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={handleDrop}
                      style={{
                        cursor: 'grab',
                        transition: 'all 0.2s ease',
                        opacity: draggedIndex === index ? 0.5 : 1
                      }}
                    >
                      <div className="queue-item-number">#{index + 1}</div>
                      <div className="queue-item-image">
                        <img
                          src={getImageUrl(queueImage.filePath)}
                          alt="Queue preview"
                          onError={(e) => {
                            e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjZjlmYWZiIi8+PC9zdmc+';
                          }}
                        />
                      </div>
                      <div className="queue-item-info">
                        <div className="queue-item-time">{queueImage.time}วินาที</div>
                        <div className="queue-item-text">
                          {queueImage.text ? queueImage.text.slice(0, 15) + '...' : 'ไม่มีข้อความ'}
                        </div>
                      </div>
                      <div className="drag-handle" style={{
                        fontSize: '18px',
                        color: '#94a3b8',
                        marginLeft: 'auto',
                        cursor: 'grab'
                      }}>
                        ⋮⋮
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal สำหรับดูรายละเอียด */}
      {showModal && selectedImage && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>รายละเอียด{selectedImage.filePath ? "รูปภาพ" : "ข้อความ"}</h2>
              <button className="close-button" onClick={() => setShowModal(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-image-container">
                {selectedImage.type === 'gift' ? (
                  renderGiftOrderFull(selectedImage, false)
                ) : selectedImage.filePath ? (
                  /* แสดง Preview แบบเดียวกับ Upload User */
                  <div style={{
                    display: "flex",
                    flexDirection: selectedImage.textLayout === 'left' ? 'row-reverse' : selectedImage.textLayout === 'top' ? 'column-reverse' : selectedImage.textLayout === 'bottom' ? 'column' : 'row',
                    gap: "20px",
                    alignItems: selectedImage.textLayout === 'top' || selectedImage.textLayout === 'bottom' ? 'center' : 'stretch',
                    background: "#929292",
                    padding: "20px",
                    borderRadius: "12px",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
                    maxWidth: "100%",
                    overflow: "hidden"
                  }}>
                    {/* รูปภาพด้านซ้าย */}
                    <div style={{
                      width: "300px",
                      height: "375px",
                      flexShrink: 0,
                      background: "#929292",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden"
                    }}>
                      <img
                        src={getImageUrl(selectedImage.filePath)}
                        alt="Full preview"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          display: "block"
                        }}
                      />
                    </div>

                    {/* Sidebar ด้านขวา - Social + Text + QR Code */}
                    <div style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      minWidth: "200px",
                      maxWidth: "250px",
                      padding: "15px 10px"
                    }}>
                      {/* Social + Text + QR Code ทั้งหมดอยู่ตรงกลาง */}
                      <div style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "16px",
                        width: "100%"
                      }}>
                        {/* Social */}
                        {selectedImage.socialType && selectedImage.socialName && (
                          <div style={{
                            color: "#fff",
                            fontWeight: "700",
                            fontSize: "18px",
                            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            textAlign: "center",
                            wordBreak: "break-word"
                          }}>
                            {renderSocialOnImage(selectedImage.socialType, selectedImage.socialName, selectedImage.socialColor)}
                          </div>
                        )}

                        {/* Text */}
                        {selectedImage.text && (
                          <div style={{
                            color: selectedImage.textColor || "#fff",
                            fontWeight: "400",
                            fontSize: "16px",
                            textShadow: selectedImage.textColor === "white"
                              ? "0 2px 8px rgba(0,0,0,0.8)"
                              : "0 2px 8px rgba(255,255,255,0.8)",
                            textAlign: "center",
                            wordBreak: "break-word",
                            whiteSpace: "pre-wrap",
                            width: "100%"
                          }}>
                            {selectedImage.text}
                          </div>
                        )}

                        {/* QR Code */}
                        {selectedImage.qrCodePath && (
                          <div style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "8px"
                          }}>
                            <span style={{
                              color: "#fff",
                              fontSize: "14px",
                              fontWeight: "600",
                              textShadow: "0 2px 4px rgba(0,0,0,0.6)"
                            }}>
                              สแกนเลย!
                            </span>
                            <img
                              src={getImageUrl(selectedImage.qrCodePath)}
                              alt="QR Code"
                              style={{
                                width: "120px",
                                height: "120px",
                                objectFit: "contain",
                                background: "white",
                                padding: "8px",
                                borderRadius: "8px",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      background: "linear-gradient(135deg,#233046 60%,#1e293b 100%)",
                      borderRadius: "18px",
                      minHeight: "80px",
                      minWidth: "100%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      padding: "24px 0"
                    }}
                  >
                    {selectedImage.socialType && selectedImage.socialName && (
                      <div
                        style={{
                          marginBottom: "16px",
                          marginTop: "8px",
                          color: "#fff",
                          padding: "6px 18px",
                          borderRadius: "8px",
                          fontWeight: "700",
                          fontSize: "20px",
                          textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                          maxWidth: "100%",
                          wordBreak: "break-all",
                          display: "inline-flex",
                          alignItems: "center"
                        }}
                      >
                        {renderSocialOnImage(selectedImage.socialType, selectedImage.socialName, selectedImage.socialColor)}
                      </div>
                    )}
                    <div
                      style={{
                        color: selectedImage.textColor || "#fff",
                        borderRadius: "8px",
                        padding: "6px 16px",
                        fontWeight: "400",
                        fontSize: "18px",
                        textShadow: selectedImage.textColor === "white"
                          ? "0 2px 8px rgba(0,0,0,0.8)"
                          : "0 2px 8px rgba(255,255,255,0.8)",
                        textAlign: "center",
                        wordBreak: "break-all"
                      }}
                    >
                      {selectedImage.text}
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-details">
                {selectedImage.type !== 'gift' && (
                  <>
                    <div className="detail-row">
                      <span className="label">ผู้ส่ง:</span>
                      <span className="value">{selectedImage.sender}</span>
                    </div>

                    {/* ประเภท */}
                    <div className="detail-row">
                      <span className="label">ประเภท:</span>
                      <span className="value" style={{
                        background: selectedImage.type === 'birthday' ? '#ec4899' :
                          selectedImage.type === 'gift' ? '#f59e0b' :
                            selectedImage.type === 'text' ? '#22c55e' : '#6366f1',
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '13px',
                        fontWeight: '600'
                      }}>
                        {selectedImage.type === 'birthday' ? '🎂 วันเกิด' :
                          selectedImage.type === 'gift' ? '🎁 ของขวัญ' :
                            selectedImage.type === 'text' ? '💬 ข้อความ' : '🖼️ รูปภาพ'}
                      </span>
                    </div>

                    {/* Social Info */}
                    {selectedImage.socialType && selectedImage.socialName && (
                      <div className="detail-row">
                        <span className="label">Social Media:</span>
                        <span className="value">
                          {selectedImage.socialType.toUpperCase()} - {selectedImage.socialName}
                        </span>
                      </div>
                    )}

                    {/* Text Content */}
                    {selectedImage.text && (
                      <div className="detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                        <span className="label">ข้อความ:</span>
                        <span className="value" style={{
                          marginTop: '6px',
                          padding: '8px 12px',
                          background: '#f8fafc',
                          borderRadius: '8px',
                          width: '100%',
                          wordBreak: 'break-word',
                          fontSize: '14px'
                        }}>
                          {selectedImage.text}
                        </span>
                      </div>
                    )}

                    {/* Text Color */}
                    {selectedImage.textColor && (
                      <div className="detail-row">
                        <span className="label">สีข้อความ:</span>
                        <span className="value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            display: 'inline-block',
                            width: '24px',
                            height: '24px',
                            background: selectedImage.textColor,
                            border: '2px solid #e2e8f0',
                            borderRadius: '6px'
                          }}></span>
                          {selectedImage.textColor}
                        </span>
                      </div>
                    )}

                    {/* Social Color */}
                    {selectedImage.socialColor && selectedImage.socialColor !== '#ffffff' && selectedImage.socialColor !== 'white' && (
                      <div className="detail-row">
                        <span className="label">สี Social:</span>
                        <span className="value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            display: 'inline-block',
                            width: '24px',
                            height: '24px',
                            background: selectedImage.socialColor,
                            border: '2px solid #e2e8f0',
                            borderRadius: '6px'
                          }}></span>
                          {selectedImage.socialColor}
                        </span>
                      </div>
                    )}

                    {/* Text Layout */}
                    {selectedImage.textLayout && (
                      <div className="detail-row">
                        <span className="label">Layout:</span>
                        <span className="value" style={{
                          background: '#eef2ff',
                          color: '#6366f1',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '13px',
                          fontWeight: '600'
                        }}>
                          📐 {selectedImage.textLayout === 'left' ? 'ซ้าย' : selectedImage.textLayout === 'right' ? 'ขวา' : selectedImage.textLayout === 'top' ? 'บน' : selectedImage.textLayout === 'bottom' ? 'ล่าง' : selectedImage.textLayout === 'center' ? 'กลาง' : selectedImage.textLayout}
                        </span>
                      </div>
                    )}

                    {/* QR Code Preview - ซ่อนเพราะแสดงใน preview แล้ว */}
                  </>
                )}

                {/* รายการสินค้าสำหรับ Gift */}
                {selectedImage.type === 'gift' && selectedImage.giftOrder && selectedImage.giftOrder.items && (
                  <div className="detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start', borderBottom: '1px solid #eee', paddingBottom: '12px', marginBottom: '12px' }}>
                    {/* เบอร์โทรผู้ส่ง */}
                    {selectedImage.giftOrder.senderPhone && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        marginBottom: '12px', padding: '10px 14px',
                        background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                        borderRadius: '12px', border: '1px solid #f59e0b', width: '100%', boxSizing: 'border-box'
                      }}>
                        <span style={{ fontSize: '18px' }}>📞</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '11px', color: '#92400e', fontWeight: '600' }}>เบอร์โทรผู้ส่ง</div>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: '#78350f' }}>{selectedImage.giftOrder.senderPhone}</div>
                        </div>
                        <a href={`tel:${selectedImage.giftOrder.senderPhone}`}
                          style={{
                            padding: '6px 14px', background: '#16a34a', color: '#fff',
                            borderRadius: '8px', fontSize: '13px', fontWeight: '600',
                            textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px'
                          }}>
                          📞 โทร
                        </a>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '8px' }}>
                      <span className="label">📦 รายการสินค้าทั้งหมด:</span>
                      {!isEditingGift ? (
                        <button onClick={() => setIsEditingGift(true)}
                          style={{
                            padding: '4px 12px', background: '#f59e0b', color: '#fff',
                            border: 'none', borderRadius: '8px', fontSize: '12px',
                            fontWeight: '600', cursor: 'pointer'
                          }}>
                          ✏️ แก้ไขรายการ
                        </button>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => { setIsEditingGift(false); setEditGiftItems(selectedImage.giftOrder.items.map(i => ({ ...i }))); setShowAddGiftItem(false); }}
                            style={{ padding: '4px 10px', background: '#94a3b8', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                            ยกเลิก
                          </button>
                          <button onClick={async () => {
                            setSavingGiftItems(true);
                            try {
                              const itemId = selectedImage._id || selectedImage.id;
                              const response = await adminFetch(`${API_BASE_URL}/api/queue/${itemId}/gift-items`, {
                                method: 'PUT',
                                body: JSON.stringify({ items: editGiftItems })
                              });
                              if (response.ok) {
                                const data = await response.json();
                                setSelectedImage(data.queueItem);
                                setEditGiftItems(data.queueItem.giftOrder.items.map(i => ({ ...i })));
                                setIsEditingGift(false);
                                setShowAddGiftItem(false);
                                fetchImages();
                              } else {
                                alert('บันทึกไม่สำเร็จ');
                              }
                            } catch (err) {
                              console.error('Error saving gift items:', err);
                              alert('เกิดข้อผิดพลาด');
                            } finally {
                              setSavingGiftItems(false);
                            }
                          }} disabled={savingGiftItems || editGiftItems.length === 0}
                            style={{ padding: '4px 10px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', opacity: savingGiftItems || editGiftItems.length === 0 ? 0.5 : 1 }}>
                            {savingGiftItems ? 'กำลังบันทึก...' : '✅ บันทึก'}
                          </button>
                        </div>
                      )}
                    </div>

                    <div style={{ width: '100%', background: '#f8fafc', borderRadius: '8px', padding: '12px' }}>
                      {(isEditingGift ? editGiftItems : selectedImage.giftOrder.items).map((giftItem, idx) => (
                        <div key={idx} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '8px 0',
                          borderBottom: idx < (isEditingGift ? editGiftItems : selectedImage.giftOrder.items).length - 1 ? '1px solid #e5e7eb' : 'none'
                        }}>
                          <span style={{ fontSize: '14px', color: '#334155', fontWeight: '500', flex: 1 }}>
                            {giftItem.name}
                          </span>
                          <span style={{ fontSize: '14px', color: '#64748b', marginRight: isEditingGift ? '10px' : '0' }}>
                            x{giftItem.quantity} · {giftItem.price === 0 ? 'ฟรี' : `฿${giftItem.price}`}
                          </span>
                          {isEditingGift && (
                            <button onClick={() => setEditGiftItems(prev => prev.filter((_, i) => i !== idx))}
                              style={{
                                width: '28px', height: '28px', background: '#ef4444', color: '#fff',
                                border: 'none', borderRadius: '8px', cursor: 'pointer',
                                fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                              }}>
                              ✖
                            </button>
                          )}
                        </div>
                      ))}

                      {/* รวมราคา */}
                      <div style={{
                        marginTop: '12px', paddingTop: '12px', borderTop: '2px solid #e5e7eb',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}>
                        <span style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>รวมทั้งหมด</span>
                        <span style={{ fontSize: '16px', fontWeight: '700', color: '#8b5cf6' }}>
                          {isEditingGift
                            ? (editGiftItems.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0) === 0 ? 'ฟรี' : `฿${editGiftItems.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0)}`)
                            : (selectedImage.price === 0 ? 'ฟรี' : `฿${selectedImage.price}`)}
                        </span>
                      </div>

                      {/* ปุ่มเพิ่มสินค้า */}
                      {isEditingGift && (
                        <div style={{ marginTop: '12px' }}>
                          {!showAddGiftItem ? (
                            <button onClick={() => setShowAddGiftItem(true)}
                              style={{
                                width: '100%', padding: '8px', background: '#eef2ff', color: '#6366f1',
                                border: '2px dashed #a5b4fc', borderRadius: '8px', cursor: 'pointer',
                                fontSize: '13px', fontWeight: '600'
                              }}>
                              ➕ เพิ่มสินค้าจากรายการ
                            </button>
                          ) : (
                            <div style={{
                              background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px',
                              padding: '10px', maxHeight: '200px', overflowY: 'auto'
                            }}>
                              <div style={{ fontSize: '12px', color: '#166534', fontWeight: '600', marginBottom: '8px' }}>
                                เลือกสินค้าที่ต้องการเพิ่ม:
                              </div>
                              {giftSettings.filter(gs => !editGiftItems.some(eg => eg.id === gs.id)).map(gs => (
                                <button key={gs.id}
                                  onClick={() => {
                                    setEditGiftItems(prev => [...prev, {
                                      id: gs.id, name: gs.name, price: Number(gs.price) || 0,
                                      quantity: 1, image: gs.imageUrl || gs.image || ''
                                    }]);
                                    setShowAddGiftItem(false);
                                  }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    width: '100%', padding: '8px', background: '#fff',
                                    border: '1px solid #d1fae5', borderRadius: '8px',
                                    cursor: 'pointer', marginBottom: '4px', textAlign: 'left'
                                  }}>
                                  {gs.imageUrl && (
                                    <img src={getImageUrl(gs.imageUrl)} alt={gs.name}
                                      style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'contain', background: '#f1f5f9' }} />
                                  )}
                                  <span style={{ flex: 1, fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{gs.name}</span>
                                  <span style={{ fontSize: '12px', color: '#64748b' }}>฿{gs.price}</span>
                                </button>
                              ))}
                              <button onClick={() => setShowAddGiftItem(false)}
                                style={{
                                  width: '100%', padding: '6px', background: '#f1f5f9', color: '#64748b',
                                  border: 'none', borderRadius: '8px', cursor: 'pointer',
                                  fontSize: '12px', fontWeight: '600', marginTop: '4px'
                                }}>
                                ปิด
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ข้อมูลพื้นฐานที่แสดงทุกประเภท */}
                <div className="detail-row">
                  <span className="label">เวลาที่เลือก:</span>
                  <span className="value">{selectedImage.time} วินาที</span>
                </div>
                <div className="detail-row">
                  <span className="label">ราคา:</span>
                  <span className="value">{selectedImage.price === 0 ? 'ฟรี' : `฿${selectedImage.price}`}</span>
                </div>
                <div className="detail-row">
                  <span className="label">ส่งเมื่อ:</span>
                  <span className="value">{formatDate(selectedImage.createdAt)}</span>
                </div>

                <div className="detail-row" style={{ marginTop: "12px", borderTop: "1px solid #eee", paddingTop: "12px" }}>
                  <span className="label" style={{ width: "100%" }}>ปรับขนาดแสดงผล (OBS):</span>
                  <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: "12px", color: "#666" }}>กว้าง (px)</label>
                      <input
                        type="number"
                        placeholder="Auto"
                        value={editWidth}
                        onChange={(e) => setEditWidth(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px",
                          borderRadius: "6px",
                          border: "1px solid #ddd"
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: "12px", color: "#666" }}>สูง (px)</label>
                      <input
                        type="number"
                        placeholder="Auto"
                        value={editHeight}
                        onChange={(e) => setEditHeight(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px",
                          borderRadius: "6px",
                          border: "1px solid #ddd"
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="approve-button"
                onClick={() => handleApprove(selectedImage._id || selectedImage.id)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                อนุมัติ
              </button>
              <button
                className="reject-button"
                onClick={() => handleReject(selectedImage._id || selectedImage.id)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                ปฏิเสธ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal - Redesigned */}
      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: "1200px", maxHeight: "90vh" }}>
            <div className="modal-header" style={{
              background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
              color: "white",
              padding: "20px 24px",
              borderRadius: "12px 12px 0 0"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <div>
                  <h2 style={{ margin: 0, fontSize: "24px", fontWeight: "700" }}>ประวัติคิว</h2>
                  <p style={{ margin: "4px 0 0 0", fontSize: "14px", opacity: 0.9 }}>
                    รายการทั้งหมด {historyItems.length} รายการ
                  </p>
                </div>
              </div>
              <button className="close-button" onClick={() => setShowHistory(false)} style={{
                background: "rgba(255,255,255,0.2)",
                border: "none",
                color: "white",
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all 0.3s ease"
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body" style={{
              padding: "24px",
              maxHeight: "calc(90vh - 100px)",
              overflowY: "auto"
            }}>
              {historyItems.length === 0 ? (
                <div style={{
                  textAlign: "center",
                  padding: "60px 20px",
                  color: "#94a3b8"
                }}>
                  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ margin: "0 auto 16px" }}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p style={{ fontSize: "18px", fontWeight: "600", marginBottom: "8px" }}>ยังไม่มีประวัติ</p>
                  <p style={{ fontSize: "14px" }}>เมื่อมีการอนุมัติหรือปฏิเสธรูปภาพจะแสดงที่นี่</p>
                </div>
              ) : (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                  gap: "20px"
                }}>
                  {historyItems.map((item) => {
                    const isApproved = item.status === "approved" || item.status === "completed";
                    const statusColor = isApproved ? "#10b981" : "#ef4444";
                    const statusBg = isApproved ? "#d1fae5" : "#fee2e2";
                    const statusIcon = isApproved ? "✓" : "✗";
                    const statusText = item.status === "completed" ? "เล่นจบ" : (isApproved ? "อนุมัติ" : "ปฏิเสธ");

                    return (
                      <div
                        key={item._id}
                        style={{
                          background: "white",
                          borderRadius: "16px",
                          overflow: "hidden",
                          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)",
                          transition: "all 0.3s ease",
                          border: "1px solid #e5e7eb",
                          position: "relative"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "translateY(-4px)";
                          e.currentTarget.style.boxShadow = "0 12px 24px -4px rgba(0,0,0,0.15)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)";
                        }}
                      >
                        {/* Status Badge */}
                        <div style={{
                          position: "absolute",
                          top: "12px",
                          right: "12px",
                          background: statusBg,
                          color: statusColor,
                          padding: "6px 12px",
                          borderRadius: "20px",
                          fontSize: "13px",
                          fontWeight: "700",
                          zIndex: 10,
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
                        }}>
                          <span style={{ fontSize: "14px" }}>{statusIcon}</span>
                          {statusText}
                        </div>

                        {/* Image Section */}
                        <div style={{
                          width: "100%",
                          height: "220px",
                          background: "linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden"
                        }}>
                          {item.type === 'gift' ? (
                            // แสดงรูปของขวัญชิ้นแรก หรือไอคอน Gift
                            (() => {
                              const firstGiftItem = item.metadata?.giftItems?.[0];
                              let giftImage = null;

                              if (firstGiftItem) {
                                // ลองหารูปจาก giftSettings
                                giftImage = firstGiftItem.image;
                                if (!giftImage && giftSettings.length > 0) {
                                  const setting = giftSettings.find(s => s.id === firstGiftItem.id);
                                  if (setting && setting.imageUrl) {
                                    giftImage = setting.imageUrl;
                                  }
                                }
                              }

                              return giftImage ? (
                                <img
                                  src={getImageUrl(giftImage)}
                                  alt="Gift preview"
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover"
                                  }}
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.parentElement.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:12px;color:#f59e0b"><div style="font-size:64px">🎁</div><span style="font-size:14px;font-weight:600">ของขวัญ</span></div>';
                                  }}
                                />
                              ) : (
                                <div style={{ textAlign: "center", color: "#f59e0b" }}>
                                  <div style={{ fontSize: "64px", marginBottom: "8px" }}>🎁</div>
                                  <p style={{ fontSize: "14px", fontWeight: "600", margin: 0 }}>ของขวัญ</p>
                                </div>
                              );
                            })()
                          ) : (item.filePath || item.mediaUrl) ? (
                            <img
                              src={getImageUrl(item.filePath || item.mediaUrl)}
                              alt="History preview"
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover"
                              }}
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.parentElement.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;color:#94a3b8"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><span style="font-size:13px">ไม่มีรูปภาพ</span></div>';
                              }}
                            />
                          ) : (
                            <div style={{ textAlign: "center", color: "#94a3b8" }}>
                              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ margin: "0 auto 8px" }}>
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                              </svg>
                              <p style={{ fontSize: "13px", margin: 0 }}>ข้อความอย่างเดียว</p>
                            </div>
                          )}
                        </div>

                        {/* Content Section */}
                        <div style={{ padding: "16px" }}>
                          {/* Sender & Date */}
                          <div style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "start",
                            marginBottom: "12px"
                          }}>
                            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "12px" }}>
                              {/* Avatar */}
                              <div style={{
                                width: "48px",
                                height: "48px",
                                borderRadius: "50%",
                                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                overflow: "hidden"
                              }}>
                                {item.avatar ? (
                                  <img
                                    src={getImageUrl(item.avatar, USER_API_URL)}
                                    alt={item.sender}
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover"
                                    }}
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                      const initial = document.createElement('span');
                                      initial.textContent = (item.sender || 'U').charAt(0).toUpperCase();
                                      initial.style.fontSize = '20px';
                                      initial.style.fontWeight = '700';
                                      initial.style.color = '#fff';
                                      e.target.parentElement.appendChild(initial);
                                    }}
                                  />
                                ) : (
                                  <span style={{
                                    fontSize: "20px",
                                    fontWeight: "700",
                                    color: "#fff"
                                  }}>
                                    {(item.sender || 'U').charAt(0).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              {/* Name and Date */}
                              <div>
                                <div style={{
                                  fontSize: "16px",
                                  fontWeight: "700",
                                  color: "#1e293b",
                                  marginBottom: "4px"
                                }}>
                                  {item.sender}
                                </div>
                                <div style={{
                                  fontSize: "12px",
                                  color: "#64748b",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px"
                                }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <polyline points="12 6 12 12 16 14" />
                                  </svg>
                                  {formatDate(item.checkedAt || item.approvalDate)}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Details Grid */}
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "12px",
                            marginBottom: "12px",
                            padding: "12px",
                            background: "#f8fafc",
                            borderRadius: "8px"
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "8px",
                                background: "#ddd6fe",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center"
                              }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10" />
                                  <polyline points="12 6 12 12 16 14" />
                                </svg>
                              </div>
                              <div>
                                <div style={{ fontSize: "11px", color: "#64748b" }}>เวลา</div>
                                <div style={{ fontSize: "14px", fontWeight: "700", color: "#1e293b" }}>
                                  {item.duration ?? item.metadata?.duration ?? "N/A"} วินาที
                                </div>
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "8px",
                                background: "#fef3c7",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center"
                              }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                                  <line x1="12" y1="1" x2="12" y2="23" />
                                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                                </svg>
                              </div>
                              <div>
                                <div style={{ fontSize: "11px", color: "#64748b" }}>ราคา</div>
                                <div style={{ fontSize: "14px", fontWeight: "700", color: "#1e293b" }}>
                                  {item.price === 0 ? 'ฟรี' : `฿${item.price}`}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Content Text */}
                          {item.content && (
                            <div style={{
                              padding: "10px 12px",
                              background: "#f1f5f9",
                              borderRadius: "8px",
                              marginBottom: "12px",
                              borderLeft: "3px solid #8b5cf6"
                            }}>
                              <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "4px" }}>
                                ข้อความ
                              </div>
                              <div style={{ fontSize: "13px", color: "#334155", lineHeight: "1.5" }}>
                                {item.content}
                              </div>
                            </div>
                          )}

                          {/* Social Badge */}
                          {item.metadata?.social?.type && item.metadata?.social?.name && (
                            <div style={{
                              padding: "10px 12px",
                              background: "#f0f9ff",
                              borderRadius: "8px",
                              marginBottom: "12px",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              borderLeft: "3px solid #0ea5e9"
                            }}>
                              <div style={{ fontSize: "11px", color: "#0369a1", fontWeight: "600" }}>
                                Social:
                              </div>
                              <div style={{ transform: "scale(0.85)", transformOrigin: "left" }}>
                                {renderSocialOnImage(item.metadata.social.type, item.metadata.social.name)}
                              </div>
                            </div>
                          )}

                          {/* Restore Button */}
                          <button
                            onClick={() => handleRestoreToQueue(item.id || item._id)}
                            style={{
                              width: "100%",
                              padding: "12px",
                              background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
                              color: "white",
                              border: "none",
                              borderRadius: "10px",
                              fontSize: "14px",
                              fontWeight: "700",
                              cursor: "pointer",
                              transition: "all 0.3s ease",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "8px"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = "scale(1.02)";
                              e.currentTarget.style.boxShadow = "0 8px 16px -4px rgba(139,92,246,0.4)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "scale(1)";
                              e.currentTarget.style.boxShadow = "none";
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="23 4 23 10 17 10" />
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                            </svg>
                            กลับเข้าคิว
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ImageQueue;
