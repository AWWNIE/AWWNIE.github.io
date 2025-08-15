class YouTubeSyncApp {
    constructor() {
        this.socket = io();
        this.player = null;
        this.playerReady = false;
        this.currentRoom = this.getRoomIdFromUrl();
        this.isHost = false;
        this.isUpdatingFromRemote = false;
        
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
        
        // Initialize YouTube player when API is ready
        if (window.YT && window.YT.Player) {
            this.onYouTubeIframeAPIReady();
        }
    }

    initializeElements() {
        this.roomScreen = document.getElementById('room-screen');
        this.leaveRoomBtn = document.getElementById('leave-room-btn');
        this.currentRoomIdSpan = document.getElementById('current-room-id');
        this.userCountSpan = document.getElementById('user-count');
        this.videoUrlInput = document.getElementById('video-url-input');
        this.loadVideoBtn = document.getElementById('load-video-btn');
        this.connectionStatus = document.getElementById('connection-status');
        this.hostIndicator = document.getElementById('host-indicator');
        this.noVideoMessage = document.getElementById('no-video-message');
        this.inviteUrl = document.getElementById('invite-url');
        this.copyLinkBtn = document.getElementById('copy-link-btn');
    }

    setupEventListeners() {
        this.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
        this.loadVideoBtn.addEventListener('click', () => this.loadVideo());
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

    loadVideo() {
        const url = this.videoUrlInput.value.trim();
        const videoId = this.extractVideoId(url);
        
        if (videoId) {
            if (!this.player || !this.playerReady) {
                // Initialize player if not ready
                this.onYouTubeIframeAPIReady();
                setTimeout(() => {
                    this.socket.emit('load-video', { videoId });
                }, 1000);
            } else {
                this.socket.emit('load-video', { videoId });
            }
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
        if (this.player) {
            this.isUpdatingFromRemote = true;
            this.player.loadVideoById(videoId);
            this.noVideoMessage.style.display = 'none';
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
        if (!this.player && window.YT && window.YT.Player) {
            setTimeout(() => {
                this.onYouTubeIframeAPIReady();
            }, 500);
        }
    }

    updateHostIndicator() {
        if (this.isHost) {
            this.hostIndicator.classList.remove('hidden');
        } else {
            this.hostIndicator.classList.add('hidden');
        }
    }


    onYouTubeIframeAPIReady() {
        this.player = new YT.Player('player', {
            height: '450',
            width: '100%',
            videoId: '',
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
                },
                'onStateChange': (event) => this.onPlayerStateChange(event)
            }
        });
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
        }
    }
}

let app;

function onYouTubeIframeAPIReady() {
    console.log('YouTube API Ready');
    if (app) {
        app.onYouTubeIframeAPIReady();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    app = new YouTubeSyncApp();
});