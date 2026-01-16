import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "./ImageQueue.css";
import igLogo from "./data-icon/ig-logo.png";
import fbLogo from "./data-icon/facebook-logo.png";
import lineLogo from "./data-icon/line-logo.png";
import tiktokLogo from "./data-icon/x-logo.png";

function ImageQueue() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [giftSettings, setGiftSettings] = useState([]);

  // Edit Size State
  const [editWidth, setEditWidth] = useState("");
  const [editHeight, setEditHeight] = useState("");

  // สำหรับ Preview และ Queue System
  const [currentPreview, setCurrentPreview] = useState(null);
  const [previewQueue, setPreviewQueue] = useState([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseTimeLeft, setPauseTimeLeft] = useState(0);
  const [displayPaused, setDisplayPaused] = useState(false);
  const [savedTimeLeft, setSavedTimeLeft] = useState(0);

  const totalDuration = currentPreview ? Math.max(currentPreview.time || 0, 1) : 1;
  const progressRatio = Math.max(0, Math.min(1, (totalDuration - timeLeft) / totalDuration));

  useEffect(() => {
    fetchImages();
    fetchGiftSettings();
    const interval = setInterval(fetchImages, 5000);
    return () => clearInterval(interval);
  }, []);

  // เมื่อเริ่มแสดงรูปใหม่ (ใน processNextInQueue หรือ handleApprove)
  const startPreview = async (image) => {
    const now = Date.now();
    const imageId = image._id || image.id;

    // IMPORTANT: Set status to 'playing' locally to prevent re-sync issues
    const playingImage = { ...image, status: 'playing' };

    setCurrentPreview(playingImage);
    setTimeLeft(image.time);
    setIsActive(true);
    localStorage.setItem("currentPreview", JSON.stringify(playingImage));
    localStorage.setItem("startTimestamp", now);
    localStorage.setItem("duration", image.time);
    localStorage.setItem("isActive", true);

    // Update local images state to mark as playing (prevents sync from re-adding)
    setImages(prev => prev.map(img => {
      if ((img._id === imageId) || (img.id === imageId)) {
        return { ...img, status: 'playing' };
      }
      return img;
    }));

    // อัพเดทสถานะเป็น 'playing' ใน DB
    try {
      await fetch(`http://localhost:5001/api/playing/${imageId}`, {
        method: "POST"
      });
      console.log("[Playing] Marked as playing:", imageId);
    } catch (err) {
      console.error("Error marking as playing:", err);
    }
  };

  // Guard to prevent double-completion
  const isCompletingRef = React.useRef(false);

  // Track completed IDs to prevent re-adding to queue
  const completedIdsRef = React.useRef(new Set());

  // Ref to track current previewQueue for use in callbacks
  const previewQueueRef = React.useRef(previewQueue);

  // Keep ref in sync with state
  useEffect(() => {
    previewQueueRef.current = previewQueue;
    console.log("[Ref Sync] previewQueueRef updated, length:", previewQueue.length);
  }, [previewQueue]);

  // Function to start next item from queue
  const processNextFromQueue = () => {
    const currentQueue = previewQueueRef.current;
    console.log("[ProcessNext] Called. Queue length:", currentQueue.length);

    if (currentQueue.length > 0) {
      const nextImage = currentQueue[0];
      console.log("[ProcessNext] Starting:", nextImage._id || nextImage.id);

      // Remove from queue first
      setPreviewQueue(prev => prev.slice(1));

      // Then start playing
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

  // Standalone function to handle item completion
  const completeCurrentItem = async (imageId) => {
    console.log("[Complete] Completing item:", imageId);

    // Call backend to complete
    try {
      const response = await fetch(`http://localhost:5001/api/complete/${imageId}`, {
        method: "POST"
      });
      const result = await response.json();
      console.log("[Complete] API Result:", result);
      completedIdsRef.current.add(imageId);
    } catch (err) {
      console.error("[Complete] API Error:", err);
    }

    // Clear current preview state
    setIsActive(false);
    setCurrentPreview(null);
    localStorage.removeItem("currentPreview");
    localStorage.removeItem("startTimestamp");
    localStorage.removeItem("duration");
    localStorage.removeItem("isActive");

    // Reset lock
    isCompletingRef.current = false;

    // Check if queue has items and start countdown
    const queueLength = previewQueueRef.current.length;
    console.log("[Complete] Queue has", queueLength, "items waiting");

    if (queueLength > 0) {
      console.log("[Complete] Queue has items, moving to next immediately");
      setIsPaused(false);
      setPauseTimeLeft(0);

      // Call processNextFromQueue immediately (or better, fetchImages to sync with server's decision)
      // Since server now auto-plays, we should probably just fetchImages to get the new 'playing' state
      // But for UI responsiveness, if we have a local queue, we can try to anticipate.
      // However, to align with server auto-play, let's just fetchImages and let the sync logic in fetchImages handle the 'playing' detection.
      setTimeout(fetchImages, 500);
    } else {
      console.log("[Complete] No queue, fetching images");
      fetchImages();
    }
  };

  // Timer effect สำหรับ countdown - SYNC only, no async in interval
  useEffect(() => {
    let interval = null;
    if (isActive && currentPreview && !displayPaused) {
      interval = setInterval(() => {
        const startTimestamp = Number(localStorage.getItem("startTimestamp"));
        const duration = Number(localStorage.getItem("duration"));
        const now = Date.now();
        const elapsed = Math.floor((now - startTimestamp) / 1000);
        const left = duration - elapsed;
        setTimeLeft(left > 0 ? left : 0);

        if (left <= 0 && !isCompletingRef.current) {
          // Lock to prevent double-completion
          isCompletingRef.current = true;
          clearInterval(interval);

          // Get imageId NOW before state changes
          const imageId = currentPreview._id || currentPreview.id;

          // Call completion function OUTSIDE interval (fire-and-forget pattern)
          // This ensures it runs independently of React's useEffect lifecycle
          setTimeout(() => {
            completeCurrentItem(imageId);
          }, 0);
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, currentPreview, displayPaused]);

  // Simple countdown effect - runs when isPaused changes
  useEffect(() => {
    let countdownTimer = null;

    if (isPaused && pauseTimeLeft > 0) {
      console.log("[Countdown] Starting from", pauseTimeLeft);

      countdownTimer = setInterval(() => {
        setPauseTimeLeft(prev => {
          const newVal = prev - 1;
          console.log("[Countdown] Time:", newVal);

          if (newVal <= 0) {
            clearInterval(countdownTimer);
            // Use setTimeout to ensure this runs after state update
            setTimeout(() => {
              console.log("[Countdown] Finished, calling processNext");
              processNextFromQueue();
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
  }, [isPaused]); // Only depend on isPaused, not pauseTimeLeft

  const fetchImages = async () => {
    try {
      const response = await fetch("http://localhost:5001/api/queue");
      if (response.ok) {
        const data = await response.json();
        setImages(data);

        // Check if there's an item currently playing on server
        const playingOnServer = data.find(img => img.status === 'playing');

        // If we found a playing item AND we don't have a current preview locally
        // OR the playing item ID matches our current but potentially out of sync
        if (playingOnServer && (!currentPreview || (currentPreview._id || currentPreview.id) === (playingOnServer._id || playingOnServer.id))) {

          // Calculate remaining time
          const duration = playingOnServer.time || 10;
          let remaining = duration;

          if (playingOnServer.playingAt) {
            const elapsed = (Date.now() - new Date(playingOnServer.playingAt).getTime()) / 1000;
            remaining = Math.max(0, duration - elapsed);
          }

          // Force sync state
          console.log("[QueueSync] Found playing item from server:", playingOnServer._id, "Remaining:", remaining);

          if (!isActive || !currentPreview) {
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
        }
      }
    } catch (error) {
      console.error("Error fetching images:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch("http://localhost:5001/api/history");
      if (response.ok) {
        const data = await response.json();
        setHistoryItems(data);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
    }
  };

  const fetchGiftSettings = async () => {
    try {
      const response = await fetch("http://localhost:5001/api/gifts/settings");
      if (response.ok) {
        const data = await response.json();
        // data structure is { tableCount, items: [...] }
        setGiftSettings(data.items || []);
        console.log("[GiftSettings] Loaded:", data.items);
      }
    } catch (error) {
      console.error("Error fetching gift settings:", error);
    }
  };

  const handlePauseDisplay = () => {
    if (displayPaused) {
      // Resume
      setDisplayPaused(false);
      const now = Date.now();
      localStorage.setItem("startTimestamp", now - (savedTimeLeft * 1000));
    } else {
      // Pause
      setDisplayPaused(true);
      setSavedTimeLeft(timeLeft);
    }
  };

  const handleSkipCurrent = async () => {
    if (!currentPreview) return;
    const imageId = currentPreview._id || currentPreview.id;
    try {
      await fetch(`http://localhost:5001/api/complete/${imageId}`, { method: "POST" });
    } catch (err) {
      console.error("Error skipping current image:", err);
    }

    // reset current preview state
    setIsActive(false);
    setIsPaused(false);
    setDisplayPaused(false);
    setCurrentPreview(null);
    setTimeLeft(0);
    setSavedTimeLeft(0);
    setPauseTimeLeft(0);
    localStorage.removeItem("currentPreview");
    localStorage.removeItem("startTimestamp");
    localStorage.removeItem("duration");
    localStorage.removeItem("isActive");
    localStorage.removeItem("timeLeft");
    localStorage.removeItem("isPaused");
    localStorage.removeItem("pauseTimeLeft");

    if (previewQueue.length > 0) {
      const nextImage = previewQueue[0];
      setPreviewQueue(prev => prev.slice(1));
      startPreview(nextImage);
    } else {
      fetchImages();
    }
  };

  const handleRestoreToQueue = async (historyId) => {
    try {
      console.log("[Frontend] Restoring history ID:", historyId);
      const response = await fetch(`http://localhost:5001/api/history/restore/${historyId}`, {
        method: "POST",
      });
      if (response.ok) {
        const result = await response.json();
        console.log("[Frontend] Restore success:", result);

        // Refresh ทั้งสองอัน
        await fetchHistory();
        await fetchImages();

        // ปิด modal หลังจาก restore สำเร็จ
        setShowHistory(false);

        alert("นำกลับเข้าคิวสำเร็จ");
      } else {
        console.error("[Frontend] Restore failed:", response.status);
        alert("ไม่สามารถนำกลับเข้าคิวได้");
      }
    } catch (error) {
      console.error("Error restoring to queue:", error);
      alert("เกิดข้อผิดพลาด: " + error.message);
    }
  };

  const handleImageClick = (image) => {
    setSelectedImage(image);
    setEditWidth(image.width || "");
    setEditHeight(image.height || "");
    setShowModal(true);
  };

  /* 
   * Queue Persistence & Sync
   * Sync 'approved' items from backend to previewQueue on load/refresh
   */
  useEffect(() => {
    if (loading) return;

    // 1. Get truly approved items from server state
    const approvedItemsFromServer = images.filter(img => img.status === "approved");
    const approvedIds = new Set(approvedItemsFromServer.map(img => img._id || img.id));

    setPreviewQueue(prev => {
      // 2. Remove items from local queue that are no longer in the approved list from server
      // (e.g. they started playing or were completed/rejected)
      const cleanedQueue = prev.filter(item => {
        const id = item._id || item.id;
        // Keep if it still exists in approved list from server
        // OR if needed? No, if it's not approved on server, it shouldn't be in queue.
        // EXCEPT: There might be a slight delay in 'images' update? 
        // Trusted source is 'images' which comes from fetchImages.
        return approvedIds.has(id);
      });

      // 3. Add new valid items
      const currentIds = new Set(cleanedQueue.map(p => p._id || p.id));
      const currentPlayingId = currentPreview ? (currentPreview._id || currentPreview.id) : null;

      const newItems = approvedItemsFromServer.filter(item => {
        const itemId = item._id || item.id;

        // Exclude if already in cleaned queue
        if (currentIds.has(itemId)) return false;

        // Exclude if currently playing (double check)
        if (currentPlayingId && currentPlayingId === itemId) return false;

        // Exclude if locally marked as completed (safety)
        if (completedIdsRef.current.has(itemId)) return false;

        return true;
      });

      if (newItems.length > 0) {
        newItems.sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));
        return [...cleanedQueue, ...newItems];
      }

      // Return cleaned queue if anything changed (length diff) or if we just want to update
      if (cleanedQueue.length !== prev.length) {
        return cleanedQueue;
      }

      return prev;
    });
  }, [images, loading, currentPreview]);

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

      // 2. Add to Queue Locally
      const imageToApprove = { ...selectedImage, width: editWidth, height: editHeight, status: 'approved' };
      if (!currentPreview && !isActive) {
        // If nothing playing, wait for next loop or start immediately? 
        // logic is handled by "processNext" effect or manual start ?
        // Actually existing logic called startPreview immediately if empty.
        // Let's keep that but careful with duplicates managed by useEffect above?
        // Actually, if we update 'images' state above, the useEffect might catch it too.
        // But explicit start is faster for specific interaction.
        startPreview(imageToApprove);
      } else {
        setPreviewQueue(prev => {
          if (prev.find(p => (p._id || p.id) === (imageToApprove._id || imageToApprove.id))) return prev;
          return [...prev, imageToApprove];
        });
      }

      // 3. Send Request
      const response = await fetch(`http://localhost:5001/api/approve/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const handleReject = async (id) => {
    try {
      console.log('[Reject] Rejecting image with ID:', id);
      const response = await fetch(`http://localhost:5001/api/reject/${id}`, {
        method: "POST",
      });
      if (response.ok) {
        fetchImages();
        setShowModal(false);
      } else {
        console.error('[Reject] Failed:', await response.text());
        alert('ไม่สามารถปฏิเสธได้');
      }
    } catch (error) {
      console.error("Error rejecting image:", error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTime = (seconds) => {
    const s = Math.floor(seconds);
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // เพิ่ม useEffect สำหรับ restore state
  useEffect(() => {
    const savedPreview = localStorage.getItem("currentPreview");
    const savedIsActive = localStorage.getItem("isActive");
    const startTimestamp = Number(localStorage.getItem("startTimestamp"));
    const duration = Number(localStorage.getItem("duration"));
    if (savedPreview && savedIsActive === "true" && startTimestamp && duration) {
      const now = Date.now();
      const elapsed = Math.floor((now - startTimestamp) / 1000);
      const left = duration - elapsed;
      if (left > 0) {
        setCurrentPreview(JSON.parse(savedPreview));
        setTimeLeft(left);
        setIsActive(true);
      } else {
        setCurrentPreview(null);
        setIsActive(false);
        localStorage.removeItem("currentPreview");
        localStorage.removeItem("startTimestamp");
        localStorage.removeItem("duration");
        localStorage.removeItem("isActive");
      }
    }
  }, []);

  // ทุกครั้งที่ state เปลี่ยน ให้ sync ลง localStorage
  useEffect(() => {
    if (currentPreview && isActive) {
      localStorage.setItem("currentPreview", JSON.stringify(currentPreview));
      localStorage.setItem("timeLeft", timeLeft);
      localStorage.setItem("isActive", isActive);
      localStorage.setItem("isPaused", isPaused);
      localStorage.setItem("pauseTimeLeft", pauseTimeLeft);
    } else {
      // ถ้าไม่มี preview แล้ว ให้ลบออก
      localStorage.removeItem("currentPreview");
      localStorage.removeItem("timeLeft");
      localStorage.removeItem("isActive");
      localStorage.removeItem("isPaused");
      localStorage.removeItem("pauseTimeLeft");
    }
  }, [currentPreview, timeLeft, isActive, isPaused, pauseTimeLeft]);

  function renderSocialOnImage(socialType, socialName) {
    const logoMap = {
      ig: igLogo,
      fb: fbLogo,
      line: lineLogo,
      tiktok: tiktokLogo
    };

    const logoSrc = logoMap[socialType];
    if (!logoSrc) return null;

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
          textShadow: "0 2px 6px rgba(0,0,0,0.8)"
        }}>{socialName}</span>
      </span>
    );
  }

  // สำหรับ Queue Section - แสดงแค่ข้อมูลพื้นฐาน
  function renderGiftOrder(item) {
    const gift = item.giftOrder || {};
    const senderInfo = item.sender || 'ผู้ส่ง';
    const targetTable = gift.tableNumber || '-';
    const avatarUrl = gift.avatar || null;
    
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

  // สำหรับ Modal และ Preview - แสดงแบบเต็ม
  function renderGiftOrderFull(item, isCompact = false) {
    const gift = item.giftOrder || {};
    const senderInfo = item.sender || 'ผู้ส่ง';
    const targetTable = gift.tableNumber || '-';
    const avatarUrl = gift.avatar || null;
    
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
                  src={avatarUrl.startsWith('http') ? avatarUrl : `http://localhost:4000${avatarUrl}`}
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
            let itemImage = giftItem.image;
            if (!itemImage && giftSettings.length > 0) {
              console.log('[Gift Card] Looking for id:', giftItem.id);
              const setting = giftSettings.find(s => s.id === giftItem.id);
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
                    src={itemImage.startsWith('http') ? itemImage : `http://localhost:5001${itemImage}`} 
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

  return (
    <div className="queue-container">
      <header className="queue-header">
        <Link to="/home" className="back-button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          กลับ
        </Link>
        <h1>ตรวจสอบรูปภาพ</h1>
        <div className="queue-stats">
          <span className="queue-count">{images.length}</span>
          <button onClick={() => { fetchHistory(); setShowHistory(true); }} className="refresh-button" style={{ marginRight: "8px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v5h5M3.05 13a9 9 0 1 0 .5-4M3 8l.5-1" />
            </svg>
          </button>
          <button onClick={fetchImages} className="refresh-button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
          </button>
        </div>
      </header>

      {/* Category Filter Buttons */}
      <div style={{
        display: "flex",
        gap: "12px",
        padding: "16px 32px",
        backgroundColor: "white",
        borderBottom: "1px solid #e5e7eb",
        overflowX: "auto"
      }}>
        <button
          onClick={() => setCategoryFilter("all")}
          style={{
            padding: "8px 20px",
            borderRadius: "20px",
            border: "none",
            backgroundColor: categoryFilter === "all" ? "#8b5cf6" : "#e5e7eb",
            color: categoryFilter === "all" ? "white" : "#64748b",
            fontWeight: "700",
            cursor: "pointer",
            transition: "all 0.3s ease",
            fontSize: "14px"
          }}
        >
          ทั้งหมด ({images.length})
        </button>
        <button
          onClick={() => setCategoryFilter("image")}
          style={{
            padding: "8px 20px",
            borderRadius: "20px",
            border: "none",
            backgroundColor: categoryFilter === "image" ? "#6366f1" : "#e5e7eb",
            color: categoryFilter === "image" ? "white" : "#64748b",
            fontWeight: "700",
            cursor: "pointer",
            transition: "all 0.3s ease",
            fontSize: "14px"
          }}
        >
          🖼️ รูปภาพ ({images.filter(img => img.type === "image" || !img.type).length})
        </button>
        <button
          onClick={() => setCategoryFilter("text")}
          style={{
            padding: "8px 20px",
            borderRadius: "20px",
            border: "none",
            backgroundColor: categoryFilter === "text" ? "#8b5cf6" : "#e5e7eb",
            color: categoryFilter === "text" ? "white" : "#64748b",
            fontWeight: "700",
            cursor: "pointer",
            transition: "all 0.3s ease",
            fontSize: "14px"
          }}
        >
          💬 ข้อความ ({images.filter(img => img.type === "text").length})
        </button>
        <button
          onClick={() => setCategoryFilter("birthday")}
          style={{
            padding: "8px 20px",
            borderRadius: "20px",
            border: "none",
            backgroundColor: categoryFilter === "birthday" ? "#ec4899" : "#e5e7eb",
            color: categoryFilter === "birthday" ? "white" : "#64748b",
            fontWeight: "700",
            cursor: "pointer",
            transition: "all 0.3s ease",
            fontSize: "14px"
          }}
        >
          🎂 วันเกิด ({images.filter(img => img.type === "birthday").length})
        </button>
        <button
          onClick={() => setCategoryFilter("gift")}
          style={{
            padding: "8px 20px",
            borderRadius: "20px",
            border: "none",
            backgroundColor: categoryFilter === "gift" ? "#f59e0b" : "#e5e7eb",
            color: categoryFilter === "gift" ? "white" : "#64748b",
            fontWeight: "700",
            cursor: "pointer",
            transition: "all 0.3s ease",
            fontSize: "14px"
          }}
        >
          🎁 ของขวัญ ({images.filter(img => img.type === "gift").length})
        </button>
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
                          image.type === "text" ? "#8b5cf6" :
                            "#6366f1";

                    return (
                      <div key={image._id || image.id} className="image-card" onClick={() => handleImageClick(image)} style={{ borderTopColor: categoryColor }}>
                        <div className="card-header">
                          <span className="queue-number">#{index + 1}</span>
                          <span className="sender">{image.sender}</span>
                        </div>

                        {/* Main Content */}
                        <div className="image-preview-container" style={{ position: "relative" }}>
                          {image.type === "gift" ? (
                            renderGiftOrder(image)
                          ) : image.filePath ? (
                            <>
                              <img
                                src={`http://localhost:5001${image.filePath}`}
                                alt="Preview"
                                className="preview-image"
                              />
                              {(!image.composed && image.composed !== "1" && ((image.socialType && image.socialName) || image.text)) && (
                                <div className="preview-overlay-center">
                                  {image.socialType && image.socialName && (
                                    <div className="preview-social-overlay" style={{
                                      marginBottom: "8px",
                                      color: "#fff",
                                      padding: "6px 16px",
                                      borderRadius: "8px",
                                      fontWeight: "700",
                                      fontSize: "20px",
                                      textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                                      maxWidth: "100%",
                                      wordBreak: "break-all"
                                    }}>
                                      {renderSocialOnImage(image.socialType, image.socialName)}
                                    </div>
                                  )}
                                  {image.text && (
                                    <div className="preview-text-overlay" style={{
                                      color: image.textColor,
                                      borderRadius: "8px",
                                      padding: "12px 24px",
                                      fontWeight: "400",
                                      fontSize: "22px",
                                      textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                                      maxWidth: "100%",
                                      wordBreak: "break-word",
                                      textAlign: "center"
                                    }}>
                                      {image.text}
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            // กรณีข้อความล้วนเหมือนเดิม
                            <div
                              className="text-only-card"
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
                              {image.socialType && image.socialName && (
                                <div
                                  style={{
                                    marginBottom: "8px",
                                    marginTop: "8px",
                                    color: "#fff",
                                    fontWeight: "700",
                                    fontSize: "20px",
                                    textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                                    maxWidth: "100%",
                                    wordBreak: "break-all",
                                    display: "inline-flex",
                                    alignItems: "center"
                                  }}
                                >
                                  {renderSocialOnImage(image.socialType, image.socialName)}
                                </div>
                              )}
                              <div
                                style={{
                                  color: image.textColor || "#fff",
                                  fontWeight: "400",
                                  fontSize: "22px",
                                  textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                                  padding: "12px 24px",
                                  textAlign: "center",
                                  wordBreak: "break-all"
                                }}
                              >
                                {image.text}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="card-footer">
                          <div className="time-price">
                            <span className="time">{image.time}วินาที</span>
                            <span className="price">฿{image.price}</span>
                          </div>
                          <div className="date">{formatDate(image.receivedAt)}</div>
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
                  {isPaused && previewQueue.length > 0 && (
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
                        }}>
                          <img
                            src={`http://localhost:5001${previewQueue[0].filePath}`}
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
                              {previewQueue[0].time} วินาที · ฿{previewQueue[0].price}
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
                      src={`http://localhost:5001${currentPreview.filePath}`}
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
                          {renderSocialOnImage(currentPreview.socialType, currentPreview.socialName)}
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
                  {isPaused && (
                    <div className="pause-message">กำลังเปลี่ยนรูป...</div>
                  )}
                  {displayPaused && (
                    <div className="pause-message" style={{ color: "#ef4444" }}>หยุดชั่วคราว</div>
                  )}
                  <button
                    onClick={handlePauseDisplay}
                    className="refresh-button"
                    style={{ marginTop: "12px", width: "100%", padding: "10px" }}
                  >
                    {displayPaused ? "เริ่มต่อ" : "หยุดชั่วคราว"}
                  </button>
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
              <div className="no-preview">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                <p>ยังไม่มีรูปภาพที่อนุมัติ</p>
                <span>กดอนุมัติรูปภาพเพื่อแสดง Preview</span>
              </div>
            )}

            {/* แสดงคิวที่รออยู่ */}
            {previewQueue.length > 0 && (
              <div className="waiting-queue">
                <h3>คิวที่รออยู่ ({previewQueue.length})</h3>
                <div className="queue-list">
                  {previewQueue.map((queueImage, index) => (
                    <div key={`queue-${index}`} className="queue-item">
                      <div className="queue-item-number">#{index + 1}</div>
                      <div className="queue-item-image">
                        <img
                          src={`http://localhost:5001${queueImage.filePath}`}
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
                  <>
                    <img
                      src={`http://localhost:5001${selectedImage.filePath}`}
                      alt="Full preview"
                      className="modal-image"
                      style={{
                        width: "100%",
                        height: "auto",
                        maxHeight: "400px",
                        objectFit: "contain",
                        borderRadius: "18px",
                        display: "block",
                        margin: "0 auto"
                      }}
                    />
                    {(!selectedImage.composed && selectedImage.composed !== "1" && ((selectedImage.socialType && selectedImage.socialName) || selectedImage.text)) && (
                      <div className="preview-overlay-center">
                        {selectedImage.socialType && selectedImage.socialName && (
                          <div className="preview-social-overlay" style={{
                            marginBottom: "8px",
                            color: "#fff",
                            padding: "6px 16px",
                            borderRadius: "8px",
                            fontWeight: "700",
                            fontSize: "20px",
                            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                            maxWidth: "100%",
                            wordBreak: "break-all"
                          }}>
                            {renderSocialOnImage(selectedImage.socialType, selectedImage.socialName)}
                          </div>
                        )}
                        {selectedImage.text && (
                          <div className="preview-text-overlay" style={{
                            color: selectedImage.textColor,
                            borderRadius: "8px",
                            padding: "6px 16px",
                            fontWeight: "400",
                            fontSize: "18px",
                            textShadow: selectedImage.textColor === "white"
                              ? "0 2px 8px rgba(0,0,0,0.8)"
                              : "0 2px 8px rgba(255,255,255,0.8)",
                            maxWidth: "100%",
                            wordBreak: "break-all"
                          }}>
                            {selectedImage.text}
                          </div>
                        )}
                      </div>
                    )}
                  </>
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
                        {renderSocialOnImage(selectedImage.socialType, selectedImage.socialName)}
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
                            selectedImage.type === 'text' ? '#8b5cf6' : '#6366f1',
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

                    {/* QR Code Preview */}
                    {selectedImage.qrCodePath && (
                      <div className="detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                        <span className="label">QR Code Instagram:</span>
                        <div style={{ marginTop: '8px' }}>
                          <img
                            src={`http://localhost:5001${selectedImage.qrCodePath}`}
                            alt="QR Code"
                            style={{
                              maxWidth: '300px',
                              maxHeight: '300px',
                              border: '3px solid #e2e8f0',
                              borderRadius: '12px',
                              background: 'white',
                              padding: '8px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* รายการสินค้าสำหรับ Gift */}
                {selectedImage.type === 'gift' && selectedImage.giftOrder && selectedImage.giftOrder.items && (
                  <div className="detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start', borderBottom: '1px solid #eee', paddingBottom: '12px', marginBottom: '12px' }}>
                    <span className="label" style={{ marginBottom: '8px' }}>📦 รายการสินค้าทั้งหมด:</span>
                    <div style={{ width: '100%', background: '#f8fafc', borderRadius: '8px', padding: '12px' }}>
                      {selectedImage.giftOrder.items.map((giftItem, idx) => (
                        <div key={idx} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 0',
                          borderBottom: idx < selectedImage.giftOrder.items.length - 1 ? '1px solid #e5e7eb' : 'none'
                        }}>
                          <span style={{ fontSize: '14px', color: '#334155', fontWeight: '500' }}>
                            {giftItem.name}
                          </span>
                          <span style={{ fontSize: '14px', color: '#64748b' }}>
                            x{giftItem.quantity} · ฿{giftItem.price}
                          </span>
                        </div>
                      ))}
                      <div style={{
                        marginTop: '12px',
                        paddingTop: '12px',
                        borderTop: '2px solid #e5e7eb',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>รวมทั้งหมด</span>
                        <span style={{ fontSize: '16px', fontWeight: '700', color: '#8b5cf6' }}>฿{selectedImage.price}</span>
                      </div>
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
                  <span className="value">฿{selectedImage.price}</span>
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
                          {item.mediaUrl ? (
                            <img
                              src={`http://localhost:5001${item.mediaUrl}`}
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
                            <div style={{ flex: 1 }}>
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
                                {formatDate(item.approvalDate)}
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
                                  {item.metadata?.duration ?? "N/A"} วินาที
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
                                  ฿{item.price}
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
                            onClick={() => handleRestoreToQueue(item._id)}
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