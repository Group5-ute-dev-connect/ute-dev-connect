require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');


const app = express();

// Cấu hình danh sách Origins được phép truy cập (hỗ trợ nhiều tên miền cách nhau bằng dấu phẩy)
const clientUrlEnv = process.env.CLIENT_URL;
let allowedOrigins = [];

if (clientUrlEnv) {
  allowedOrigins = clientUrlEnv
    .split(',')
    .map(url => url.trim().replace(/\/$/, ''));
} else {
  allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
}

app.use(cors({
  origin: function (origin, callback) {
    // Cho phép các request không có origin (ví dụ: Postman, Mobile App)
    if (!origin) return callback(null, true);
    
    const normalizedOrigin = origin.replace(/\/$/, '');
    
    // Kiểm tra xem origin yêu cầu có thuộc danh sách cho phép hay không
    if (allowedOrigins.includes(normalizedOrigin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    
    // Tự động cho phép localhost khi chạy thử ở môi trường development
    if (process.env.NODE_ENV !== 'production' && (normalizedOrigin.startsWith('http://localhost:') || normalizedOrigin.startsWith('http://127.0.0.1:'))) {
      return callback(null, true);
    }
    
    return callback(null, false);
  },
  credentials: true
}));
connectDB();

app.use(express.json({ limit: '10mb' }));

const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/', (req, res) => {
  res.send('API Mạng xã hội đang chạy trên Database Online!');
});

// Đăng ký routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api', require('./routes/profileRoutes'));
app.use('/api/posts', require('./routes/postRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/groups', require('./routes/groupRoutes'));
app.use('/api/search', require('./routes/searchRoutes'));
app.use('/api/filters', require('./routes/filterRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

const http = require('http');
const socketIO = require('./utils/socketIO');
const { ExpressPeerServer } = require('peer');

const server = http.createServer(app);

// Cấu hình PeerJS Server chạy trực tiếp trên cổng backend 5000
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/'
});
app.use('/peer', peerServer);

const io = socketIO.init(server);

const initSocketHandlers = require('./utils/socketHandlers');
initSocketHandlers(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
});