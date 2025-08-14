// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors()); // Allow cross-origin requests

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for GitHub Pages
    methods: ["GET", "POST"]
  }
});

// Simple message if you open backend URL
app.get("/", (req, res) => {
  res.send("Watch Together backend is running!");
});

// Rooms data
const rooms = {}; // roomId -> { queue: [], currentVideo: null }

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("joinRoom", (roomId, userName) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = { queue: [], currentVideo: null };
    }
    // Send current queue to new user
    socket.emit("updateQueue", rooms[roomId].queue);
  });

  socket.on("addVideo", ({ roomId, videoId }) => {
    if (!rooms[roomId]) return;
    rooms[roomId].queue.push(videoId);
    io.to(roomId).emit("updateQueue", rooms[roomId].queue);

    // Auto-play first video if none is playing
    if (!rooms[roomId].currentVideo) {
      rooms[roomId].currentVideo = videoId;
      io.to(roomId).emit("playVideo", videoId);
    }
  });

  socket.on("videoEnded", (roomId) => {
    if (!rooms[roomId]) return;
    rooms[roomId].queue.shift(); // Remove first video
    const nextVideo = rooms[roomId].queue[0] || null;
    rooms[roomId].currentVideo = nextVideo;
    if (nextVideo) io.to(roomId).emit("playVideo", nextVideo);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
