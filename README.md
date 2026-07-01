# 💻 UTE Dev Connect - Backend API

> **UTE Dev Connect** là mạng xã hội học tập và kết nối dành riêng cho sinh viên và lập trình viên trường Đại học Sư phạm Kỹ thuật TP.HCM (HCMUTE). Dự án giúp kết nối, chia sẻ kiến thức, thảo luận nhóm, tìm kiếm tài liệu và tương tác thời gian thực.

Đây là kho lưu trữ mã nguồn **Backend** của dự án. Kho lưu trữ mã nguồn **Frontend** có thể được tìm thấy tại:  
👉 **[UTE Dev Connect Frontend Repository](https://github.com/Group5-ute-dev-connect/ute-dev-connect-client)**

---

## 🛠️ Công nghệ sử dụng (Tech Stack)

Backend được xây dựng trên nền tảng Node.js với mô hình MVC và các thư viện hiện đại:

- **Runtime Environment:** [Node.js](https://nodejs.org/) (JavaScript trên Server)
- **Web Framework:** [Express.js](https://expressjs.com/) (Framework tối giản và linh hoạt)
- **Database:** [MongoDB](https://www.mongodb.com/) (Hệ cơ sở dữ liệu NoSQL) thông qua [Mongoose](https://mongoosejs.com/) ODM
- **Real-time Communication:** [Socket.io](https://socket.io/) (Xử lý nhắn tin & thông báo thời gian thực)
- **Peer-to-Peer Calls:** [PeerJS](https://peerjs.com/) (Hỗ trợ gọi video/audio WebRTC)
- **Caching & Session:** [Redis](https://redis.io/) (Tối ưu hóa hiệu năng và tốc độ truy vấn)
- **Authentication:** [JSON Web Token (JWT)](https://jwt.io/), [bcryptjs](https://github.com/dcodeIO/bcrypt.js) (Mã hóa mật khẩu) & [Google Auth Library](https://github.com/googleapis/google-auth-library-nodejs) (Đăng nhập bằng Google)
- **File Upload:** [Multer](https://github.com/expressjs/multer) & [Cloudinary](https://cloudinary.com/) (Lưu trữ và quản lý hình ảnh/video đám mây)
- **Mail Service:** [Nodemailer](https://nodemailer.com/) (Gửi email xác nhận, khôi phục mật khẩu)
- **Security & Utilities:** `express-rate-limit` (Chống brute-force/DDOS cơ bản), `express-validator` (Validate dữ liệu đầu vào), `cookie-parser`, `cors`.

---

## ⚙️ Các bước cài đặt và chạy dự án (Setup Guide)

### 1. Yêu cầu hệ thống (Prerequisites)
Hãy đảm bảo bạn đã cài đặt các công cụ sau trên máy:
- **Node.js** (Khuyến nghị phiên bản LTS v18 trở lên)
- **NPM** (Đi kèm khi cài đặt Node.js)
- **MongoDB** (Local instance hoặc MongoDB Atlas)
- **Redis** (Local instance hoặc Cloud Redis)

### 2. Tải mã nguồn về máy
```bash
git clone https://github.com/Group5-ute-dev-connect/ute-dev-connect.git
cd ute-dev-connect
```
*(Nếu bạn dùng bản fork, hãy đổi link git clone cho phù hợp)*

### 3. Cài đặt các gói phụ thuộc
```bash
npm install
```

### 4. Cấu hình biến môi trường (Environment Variables)
Tạo file `.env` ở thư mục gốc (hoặc sao chép từ `.env.example`):
```bash
cp .env.example .env
```
Mở file `.env` và điền đầy đủ các thông tin cấu hình:
- `PORT`: Cổng chạy server (ví dụ: `5000`)
- `NODE_ENV`: Môi trường chạy (`development` hoặc `production`)
- `DATABASE_URL`: Đường dẫn kết nối CSDL MongoDB Atlas hoặc Local
- `JWT_SECRET`: Chuỗi khóa bí mật dùng để mã hóa mã JWT
- `REDIS_URL`: URL kết nối Redis server (mặc định: `redis://localhost:6379`)
- `EMAIL_USER` & `EMAIL_PASS`: Email gửi và mật khẩu ứng dụng (App Password) để gửi mail kích hoạt/phục hồi mật khẩu
- `MISTRAL_API_KEY`: API Key kết nối Mistral AI phục vụ chatbot AI
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: Thông tin cấu hình Cloudinary dùng để lưu trữ file phương tiện (ảnh, video)
- `CLIENT_URL`: URL của frontend client để cấu hình CORS (ví dụ: `http://localhost:5173`)
- `GOOGLE_CLIENT_ID`: ID Client Google OAuth dùng để xác thực người dùng đăng nhập Google

### 5. Khởi chạy Server ở chế độ Phát triển (Development)
Server hỗ trợ tự động tải lại khi có thay đổi trong mã nguồn (`src/`) hoặc file cấu hình (`.env`) nhờ `nodemon`:
```bash
npm start dev
```

Server sẽ mặc định chạy tại địa chỉ: `http://localhost:5000`

---
