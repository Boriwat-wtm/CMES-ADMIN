/**
 * Multi-tenant Context
 * เก็บ shopId และ Socket.IO instance สำหรับ Admin Frontend
 */

import React, { createContext, useState, useEffect, useCallback } from "react";
import { io } from "socket.io-client";
import { REALTIME_URL } from "../config/apiConfig";

export const ShopContext = createContext();

export const ShopProvider = ({ children }) => {

  const [shopId, setShopId] = useState(localStorage.getItem("shopId") || null);
  const [socket, setSocket] = useState(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [systemConfig, setSystemConfig] = useState(null);

  const initializeSocket = useCallback(() => {

    if (!shopId) {
      console.log("[ShopContext] No shopId, skipping socket initialization");
      return;
    }

    console.log("[ShopContext] REALTIME_URL:", REALTIME_URL);
    console.log("[ShopContext] Initializing socket for shop:", shopId);

    const newSocket = io(REALTIME_URL, {

      query: { shopId },

      transports: ["polling", "websocket"],

      timeout: 30000,

      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,

      forceNew: true
    });


    newSocket.on("connect", () => {
      console.log("Socket connected:", newSocket.id);
      setIsSocketConnected(true);
    });


    newSocket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      setIsSocketConnected(false);
    });


    newSocket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
      setIsSocketConnected(false);
    });


    newSocket.on("reconnect_attempt", (attempt) => {
      console.log("Socket reconnect attempt:", attempt);
    });


    newSocket.on("reconnect", (attempt) => {
      console.log("Socket reconnected after attempts:", attempt);
    });


    newSocket.on("status", (config) => {
      console.log("Received system config:", config);
      setSystemConfig(config);
    });


    newSocket.on("publicRankingTypeUpdated", (data) => {
      console.log("Ranking type updated:", data);
    });


    setSocket(newSocket);


    return () => {
      console.log("[ShopContext] Cleaning up socket");
      newSocket.disconnect();
    };

  }, [shopId]);


  useEffect(() => {

    if (shopId) {

      localStorage.setItem("shopId", shopId);

      const cleanup = initializeSocket();
      return cleanup;

    } else {

      localStorage.removeItem("shopId");

      if (socket) {
        socket.disconnect();
        setSocket(null);
      }

    }

  }, [shopId]);


  const logout = useCallback(() => {

    console.log("[ShopContext] Logging out...");

    if (socket) {
      socket.disconnect();
      setSocket(null);
    }

    localStorage.removeItem("shopId");
    localStorage.removeItem("adminId");
    localStorage.removeItem("adminUsername");

    setShopId(null);
    setIsSocketConnected(false);

  }, [socket]);


  const value = {
    shopId,
    setShopId,
    socket,
    isSocketConnected,
    logout,
    systemConfig,
    setSystemConfig
  };


  return (
    <ShopContext.Provider value={value}>
      {children}
    </ShopContext.Provider>
  );

};