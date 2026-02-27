/**
 * Middleware สำหรับ Multi-tenant Authentication
 * ตรวจสอบ shopId จาก Request Header
 */

export const requireShopId = (req, res, next) => {
  const shopId = req.headers['x-shop-id'] || req.query.shopId || req.body.shopId;
  
  if (!shopId) {
    return res.status(400).json({
      success: false,
      message: 'shopId is required'
    });
  }
  
  // แนบ shopId เข้ากับ req object เพื่อใช้ใน controller
  req.shopId = shopId;
  next();
};

/**
 * Middleware สำหรับ Admin Authentication (Optional: ใช้ JWT ในอนาคต)
 * ตอนนี้ตรวจสอบแค่ shopId จาก header เท่านั้น
 */
export const requireAdminAuth = (req, res, next) => {
  const shopId = req.headers['x-shop-id'];
  const adminId = req.headers['x-admin-id'];
  
  if (!shopId || !adminId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  
  // แนบข้อมูล admin เข้ากับ req object
  req.shopId = shopId;
  req.adminId = adminId;
  next();
};
