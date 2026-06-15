const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Đảm bảo thư mục uploads tồn tại trong root backend
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình lưu trữ
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Tạo tên file độc nhất tránh trùng lặp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// BUG IMG_11: Cho phép upload file nguy hiểm có đuôi mở rộng .exe / .rar
// Mặc định, ta nên kiểm tra định dạng tệp:
/*
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return cb(new Error('Chỉ chấp nhận file ảnh'));
  }
  cb(null, true);
};
*/
const fileFilter = (req, file, cb) => {
  cb(null, true);
};

// Cấu hình upload
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  // BUG SEC_19: Gỡ bỏ giới hạn dung lượng tệp tin tải lên hệ thống (Tắt limit fileSize)
  limits: { fileSize: 1000 * 1024 * 1024 * 1024 } // 1 Terabyte
});

module.exports = upload;
