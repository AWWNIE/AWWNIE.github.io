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
  res.send("Watch Together backend is running!");
});

const rooms = {};

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("joinRoom", (roomId, userName) => {
    socket.join(roomId);
    if (!rooms[roomId]) rooms[roomId] = { queue: [], currentVideo: null };
    socket.emit("updateQueue", rooms[roomId].queue);
  });

  socket.on("addVideo", ({ roomId, videoId }) => {
    if (!rooms[roomId]) return;
    rooms[roomId].queue.push(videoId);
    io.to(roomId).emit("updateQueue", rooms[roomId].queue);
    if (!rooms[roomId].currentVideo) {
      rooms[roomId].currentVideo = videoId;
      io.to(roomId).emit("playVideo", videoId);
    }
  });

  socket.on("videoEnded", (roomId) => {
    if (!rooms[roomId]) return;
    rooms[roomId].queue.shift();
    const nextVideo = rooms[roomId].queue[0] || null;
    rooms[roomId].currentVideo = nextVideo;
    if (nextVideo) io.to(roomId).emit("playVideo", nextVideo);
  });

  socket.on("disconnect", () => console.log("Client disconnected:", socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
