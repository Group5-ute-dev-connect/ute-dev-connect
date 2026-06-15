require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');


const app = express();

connectDB();

app.use(express.json());

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
app.use('/api/admin', require('./routes/adminRoutes'));

const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');

const server = http.createServer(app);

// Cấu hình PeerJS Server chạy trực tiếp trên cổng backend 5000
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/'
});
app.use('/peer', peerServer);

const io = new Server(server, {
  cors: {
    origin: '*', // Tạm thời allow all origin để test frontend dễ dàng
    methods: ['GET', 'POST'],
  },
});

const Message = require('./models/Message');
const Conversation = require('./models/Conversation');

const onlineUsers = {}; // Map userId -> Array of socket.id

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', (conversationId) => {
    socket.join(conversationId);
    console.log(`User ${socket.id} joined room: ${conversationId}`);
  });

  socket.on('setup', (userId) => {
    socket.userId = userId;
    socket.join(userId);
    console.log(`User ${socket.id} setup global room: ${userId}`);

    if (!onlineUsers[userId]) {
      onlineUsers[userId] = [];
    }
    if (!onlineUsers[userId].includes(socket.id)) {
      onlineUsers[userId].push(socket.id);
    }

    // Send current online users list to this user
    socket.emit('get-online-users', Object.keys(onlineUsers));

    // Broadcast to all others that this user is online
    socket.broadcast.emit('user-online', userId);
  });

  socket.on('send_message', async (data) => {
    try {
      const { conversationId, senderId, text, fileUrl, fileName, fileType, codeSnippet } = data;
      
      // Lưu tin nhắn vào DB
      const newMessage = new Message({ 
        conversationId, 
        sender: senderId, 
        text, 
        fileUrl, 
        fileName, 
        fileType, 
        codeSnippet 
      });
      await newMessage.save();

      // Cập nhật lastMessage cho Conversation
      await Conversation.findByIdAndUpdate(conversationId, { lastMessage: newMessage._id });

      // Populate thông tin người gửi để frontend hiển thị
      await newMessage.populate('sender', 'name avatar');

      // Gửi tin nhắn cho tất cả user trong room
      io.to(conversationId).emit('receive_message', newMessage);

      // Gửi thông báo có tin nhắn cho từng participant trong conversation
      // (để người kia nhận được cuộc trò chuyện mới ngay lập tức)
      const conversation = await Conversation.findById(conversationId);
      if (conversation) {
        conversation.participants.forEach(participantId => {
          if (participantId.toString() !== senderId.toString()) {
            io.to(participantId.toString()).emit('receive_message', newMessage);
          }
        });
      }
    } catch (err) {
      console.error('Lỗi khi gửi tin nhắn:', err);
    }
  });

  // --- TYPING & READ RECEIPTS ---
  socket.on('typing', ({ conversationId, userId }) => {
    socket.to(conversationId).emit('typing', { conversationId, userId });
  });

  socket.on('stop-typing', ({ conversationId, userId }) => {
    socket.to(conversationId).emit('stop-typing', { conversationId, userId });
  });

  socket.on('mark-as-read', async ({ conversationId, userId }) => {
    try {
      await Message.updateMany(
        { conversationId, sender: { $ne: userId }, isRead: false },
        { $set: { isRead: true } }
      );
      // Gửi sự kiện cho tất cả mọi người trong phòng chat biết là tin nhắn đã được đọc
      io.to(conversationId).emit('messages-read', { conversationId, userId });
    } catch (err) {
      console.error('Error marking messages as read:', err);
    }
  });

  // --- HỖ TRỢ CUỘC GỌI VIDEO & THOẠI (WebRTC via PeerJS) ---
  socket.on('call-user', (data) => {
    console.log(`[Call] Cuộc gọi từ ${data.callerId} tới ${data.recipientId} (${data.callType})`);
    io.to(data.recipientId).emit('incoming-call', {
      callerId: data.callerId,
      callerName: data.callerName,
      callerAvatar: data.callerAvatar,
      callType: data.callType
    });
  });

  socket.on('answer-call', (data) => {
    console.log(`[Call] Phản hồi cuộc gọi từ ${data.recipientId} tới ${data.callerId}: ${data.status}`);
    io.to(data.callerId).emit('call-response', {
      recipientId: data.recipientId,
      status: data.status
    });
  });

  socket.on('end-call', (data) => {
    console.log(`[Call] Gác máy bởi socket ${socket.id}, thông báo cho ${data.targetId}`);
    io.to(data.targetId).emit('call-ended');
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.userId) {
      const userId = socket.userId;
      if (onlineUsers[userId]) {
        onlineUsers[userId] = onlineUsers[userId].filter(id => id !== socket.id);
        if (onlineUsers[userId].length === 0) {
          delete onlineUsers[userId];
          // Broadcast to all others that this user is offline
          socket.broadcast.emit('user-offline', userId);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
});