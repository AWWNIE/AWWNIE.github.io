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
    
    if (!rooms[roomId]) {
      rooms[roomId] = { 
        queue: [], 
        currentVideo: null, 
        users: {},
        readyUsers: new Set(),
        isPaused: false,
        currentTime: 0
      };
    }
    
    rooms[roomId].users[socket.id] = { name: userName, ready: false };
    
    socket.emit("updateQueue", rooms[roomId].queue);
    socket.emit("updateUsers", Object.values(rooms[roomId].users));
    
    if (rooms[roomId].currentVideo) {
      socket.emit("playVideo", {
        videoId: rooms[roomId].currentVideo,
        isPaused: rooms[roomId].isPaused,
        currentTime: rooms[roomId].currentTime
      });
    }
    
    io.to(roomId).emit("updateUsers", Object.values(rooms[roomId].users));
  });

  socket.on("addVideo", ({ roomId, videoId }) => {
    if (!rooms[roomId]) return;
    rooms[roomId].queue.push(videoId);
    io.to(roomId).emit("updateQueue", rooms[roomId].queue);
    
    if (!rooms[roomId].currentVideo) {
      rooms[roomId].currentVideo = videoId;
      rooms[roomId].queue.shift();
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
    
    if (rooms[roomId].queue.length > 0) {
      const nextVideo = rooms[roomId].queue.shift();
      rooms[roomId].currentVideo = nextVideo;
      rooms[roomId].isPaused = false;
      rooms[roomId].currentTime = 0;
      rooms[roomId].readyUsers.clear();
      
      io.to(roomId).emit("playVideo", {
        videoId: nextVideo,
        isPaused: false,
        currentTime: 0
      });
      io.to(roomId).emit("updateQueue", rooms[roomId].queue);
    } else {
      rooms[roomId].currentVideo = null;
      rooms[roomId].readyUsers.clear();
    }
  });

  socket.on("toggleReady", (roomId) => {
    if (!rooms[roomId] || !rooms[roomId].users[socket.id]) return;
    
    const user = rooms[roomId].users[socket.id];
    user.ready = !user.ready;
    
    if (user.ready) {
      rooms[roomId].readyUsers.add(socket.id);
    } else {
      rooms[roomId].readyUsers.delete(socket.id);
    }
    
    io.to(roomId).emit("updateUsers", Object.values(rooms[roomId].users));
    
    const totalUsers = Object.keys(rooms[roomId].users).length;
    const readyCount = rooms[roomId].readyUsers.size;
    
    if (readyCount === totalUsers && totalUsers > 1) {
      io.to(roomId).emit("allReady");
    }
  });

  socket.on("skipVideo", (roomId) => {
    if (!rooms[roomId] || !rooms[roomId].currentVideo) return;
    
    if (rooms[roomId].queue.length > 0) {
      const nextVideo = rooms[roomId].queue.shift();
      rooms[roomId].currentVideo = nextVideo;
      rooms[roomId].isPaused = false;
      rooms[roomId].currentTime = 0;
      rooms[roomId].readyUsers.clear();
      
      io.to(roomId).emit("playVideo", {
        videoId: nextVideo,
        isPaused: false,
        currentTime: 0
      });
      io.to(roomId).emit("updateQueue", rooms[roomId].queue);
    } else {
      rooms[roomId].currentVideo = null;
      rooms[roomId].readyUsers.clear();
      io.to(roomId).emit("videoStopped");
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
      if (rooms[roomId].users[socket.id]) {
        delete rooms[roomId].users[socket.id];
        rooms[roomId].readyUsers.delete(socket.id);
        
        const remainingUsers = Object.keys(rooms[roomId].users).length;
        
        if (remainingUsers === 0) {
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
