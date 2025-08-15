const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const rooms = new Map();

function createRoom(roomId) {
  return {
    id: roomId,
    users: new Set(),
    currentVideo: null,
    videoState: {
      isPlaying: false,
      currentTime: 0,
      lastUpdate: Date.now()
    },
    queue: [],
    host: null
  };
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-room', () => {
    const roomId = uuidv4().substring(0, 8);
    const room = createRoom(roomId);
    room.host = socket.id;
    rooms.set(roomId, room);
    
    socket.join(roomId);
    socket.roomId = roomId;
    room.users.add(socket.id);
    
    socket.emit('room-created', { roomId, isHost: true });
    console.log(`Room created: ${roomId} by ${socket.id}`);
  });

  socket.on('join-room', (roomId) => {
    let room = rooms.get(roomId);
    
    // Create room if it doesn't exist
    if (!room) {
      room = createRoom(roomId);
      room.host = socket.id;
      rooms.set(roomId, room);
      console.log(`Room ${roomId} created automatically for ${socket.id}`);
    }

    socket.join(roomId);
    socket.roomId = roomId;
    room.users.add(socket.id);

    const isHost = room.host === socket.id;
    socket.emit('room-joined', { 
      roomId, 
      isHost,
      currentVideo: room.currentVideo,
      videoState: room.videoState,
      queue: room.queue,
      userCount: room.users.size
    });

    // Notify ALL users in the room (including the one who just joined) about the updated user count
    io.to(roomId).emit('user-count-updated', { userCount: room.users.size });
    console.log(`User ${socket.id} joined room ${roomId}. Total users: ${room.users.size}`);
  });

  socket.on('load-video', (data) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    room.currentVideo = data.videoId;
    room.videoState = {
      isPlaying: false,
      currentTime: 0,
      lastUpdate: Date.now()
    };

    io.to(socket.roomId).emit('video-loaded', { 
      videoId: data.videoId,
      videoState: room.videoState
    });
    console.log(`Video loaded in room ${socket.roomId}: ${data.videoId}`);
  });

  socket.on('video-play', (data) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    room.videoState = {
      isPlaying: true,
      currentTime: data.currentTime,
      lastUpdate: Date.now()
    };

    console.log(`Video play event from ${socket.id} in room ${socket.roomId}:`, room.videoState);
    socket.to(socket.roomId).emit('video-play', room.videoState);
  });

  socket.on('video-pause', (data) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    room.videoState = {
      isPlaying: false,
      currentTime: data.currentTime,
      lastUpdate: Date.now()
    };

    console.log(`Video pause event from ${socket.id} in room ${socket.roomId}:`, room.videoState);
    socket.to(socket.roomId).emit('video-pause', room.videoState);
  });

  socket.on('video-seek', (data) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    room.videoState = {
      isPlaying: room.videoState.isPlaying,
      currentTime: data.currentTime,
      lastUpdate: Date.now()
    };

    console.log(`Video seek event from ${socket.id} in room ${socket.roomId}:`, room.videoState);
    socket.to(socket.roomId).emit('video-seek', room.videoState);
  });

  socket.on('add-to-queue', (data) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    const queueItem = {
      id: Date.now().toString(),
      videoId: data.videoId,
      title: data.title,
      addedBy: socket.id,
      addedAt: Date.now()
    };

    room.queue.push(queueItem);
    io.to(socket.roomId).emit('queue-updated', { queue: room.queue });
    console.log(`Video added to queue in room ${socket.roomId}: ${data.videoId}`);
  });

  socket.on('remove-from-queue', (data) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    room.queue = room.queue.filter(item => item.id !== data.itemId);
    io.to(socket.roomId).emit('queue-updated', { queue: room.queue });
    console.log(`Video removed from queue in room ${socket.roomId}: ${data.itemId}`);
  });

  socket.on('play-next', () => {
    const room = rooms.get(socket.roomId);
    if (!room || room.queue.length === 0) return;

    const nextVideo = room.queue.shift();
    room.currentVideo = nextVideo.videoId;
    room.videoState = {
      isPlaying: false,
      currentTime: 0,
      lastUpdate: Date.now()
    };

    io.to(socket.roomId).emit('video-loaded', { 
      videoId: nextVideo.videoId,
      videoState: room.videoState
    });
    io.to(socket.roomId).emit('queue-updated', { queue: room.queue });
    console.log(`Playing next video in room ${socket.roomId}: ${nextVideo.videoId}`);
  });

  socket.on('disconnect', () => {
    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) {
        room.users.delete(socket.id);
        
        if (room.host === socket.id && room.users.size > 0) {
          room.host = Array.from(room.users)[0];
          io.to(room.host).emit('host-changed', { isHost: true });
        }
        
        if (room.users.size === 0) {
          rooms.delete(socket.roomId);
          console.log(`Room ${socket.roomId} deleted - no users left`);
        } else {
          // Notify ALL remaining users about the updated user count
          io.to(socket.roomId).emit('user-count-updated', { userCount: room.users.size });
          console.log(`User ${socket.id} left room ${socket.roomId}. Remaining users: ${room.users.size}`);
        }
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});