const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors()); // allow frontend on GitHub Pages

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const rooms = {};

io.on("connection", (socket) => {
  let currentRoom = null;

  socket.on("joinRoom", ({ roomId, name, secret }) => {
    currentRoom = roomId;
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = { queue: [], currentVideo: null };
    }

    io.to(roomId).emit("queueUpdated", rooms[roomId].queue);
    io.to(roomId).emit("currentVideo", rooms[roomId].currentVideo);
  });

  socket.on("addToQueue", ({ videoId, title }) => {
    if (!currentRoom) return;
    rooms[currentRoom].queue.push({ videoId, title });
    io.to(currentRoom).emit("queueUpdated", rooms[currentRoom].queue);
  });

  socket.on("nextFromQueue", () => {
    if (!currentRoom) return;
    const room = rooms[currentRoom];
    const next = room.queue.shift() || null;
    room.currentVideo = next;
    io.to(currentRoom).emit("queueUpdated", room.queue);
    io.to(currentRoom).emit("currentVideo", room.currentVideo);
  });

  socket.on("playVideo", () => {
    if (!currentRoom) return;
    io.to(currentRoom).emit("playVideo");
  });

  socket.on("pauseVideo", () => {
    if (!currentRoom) return;
    io.to(currentRoom).emit("pauseVideo");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
