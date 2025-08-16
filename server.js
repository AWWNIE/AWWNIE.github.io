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
  },
  // Enhanced stability settings for Railway deployment
  pingTimeout: 120000,  // 2 minutes - longer for unstable connections
  pingInterval: 30000,  // 30 seconds
  transports: ['polling', 'websocket'], // Prioritize polling for stability
  allowEIO3: true,
  serveClient: true,
  cookie: false,
  connectTimeout: 60000,
  upgradeTimeout: 30000
});

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const rooms = new Map();
const roomDeletionTimers = new Map(); // Track pending room deletions

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
    
    // Cancel any pending deletion for this room
    if (roomDeletionTimers.has(roomId)) {
      clearTimeout(roomDeletionTimers.get(roomId));
      roomDeletionTimers.delete(roomId);
      console.log(`Cancelled scheduled deletion for room ${roomId} - user rejoining`);
    }
    
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
    if (!room) {
      console.log(`Load video failed: Room ${socket.roomId} not found for ${socket.id}`);
      socket.emit('error', 'Room not found - please rejoin the room');
      return;
    }

    room.currentVideo = data.videoId;
    // Reset video state for new video - don't send old state
    room.videoState = {
      isPlaying: false,
      currentTime: 0,
      lastUpdate: Date.now()
    };

    // Send video loaded event WITHOUT video state to prevent override
    io.to(socket.roomId).emit('video-loaded', { 
      videoId: data.videoId
      // Removed videoState to prevent stale state override
    });
    console.log(`Video loaded in room ${socket.roomId}: ${data.videoId}`);
  });

  socket.on('video-play', (data) => {
    const room = rooms.get(socket.roomId);
    if (!room) {
      console.log(`Video play failed: Room ${socket.roomId} not found for ${socket.id}`);
      socket.emit('error', 'Room not found - please rejoin the room');
      return;
    }

    room.videoState = {
      isPlaying: true,
      currentTime: data.currentTime,
      lastUpdate: Date.now()
    };

    console.log(`Video play event from ${socket.id} in room ${socket.roomId}:`, room.videoState);
    // Send to ALL users in room (including sender) with sender ID to prevent loops
    io.to(socket.roomId).emit('video-play', { 
      ...room.videoState, 
      senderId: socket.id 
    });
  });

  socket.on('video-pause', (data) => {
    const room = rooms.get(socket.roomId);
    if (!room) {
      console.log(`Video pause failed: Room ${socket.roomId} not found for ${socket.id}`);
      socket.emit('error', 'Room not found - please rejoin the room');
      return;
    }

    room.videoState = {
      isPlaying: false,
      currentTime: data.currentTime,
      lastUpdate: Date.now()
    };

    console.log(`Video pause event from ${socket.id} in room ${socket.roomId}:`, room.videoState);
    // Send to ALL users in room (including sender) with sender ID to prevent loops
    io.to(socket.roomId).emit('video-pause', { 
      ...room.videoState, 
      senderId: socket.id 
    });
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
    // Send to ALL users in room (including sender) with sender ID to prevent loops
    io.to(socket.roomId).emit('video-seek', { 
      ...room.videoState, 
      senderId: socket.id 
    });
  });

  socket.on('add-to-queue', (data) => {
    const room = rooms.get(socket.roomId);
    if (!room) {
      console.log(`Add to queue failed: Room ${socket.roomId} not found for ${socket.id}`);
      socket.emit('error', 'Room not found');
      return;
    }

    if (!room.users.has(socket.id)) {
      console.log(`Add to queue failed: User ${socket.id} not in room ${socket.roomId}`);
      socket.emit('error', 'Not a member of this room');
      return;
    }

    if (!data.videoId || !data.title) {
      console.log(`Add to queue failed: Invalid data from ${socket.id}`);
      socket.emit('error', 'Invalid video data');
      return;
    }

    const queueItem = {
      id: Date.now().toString() + '_' + socket.id.slice(-4), // More unique ID
      videoId: data.videoId,
      title: data.title,
      addedBy: socket.id,
      addedAt: Date.now()
    };

    room.queue.push(queueItem);
    io.to(socket.roomId).emit('queue-updated', { queue: room.queue });
    console.log(`Video added to queue in room ${socket.roomId}: ${data.videoId} by ${socket.id}`);
  });

  socket.on('remove-from-queue', (data) => {
    const room = rooms.get(socket.roomId);
    if (!room) {
      console.log(`Remove from queue failed: Room ${socket.roomId} not found for ${socket.id}`);
      socket.emit('error', 'Room not found');
      return;
    }

    if (!room.users.has(socket.id)) {
      console.log(`Remove from queue failed: User ${socket.id} not in room ${socket.roomId}`);
      socket.emit('error', 'Not a member of this room');
      return;
    }

    if (!data.itemId) {
      console.log(`Remove from queue failed: No item ID from ${socket.id}`);
      socket.emit('error', 'Invalid item ID');
      return;
    }

    const originalLength = room.queue.length;
    room.queue = room.queue.filter(item => item.id !== data.itemId);
    
    if (room.queue.length === originalLength) {
      console.log(`Remove from queue failed: Item ${data.itemId} not found in room ${socket.roomId}`);
      socket.emit('error', 'Video not found in queue');
      return;
    }

    io.to(socket.roomId).emit('queue-updated', { queue: room.queue });
    console.log(`Video removed from queue in room ${socket.roomId}: ${data.itemId} by ${socket.id}`);
  });

  socket.on('play-next', () => {
    const room = rooms.get(socket.roomId);
    if (!room || room.queue.length === 0) return;

    const nextVideo = room.queue.shift();
    room.currentVideo = nextVideo.videoId;
    // Reset video state for new video from queue
    room.videoState = {
      isPlaying: false,
      currentTime: 0,
      lastUpdate: Date.now()
    };

    // Send video loaded event WITHOUT forcing old state
    io.to(socket.roomId).emit('video-loaded', { 
      videoId: nextVideo.videoId
      // Removed videoState to let video play naturally
    });
    io.to(socket.roomId).emit('queue-updated', { queue: room.queue });
    console.log(`Playing next video in room ${socket.roomId}: ${nextVideo.videoId}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnecting:', socket.id);
    
    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room && room.users.has(socket.id)) {
        console.log(`Removing user ${socket.id} from room ${socket.roomId}`);
        room.users.delete(socket.id);
        
        // Handle host change if needed
        if (room.host === socket.id && room.users.size > 0) {
          room.host = Array.from(room.users)[0];
          console.log(`New host assigned: ${room.host}`);
          io.to(room.host).emit('host-changed', { isHost: true });
        }
        
        if (room.users.size === 0) {
          // Don't delete room immediately - add longer grace period for unstable connections
          console.log(`Room ${socket.roomId} is empty, scheduling deletion in 5 minutes`);
          
          const deletionTimer = setTimeout(() => {
            const currentRoom = rooms.get(socket.roomId);
            if (currentRoom && currentRoom.users.size === 0) {
              rooms.delete(socket.roomId);
              roomDeletionTimers.delete(socket.roomId);
              console.log(`Room ${socket.roomId} deleted after grace period - no users returned`);
            } else {
              console.log(`Room ${socket.roomId} deletion cancelled - users present`);
              roomDeletionTimers.delete(socket.roomId);
            }
          }, 300000); // 5 minute grace period for unstable connections
          
          roomDeletionTimers.set(socket.roomId, deletionTimer);
        } else {
          // Cancel any pending deletion since we still have users
          if (roomDeletionTimers.has(socket.roomId)) {
            clearTimeout(roomDeletionTimers.get(socket.roomId));
            roomDeletionTimers.delete(socket.roomId);
            console.log(`Cancelled deletion for room ${socket.roomId} - users still present`);
          }
          
          // Notify ALL remaining users about the updated user count
          console.log(`Notifying room ${socket.roomId} of user count change: ${room.users.size}`);
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