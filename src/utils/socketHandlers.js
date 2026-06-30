const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

const onlineUsers = {}; // Map userId -> Array of socket.id

const initSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    socket.on('join_room', (conversationId) => {
      socket.join(conversationId);
    });

    socket.on('setup', (userId) => {
      socket.userId = userId;
      socket.join(userId);

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
        io.to(conversationId).emit('messages-read', { conversationId, userId });
      } catch (err) {
        console.error('Error marking messages as read:', err);
      }
    });

    // --- HỖ TRỢ CUỘC GỌI VIDEO & THOẠI (WebRTC via PeerJS) ---
    socket.on('call-user', (data) => {
      io.to(data.recipientId).emit('incoming-call', {
        callerId: data.callerId,
        callerName: data.callerName,
        callerAvatar: data.callerAvatar,
        callType: data.callType
      });
    });

    socket.on('answer-call', (data) => {
      io.to(data.callerId).emit('call-response', {
        recipientId: data.recipientId,
        status: data.status
      });
    });

    socket.on('end-call', (data) => {
      io.to(data.targetId).emit('call-ended');
    });

    socket.on('disconnect', () => {
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
};

module.exports = initSocketHandlers;
