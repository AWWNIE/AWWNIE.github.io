const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const https = require("https");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);

// Add error handling
server.on('error', (err) => {
  console.error('Server error:', err);
});

app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).send('Something broke!');
});
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve the main HTML file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API status endpoint
app.get("/api/status", (req, res) => {
  res.json({
    status: "WatchTogether backend is running!",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Test YouTube API key
app.get("/api/test-key", (req, res) => {
  res.json({ 
    hasKey: !!YOUTUBE_API_KEY,
    keyLength: YOUTUBE_API_KEY ? YOUTUBE_API_KEY.length : 0,
    keyPreview: YOUTUBE_API_KEY ? YOUTUBE_API_KEY.substring(0, 10) + '...' : 'No key'
  });
});

// Secure video search endpoint
app.get("/api/search", (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Search query required" });
  }
  
  if (!YOUTUBE_API_KEY) {
    return res.status(500).json({ error: "YouTube API key not configured" });
  }
  
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
  
  console.log(`YouTube API request: ${url.replace(YOUTUBE_API_KEY, 'API_KEY_HIDDEN')}`);
  
  https.get(url, (apiRes) => {
    let data = '';
    
    apiRes.on('data', (chunk) => {
      data += chunk;
    });
    
    apiRes.on('end', () => {
      try {
        const response = JSON.parse(data);
        console.log('YouTube API response:', JSON.stringify(response, null, 2));
        
        if (response.items && response.items.length > 0) {
          const videos = response.items.map(item => ({
            id: item.id.videoId,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails.medium.url,
            description: item.snippet.description
          }));
          console.log(`Found ${videos.length} videos for query: ${query}`);
          res.json({ videos });
        } else {
          console.log(`No videos found for query: ${query}`);
          console.log('API Response:', response);
          res.status(404).json({ error: "No videos found", details: response.error || "Unknown error" });
        }
      } catch (error) {
        console.error('YouTube search parsing error:', error);
        console.log('Raw response data:', data);
        res.status(500).json({ error: "Search failed", details: error.message });
      }
    });
  }).on('error', (error) => {
    res.status(500).json({ error: "Search failed" });
  });
});

// Room invitation endpoint
app.get("/invite/:roomId", (req, res) => {
  const roomId = req.params.roomId;
  const hasRoom = rooms[roomId] && Object.keys(rooms[roomId].users || {}).length > 0;
  
  if (hasRoom) {
    res.redirect(`/?room=${roomId}`);
  } else {
    res.redirect("/?error=room_not_found");
  }
});

const rooms = {};

// YouTube Data API v3 configuration (keep this private)
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Room expiration - auto-delete inactive rooms after 2 hours
const ROOM_EXPIRATION_TIME = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

function cleanupInactiveRooms() {
  const now = Date.now();
  for (const [roomId, room] of Object.entries(rooms)) {
    const userCount = Object.keys(room.users || {}).length;
    const lastActivity = room.lastActivity || room.createdAt || now;
    
    // Delete room if empty for more than 30 minutes OR inactive for more than 2 hours
    const emptyTimeout = userCount === 0 && (now - lastActivity) > (30 * 60 * 1000);
    const inactiveTimeout = (now - lastActivity) > ROOM_EXPIRATION_TIME;
    
    if (emptyTimeout || inactiveTimeout) {
      console.log(`Cleaning up inactive room: ${roomId} (empty: ${userCount === 0}, inactive: ${Math.round((now - lastActivity) / 60000)} minutes)`);
      delete rooms[roomId];
    }
  }
}

// Run cleanup every 15 minutes
setInterval(cleanupInactiveRooms, 15 * 60 * 1000);

// Function to update room activity
function updateRoomActivity(roomId) {
  if (rooms[roomId]) {
    rooms[roomId].lastActivity = Date.now();
  }
}

// Function to update admin status - longest staying user becomes admin
function updateRoomAdmin(roomId) {
  if (!rooms[roomId] || Object.keys(rooms[roomId].users).length === 0) return;
  
  let earliestJoinTime = Infinity;
  let adminSocketId = null;
  
  // Find user with earliest join time
  for (const [socketId, user] of Object.entries(rooms[roomId].users)) {
    if (user.joinTime < earliestJoinTime) {
      earliestJoinTime = user.joinTime;
      adminSocketId = socketId;
    }
  }
  
  // Update admin status
  for (const [socketId, user] of Object.entries(rooms[roomId].users)) {
    const wasAdmin = user.isAdmin;
    user.isAdmin = (socketId === adminSocketId);
    
    if (user.isAdmin && !wasAdmin) {
      console.log(`${user.name} is now admin of room ${roomId}`);
    }
  }
}

// Multi-platform video support
function parseVideoUrl(url) {
  // YouTube
  let match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
  if (match) {
    return { platform: 'youtube', id: match[1], originalUrl: url };
  }
  
  // Vimeo
  match = url.match(/(?:vimeo\.com\/)(\d+)/);
  if (match) {
    return { platform: 'vimeo', id: match[1], originalUrl: url };
  }
  
  // Twitch
  match = url.match(/(?:twitch\.tv\/videos\/)(\d+)/);
  if (match) {
    return { platform: 'twitch', id: match[1], originalUrl: url };
  }
  
  // Direct video ID (assume YouTube)
  if (url.match(/^[a-zA-Z0-9_-]{11}$/)) {
    return { platform: 'youtube', id: url, originalUrl: `https://youtube.com/watch?v=${url}` };
  }
  
  return null;
}

// Function to fetch video information from YouTube API
function fetchVideoInfo(videoId, callback) {
  const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${YOUTUBE_API_KEY}&part=snippet,contentDetails`;
  
  https.get(url, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        if (response.items && response.items.length > 0) {
          const video = response.items[0];
          callback(null, {
            title: video.snippet.title,
            duration: video.contentDetails.duration,
            thumbnail: video.snippet.thumbnails.medium.url,
            channelTitle: video.snippet.channelTitle
          });
        } else {
          callback(new Error("Video not found"), null);
        }
      } catch (error) {
        callback(error, null);
      }
    });
  }).on('error', (error) => {
    callback(error, null);
  });
}

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("checkRoom", (roomId) => {
    const roomExists = rooms[roomId] && Object.keys(rooms[roomId].users || {}).length > 0;
    const hasPassword = roomExists && rooms[roomId].password;
    socket.emit("roomStatus", { exists: roomExists, hasPassword: hasPassword });
  });

  socket.on("createRoom", ({ roomId, userName, password }) => {
    // Check if room already exists with users
    if (rooms[roomId] && Object.keys(rooms[roomId].users || {}).length > 0) {
      socket.emit("roomError", "Room already exists");
      return;
    }

    // Create new room with optional password
    rooms[roomId] = { 
      queue: [], 
      currentVideo: null,
      users: {},
      readyUsers: new Set(),
      skipVotes: new Set(),
      kickVotes: {},
      isPaused: false,
      currentTime: 0,
      password: password || null,
      videoInfoCache: {},
      createdAt: Date.now(),
      lastActivity: Date.now()
    };

    socket.join(roomId);
    rooms[roomId].users[socket.id] = { 
      name: userName, 
      ready: false, 
      joinTime: Date.now(),
      isAdmin: true // First user is admin
    };
    console.log(`User ${userName} created room ${roomId} ${password ? 'with password' : 'without password'} as admin`);
    
    socket.emit("roomJoined", { roomId, isCreator: true });
    socket.emit("updateQueue", { 
      queue: rooms[roomId].queue,
      videoInfoCache: rooms[roomId].videoInfoCache
    });
    socket.emit("updateUsers", Object.values(rooms[roomId].users));
  });

  socket.on("joinRoom", ({ roomId, userName, password }) => {
    // Check if room exists
    if (!rooms[roomId] || Object.keys(rooms[roomId].users || {}).length === 0) {
      socket.emit("roomError", "Room does not exist");
      return;
    }

    // Check password if room has one
    if (rooms[roomId].password && rooms[roomId].password !== password) {
      socket.emit("roomError", "Incorrect password");
      return;
    }

    rooms[roomId].users[socket.id] = { 
      name: userName, 
      ready: false, 
      joinTime: Date.now(),
      isAdmin: false // Joining users are not admin initially
    };
    updateRoomActivity(roomId);
    console.log(`User ${userName} (${socket.id}) joined room ${roomId}. Total users: ${Object.keys(rooms[roomId].users).length}`);
    
    socket.emit("roomJoined", { roomId, isCreator: false });
    
    // Send complete room state to the joining user immediately
    socket.emit("updateQueue", { 
      queue: rooms[roomId].queue,
      videoInfoCache: rooms[roomId].videoInfoCache
    });
    
    socket.emit("updateUsers", Object.values(rooms[roomId].users));
    
    // Send current video state to new user if one is playing
    if (rooms[roomId].currentVideo) {
      const videoKey = rooms[roomId].currentVideo;
      const videoInfo = rooms[roomId].videoInfoCache[videoKey];
      
      // Extract platform and ID from video key
      const [platform, videoId] = videoKey.includes('_') ? videoKey.split('_') : ['youtube', videoKey];
      
      console.log(`Sending current video to ${userName}: ${videoKey} (${platform}:${videoId})`);
      
      // Send immediately, then sync after UI loads
      socket.emit("playVideo", {
        videoId: videoId,
        platform: platform,
        isPaused: rooms[roomId].isPaused,
        currentTime: rooms[roomId].currentTime,
        videoInfo: videoInfo
      });
      
      // Additional sync after a delay to ensure proper loading
      setTimeout(() => {
        if (rooms[roomId] && rooms[roomId].users[socket.id]) {
          socket.emit("syncTime", {
            currentTime: rooms[roomId].currentTime,
            isPaused: rooms[roomId].isPaused
          });
        }
      }, 2000);
    }
    
    // Update admin status after user joins
    updateRoomAdmin(roomId);
    
    // Notify all users in room about the updated user list
    io.to(roomId).emit("updateUsers", Object.values(rooms[roomId].users));
    
    // Send join notification to other users (not the joining user)
    socket.to(roomId).emit("userJoined", { userName });
  });

  socket.on("addVideo", ({ roomId, videoUrl }) => {
    if (!rooms[roomId]) {
      console.log(`Room ${roomId} doesn't exist for addVideo`);
      return;
    }
    
    updateRoomActivity(roomId);
    console.log(`Adding video ${videoUrl} to room ${roomId}`);
    
    // Parse video URL to determine platform and ID
    const videoData = parseVideoUrl(videoUrl);
    if (!videoData) {
      socket.emit("videoError", { message: "Unsupported video URL format" });
      return;
    }
    
    // Only fetch detailed info for YouTube videos
    if (videoData.platform === 'youtube') {
      fetchVideoInfo(videoData.id, (error, videoInfo) => {
        if (error) {
          console.error(`Error fetching video info for ${videoData.id}:`, error);
          socket.emit("videoError", { message: "Could not fetch video information" });
          return;
        }
        
        processVideoAdd(roomId, videoData, videoInfo, socket);
      });
    } else {
      // For non-YouTube platforms, create basic video info
      const basicInfo = {
        title: `${videoData.platform.charAt(0).toUpperCase() + videoData.platform.slice(1)} Video`,
        channelTitle: videoData.platform,
        platform: videoData.platform
      };
      processVideoAdd(roomId, videoData, basicInfo, socket);
    }
  });

  function processVideoAdd(roomId, videoData, videoInfo, socket) {
    if (!rooms[roomId].videoInfoCache) {
      rooms[roomId].videoInfoCache = {};
    }
    
    const videoKey = `${videoData.platform}_${videoData.id}`;
    rooms[roomId].videoInfoCache[videoKey] = { ...videoInfo, ...videoData };
    
    rooms[roomId].queue.push(videoKey);
    io.to(roomId).emit("updateQueue", { 
      queue: rooms[roomId].queue,
      videoInfoCache: rooms[roomId].videoInfoCache
    });
    
    // Notify users about the video being added
    const userName = rooms[roomId].users[socket.id].name;
    io.to(roomId).emit("videoAdded", {
      user: userName,
      videoInfo: { ...videoInfo, ...videoData }
    });
    
    // If no video is currently playing, start this one immediately
    if (!rooms[roomId].currentVideo) {
      rooms[roomId].currentVideo = videoKey;
      rooms[roomId].queue.shift(); // Remove from queue since it's now playing
      console.log(`Auto-starting video ${videoKey} in room ${roomId}`);
      io.to(roomId).emit("playVideo", {
        videoId: videoData.id,
        platform: videoData.platform,
        isPaused: false,
        currentTime: 0,
        videoInfo: { ...videoInfo, ...videoData }
      });
      io.to(roomId).emit("updateQueue", { 
        queue: rooms[roomId].queue,
        videoInfoCache: rooms[roomId].videoInfoCache
      });
    }
  }

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
      
      // Add a small delay to ensure all users are synchronized
      setTimeout(() => {
        io.to(roomId).emit("playVideo", {
          videoId: nextVideo,
          isPaused: false,
          currentTime: 0
        });
        io.to(roomId).emit("updateQueue", rooms[roomId].queue);
        io.to(roomId).emit("allReady");
      }, 1000);
    } else if (readyCount === totalUsers && totalUsers >= 1) {
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

  socket.on("voteKick", ({ roomId, targetUserName }) => {
    if (!rooms[roomId] || !rooms[roomId].users[socket.id]) {
      console.log(`Invalid kick vote for room ${roomId}`);
      return;
    }
    
    // Check if the user requesting the kick is an admin
    if (!rooms[roomId].users[socket.id].isAdmin) {
      socket.emit("kickError", "Only room admin can kick users");
      return;
    }
    
    // Find target user by name
    let targetUserId = null;
    for (const [socketId, user] of Object.entries(rooms[roomId].users)) {
      if (user.name === targetUserName) {
        targetUserId = socketId;
        break;
      }
    }
    
    if (!targetUserId) {
      console.log(`Target user ${targetUserName} not found in room ${roomId}`);
      socket.emit("kickError", "User not found in room");
      return;
    }
    
    const adminName = rooms[roomId].users[socket.id].name;
    const targetName = targetUserName;
    
    // Can't kick yourself
    if (socket.id === targetUserId) {
      socket.emit("kickError", "You cannot kick yourself");
      return;
    }
    
    console.log(`Admin ${adminName} is kicking ${targetName} from room ${roomId}`);
    
    // Remove user from room immediately (admin kick)
    delete rooms[roomId].users[targetUserId];
    rooms[roomId].readyUsers.delete(targetUserId);
    rooms[roomId].skipVotes.delete(targetUserId);
    
    // Clean up any kick votes for this user
    delete rooms[roomId].kickVotes[targetUserId];
    
    // Remove user from socket room and disconnect
    const targetSocket = io.sockets.sockets.get(targetUserId);
    if (targetSocket) {
      targetSocket.leave(roomId);
      targetSocket.emit("kicked", { reason: "admin", room: roomId });
      // Force disconnect after a short delay
      setTimeout(() => {
        targetSocket.disconnect(true);
      }, 1000);
    }
    
    // Update admin status after user removal
    updateRoomAdmin(roomId);
    
    // Notify remaining users
    io.to(roomId).emit("userKicked", { user: targetName, reason: "admin", kickedBy: adminName });
    io.to(roomId).emit("updateUsers", Object.values(rooms[roomId].users));
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

  socket.on("removeFromQueue", ({ roomId, queueIndex }) => {
    if (!rooms[roomId] || !rooms[roomId].users[socket.id]) {
      console.log(`Invalid remove from queue for room ${roomId}`);
      return;
    }

    updateRoomActivity(roomId);
    
    if (queueIndex >= 0 && queueIndex < rooms[roomId].queue.length) {
      const removedVideoId = rooms[roomId].queue[queueIndex];
      const removedVideoInfo = rooms[roomId].videoInfoCache[removedVideoId];
      
      rooms[roomId].queue.splice(queueIndex, 1);
      
      console.log(`Removed video at index ${queueIndex} from room ${roomId}`);
      
      // Notify all users about queue update
      io.to(roomId).emit("updateQueue", { 
        queue: rooms[roomId].queue,
        videoInfoCache: rooms[roomId].videoInfoCache
      });
      
      // Notify about removal
      const userName = rooms[roomId].users[socket.id].name;
      io.to(roomId).emit("videoRemoved", {
        user: userName,
        videoInfo: removedVideoInfo || { title: "Video" }
      });
    }
  });

  socket.on("refreshRoomState", (roomId) => {
    if (!rooms[roomId] || !rooms[roomId].users[socket.id]) {
      console.log(`Invalid refresh room state for ${socket.id} in room ${roomId}`);
      return;
    }

    console.log(`Refreshing room state for ${rooms[roomId].users[socket.id].name} in room ${roomId}`);
    
    // Send complete room state
    socket.emit("updateQueue", { 
      queue: rooms[roomId].queue,
      videoInfoCache: rooms[roomId].videoInfoCache
    });
    
    socket.emit("updateUsers", Object.values(rooms[roomId].users));
    
    // Send current video state if one is playing
    if (rooms[roomId].currentVideo) {
      const videoKey = rooms[roomId].currentVideo;
      const videoInfo = rooms[roomId].videoInfoCache[videoKey];
      const [platform, videoId] = videoKey.includes('_') ? videoKey.split('_') : ['youtube', videoKey];
      
      socket.emit("syncTime", {
        currentTime: rooms[roomId].currentTime,
        isPaused: rooms[roomId].isPaused
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    
    for (const roomId in rooms) {
      if (rooms[roomId].users && rooms[roomId].users[socket.id]) {
        const userName = rooms[roomId].users[socket.id].name;
        delete rooms[roomId].users[socket.id];
        rooms[roomId].readyUsers.delete(socket.id);
        rooms[roomId].skipVotes.delete(socket.id);
        
        // Clean up kick votes involving this user
        Object.keys(rooms[roomId].kickVotes).forEach(targetUserId => {
          if (targetUserId === socket.id) {
            delete rooms[roomId].kickVotes[targetUserId];
          } else {
            rooms[roomId].kickVotes[targetUserId].delete(socket.id);
            if (rooms[roomId].kickVotes[targetUserId].size === 0) {
              delete rooms[roomId].kickVotes[targetUserId];
            }
          }
        });
        
        const remainingUsers = Object.keys(rooms[roomId].users).length;
        console.log(`User ${userName} left room ${roomId}. Remaining users: ${remainingUsers}`);
        
        if (remainingUsers === 0) {
          console.log(`Room ${roomId} is empty, cleaning up...`);
          delete rooms[roomId];
        } else {
          // Update admin status after user leaves
          updateRoomAdmin(roomId);
          
          // Send updated user list to all remaining users
          io.to(roomId).emit("updateUsers", Object.values(rooms[roomId].users));
          // Send leave notification to remaining users
          io.to(roomId).emit("userLeft", { userName });
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`YouTube API Key configured: ${!!process.env.YOUTUBE_API_KEY}`);
});
