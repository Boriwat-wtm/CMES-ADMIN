import cron from 'node-cron';
import CheckHistory from './models/CheckHistory.js';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

export const startCleanupJob = () => {
    // รันทุกๆ ตี 3 (03:00) ของทุกวัน
    cron.schedule('0 3 * * *', async () => {
        console.log('[Cron] Starting 2-day-old history cleanup process...');
        try {
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

            // ค้นหา record ที่อายุเกิน 2 วัน และยังไม่ได้ลบรูปหรือข้อความ
            // ตรวจสอบเงื่อนไข mediaUrl มีค่า หรือ content มีค่า
            const oldRecords = await CheckHistory.find({
                createdAt: { $lt: twoDaysAgo },
                $or: [
                    { mediaUrl: { $ne: null } },
                    { mediaUrl: { $ne: '' } },
                    { content: { $ne: '' } }
                ]
            });

            console.log(`[Cron] Found ${oldRecords.length} old records to anonymize.`);

            let cleanedCount = 0;

            for (const record of oldRecords) {
                // 1. Delete media if exists
                if (record.mediaUrl) {
                    const fileUrl = record.mediaUrl;
                    if (fileUrl.includes('res.cloudinary.com')) {
                        // Delete from Cloudinary
                        try {
                            const urlParts = fileUrl.split('/');
                            const folderIndex = urlParts.findIndex(part => part === 'cmes-admin');
                            if (folderIndex !== -1) {
                                const publicIdWithExt = urlParts.slice(folderIndex).join('/');
                                const publicId = publicIdWithExt.split('.').slice(0, -1).join('.');
                                await cloudinary.uploader.destroy(publicId);
                            }
                        } catch (cloudErr) {
                            console.error(`[Cron] Error deleting Cloudinary file for record ${record._id}:`, cloudErr.message);
                        }
                    } else if (fileUrl.startsWith('/uploads/')) {
                        // Delete Local File
                        try {
                            // Path to root of backend
                            const rootPath = path.resolve();
                            const localPath = path.join(rootPath, fileUrl);
                            if (fs.existsSync(localPath)) {
                                fs.unlinkSync(localPath);
                            }
                        } catch (fsErr) {
                            console.error(`[Cron] Error deleting local file for record ${record._id}:`, fsErr.message);
                        }
                    }
                }

                // 2. Anonymize Content (ลบข้อความ และรูป)
                await CheckHistory.findByIdAndUpdate(record._id, {
                    $set: {
                        mediaUrl: null,
                        content: '', // ลบข้อความที่ลูกค้าพิมพ์มา
                        'metadata.note': '', // ลบ Note ที่อาจจะพิมพ์มาพร้อมของขวัญ
                    }
                });

                cleanedCount++;
            }

            console.log(`[Cron] Successfully anonymized ${cleanedCount} records.`);

        } catch (error) {
            console.error('[Cron] Cleanup job failed:', error);
        }
    });

    console.log('[Cron] Cleanup job registered to run daily at 03:00');
};
