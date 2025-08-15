class YouTubeSyncApp {
    constructor() {
        this.socket = io();
        this.player = null;
        this.playerReady = false;
        this.apiReady = false;
        this.creatingPlayer = false;
        this.currentRoom = this.getRoomIdFromUrl();
        this.isHost = false;
        this.isUpdatingFromRemote = false;
        this.pendingVideoId = null;
        this.lastKnownTime = 0;
        this.seekCheckInterval = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupSocketListeners();
        
        // Join room automatically if room ID is in URL
        if (this.currentRoom) {
            console.log('Joining room:', this.currentRoom);
            this.socket.emit('join-room', this.currentRoom);
            // Update UI immediately with room ID from URL
            this.updateRoomInfo();
        } else {
            // Redirect to home if no room ID
            window.location.href = '/';
        }
        
        // Wait for YouTube API to load
        this.waitForYouTubeAPI();
    }

    initializeElements() {
        this.roomScreen = document.getElementById('room-screen');
        this.leaveRoomBtn = document.getElementById('leave-room-btn');
        this.currentRoomIdSpan = document.getElementById('current-room-id');
        this.userCountSpan = document.getElementById('user-count');
        this.videoUrlInput = document.getElementById('video-url-input');
        this.loadVideoBtn = document.getElementById('load-video-btn');
        this.addToQueueBtn = document.getElementById('add-to-queue-btn');
        this.playNextBtn = document.getElementById('play-next-btn');
        this.connectionStatus = document.getElementById('connection-status');
        this.hostIndicator = document.getElementById('host-indicator');
        this.noVideoMessage = document.getElementById('no-video-message');
        this.inviteUrl = document.getElementById('invite-url');
        this.copyLinkBtn = document.getElementById('copy-link-btn');
        this.queueCount = document.getElementById('queue-count');
        this.queueList = document.getElementById('queue-list');
        this.emptyQueueMessage = document.getElementById('empty-queue-message');
    }

    setupEventListeners() {
        this.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
        this.loadVideoBtn.addEventListener('click', () => this.loadVideo());
        this.addToQueueBtn.addEventListener('click', () => this.addToQueue());
        this.playNextBtn.addEventListener('click', () => this.playNext());
        this.copyLinkBtn.addEventListener('click', () => this.copyInviteLink());
        
        this.videoUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.loadVideo();
        });
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            this.connectionStatus.textContent = 'Connected';
            this.connectionStatus.style.color = '#4caf50';
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected from server:', reason);
            this.connectionStatus.textContent = 'Disconnected';
            this.connectionStatus.style.color = '#f44336';
        });

        this.socket.on('reconnect', () => {
            console.log('Reconnected to server');
            this.connectionStatus.textContent = 'Connected';
            this.connectionStatus.style.color = '#4caf50';
            
            // Rejoin room after reconnection
            if (this.currentRoom) {
                this.socket.emit('join-room', this.currentRoom);
            }
        });

        this.socket.on('room-joined', (data) => {
            this.currentRoom = data.roomId;
            this.isHost = data.isHost;
            this.updateRoomInfo();
            
            // Update user count from room-joined data
            if (data.userCount) {
                this.userCountSpan.textContent = data.userCount;
            }
            
            if (data.currentVideo) {
                this.loadYouTubeVideo(data.currentVideo);
                if (data.videoState) {
                    this.syncVideoState(data.videoState);
                }
            }
            
            if (data.queue) {
                this.updateQueue(data.queue);
            }
        });

        this.socket.on('error', (message) => {
            console.error('Socket error:', message);
            alert('Error: ' + message);
        });

        this.socket.on('video-loaded', (data) => {
            this.loadYouTubeVideo(data.videoId);
        });

        this.socket.on('video-play', (data) => {
            this.syncVideoState(data);
        });

        this.socket.on('video-pause', (data) => {
            this.syncVideoState(data);
        });

        this.socket.on('video-seek', (data) => {
            this.syncVideoState(data);
        });

        this.socket.on('user-count-updated', (data) => {
            console.log('User count updated:', data.userCount);
            this.userCountSpan.textContent = data.userCount;
        });

        this.socket.on('host-changed', (data) => {
            this.isHost = data.isHost;
            this.updateHostIndicator();
        });

        this.socket.on('queue-updated', (data) => {
            this.updateQueue(data.queue);
        });

        this.socket.on('error', (message) => {
            alert('Error: ' + message);
        });
    }

    getRoomIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
    }

    getPlayerHeight() {
        const screenWidth = window.innerWidth;
        
        if (screenWidth >= 1200) {
            // Desktop: larger player
            return '600';
        } else if (screenWidth >= 768) {
            // Tablet
            return '450';
        } else if (screenWidth >= 480) {
            // Mobile
            return '315';
        } else {
            // Small mobile
            return '250';
        }
    }

    leaveRoom() {
        window.location.href = '/';
    }

    copyInviteLink() {
        this.inviteUrl.select();
        this.inviteUrl.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(this.inviteUrl.value).then(() => {
            this.copyLinkBtn.textContent = 'Copied!';
            setTimeout(() => {
                this.copyLinkBtn.textContent = 'Copy Link';
            }, 2000);
        });
    }

    async addToQueue() {
        const url = this.videoUrlInput.value.trim();
        const videoId = this.extractVideoId(url);
        
        if (videoId) {
            const title = await this.getVideoTitle(videoId);
            this.socket.emit('add-to-queue', { videoId, title });
            this.videoUrlInput.value = '';
        } else {
            alert('Please enter a valid YouTube URL');
        }
    }

    playNext() {
        this.socket.emit('play-next');
    }

    removeFromQueue(itemId) {
        this.socket.emit('remove-from-queue', { itemId });
    }

    async getVideoTitle(videoId) {
        try {
            // Use YouTube Data API v3 for better reliability
            const API_KEY = 'AIzaSyA7TDHt3oyVHW78Dk-f7WTPXPjZwdEEU98';
            const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${API_KEY}&part=snippet`);
            
            if (response.ok) {
                const data = await response.json();
                if (data.items && data.items.length > 0) {
                    const title = data.items[0].snippet.title;
                    const channelTitle = data.items[0].snippet.channelTitle;
                    console.log('Fetched video data:', { title, channelTitle });
                    return title;
                }
            }
        } catch (error) {
            console.log('YouTube API failed, trying oEmbed:', error);
        }

        try {
            // Fallback to oEmbed API
            const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
            if (response.ok) {
                const data = await response.json();
                return data.title;
            }
        } catch (error) {
            console.log('Could not fetch video title:', error);
        }
        
        return `Video ${videoId.substring(0, 8)}`;
    }

    updateQueue(queue) {
        this.queueCount.textContent = queue.length;
        this.playNextBtn.disabled = queue.length === 0;
        
        if (queue.length === 0) {
            this.emptyQueueMessage.style.display = 'block';
            this.queueList.style.display = 'none';
        } else {
            this.emptyQueueMessage.style.display = 'none';
            this.queueList.style.display = 'block';
            this.renderQueue(queue);
        }
    }

    renderQueue(queue) {
        this.queueList.innerHTML = '';
        
        queue.forEach((item, index) => {
            const queueItem = document.createElement('div');
            queueItem.className = 'queue-item';
            queueItem.innerHTML = `
                <div class="queue-item-info">
                    <div class="queue-item-title">${item.title}</div>
                    <div class="queue-item-meta">#${index + 1} in queue</div>
                </div>
                <div class="queue-item-actions">
                    <button class="btn danger" onclick="app.removeFromQueue('${item.id}')">Remove</button>
                </div>
            `;
            this.queueList.appendChild(queueItem);
        });
    }

    async loadVideo() {
        const url = this.videoUrlInput.value.trim();
        const videoId = this.extractVideoId(url);
        
        if (videoId) {
            // Ensure player is initialized before loading video
            await this.initializePlayer();
            this.socket.emit('load-video', { videoId });
            this.videoUrlInput.value = '';
        } else {
            alert('Please enter a valid YouTube URL');
        }
    }

    extractVideoId(url) {
        // Enhanced regex to support multiple YouTube URL formats:
        // - https://www.youtube.com/watch?v=VIDEO_ID
        // - https://youtu.be/VIDEO_ID
        // - https://www.youtube.com/live/VIDEO_ID
        // - https://youtube.com/embed/VIDEO_ID
        // - https://www.youtube.com/v/VIDEO_ID
        // - Mobile share links with ?si= parameter
        const regex = /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|live\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regex);
        
        if (match) {
            console.log('Extracted video ID:', match[1], 'from URL:', url);
            return match[1];
        }
        
        console.log('Failed to extract video ID from URL:', url);
        return null;
    }

    loadYouTubeVideo(videoId) {
        console.log('loadYouTubeVideo called with:', videoId);
        console.log('Player state - exists:', !!this.player, 'ready:', this.playerReady, 'creating:', this.creatingPlayer);
        
        // Double-check player readiness
        const isPlayerActuallyReady = this.player && 
                                     this.playerReady && 
                                     typeof this.player.loadVideoById === 'function' &&
                                     this.player.getPlayerState !== undefined;
        
        console.log('Is player actually ready?', isPlayerActuallyReady);
        
        if (isPlayerActuallyReady) {
            console.log('Player ready, loading video immediately');
            this.isUpdatingFromRemote = true;
            this.player.loadVideoById(videoId);
            this.noVideoMessage.style.display = 'none';
        } else {
            console.log('Player not ready, storing video ID for later:', videoId);
            this.pendingVideoId = videoId;
            this.noVideoMessage.style.display = 'none';
            
            // Try to initialize player if not done yet
            if (!this.playerReady && !this.creatingPlayer) {
                console.log('Initializing player for pending video');
                this.initializePlayer();
            } else if (this.playerReady && !isPlayerActuallyReady) {
                console.log('Player marked as ready but methods missing - reinitializing');
                this.playerReady = false;
                this.initializePlayer();
            }
        }
    }

    syncVideoState(state) {
        if (!this.player || !this.playerReady) {
            console.log('Cannot sync - player not ready');
            return;
        }

        console.log('Syncing video state:', state);
        
        // Block local events during sync
        this.isUpdatingFromRemote = true;
        
        try {
            const timeDiff = Date.now() - state.lastUpdate;
            let targetTime = state.currentTime;
            
            // Compensate for network delay if video is playing
            if (state.isPlaying) {
                targetTime += timeDiff / 1000;
            }

            console.log('Seeking to time:', targetTime, 'isPlaying:', state.isPlaying);

            // Always seek first to ensure we're at the right time
            this.player.seekTo(targetTime, true);
            
            // Then set the play state
            setTimeout(() => {
                if (state.isPlaying) {
                    if (this.player.getPlayerState() !== YT.PlayerState.PLAYING) {
                        console.log('Starting playback');
                        this.player.playVideo();
                    }
                } else {
                    if (this.player.getPlayerState() === YT.PlayerState.PLAYING) {
                        console.log('Pausing playback');
                        this.player.pauseVideo();
                    }
                }
            }, 100);
            
        } catch (error) {
            console.error('Error syncing video state:', error);
        }

        // Allow local events after sync completes
        setTimeout(() => {
            this.isUpdatingFromRemote = false;
            console.log('Sync complete, allowing local events');
        }, 2000);
    }

    updateRoomInfo() {
        this.currentRoomIdSpan.textContent = this.currentRoom;
        this.inviteUrl.value = `${window.location.origin}/room.html?id=${this.currentRoom}`;
        this.updateHostIndicator();
        
        // Initialize YouTube player when entering room
        if (!this.playerReady) {
            this.initializePlayer();
        }
    }

    updateHostIndicator() {
        if (this.isHost) {
            this.hostIndicator.classList.remove('hidden');
        } else {
            this.hostIndicator.classList.add('hidden');
        }
    }


    waitForYouTubeAPI() {
        if ((window.YT && window.YT.Player) || window.youtubeAPIReady) {
            console.log('YouTube API already loaded');
            this.apiReady = true;
            this.initializePlayer();
        } else {
            console.log('Waiting for YouTube API...');
            // Check every 100ms for API availability
            const checkAPI = setInterval(() => {
                if ((window.YT && window.YT.Player) || window.youtubeAPIReady) {
                    console.log('YouTube API loaded via polling');
                    this.apiReady = true;
                    clearInterval(checkAPI);
                    this.initializePlayer();
                }
            }, 100);
            
            // Timeout after 15 seconds
            setTimeout(() => {
                if (!this.apiReady) {
                    console.error('YouTube API failed to load after 15 seconds');
                    clearInterval(checkAPI);
                    // Try to reload the page or show an error
                    alert('YouTube player failed to load. Please refresh the page.');
                }
            }, 15000);
        }
    }

    async initializePlayer() {
        if (this.player && this.playerReady) {
            console.log('Player already initialized and ready');
            return Promise.resolve();
        }

        if (this.player && !this.playerReady) {
            console.log('Player exists but not ready yet, waiting...');
            return Promise.resolve();
        }

        if (!this.apiReady || !window.YT || !window.YT.Player) {
            console.log('API not ready, waiting...');
            return new Promise((resolve) => {
                setTimeout(() => this.initializePlayer().then(resolve), 500);
            });
        }

        // Prevent multiple player creation
        if (this.creatingPlayer) {
            console.log('Player creation already in progress...');
            return Promise.resolve();
        }

        // Clear any existing player
        if (this.player && typeof this.player.destroy === 'function') {
            console.log('Destroying existing player');
            this.player.destroy();
            this.player = null;
            this.playerReady = false;
        }

        this.creatingPlayer = true;

        return new Promise((resolve) => {
            console.log('Creating YouTube player...');
            try {
                this.player = new YT.Player('player', {
                    height: this.getPlayerHeight(),
                    width: '100%',
                    playerVars: {
                        'playsinline': 1,
                        'controls': 1,
                        'rel': 0,
                        'modestbranding': 1
                    },
                    events: {
                        'onReady': (event) => {
                            console.log('YouTube player ready - setting playerReady = true');
                            this.playerReady = true;
                            this.creatingPlayer = false;
                            
                            // Verify the player methods exist
                            console.log('Player methods available:', {
                                loadVideoById: typeof this.player.loadVideoById,
                                playVideo: typeof this.player.playVideo,
                                pauseVideo: typeof this.player.pauseVideo
                            });
                            
                            // Start seek detection
                            this.startSeekDetection();
                            
                            // Load pending video if any
                            if (this.pendingVideoId) {
                                console.log('Loading pending video:', this.pendingVideoId);
                                this.isUpdatingFromRemote = true;
                                this.player.loadVideoById(this.pendingVideoId);
                                this.pendingVideoId = null;
                                this.noVideoMessage.style.display = 'none';
                            }
                            
                            resolve();
                        },
                        'onStateChange': (event) => this.onPlayerStateChange(event),
                        'onError': (event) => {
                            console.error('YouTube player error:', event.data);
                            this.creatingPlayer = false;
                        }
                    }
                });
            } catch (error) {
                console.error('Error creating YouTube player:', error);
                this.creatingPlayer = false;
                setTimeout(() => this.initializePlayer().then(resolve), 1000);
            }
        });
    }

    startSeekDetection() {
        if (this.seekCheckInterval) {
            clearInterval(this.seekCheckInterval);
        }
        
        this.seekCheckInterval = setInterval(() => {
            if (!this.player || !this.playerReady || this.isUpdatingFromRemote) return;
            
            try {
                const currentTime = this.player.getCurrentTime();
                const playerState = this.player.getPlayerState();
                
                // Only check for seeks when not buffering or loading
                if (playerState === YT.PlayerState.BUFFERING || playerState === YT.PlayerState.CUED) {
                    return;
                }
                
                if (this.lastKnownTime > 0) {
                    const expectedTime = this.lastKnownTime + 1; // Expected time after 1 second
                    const timeDiff = Math.abs(currentTime - expectedTime);
                    
                    // If time is off by more than 3 seconds, user probably seeked
                    if (timeDiff > 3) {
                        console.log('Manual seek detected:', this.lastKnownTime, '->', currentTime);
                        this.socket.emit('video-seek', { currentTime });
                    }
                }
                
                this.lastKnownTime = currentTime;
            } catch (error) {
                console.error('Error in seek detection:', error);
            }
        }, 1000);
    }

    onYouTubeIframeAPIReady() {
        this.initializePlayer();
    }

    onPlayerStateChange(event) {
        if (this.isUpdatingFromRemote) {
            console.log('Ignoring state change - updating from remote');
            return;
        }

        const currentTime = this.player.getCurrentTime();
        console.log('Player state changed:', event.data, 'at time:', currentTime);
        
        switch (event.data) {
            case YT.PlayerState.PLAYING:
                console.log('Emitting video-play event');
                this.socket.emit('video-play', { currentTime });
                break;
            case YT.PlayerState.PAUSED:
                console.log('Emitting video-pause event');
                this.socket.emit('video-pause', { currentTime });
                break;
            case YT.PlayerState.ENDED:
                console.log('Video ended');
                // Auto-play next video if queue has items and user is host
                if (this.isHost) {
                    setTimeout(() => {
                        this.socket.emit('play-next');
                    }, 1000);
                }
                break;
            case YT.PlayerState.BUFFERING:
                console.log('Video buffering');
                break;
            case YT.PlayerState.CUED:
                console.log('Video cued');
                break;
        }
    }
}

let app;

function onYouTubeIframeAPIReady() {
    console.log('Global YouTube API Ready callback');
    window.youtubeAPIReady = true;
    if (window.app) {
        console.log('Setting app.apiReady = true');
        window.app.apiReady = true;
        // Only initialize if not already creating
        if (!window.app.creatingPlayer && !window.app.playerReady) {
            console.log('Calling initializePlayer from global callback');
            window.app.initializePlayer();
        } else {
            console.log('Skipping init - creating:', window.app.creatingPlayer, 'ready:', window.app.playerReady);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, creating app');
    window.app = new YouTubeSyncApp();
});