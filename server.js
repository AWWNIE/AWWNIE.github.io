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

// Stats endpoint for homepage
app.get("/api/stats", (req, res) => {
  let totalUsers = 0;
  let activeRooms = 0;
  
  for (const [roomId, room] of Object.entries(rooms)) {
    const userCount = Object.keys(room.users || {}).length;
    if (userCount > 0) {
      totalUsers += userCount;
      activeRooms++;
    }
  }
  
  res.json({
    totalUsers,
    activeRooms
  });
});

// Enhanced anime search endpoint with multiple sources
app.get("/api/anime/search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Search query required" });
  }
  
  try {
    const searchResults = await searchAnimeFromSources(query);
    res.json({ anime: searchResults });
  } catch (error) {
    console.error('Anime search error:', error.message);
    res.status(500).json({ error: "Anime search failed" });
  }
});

// Enhanced anime popular/trending endpoint
app.get("/api/anime/popular", async (req, res) => {
  try {
    const popularAnime = await getPopularAnime();
    res.json({ anime: popularAnime });
  } catch (error) {
    console.error('Popular anime error:', error.message);
    res.status(500).json({ error: "Failed to get popular anime" });
  }
});

// Search anime from multiple sources
async function searchAnimeFromSources(query) {
  const results = [];
  
  // Source 1: 9anime pattern
  const nineAnimeResults = generate9AnimeResults(query);
  results.push(...nineAnimeResults);
  
  // Source 2: GogoAnime pattern
  const gogoResults = generateGogoAnimeResults(query);
  results.push(...gogoResults);
  
  // Source 3: Zoro.to pattern
  const zoroResults = generateZoroResults(query);
  results.push(...zoroResults);
  
  return results.slice(0, 12); // Limit to 12 results
}

// Generate anime results with proper embed URLs - Updated sources
function generate9AnimeResults(query) {
  const animeDatabase = [
    { title: "Attack on Titan Final Season", slug: "attack-on-titan-final-season", episodes: 24, year: 2023, id: "1735" },
    { title: "Demon Slayer Season 4", slug: "demon-slayer-season-4", episodes: 12, year: 2024, id: "1842" },
    { title: "Jujutsu Kaisen Season 2", slug: "jujutsu-kaisen-season-2", episodes: 23, year: 2023, id: "1756" },
    { title: "One Piece", slug: "one-piece", episodes: 1000, year: 2024, id: "100" },
    { title: "My Hero Academia Season 7", slug: "my-hero-academia-season-7", episodes: 25, year: 2024, id: "1823" },
    { title: "Solo Leveling", slug: "solo-leveling", episodes: 12, year: 2024, id: "1834" },
    { title: "Chainsaw Man", slug: "chainsaw-man", episodes: 12, year: 2022, id: "1699" },
    { title: "Spy x Family Season 2", slug: "spy-x-family-season-2", episodes: 12, year: 2023, id: "1745" },
    { title: "Death Note", slug: "death-note", episodes: 37, year: 2006, id: "1376" },
    { title: "Naruto Shippuden", slug: "naruto-shippuden", episodes: 500, year: 2007, id: "1565" }
  ];
  
  const filtered = animeDatabase.filter(anime => 
    anime.title.toLowerCase().includes(query.toLowerCase())
  );
  
  return filtered.map(anime => ({
    slug: anime.slug,
    title: anime.title,
    episodes: anime.episodes,
    thumbnail: `https://img.zoroto.to/xxrz/250x400/100/01/52/015255c6617c23b9b5b16f4b13b9206a/015255c6617c23b9b5b16f4b13b9206a.jpg`,
    genre: "Action, Adventure",
    year: anime.year,
    source: "9anime",
    embedUrl: `https://9animetv.to/watch/${anime.slug}`,
    directUrl: `https://9animetv.to/watch/${anime.slug}`,
    streamUrl: `https://vidplay.site/e/${anime.id}`,
    url: `9anime://${anime.slug}#ep=1`
  }));
}

function generateGogoAnimeResults(query) {
  const animeDatabase = [
    { title: "Frieren Beyond Journey's End", slug: "frieren-beyond-journeys-end", episodes: 28, year: 2023 },
    { title: "Dandadan", slug: "dandadan", episodes: 12, year: 2024 },
    { title: "Blue Lock Season 2", slug: "blue-lock-season-2", episodes: 14, year: 2024 },
    { title: "Dragon Ball Daima", slug: "dragon-ball-daima", episodes: 20, year: 2024 },
    { title: "Bleach TYBW Part 3", slug: "bleach-tybw-part-3", episodes: 13, year: 2024 },
    { title: "Tokyo Ghoul", slug: "tokyo-ghoul", episodes: 12, year: 2014 }
  ];
  
  const filtered = animeDatabase.filter(anime => 
    anime.title.toLowerCase().includes(query.toLowerCase())
  );
  
  return filtered.map(anime => ({
    slug: anime.slug,
    title: anime.title,
    episodes: anime.episodes,
    thumbnail: `https://gogocdn.net/cover/${anime.slug}.png`,
    genre: "Action, Adventure",
    year: anime.year,
    source: "gogoanime",
    embedUrl: `https://anitaku.so/watch/${anime.slug}`,
    directUrl: `https://anitaku.so/${anime.slug}`,
    streamUrl: `https://mp4upload.com/embed/${anime.slug}-1`,
    url: `gogoanime://${anime.slug}#ep=1`
  }));
}

function generateZoroResults(query) {
  const animeDatabase = [
    { title: "Wind Breaker", slug: "wind-breaker", episodes: 13, year: 2024, id: "19105" },
    { title: "Kaiju No 8", slug: "kaiju-no-8", episodes: 12, year: 2024, id: "19107" },
    { title: "Mushoku Tensei Season 2", slug: "mushoku-tensei-season-2", episodes: 24, year: 2023, id: "18508" },
    { title: "Hell's Paradise", slug: "hells-paradise", episodes: 13, year: 2023, id: "18623" }
  ];
  
  const filtered = animeDatabase.filter(anime => 
    anime.title.toLowerCase().includes(query.toLowerCase())
  );
  
  return filtered.map(anime => ({
    slug: anime.slug,
    title: anime.title,
    episodes: anime.episodes,
    thumbnail: `https://img.zoroto.to/xxrz/250x400/100/17/82/1782c72e1f98bd8739de21ad8e8a7daf/1782c72e1f98bd8739de21ad8e8a7daf.jpg`,
    genre: "Action, Adventure",
    year: anime.year,
    source: "hianime",
    embedUrl: `https://hianime.to/watch/${anime.slug}`,
    directUrl: `https://hianime.to/watch/${anime.slug}`,
    streamUrl: `https://megacloud.tv/embed-2/e-1/${anime.id}`,
    url: `hianime://${anime.slug}#ep=1`
  }));
}

// Get popular anime
async function getPopularAnime() {
  const popularAnime = [
    {
      slug: "attack-on-titan-final-season",
      title: "Attack on Titan Final Season",
      episodes: 24,
      thumbnail: "https://img.zoroto.to/xxrz/250x400/100/01/52/015255c6617c23b9b5b16f4b13b9206a/015255c6617c23b9b5b16f4b13b9206a.jpg",
      genre: "Action, Drama",
      year: 2023,
      source: "9anime",
      embedUrl: "https://9anime.gs/embed/1735",
      url: "9anime://attack-on-titan-final-season#ep=1"
    },
    {
      slug: "demon-slayer-season-4", 
      title: "Demon Slayer Season 4",
      episodes: 12,
      thumbnail: "https://img.zoroto.to/xxrz/250x400/100/54/79/5479d35e25b056c19b5df706c133b4b6/5479d35e25b056c19b5df706c133b4b6.jpg",
      genre: "Action, Supernatural",
      year: 2024,
      source: "9anime",
      embedUrl: "https://9anime.gs/embed/1842",
      url: "9anime://demon-slayer-season-4#ep=1"
    },
    {
      slug: "jujutsu-kaisen-season-2",
      title: "Jujutsu Kaisen Season 2", 
      episodes: 23,
      thumbnail: "https://img.zoroto.to/xxrz/250x400/100/18/b6/18b659332bbfd6b7a6e57bb2cb29e33b/18b659332bbfd6b7a6e57bb2cb29e33b.jpg",
      genre: "Action, Supernatural",
      year: 2023,
      source: "9anime",
      embedUrl: "https://9anime.gs/embed/1756",
      url: "9anime://jujutsu-kaisen-season-2#ep=1"
    },
    {
      slug: "frieren-beyond-journeys-end",
      title: "Frieren Beyond Journey's End",
      episodes: 28,
      thumbnail: "https://gogocdn.net/cover/frieren-beyond-journeys-end.png", 
      genre: "Adventure, Fantasy",
      year: 2023,
      source: "gogoanime",
      embedUrl: "https://gogoanime3.co/embed/frieren-beyond-journeys-end-episode-1",
      url: "gogoanime://frieren-beyond-journeys-end#ep=1"
    },
    {
      slug: "solo-leveling",
      title: "Solo Leveling",
      episodes: 12,
      thumbnail: "https://img.zoroto.to/xxrz/250x400/100/4f/d8/4fd8bb90d4b99b2e55a8276fe35b9f9a/4fd8bb90d4b99b2e55a8276fe35b9f9a.jpg",
      genre: "Action, Fantasy",
      year: 2024,
      source: "zoro",
      embedUrl: "https://hianime.to/embed/19234",
      url: "zoro://solo-leveling#ep=1"
    },
    {
      slug: "one-piece",
      title: "One Piece",
      episodes: 1000,
      thumbnail: "https://img.zoroto.to/xxrz/250x400/100/bcd84731a3eda4f4a306250769675065/bcd84731a3eda4f4a306250769675065.jpg",
      genre: "Adventure, Comedy",
      year: 2024,
      source: "9anime",
      embedUrl: "https://9anime.gs/embed/100",
      url: "9anime://one-piece#ep=1"
    }
  ];
  
  return popularAnime;
}

// Enhanced video URL parsing with anime sources
function parseVideoUrl(url) {
  // 9anime URLs
  let match = url.match(/9anime:\/\/([^#]+)(?:#ep=(\d+))?/);
  if (match) {
    const animeSlug = match[1];
    const episode = match[2] || '1';
    return { 
      platform: 'anime', 
      source: '9anime',
      id: animeSlug, 
      episode: episode,
      originalUrl: url,
      embedUrl: `https://9anime.gs/embed/${animeSlug}-${episode}`,
      directUrl: `https://9anime.gs/watch/${animeSlug}`,
      streamUrl: `https://vidstream.pro/embed/${animeSlug}-${episode}`
    };
  }

  // GogoAnime URLs
  match = url.match(/gogoanime:\/\/([^#]+)(?:#ep=(\d+))?/);
  if (match) {
    const animeSlug = match[1];
    const episode = match[2] || '1';
    return {
      platform: 'anime',
      source: 'gogoanime',
      id: animeSlug,
      episode: episode,
      originalUrl: url,
      embedUrl: `https://gogoanime3.co/embed/${animeSlug}-episode-${episode}`,
      directUrl: `https://gogoanime3.co/${animeSlug}`,
      streamUrl: `https://streamtape.com/e/${animeSlug}-${episode}`
    };
  }

  // Zoro URLs
  match = url.match(/zoro:\/\/([^#]+)(?:#ep=(\d+))?/);
  if (match) {
    const animeSlug = match[1];
    const episode = match[2] || '1';
    return {
      platform: 'anime',
      source: 'zoro',
      id: animeSlug,
      episode: episode,
      originalUrl: url,
      embedUrl: `https://hianime.to/embed/${animeSlug}-${episode}`,
      directUrl: `https://hianime.to/watch/${animeSlug}`,
      streamUrl: `https://megacloud.tv/embed-2/e-1/${animeSlug}-${episode}`
    };
  }

  // Direct anime site URLs - Updated patterns
  match = url.match(/(?:9animetv|anitaku|hianime)\.[\w]+\/(?:watch|embed)\/([^#?]+)(?:[#?]ep[=:]?(\d+))?/);
  if (match) {
    const animeSlug = match[1];
    const episode = match[2] || '1';
    const domain = url.match(/(9animetv|anitaku|hianime)/)[1];
    
    // Map domains to sources
    let source = domain;
    if (domain === '9animetv') source = '9anime';
    if (domain === 'anitaku') source = 'gogoanime';
    
    return {
      platform: 'anime',
      source: source,
      id: animeSlug,
      episode: episode,
      originalUrl: url,
      embedUrl: generateEmbedUrl(source, animeSlug, episode),
      directUrl: url
    };
  }

  // YouTube
  match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
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
  
  // Dailymotion
  match = url.match(/(?:dailymotion\.com\/video\/)([^_\n?]+)/);
  if (match) {
    return { platform: 'dailymotion', id: match[1], originalUrl: url };
  }
  
  // Rumble
  match = url.match(/(?:rumble\.com\/embed\/)?([a-zA-Z0-9]+)/);
  if (match) {
    return { platform: 'rumble', id: match[1], originalUrl: url };
  }
  
  // Direct video ID (assume YouTube)
  if (url.match(/^[a-zA-Z0-9_-]{11}$/)) {
    return { platform: 'youtube', id: url, originalUrl: `https://youtube.com/watch?v=${url}` };
  }
  
  return null;
}

// Generate embed URL based on source - Updated URLs
function generateEmbedUrl(source, animeSlug, episode) {
  switch(source) {
    case '9anime':
      return `https://9animetv.to/watch/${animeSlug}`;
    case 'gogoanime':
      return `https://anitaku.so/watch/${animeSlug}`;
    case 'zoro':
    case 'hianime':
      return `https://hianime.to/watch/${animeSlug}`;
    default:
      return null;
  }
}

// Enhanced anime info creation
function createAnimeInfo(videoData) {
  const animeSlug = videoData.id;
  const episode = videoData.episode;
  const source = videoData.source || '9anime';
  
  // Convert slug to readable title
  const title = animeSlug
    .split('-')
    .map(word => {
      if (word === 'season') return 'Season';
      if (word.match(/^\d+$/)) return word;
      if (word.length <= 2) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
  
  return {
    title: `${title} - Episode ${episode}`,
    channelTitle: source.charAt(0).toUpperCase() + source.slice(1),
    platform: 'anime',
    episode: episode,
    animeTitle: title,
    embedUrl: videoData.embedUrl,
    directUrl: videoData.directUrl,
    streamUrl: videoData.streamUrl,
    source: source,
    thumbnail: getThumbnailUrl(source, animeSlug)
  };
}

// Get thumbnail URL based on source
function getThumbnailUrl(source, animeSlug) {
  switch(source) {
    case '9anime':
    case 'zoro':
      return `https://img.zoroto.to/xxrz/250x400/100/01/52/015255c6617c23b9b5b16f4b13b9206a/015255c6617c23b9b5b16f4b13b9206a.jpg`;
    case 'gogoanime':
      return `https://gogocdn.net/cover/${animeSlug}.png`;
    default:
      return `https://via.placeholder.com/250x400/667eea/ffffff?text=${encodeURIComponent(animeSlug)}`;
  }
}

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
    keyPreview: YOUTUBE_API_KEY ? YOUTUBE_API_KEY.substring(0, 6) + '...' : 'No key'
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
          res.status(404).json({ error: "No videos found", details: response.error ? "API Error" : "Unknown error" });
        }
      } catch (error) {
        console.error('YouTube search parsing error:', error.message);
        res.status(500).json({ error: "Search failed", details: "Parsing error" });
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

// Sync Master Management Functions
function updateSyncMaster(roomId) {
  if (!rooms[roomId] || Object.keys(rooms[roomId].users).length === 0) return;
  
  let currentSyncMaster = null;
  let adminSocketId = null;
  let earliestJoinTime = Infinity;
  let fallbackSocketId = null;
  
  // Find current sync master, admin, and earliest user
  for (const [socketId, user] of Object.entries(rooms[roomId].users)) {
    if (user.isSyncMaster) {
      currentSyncMaster = socketId;
    }
    if (user.isAdmin) {
      adminSocketId = socketId;
    }
    if (user.joinTime < earliestJoinTime) {
      earliestJoinTime = user.joinTime;
      fallbackSocketId = socketId;
    }
  }
  
  // Determine new sync master if current one is gone
  let newSyncMaster = currentSyncMaster;
  if (!currentSyncMaster || !rooms[roomId].users[currentSyncMaster]) {
    // Priority: Admin > Earliest user
    newSyncMaster = adminSocketId || fallbackSocketId;
  }
  
  // Update sync master status
  let syncMasterChanged = false;
  for (const [socketId, user] of Object.entries(rooms[roomId].users)) {
    const wasSyncMaster = user.isSyncMaster;
    user.isSyncMaster = (socketId === newSyncMaster);
    
    if (user.isSyncMaster && !wasSyncMaster) {
      console.log(`${user.name} is now sync master of room ${roomId}`);
      syncMasterChanged = true;
    }
  }
  
  // Notify all users if sync master changed
  if (syncMasterChanged) {
    io.to(roomId).emit("syncMasterChanged", {
      syncMasterId: newSyncMaster,
      syncMasterName: rooms[roomId].users[newSyncMaster]?.name
    });
    
    // Notify the new sync master specifically
    if (newSyncMaster) {
      io.to(newSyncMaster).emit("syncMasterChanged", { isSyncMaster: true });
    }
  }
  
  return newSyncMaster;
}

// Enhanced automatic anime sync assistance
function startAnimeSyncAssistance(roomId) {
  if (!rooms[roomId] || !rooms[roomId].animeSettings.syncAssistance) return;
  
  rooms[roomId].animeSync.currentEpisodeStart = Date.now();
  rooms[roomId].animeSync.participantTimestamps.clear();
  
  // Send sync assistance start notification
  io.to(roomId).emit("animeSyncStart", {
    startTime: Date.now(),
    message: "Episode started - automatic sync active"
  });
  
  // Start automatic anime sync master system
  startAutomaticAnimeSyncMaster(roomId);
}

// Enhanced automatic anime sync master system
function startAutomaticAnimeSyncMaster(roomId) {
  if (!rooms[roomId]) return;
  
  // Clear any existing anime sync interval
  if (rooms[roomId].animeSync.syncCheckInterval) {
    clearInterval(rooms[roomId].animeSync.syncCheckInterval);
  }
  
  // Initialize anime sync state
  rooms[roomId].animeSync.masterState = {
    currentTime: 0,
    isPaused: false,
    lastUpdate: Date.now(),
    episodeStartTime: Date.now(),
    playbackRate: 1.0
  };
  
  // Start automatic sync broadcasting (every 1 second for precise anime sync)
  rooms[roomId].animeSync.syncCheckInterval = setInterval(() => {
    if (rooms[roomId] && rooms[roomId].currentVideo) {
      broadcastAutomaticAnimeSyncState(roomId);
    } else {
      clearInterval(rooms[roomId].animeSync.syncCheckInterval);
    }
  }, 1000);
  
  console.log(`Started automatic anime sync master for room ${roomId}`);
}

// Broadcast anime sync state automatically from master
function broadcastAutomaticAnimeSyncState(roomId) {
  if (!rooms[roomId] || !rooms[roomId].animeSync.masterState) return;
  
  const syncMaster = rooms[roomId].syncState.syncMaster;
  if (!syncMaster || !rooms[roomId].users[syncMaster]) return;
  
  // Calculate current time based on episode start
  const episodeStart = rooms[roomId].animeSync.masterState.episodeStartTime;
  const now = Date.now();
  
  let estimatedTime;
  if (rooms[roomId].animeSync.masterState.isPaused) {
    estimatedTime = rooms[roomId].animeSync.masterState.currentTime;
  } else {
    estimatedTime = (now - episodeStart) / 1000;
  }
  
  // Update master state
  rooms[roomId].animeSync.masterState.currentTime = estimatedTime;
  rooms[roomId].animeSync.masterState.lastUpdate = now;
  
  // Broadcast to all users in room
  io.to(roomId).emit("animeAutoSync", {
    currentTime: estimatedTime,
    isPaused: rooms[roomId].animeSync.masterState.isPaused,
    timestamp: now,
    episodeStartTime: episodeStart,
    masterTime: estimatedTime,
    playbackRate: rooms[roomId].animeSync.masterState.playbackRate
  });
}

// Handle automatic anime state updates from master
function handleAnimeAutoStateUpdate(socket, { roomId, isPaused, currentTime, event }) {
  if (!rooms[roomId] || !rooms[roomId].users[socket.id]?.isSyncMaster) return;
  
  const now = Date.now();
  
  if (rooms[roomId].animeSync.masterState) {
    const masterState = rooms[roomId].animeSync.masterState;
    
    switch(event) {
      case 'pause':
        masterState.isPaused = true;
        masterState.currentTime = currentTime;
        console.log(`Anime paused at ${currentTime}s in room ${roomId}`);
        break;
        
      case 'play':
        if (masterState.isPaused) {
          masterState.isPaused = false;
          masterState.episodeStartTime = now - (currentTime * 1000);
          console.log(`Anime resumed at ${currentTime}s in room ${roomId}`);
        }
        break;
        
      case 'seek':
        masterState.currentTime = currentTime;
        masterState.episodeStartTime = now - (currentTime * 1000);
        console.log(`Anime seeked to ${currentTime}s in room ${roomId}`);
        break;
        
      case 'timeupdate':
        if (!masterState.isPaused) {
          masterState.currentTime = currentTime;
          masterState.episodeStartTime = now - (currentTime * 1000);
        }
        break;
    }
    
    masterState.lastUpdate = now;
  }
}

// Enhanced auto-progression with automatic sync
function tryAutoProgressAnime(roomId, currentVideoInfo) {
  if (!currentVideoInfo || currentVideoInfo.platform !== 'anime') return null;
  
  const currentEpisode = parseInt(currentVideoInfo.episode) || 1;
  const nextEpisode = currentEpisode + 1;
  
  // Create next episode info based on source
  const source = currentVideoInfo.source || '9anime';
  const nextVideoData = {
    platform: 'anime',
    source: source,
    id: currentVideoInfo.id,
    episode: nextEpisode.toString(),
    embedUrl: generateEmbedUrl(source, currentVideoInfo.id, nextEpisode.toString()),
    directUrl: currentVideoInfo.directUrl
  };
  
  const nextVideoInfo = {
    title: currentVideoInfo.animeTitle ? `${currentVideoInfo.animeTitle} - Episode ${nextEpisode}` : `Episode ${nextEpisode}`,
    channelTitle: source.charAt(0).toUpperCase() + source.slice(1),
    platform: 'anime',
    episode: nextEpisode.toString(),
    animeTitle: currentVideoInfo.animeTitle,
    embedUrl: nextVideoData.embedUrl,
    directUrl: nextVideoData.directUrl,
    source: source
  };
  
  const videoKey = `anime_${source}_${currentVideoInfo.id}_ep${nextEpisode}`;
  
  // Add to cache
  rooms[roomId].videoInfoCache[videoKey] = { ...nextVideoInfo, ...nextVideoData };
  
  return {
    videoKey: videoKey,
    title: nextVideoInfo.title,
    videoInfo: nextVideoInfo
  };
}

// Helper function to parse video keys
function parseVideoKey(videoKey) {
  if (videoKey.startsWith('anime_')) {
    // Format: anime_source_animeSlug_epX
    const parts = videoKey.split('_');
    const episode = parts[parts.length - 1].replace('ep', '');
    const source = parts[1];
    const id = parts.slice(2, -1).join('_');
    return { platform: 'anime', source: source, id: id, episode: episode };
  } else {
    // Format: platform_id
    const [platform, ...idParts] = videoKey.split('_');
    return { platform: platform, id: idParts.join('_') };
  }
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
        console.error('Video info parsing error:', error.message);
        callback(error, null);
      }
    });
  }).on('error', (error) => {
    console.error('Video info request error:', error.message);
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
      lastActivity: Date.now(),
      syncState: {
        lastHeartbeat: Date.now(),
        syncMaster: null
      },
      animeSettings: {
        autoProgression: true,
        syncAssistance: true,
        watchHistory: true
      },
      animeSync: {
        currentEpisodeStart: null,
        syncCheckInterval: null,
        participantTimestamps: new Map(),
        masterState: null
      }
    };

    socket.join(roomId);
    rooms[roomId].users[socket.id] = { 
      name: userName, 
      ready: false, 
      joinTime: Date.now(),
      isAdmin: true,
      isSyncMaster: true
    };
    
    rooms[roomId].syncState.syncMaster = socket.id;
    
    console.log(`User ${userName} created room ${roomId} ${password ? 'with password' : 'without password'} as admin and sync master`);
    
    socket.emit("roomJoined", { roomId, isCreator: true });
    socket.emit("syncMasterChanged", { isSyncMaster: true });
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

    socket.join(roomId);
    rooms[roomId].users[socket.id] = { 
      name: userName, 
      ready: false, 
      joinTime: Date.now(),
      isAdmin: false,
      isSyncMaster: false
    };
    
    updateRoomActivity(roomId);
    console.log(`User ${userName} (${socket.id}) joined room ${roomId}. Total users: ${Object.keys(rooms[roomId].users).length}`);
    
    socket.emit("roomJoined", { roomId, isCreator: false });
    
    socket.emit("updateQueue", { 
      queue: rooms[roomId].queue,
      videoInfoCache: rooms[roomId].videoInfoCache
    });
    
    socket.emit("updateUsers", Object.values(rooms[roomId].users));
    
    // Send current video state to new user if one is playing
    if (rooms[roomId].currentVideo) {
      const videoKey = rooms[roomId].currentVideo;
      const videoInfo = rooms[roomId].videoInfoCache[videoKey];
      const parsedKey = parseVideoKey(videoKey);
      
      console.log(`Sending current video to ${userName}: ${videoKey} (${parsedKey.platform})`);
      
      let playData = {
        isPaused: rooms[roomId].isPaused,
        currentTime: rooms[roomId].currentTime,
        videoInfo: videoInfo
      };

      if (parsedKey.platform === 'anime') {
        playData.videoId = parsedKey.id;
        playData.platform = 'anime';
        playData.episode = parsedKey.episode;
        playData.source = parsedKey.source;
        playData.embedUrl = videoInfo?.embedUrl;
        playData.directUrl = videoInfo?.directUrl;
        playData.streamUrl = videoInfo?.streamUrl;
      } else {
        playData.videoId = parsedKey.id;
        playData.platform = parsedKey.platform;
      }
      
      socket.emit("playVideo", playData);
      
      setTimeout(() => {
        if (rooms[roomId] && rooms[roomId].users[socket.id]) {
          socket.emit("syncHeartbeat", {
            currentTime: rooms[roomId].currentTime,
            isPaused: rooms[roomId].isPaused,
            timestamp: Date.now()
          });
        }
      }, 2000);
    }
    
    updateRoomAdmin(roomId);
    updateSyncMaster(roomId);
    
    io.to(roomId).emit("updateUsers", Object.values(rooms[roomId].users));
    socket.to(roomId).emit("userJoined", { userName });
  });

  // Anime auto state update handler
  socket.on("animeAutoStateUpdate", (data) => {
    handleAnimeAutoStateUpdate(socket, data);
  });

  // Anime heartbeat handler
  socket.on("animeHeartbeat", ({ roomId, isAlive, estimatedTime }) => {
    if (!rooms[roomId] || !rooms[roomId].users[socket.id]) return;
    
    const userId = socket.id;
    const userName = rooms[roomId].users[userId].name;
    
    if (!rooms[roomId].animeSync.participantTimestamps) {
      rooms[roomId].animeSync.participantTimestamps = new Map();
    }
    
    rooms[roomId].animeSync.participantTimestamps.set(userId, {
      lastSeen: Date.now(),
      estimatedTime: estimatedTime,
      isAlive: isAlive,
      userName: userName
    });
    
    // Clean up old heartbeats (older than 30 seconds)
    const cutoff = Date.now() - 30000;
    for (const [id, data] of rooms[roomId].animeSync.participantTimestamps.entries()) {
      if (data.lastSeen < cutoff) {
        rooms[roomId].animeSync.participantTimestamps.delete(id);
      }
    }
  });

  socket.on("addVideo", ({ roomId, videoUrl }) => {
    if (!rooms[roomId]) {
      console.log(`Room ${roomId} doesn't exist for addVideo`);
      socket.emit("videoError", { message: "Room not found. Please rejoin the room." });
      return;
    }
    
    if (!videoUrl || typeof videoUrl !== 'string' || videoUrl.trim() === '') {
      socket.emit("videoError", { message: "Please provide a valid video URL." });
      return;
    }
    
    updateRoomActivity(roomId);
    console.log(`Adding video ${videoUrl} to room ${roomId}`);
    
    const videoData = parseVideoUrl(videoUrl.trim());
    if (!videoData) {
      socket.emit("videoError", { message: "Unsupported video URL format. Supports YouTube, Vimeo, Twitch, Dailymotion, Rumble, and Anime URLs." });
      return;
    }
    
    if (videoData.platform === 'youtube') {
      if (!YOUTUBE_API_KEY) {
        // Fallback: Use basic info when API key is not available
        const basicVideoInfo = {
          title: `YouTube Video (${videoData.id})`,
          channelTitle: "YouTube",
          platform: "youtube",
          thumbnail: `https://img.youtube.com/vi/${videoData.id}/maxresdefault.jpg`
        };
        processVideoAdd(roomId, videoData, basicVideoInfo, socket);
        return;
      }
      
      fetchVideoInfo(videoData.id, (error, videoInfo) => {
        if (error) {
          console.error(`Error fetching video info for ${videoData.id}:`, error);
          // Fallback to basic info on error
          const basicVideoInfo = {
            title: `YouTube Video (${videoData.id})`,
            channelTitle: "YouTube",
            platform: "youtube",
            thumbnail: `https://img.youtube.com/vi/${videoData.id}/maxresdefault.jpg`
          };
          processVideoAdd(roomId, videoData, basicVideoInfo, socket);
          return;
        }
        
        processVideoAdd(roomId, videoData, videoInfo, socket);
      });
    } else if (videoData.platform === 'anime') {
      const animeInfo = createAnimeInfo(videoData);
      processVideoAdd(roomId, videoData, animeInfo, socket);
    } else {
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
    
    let videoKey;
    if (videoData.platform === 'anime') {
      videoKey = `anime_${videoData.source}_${videoData.id}_ep${videoData.episode}`;
    } else {
      videoKey = `${videoData.platform}_${videoData.id}`;
    }
    
    rooms[roomId].videoInfoCache[videoKey] = { ...videoInfo, ...videoData };
    
    rooms[roomId].queue.push(videoKey);
    io.to(roomId).emit("updateQueue", { 
      queue: rooms[roomId].queue,
      videoInfoCache: rooms[roomId].videoInfoCache
    });
    
    const userName = rooms[roomId].users[socket.id].name;
    io.to(roomId).emit("videoAdded", {
      user: userName,
      videoInfo: { ...videoInfo, ...videoData }
    });
    
    // If no video is currently playing, start this one immediately
    if (!rooms[roomId].currentVideo) {
      rooms[roomId].currentVideo = videoKey;
      rooms[roomId].queue.shift();
      rooms[roomId].currentTime = 0;
      rooms[roomId].isPaused = false;
      
      console.log(`Auto-starting video ${videoKey} in room ${roomId}`);
      
      let playData = {
        isPaused: false,
        currentTime: 0,
        videoInfo: { ...videoInfo, ...videoData }
      };

      if (videoData.platform === 'anime') {
        playData.videoId = videoData.id;
        playData.platform = 'anime';
        playData.episode = videoData.episode;
        playData.source = videoData.source;
        playData.embedUrl = videoData.embedUrl;
        playData.directUrl = videoData.directUrl;
        playData.streamUrl = videoData.streamUrl;
      } else {
        playData.videoId = videoData.id;
        playData.platform = videoData.platform;
      }

      io.to(roomId).emit("playVideo", playData);
      io.to(roomId).emit("updateQueue", { 
        queue: rooms[roomId].queue,
        videoInfoCache: rooms[roomId].videoInfoCache
      });
    }
  }

  socket.on("videoEnded", (roomId) => {
    if (!rooms[roomId]) return;
    
    console.log(`Video ended in room ${roomId}`);
    
    const currentVideoKey = rooms[roomId].currentVideo;
    const currentVideoInfo = rooms[roomId].videoInfoCache[currentVideoKey];
    
    // Handle anime auto-progression
    if (currentVideoInfo && currentVideoInfo.platform === 'anime' && rooms[roomId].animeSettings.autoProgression) {
      const nextEpisode = tryAutoProgressAnime(roomId, currentVideoInfo);
      if (nextEpisode) {
        console.log(`Auto-progressing to next episode: ${nextEpisode.title}`);
        rooms[roomId].queue.unshift(nextEpisode.videoKey);
        
        io.to(roomId).emit("autoProgression", {
          currentEpisode: currentVideoInfo.title,
          nextEpisode: nextEpisode.title,
          autoAdded: true
        });
      }
    }
    
    if (rooms[roomId].queue.length > 0) {
      const nextVideo = rooms[roomId].queue.shift();
      rooms[roomId].currentVideo = nextVideo;
      rooms[roomId].isPaused = false;
      rooms[roomId].currentTime = 0;
      rooms[roomId].readyUsers.clear();
      rooms[roomId].skipVotes.clear();
      
      console.log(`Playing next video ${nextVideo} in room ${roomId}`);
      
      const videoInfo = rooms[roomId].videoInfoCache[nextVideo];
      const parsedKey = parseVideoKey(nextVideo);
      
      let playData = {
        isPaused: false,
        currentTime: 0,
        videoInfo: videoInfo
      };

      if (parsedKey.platform === 'anime') {
        playData.videoId = parsedKey.id;
        playData.platform = 'anime';
        playData.episode = parsedKey.episode;
        playData.source = parsedKey.source;
        playData.embedUrl = videoInfo?.embedUrl;
        playData.directUrl = videoInfo?.directUrl;
        playData.streamUrl = videoInfo?.streamUrl;
        
        startAnimeSyncAssistance(roomId);
      } else {
        playData.videoId = parsedKey.id;
        playData.platform = parsedKey.platform;
      }

      io.to(roomId).emit("playVideo", playData);
      io.to(roomId).emit("updateQueue", { 
        queue: rooms[roomId].queue,
        videoInfoCache: rooms[roomId].videoInfoCache
      });
    } else {
      rooms[roomId].currentVideo = null;
      rooms[roomId].readyUsers.clear();
      rooms[roomId].skipVotes.clear();
      console.log(`No more videos in queue for room ${roomId}`);
    }
  });

  // Other socket handlers remain the same...
  socket.on("syncHeartbeat", ({ roomId, currentTime, isPaused, timestamp }) => {
    if (!rooms[roomId] || !rooms[roomId].users[socket.id] || !rooms[roomId].users[socket.id].isSyncMaster) {
      return;
    }
    
    rooms[roomId].currentTime = currentTime;
    rooms[roomId].isPaused = isPaused;
    rooms[roomId].syncState.lastHeartbeat = Date.now();
    
    socket.to(roomId).emit("syncHeartbeat", {
      currentTime,
      isPaused,
      timestamp
    });
  });

  socket.on("requestSync", ({ roomId }) => {
    if (!rooms[roomId]) return;
    
    const syncMaster = rooms[roomId].syncState.syncMaster;
    if (syncMaster && rooms[roomId].users[syncMaster]) {
      io.to(syncMaster).emit("syncRequest", { requesterId: socket.id });
      
      socket.emit("syncResponse", {
        currentTime: rooms[roomId].currentTime,
        isPaused: rooms[roomId].isPaused,
        timestamp: Date.now()
      });
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
    
    io.to(roomId).emit("updateUsers", Object.values(rooms[roomId].users));
    
    const totalUsers = Object.keys(rooms[roomId].users).length;
    const readyCount = rooms[roomId].readyUsers.size;
    
    console.log(`Ready check in room ${roomId}: ${readyCount}/${totalUsers} users ready`);
    
    if (readyCount === totalUsers && totalUsers >= 1 && rooms[roomId].queue.length > 0 && !rooms[roomId].currentVideo) {
      const nextVideo = rooms[roomId].queue.shift();
      rooms[roomId].currentVideo = nextVideo;
      rooms[roomId].isPaused = false;
      rooms[roomId].currentTime = 0;
      rooms[roomId].readyUsers.clear();
      rooms[roomId].skipVotes.clear();
      
      console.log(`Auto-starting video ${nextVideo} in room ${roomId} (all users ready)`);
      
      const videoInfo = rooms[roomId].videoInfoCache[nextVideo];
      const parsedKey = parseVideoKey(nextVideo);
      
      let playData = {
        isPaused: false,
        currentTime: 0,
        videoInfo: videoInfo
      };

      if (parsedKey.platform === 'anime') {
        playData.videoId = parsedKey.id;
        playData.platform = 'anime';
        playData.episode = parsedKey.episode;
        playData.source = parsedKey.source;
        playData.embedUrl = videoInfo?.embedUrl;
        playData.directUrl = videoInfo?.directUrl;
        playData.streamUrl = videoInfo?.streamUrl;
      } else {
        playData.videoId = parsedKey.id;
        playData.platform = parsedKey.platform;
      }
      
      setTimeout(() => {
        io.to(roomId).emit("playVideo", playData);
        io.to(roomId).emit("updateQueue", { 
          queue: rooms[roomId].queue,
          videoInfoCache: rooms[roomId].videoInfoCache
        });
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
      rooms[roomId].skipVotes.delete(socket.id);
      console.log(`${userName} removed skip vote in room ${roomId}`);
      io.to(roomId).emit("skipVoteUpdate", {
        votes: rooms[roomId].skipVotes.size,
        total: Object.keys(rooms[roomId].users).length,
        action: "removed",
        user: userName
      });
    } else {
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
      
      if (skipVotes === totalUsers) {
        console.log(`Skip vote passed in room ${roomId} (${skipVotes}/${totalUsers})`);
        
        if (rooms[roomId].queue.length > 0) {
          const nextVideo = rooms[roomId].queue.shift();
          rooms[roomId].currentVideo = nextVideo;
          rooms[roomId].isPaused = false;
          rooms[roomId].currentTime = 0;
          rooms[roomId].readyUsers.clear();
          rooms[roomId].skipVotes.clear();
          
          const videoInfo = rooms[roomId].videoInfoCache[nextVideo];
          const parsedKey = parseVideoKey(nextVideo);
          
          let playData = {
            isPaused: false,
            currentTime: 0,
            videoInfo: videoInfo
          };

          if (parsedKey.platform === 'anime') {
            playData.videoId = parsedKey.id;
            playData.platform = 'anime';
            playData.episode = parsedKey.episode;
            playData.source = parsedKey.source;
            playData.embedUrl = videoInfo?.embedUrl;
            playData.directUrl = videoInfo?.directUrl;
            playData.streamUrl = videoInfo?.streamUrl;
          } else {
            playData.videoId = parsedKey.id;
            playData.platform = parsedKey.platform;
          }
          
          io.to(roomId).emit("playVideo", playData);
          io.to(roomId).emit("updateQueue", { 
            queue: rooms[roomId].queue,
            videoInfoCache: rooms[roomId].videoInfoCache
          });
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
    
    if (!rooms[roomId].users[socket.id].isAdmin) {
      socket.emit("kickError", "Only room admin can kick users");
      return;
    }
    
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
    
    if (socket.id === targetUserId) {
      socket.emit("kickError", "You cannot kick yourself");
      return;
    }
    
    console.log(`Admin ${adminName} is kicking ${targetName} from room ${roomId}`);
    
    delete rooms[roomId].users[targetUserId];
    rooms[roomId].readyUsers.delete(targetUserId);
    rooms[roomId].skipVotes.delete(targetUserId);
    
    delete rooms[roomId].kickVotes[targetUserId];
    
    const targetSocket = io.sockets.sockets.get(targetUserId);
    if (targetSocket) {
      targetSocket.leave(roomId);
      targetSocket.emit("kicked", { reason: "admin", room: roomId });
      setTimeout(() => {
        targetSocket.disconnect(true);
      }, 1000);
    }
    
    updateRoomAdmin(roomId);
    updateSyncMaster(roomId);
    
    io.to(roomId).emit("userKicked", { user: targetName, reason: "admin", kickedBy: adminName });
    io.to(roomId).emit("updateUsers", Object.values(rooms[roomId].users));
  });

  socket.on("pauseVideo", ({ roomId, currentTime }) => {
    if (!rooms[roomId] || !rooms[roomId].users[socket.id]?.isSyncMaster) return;
    
    rooms[roomId].isPaused = true;
    rooms[roomId].currentTime = currentTime;
    
    socket.to(roomId).emit("syncPause", currentTime);
  });

  socket.on("playVideo", ({ roomId, currentTime }) => {
    if (!rooms[roomId] || !rooms[roomId].users[socket.id]?.isSyncMaster) return;
    
    rooms[roomId].isPaused = false;
    rooms[roomId].currentTime = currentTime;
    
    socket.to(roomId).emit("syncPlay", currentTime);
  });

  socket.on("seekVideo", ({ roomId, currentTime }) => {
    if (!rooms[roomId] || !rooms[roomId].users[socket.id]?.isSyncMaster) return;
    
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
      
      io.to(roomId).emit("updateQueue", { 
        queue: rooms[roomId].queue,
        videoInfoCache: rooms[roomId].videoInfoCache
      });
      
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
    
    socket.emit("updateQueue", { 
      queue: rooms[roomId].queue,
      videoInfoCache: rooms[roomId].videoInfoCache
    });
    
    socket.emit("updateUsers", Object.values(rooms[roomId].users));
    
    if (rooms[roomId].currentVideo) {
      const videoKey = rooms[roomId].currentVideo;
      const videoInfo = rooms[roomId].videoInfoCache[videoKey];
      const parsedKey = parseVideoKey(videoKey);
      
      socket.emit("syncTime", {
        currentTime: rooms[roomId].currentTime,
        isPaused: rooms[roomId].isPaused
      });
    }
    
    const user = rooms[roomId].users[socket.id];
    if (user.isSyncMaster) {
      socket.emit("syncMasterChanged", { isSyncMaster: true });
    }
  });

  socket.on("updateRoomSettings", ({ roomId, settings }) => {
    if (!rooms[roomId] || !rooms[roomId].users[socket.id]) return;
    
    if (!rooms[roomId].users[socket.id].isAdmin) {
      socket.emit("settingsError", "Only room admin can update settings");
      return;
    }
    
    if (settings.animeSettings) {
      Object.assign(rooms[roomId].animeSettings, settings.animeSettings);
      console.log(`Room ${roomId} anime settings updated:`, settings.animeSettings);
    }
    
    io.to(roomId).emit("roomSettingsUpdated", {
      animeSettings: rooms[roomId].animeSettings
    });
  });

  socket.on("getRoomSettings", (roomId) => {
    if (!rooms[roomId] || !rooms[roomId].users[socket.id]) return;
    
    socket.emit("roomSettings", {
      animeSettings: rooms[roomId].animeSettings
    });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    
    for (const roomId in rooms) {
      if (rooms[roomId].users && rooms[roomId].users[socket.id]) {
        const userName = rooms[roomId].users[socket.id].name;
        const wasSyncMaster = rooms[roomId].users[socket.id].isSyncMaster;
        
        delete rooms[roomId].users[socket.id];
        rooms[roomId].readyUsers.delete(socket.id);
        rooms[roomId].skipVotes.delete(socket.id);
        
        if (rooms[roomId].animeSync && rooms[roomId].animeSync.participantTimestamps) {
          rooms[roomId].animeSync.participantTimestamps.delete(socket.id);
        }
        
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
          if (rooms[roomId].animeSync && rooms[roomId].animeSync.syncCheckInterval) {
            clearInterval(rooms[roomId].animeSync.syncCheckInterval);
          }
          delete rooms[roomId];
        } else {
          updateRoomAdmin(roomId);
          if (wasSyncMaster) {
            console.log(`Sync master left room ${roomId}, reassigning...`);
          }
          updateSyncMaster(roomId);
          
          io.to(roomId).emit("updateUsers", Object.values(rooms[roomId].users));
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
