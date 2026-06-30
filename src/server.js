require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');


const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
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