const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.get("/", (req, res) => {
  res.send("WatchTogether backend is running!");
});

const rooms = {};

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("joinRoom", (roomId, userName) => {
    socket.join(roomId);
    
    // Always create fresh room if it doesn't exist or is empty
    if (!rooms[roomId] || Object.keys(rooms[roomId].users || {}).length === 0) {
      rooms[roomId] = { 
        queue: [], 
        currentVideo: null,
        users: {},
        readyUsers: new Set(),
        skipVotes: new Set(),
        isPaused: false,
        currentTime: 0
      };
      console.log(`Created fresh room: ${roomId}`);
    }
    
    rooms[roomId].users[socket.id] = { name: userName, ready: false };
    console.log(`User ${userName} (${socket.id}) joined room ${roomId}. Total users: ${Object.keys(rooms[roomId].users).length}`);
    
    // Send current room state to the joining user
    socket.emit("updateQueue", rooms[roomId].queue);
    socket.emit("updateUsers", Object.values(rooms[roomId].users));
    
    // Send current video to new user if one is playing
    if (rooms[roomId].currentVideo) {
      socket.emit("playVideo", {
        videoId: rooms[roomId].currentVideo,
        isPaused: rooms[roomId].isPaused,
        currentTime: rooms[roomId].currentTime
      });
    }
    
    // Notify all users in room about the new user
    io.to(roomId).emit("updateUsers", Object.values(rooms[roomId].users));
  });

  socket.on("addVideo", ({ roomId, videoId }) => {
    if (!rooms[roomId]) {
      console.log(`Room ${roomId} doesn't exist for addVideo`);
      return;
    }
    
    console.log(`Adding video ${videoId} to room ${roomId}`);
    rooms[roomId].queue.push(videoId);
    io.to(roomId).emit("updateQueue", rooms[roomId].queue);
    
    // If no video is currently playing, start this one immediately
    if (!rooms[roomId].currentVideo) {
      rooms[roomId].currentVideo = videoId;
      rooms[roomId].queue.shift(); // Remove from queue since it's now playing
      console.log(`Auto-starting video ${videoId} in room ${roomId}`);
      io.to(roomId).emit("playVideo", {
        videoId: videoId,
        isPaused: false,
        currentTime: 0
      });
      io.to(roomId).emit("updateQueue", rooms[roomId].queue);
    }
  });

  socket.on("videoEnded", (roomId) => {
    if (!rooms[roomId]) return;
    
    console.log(`Video ended in room ${roomId}`);
    
    if (rooms[roomId].queue.length > 0) {
      const nextVideo = rooms[roomId].queue.shift();
      rooms[roomId].currentVideo = nextVideo;
      rooms[roomId].isPaused = false;
      rooms[roomId].currentTime = 0;
      rooms[roomId].readyUsers.clear();
      rooms[roomId].skipVotes.clear();
      
      console.log(`Playing next video ${nextVideo} in room ${roomId}`);
      io.to(roomId).emit("playVideo", {
        videoId: nextVideo,
        isPaused: false,
        currentTime: 0
      });
      io.to(roomId).emit("updateQueue", rooms[roomId].queue);
    } else {
      rooms[roomId].currentVideo = null;
      rooms[roomId].readyUsers.clear();
      rooms[roomId].skipVotes.clear();
      console.log(`No more videos in queue for room ${roomId}`);
    }
  });

  socket.on("toggleReady", (roomId) => {
    if (!rooms[roomId] || !rooms[roomId].users[socket.id]) {
      console.log(`Invalid ready toggle for room ${roomId} or user ${socket.id}`);
      return;
    }
    
    const user = rooms[roomId].users[socket.id];
    user.ready = !user.ready;
    
    if (user.ready) {
      rooms[roomId].readyUsers.add(socket.id);
    } else {
      rooms[roomId].readyUsers.delete(socket.id);
    }
    
    // Update all users about ready states
    io.to(roomId).emit("updateUsers", Object.values(rooms[roomId].users));
    
    const totalUsers = Object.keys(rooms[roomId].users).length;
    const readyCount = rooms[roomId].readyUsers.size;
    
    console.log(`Ready check in room ${roomId}: ${readyCount}/${totalUsers} users ready`);
    
    // Auto-start video when all users are ready and there's a queue
    if (readyCount === totalUsers && totalUsers >= 1 && rooms[roomId].queue.length > 0 && !rooms[roomId].currentVideo) {
      const nextVideo = rooms[roomId].queue.shift();
      rooms[roomId].currentVideo = nextVideo;
      rooms[roomId].isPaused = false;
      rooms[roomId].currentTime = 0;
      rooms[roomId].readyUsers.clear();
      rooms[roomId].skipVotes.clear();
      
      console.log(`Auto-starting video ${nextVideo} in room ${roomId} (all users ready)`);
      io.to(roomId).emit("playVideo", {
        videoId: nextVideo,
        isPaused: false,
        currentTime: 0
      });
      io.to(roomId).emit("updateQueue", rooms[roomId].queue);
      io.to(roomId).emit("allReady");
    } else if (readyCount === totalUsers && totalUsers > 1) {
      io.to(roomId).emit("allReady");
    }
  });

  socket.on("voteSkip", (roomId) => {
    if (!rooms[roomId] || !rooms[roomId].currentVideo || !rooms[roomId].users[socket.id]) {
      console.log(`Invalid skip vote for room ${roomId}`);
      return;
    }
    
    const userName = rooms[roomId].users[socket.id].name;
    
    if (rooms[roomId].skipVotes.has(socket.id)) {
      // Remove vote
      rooms[roomId].skipVotes.delete(socket.id);
      console.log(`${userName} removed skip vote in room ${roomId}`);
      io.to(roomId).emit("skipVoteUpdate", {
        votes: rooms[roomId].skipVotes.size,
        total: Object.keys(rooms[roomId].users).length,
        action: "removed",
        user: userName
      });
    } else {
      // Add vote
      rooms[roomId].skipVotes.add(socket.id);
      console.log(`${userName} voted to skip in room ${roomId}`);
      
      const totalUsers = Object.keys(rooms[roomId].users).length;
      const skipVotes = rooms[roomId].skipVotes.size;
      
      io.to(roomId).emit("skipVoteUpdate", {
        votes: skipVotes,
        total: totalUsers,
        action: "added",
        user: userName
      });
      
      // Check if all users voted to skip
      if (skipVotes === totalUsers) {
        console.log(`Skip vote passed in room ${roomId} (${skipVotes}/${totalUsers})`);
        
        if (rooms[roomId].queue.length > 0) {
          const nextVideo = rooms[roomId].queue.shift();
          rooms[roomId].currentVideo = nextVideo;
          rooms[roomId].isPaused = false;
          rooms[roomId].currentTime = 0;
          rooms[roomId].readyUsers.clear();
          rooms[roomId].skipVotes.clear();
          
          io.to(roomId).emit("playVideo", {
            videoId: nextVideo,
            isPaused: false,
            currentTime: 0
          });
          io.to(roomId).emit("updateQueue", rooms[roomId].queue);
          io.to(roomId).emit("videoSkipped", { reason: "vote" });
        } else {
          rooms[roomId].currentVideo = null;
          rooms[roomId].readyUsers.clear();
          rooms[roomId].skipVotes.clear();
          io.to(roomId).emit("videoStopped");
          io.to(roomId).emit("videoSkipped", { reason: "vote" });
        }
      }
    }
  });

  socket.on("pauseVideo", ({ roomId, currentTime }) => {
    if (!rooms[roomId]) return;
    
    rooms[roomId].isPaused = true;
    rooms[roomId].currentTime = currentTime;
    
    socket.to(roomId).emit("syncPause", currentTime);
  });

  socket.on("playVideo", ({ roomId, currentTime }) => {
    if (!rooms[roomId]) return;
    
    rooms[roomId].isPaused = false;
    rooms[roomId].currentTime = currentTime;
    
    socket.to(roomId).emit("syncPlay", currentTime);
  });

  socket.on("seekVideo", ({ roomId, currentTime }) => {
    if (!rooms[roomId]) return;
    
    rooms[roomId].currentTime = currentTime;
    socket.to(roomId).emit("syncSeek", currentTime);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    
    for (const roomId in rooms) {
      if (rooms[roomId].users && rooms[roomId].users[socket.id]) {
        const userName = rooms[roomId].users[socket.id].name;
        delete rooms[roomId].users[socket.id];
        rooms[roomId].readyUsers.delete(socket.id);
        rooms[roomId].skipVotes.delete(socket.id);
        
        const remainingUsers = Object.keys(rooms[roomId].users).length;
        console.log(`User ${userName} left room ${roomId}. Remaining users: ${remainingUsers}`);
        
        if (remainingUsers === 0) {
          console.log(`Room ${roomId} is empty, cleaning up...`);
          delete rooms[roomId];
        } else {
          io.to(roomId).emit("updateUsers", Object.values(rooms[roomId].users));
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
