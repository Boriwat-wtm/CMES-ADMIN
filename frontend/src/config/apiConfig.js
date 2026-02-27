// API Configuration for Admin
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://cmes-admin-server.onrender.com';
// REALTIME_URL ตอนนี้ชี้ไปที่ server เดียวกันกับ API_BASE_URL
const REALTIME_URL = process.env.REACT_APP_REALTIME_URL || API_BASE_URL;
const USER_API_URL = process.env.REACT_APP_USER_API_URL || 'https://cmes-user.onrender.com';

export { API_BASE_URL, REALTIME_URL, USER_API_URL };
