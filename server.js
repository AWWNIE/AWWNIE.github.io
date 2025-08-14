const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const https = require("https");

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

// Function to get YouTube video title
async function getVideoTitle(videoId) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'www.googleapis.com',
      port: 443,
      path: `/youtube/v3/videos?part=snippet&id=${videoId}&key=AIzaSyBPLvXVH3vgDbXkUYW-XfO-lCdIKJfFsIo`,
      method: 'GET'
    };

    // Fallback - return video ID if API fails
    const fallback = () => resolve(`Video: ${videoId}`);
    
    try {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.items && response.items[0] && response.items[0].snippet) {
              resolve(response.items[0].snippet.title);
            } else {
              fallback();
            }
          } catch (error) {
            fallback();
          }
        });
      });
      
      req.on('error', fallback);
      req.setTimeout(5000, fallback);
      req.end();
    } catch (error) {
      fallback();
    }
  });
}

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("joinRoom", (roomId, userName) => {
    socket.join(roomId);
    
    // Check if room exists and has users, if not create fresh room
    if (!rooms[roomId] || Object.keys(rooms[roomId].users || {}).length === 0) {
      rooms[roomId] = { 
        queue: [], 
        currentVideo: null, 
        currentVideoTitle: null,
        users: {},
        readyUsers: new Set(),
        skipVotes: new Set(),
        isPaused: false,
        currentTime: 0
      };
    }
    
    rooms[roomId].users[socket.id] = { name: userName, ready: false };
    console.log(`User ${userName} joined room ${roomId}. Total users: ${Object.keys(rooms[roomId].users).length}`);
    
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

  socket.on("addVideo", async ({ roomId, videoId }) => {
    if (!rooms[roomId]) return;
    
    const title = await getVideoTitle(videoId);
    const videoData = { id: videoId, title: title };
    
    rooms[roomId].queue.push(videoData);
    io.to(roomId).emit("updateQueue", rooms[roomId].queue);
    
    if (!rooms[roomId].currentVideo) {
      rooms[roomId].currentVideo = videoId;
      rooms[roomId].currentVideoTitle = title;
      rooms[roomId].queue.shift();
      io.to(roomId).emit("playVideo", {
        videoId: videoId,
        title: title,
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
      rooms[roomId].currentVideo = nextVideo.id;
      rooms[roomId].currentVideoTitle = nextVideo.title;
      rooms[roomId].isPaused = false;
      rooms[roomId].currentTime = 0;
      rooms[roomId].readyUsers.clear();
      rooms[roomId].skipVotes.clear();
      
      io.to(roomId).emit("playVideo", {
        videoId: nextVideo.id,
        title: nextVideo.title,
        isPaused: false,
        currentTime: 0
      });
      io.to(roomId).emit("updateQueue", rooms[roomId].queue);
    } else {
      rooms[roomId].currentVideo = null;
      rooms[roomId].currentVideoTitle = null;
      rooms[roomId].readyUsers.clear();
      rooms[roomId].skipVotes.clear();
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
    
    console.log(`Ready check: ${readyCount}/${totalUsers} users ready in room ${roomId}`);
    
    // Auto-start video when all users are ready (minimum 1 user, but works with 1+ users)
    if (readyCount === totalUsers && totalUsers >= 1 && rooms[roomId].queue.length > 0 && !rooms[roomId].currentVideo) {
      const nextVideo = rooms[roomId].queue.shift();
      rooms[roomId].currentVideo = nextVideo.id;
      rooms[roomId].currentVideoTitle = nextVideo.title;
      rooms[roomId].isPaused = false;
      rooms[roomId].currentTime = 0;
      rooms[roomId].readyUsers.clear();
      rooms[roomId].skipVotes.clear();
      
      console.log(`Auto-starting video ${nextVideo.title} in room ${roomId}`);
      io.to(roomId).emit("playVideo", {
        videoId: nextVideo.id,
        title: nextVideo.title,
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
    if (!rooms[roomId] || !rooms[roomId].currentVideo || !rooms[roomId].users[socket.id]) return;
    
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
        console.log(`Skip vote passed in room ${roomId}`);
        
        if (rooms[roomId].queue.length > 0) {
          const nextVideo = rooms[roomId].queue.shift();
          rooms[roomId].currentVideo = nextVideo.id;
          rooms[roomId].currentVideoTitle = nextVideo.title;
          rooms[roomId].isPaused = false;
          rooms[roomId].currentTime = 0;
          rooms[roomId].readyUsers.clear();
          rooms[roomId].skipVotes.clear();
          
          io.to(roomId).emit("playVideo", {
            videoId: nextVideo.id,
            title: nextVideo.title,
            isPaused: false,
            currentTime: 0
          });
          io.to(roomId).emit("updateQueue", rooms[roomId].queue);
          io.to(roomId).emit("videoSkipped", { reason: "vote" });
        } else {
          rooms[roomId].currentVideo = null;
          rooms[roomId].currentVideoTitle = null;
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
