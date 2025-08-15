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

        this.socket.on('disconnect', () => {
            this.connectionStatus.textContent = 'Disconnected';
            this.connectionStatus.style.color = '#f44336';
        });

        this.socket.on('room-joined', (data) => {
            this.currentRoom = data.roomId;
            this.isHost = data.isHost;
            this.updateRoomInfo();
            
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

        this.socket.on('user-joined', (data) => {
            this.userCountSpan.textContent = data.userCount;
        });

        this.socket.on('user-left', (data) => {
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
            // Try to get title from YouTube oEmbed API
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
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    loadYouTubeVideo(videoId) {
        console.log('loadYouTubeVideo called with:', videoId);
        console.log('Player state - exists:', !!this.player, 'ready:', this.playerReady, 'creating:', this.creatingPlayer);
        
        if (this.player && this.playerReady && typeof this.player.loadVideoById === 'function') {
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
            }
        }
    }

    syncVideoState(state) {
        if (!this.player || this.isUpdatingFromRemote) return;

        this.isUpdatingFromRemote = true;
        
        const timeDiff = Date.now() - state.lastUpdate;
        let targetTime = state.currentTime;
        
        if (state.isPlaying) {
            targetTime += timeDiff / 1000;
        }

        this.player.seekTo(targetTime, true);
        
        if (state.isPlaying) {
            this.player.playVideo();
        } else {
            this.player.pauseVideo();
        }

        setTimeout(() => {
            this.isUpdatingFromRemote = false;
        }, 1000);
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

        this.creatingPlayer = true;

        return new Promise((resolve) => {
            console.log('Creating YouTube player...');
            try {
                this.player = new YT.Player('player', {
                    height: '675',
                    width: '100%',
                    playerVars: {
                        'playsinline': 1,
                        'controls': 1,
                        'rel': 0,
                        'modestbranding': 1
                    },
                    events: {
                        'onReady': (event) => {
                            console.log('YouTube player ready');
                            this.playerReady = true;
                            this.creatingPlayer = false;
                            
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

    onYouTubeIframeAPIReady() {
        this.initializePlayer();
    }

    onPlayerStateChange(event) {
        if (this.isUpdatingFromRemote) return;

        const currentTime = this.player.getCurrentTime();
        
        switch (event.data) {
            case YT.PlayerState.PLAYING:
                this.socket.emit('video-play', { currentTime });
                break;
            case YT.PlayerState.PAUSED:
                this.socket.emit('video-pause', { currentTime });
                break;
            case YT.PlayerState.ENDED:
                // Auto-play next video if queue has items and user is host
                if (this.isHost) {
                    setTimeout(() => {
                        this.socket.emit('play-next');
                    }, 1000);
                }
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
            window.app.initializePlayer();
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, creating app');
    window.app = new YouTubeSyncApp();
});