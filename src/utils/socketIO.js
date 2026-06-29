const { Server } = require('socket.io');

let ioInstance = null;

const socketIO = {
  init: (server) => {
    ioInstance = new Server(server, {
      cors: {
        origin: '*', // Allow all origin to ease testing
        methods: ['GET', 'POST'],
      },
    });
    return ioInstance;
  },
  getIO: () => {
    if (!ioInstance) {
      throw new Error('Socket.io has not been initialized!');
    }
    return ioInstance;
  }
};

module.exports = socketIO;
