/**
 * 🔥 Multi-tenant Context
 * เก็บ shopId และ Socket.IO instance สำหรับ Admin Frontend
 */
import React, { createContext, useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { REALTIME_URL } from '../config/apiConfig';

export const ShopContext = createContext();

export const ShopProvider = ({ children }) => {
  const [shopId, setShopId] = useState(localStorage.getItem('shopId') || null);
  const [socket, setSocket] = useState(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  /**
   * เริ่มต้น Socket.IO connection พร้อม shopId
   */
  const initializeSocket = useCallback(() => {
    if (!shopId) {
      console.log('[ShopContext] No shopId, skipping socket initialization');
      return;
    }

    // ปิด socket เก่าก่อน (ถ้ามี)
    if (socket) {
      socket.disconnect();
    }

    console.log(`[ShopContext] Initializing socket for shop: ${shopId}`);

    // สร้าง socket connection ใหม่พร้อม shopId
    const newSocket = io(REALTIME_URL, {
      query: { shopId } // 🔥 ส่ง shopId เพื่อ join room
    });

    newSocket.on('connect', () => {
      console.log(`[ShopContext] Socket connected for shop ${shopId}:`, newSocket.id);
      setIsSocketConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('[ShopContext] Socket disconnected');
      setIsSocketConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('[ShopContext] Socket connection error:', error);
      setIsSocketConnected(false);
    });

    setSocket(newSocket);

    // Cleanup function
    return () => {
      console.log('[ShopContext] Cleaning up socket');
      newSocket.disconnect();
    };
  }, [shopId]);

  /**
   * เมื่อ shopId เปลี่ยน -> เชื่อมต่อ socket ใหม่
   */
  useEffect(() => {
    if (shopId) {
      localStorage.setItem('shopId', shopId);
      const cleanup = initializeSocket();
      return cleanup;
    } else {
      localStorage.removeItem('shopId');
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
    }
  }, [shopId, initializeSocket]);

  /**
   * Logout function - ล้างข้อมูลทั้งหมด
   */
  const logout = useCallback(() => {
    console.log('[ShopContext] Logging out...');
    
    // Disconnect socket
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }

    // Clear localStorage
    localStorage.removeItem('shopId');
    localStorage.removeItem('adminId');
    localStorage.removeItem('adminUsername');
    
    // Clear state
    setShopId(null);
    setIsSocketConnected(false);
  }, [socket]);

  const value = {
    shopId,
    setShopId,
    socket,
    isSocketConnected,
    logout
  };

  return (
    <ShopContext.Provider value={value}>
      {children}
    </ShopContext.Provider>
  );
};
