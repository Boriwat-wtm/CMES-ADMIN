/**
 * authFetch.js — Admin shared fetch utility
 * - อัตโนมัติเพิ่ม x-shop-id + x-admin-id ทุก request
 * - รองรับ FormData (ไม่บังคับ Content-Type)
 * - Redirect กลับหน้า login เมื่อได้รับ 401 Unauthorized
 */

export const handleAdminUnauthorized = () => {
  console.warn("[Admin] 401 Unauthorized — session expired, redirecting to login");
  localStorage.removeItem("adminId");
  localStorage.removeItem("adminUsername");
  localStorage.removeItem("shopId");
  window.location.href = "/";
};

const adminFetch = async (url, options = {}) => {
  const shopId = localStorage.getItem("shopId") || "";
  const adminId = localStorage.getItem("adminId") || "";
  const isFormData = options.body instanceof FormData;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      "x-shop-id": shopId,
      "x-admin-id": adminId,
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    handleAdminUnauthorized();
  }

  return response;
};

export default adminFetch;
