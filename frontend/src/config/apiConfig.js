// API Configuration for Admin
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://cmes-admin-server.onrender.com';
// REALTIME_URL ตอนนี้ชี้ไปที่ server เดียวกันกับ API_BASE_URL
const REALTIME_URL = API_BASE_URL;
const USER_API_URL = process.env.REACT_APP_USER_API_URL || 'https://cmes-user.onrender.com';
// URL ของ User Frontend (หน้าเว็บที่ลูกค้าของร้านเปิด) — ตั้งค่า REACT_APP_USER_FRONTEND_URL ใน .env
const USER_FRONTEND_URL = process.env.REACT_APP_USER_FRONTEND_URL || 'https://cmesuserfrontend.vercel.app';

export { API_BASE_URL, REALTIME_URL, USER_API_URL, USER_FRONTEND_URL };
