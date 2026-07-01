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

## 🌟 Các tính năng cốt lõi & Cơ chế kỹ thuật (Features & Architecture)

Dưới đây là chi tiết các tính năng đã được hiện thực hóa trong hệ thống và những giải pháp kỹ thuật nổi bật:

### 1. 🔐 Xác thực & Bảo mật tài khoản (Auth & Security)
*   **Đăng ký tài khoản sinh viên:** Hỗ trợ đăng ký bằng tài khoản email trường `@student.hcmute.edu.vn`.
*   **Xác thực mã OTP thông qua Redis:** Mã OTP đăng ký và khôi phục mật khẩu được băm bảo mật bằng `bcrypt`, lưu trữ tạm thời trên **Redis** với cơ chế tự hủy (`TTL = 15 phút`). OTP sẽ tự động bị xóa ngay sau khi xác thực thành công tại `/verify-otp` nhằm tránh tấn công phát lại (*replay attack*).
*   **Gửi Mail tự động:** Tích hợp dịch vụ **Nodemailer** tự động gửi mã OTP xác thực và khôi phục mật khẩu.
*   **Đăng nhập Google OAuth2:** Tương tác với Google API thông qua `google-auth-library` để kiểm tra tính hợp lệ của token và tự động tạo hoặc liên kết tài khoản.
*   **Khôi phục mật khẩu (Forgot Password):** Đặt lại mật khẩu mới an toàn bằng cơ chế OTP và Redis.

### 2. 📰 Bảng tin công cộng & Thuật toán Xu hướng (Trending Feed)
*   **Chia sẻ bài viết & Mã nguồn:** Tạo bài đăng kèm văn bản và mã nguồn (Code Snippets), hỗ trợ chế độ Công khai (Public).
*   **Kiểm duyệt từ cấm hệ thống (System Banned Words):** Bộ quét từ cấm tự động kiểm tra nội dung ngay khi có yêu cầu đăng bài. Nếu phát hiện từ cấm hệ thống, server chặn đứng và phản hồi mã lỗi `400 Bad Request`.
*   **Thuật toán Xu hướng động chống Spam (Trending Algorithm):**
    *   Hệ thống ghi nhận mỗi lượt xem thành một bản ghi riêng biệt trong bảng `postviews` (chứa `post`, `user` hoặc địa chỉ IP, và `timestamp`).
    *   **Cơ chế Cooldown:** Lượt xem chỉ được ghi nhận nếu tài khoản/IP đó chưa xem bài viết trong vòng **15 phút**.
    *   **MongoDB Aggregation:** Gom nhóm và đếm động số lượt xem trong các mốc thời gian `24h`, `7d`, `30d`. Giúp các bài viết cũ bỗng dưng nhận được lượng tương tác đột biến vẫn có cơ hội thăng hạng lên đầu trang Xu hướng.
*   **Tương tác thời gian thực:** Đồng bộ lượt Thích (Like) và Bình luận (Comment) thông qua **Socket.io**.
*   **Lưu trữ & Ẩn bài viết:** Hỗ trợ các API Lưu bài viết (`Save Post`) và Ẩn bài viết (`Hide Post`) khỏi feed của cá nhân.

### 3. 👥 Nhóm học tập (Study Groups)
*   **Nhóm Công khai (Public Group):** Người dùng tham gia tự do và được phê duyệt tự động.
*   **Nhóm Riêng tư (Private Group):** Ẩn toàn bộ bảng tin thảo luận và danh sách thành viên với người ngoài. Chỉ thành viên đã được Admin duyệt mới có quyền truy cập.
*   **Phê duyệt bài viết trong nhóm (Post Moderation):** Hỗ trợ cấu hình duyệt bài viết thủ công bởi Admin nhóm trước khi xuất bản lên bảng tin chung.
*   **Bộ lọc từ cấm của nhóm (Group Banned Words):** Cho phép Admin nhóm tự định nghĩa từ cấm. Nếu bài viết vi phạm, hệ thống tự động chuyển bài viết vào danh sách **Chờ duyệt** (khi ở chế độ Auto) thay vì chặn cứng và từ chối tạo bài viết.

### 4. 🪪 Hồ sơ cá nhân & Tích hợp GitHub
*   **Hồ sơ chi tiết:** Quản lý thông tin MSSV, chuyên ngành, danh sách kỹ năng cá nhân (tags) và mô tả bản thân.
*   **Lưu trữ hình ảnh:** Ảnh đại diện (Avatar) và ảnh bìa (Cover Image) được lưu trữ và tối ưu hóa thông qua **Cloudinary**.
*   **Tích hợp GitHub API:** Tự động lấy danh sách các kho lưu trữ công khai (public repositories) cùng số sao (stars), lượt fork và ngôn ngữ sử dụng dựa trên GitHub Username của người dùng.
*   **Theo dõi (Follow System):** Cơ chế theo dõi chéo giữa các sinh viên để tạo mạng lưới kết nối học tập.

### 5. 💬 Trò chuyện & Gọi Video/Audio trực tuyến (WebRTC & Sockets)
*   **Tin nhắn trực tuyến thời gian thực:** Đồng bộ hóa tin nhắn tức thì sử dụng kết nối **Socket.io**.
*   **Trạng thái người dùng:** Hiển thị trạng thái hoạt động (Online/Offline) và trạng thái đang nhập chữ (*Typing Indicator*) theo thời gian thực.
*   **Gọi Video/Audio ngang hàng (Peer-to-Peer Call):**
    *   Sử dụng **Socket.io** làm kênh truyền tín hiệu (*signaling*).
    *   Khi cuộc gọi được thiết lập, luồng dữ liệu hình ảnh/âm thanh truyền trực tiếp giữa 2 client thông qua **PeerJS (WebRTC)** nhằm giảm tải tối đa băng thông cho máy chủ.
*   **Thông báo đẩy thời gian thực (Real-time Notifications):** Gửi thông báo tức thì cho các tương tác Like, Comment, Yêu cầu nhóm thông qua Socket.io.

### 6. 🛠️ Hệ thống kiểm duyệt nội dung tích hợp AI & Fallback
*   **Kiểm duyệt AI (Mistral AI):** Tự động phân tích ngữ cảnh bài đăng để ngăn chặn các bài viết quảng cáo, cờ bạc cá độ, hoặc nội dung độc hại.
*   **Cơ chế dự phòng cục bộ (Local AI Fallback):** Khi API Mistral AI gặp sự cố (quá giới hạn hoặc lỗi kết nối), backend tự động chuyển sang chế độ quét bằng Regex cục bộ (`checkContentLocalAI`), đảm bảo hệ thống không bị gián đoạn và luôn được bảo vệ.

### 7. 📊 Nhật ký hệ thống & Cơ chế Xóa mềm (System Logs & Soft Delete)
*   **Nhật ký hoạt động (System Logs):** Ghi nhận lịch sử toàn bộ các sự kiện quan trọng (tạo nhóm, kết bạn, bài đăng/bình luận).
*   **Cơ chế Xóa mềm (Soft Delete):** Bài viết bị gỡ bỏ sẽ được cập nhật thuộc tính `isDeleted: true` nhằm giữ tính toàn vẹn dữ liệu cho nhật ký hệ thống. Người dùng bình thường truy cập sẽ nhận lỗi `404`.
*   **Bypass cho Admin:** Admin hệ thống có thể xem lại nội dung gốc của bài đăng đã bị xóa thông qua liên kết đặc biệt trong trang quản trị nhật ký, phục vụ công tác đối chất và kiểm toán.

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
