class YouTubeSyncApp {
    constructor() {
        this.socket = io();
        this.player = null;
        this.playerReady = false;
        this.currentRoom = null;
        this.isHost = false;
        this.isUpdatingFromRemote = false;
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupSocketListeners();
        
        this.showHomeScreen();
        
        // Initialize YouTube player when API is ready
        if (window.YT && window.YT.Player) {
            this.onYouTubeIframeAPIReady();
        }
    }

    initializeElements() {
        this.homeScreen = document.getElementById('home-screen');
        this.roomScreen = document.getElementById('room-screen');
        this.createRoomBtn = document.getElementById('create-room-btn');
        this.joinRoomBtn = document.getElementById('join-room-btn');
        this.roomIdInput = document.getElementById('room-id-input');
        this.leaveRoomBtn = document.getElementById('leave-room-btn');
        this.currentRoomIdSpan = document.getElementById('current-room-id');
        this.userCountSpan = document.getElementById('user-count');
        this.videoUrlInput = document.getElementById('video-url-input');
        this.loadVideoBtn = document.getElementById('load-video-btn');
        this.connectionStatus = document.getElementById('connection-status');
        this.hostIndicator = document.getElementById('host-indicator');
        this.noVideoMessage = document.getElementById('no-video-message');
    }

    setupEventListeners() {
        this.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
        this.loadVideoBtn.addEventListener('click', () => this.loadVideo());
        
        this.roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        
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

        this.socket.on('room-created', (data) => {
            this.currentRoom = data.roomId;
            this.isHost = data.isHost;
            this.showRoomScreen();
        });

        this.socket.on('room-joined', (data) => {
            this.currentRoom = data.roomId;
            this.isHost = data.isHost;
            this.showRoomScreen();
            
            if (data.currentVideo) {
                this.loadYouTubeVideo(data.currentVideo);
                if (data.videoState) {
                    this.syncVideoState(data.videoState);
                }
            }
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

    createRoom() {
        this.socket.emit('create-room');
    }

    joinRoom() {
        const roomId = this.roomIdInput.value.trim();
        if (roomId) {
            this.socket.emit('join-room', roomId);
        }
    }

    leaveRoom() {
        this.socket.disconnect();
        this.socket.connect();
        this.showHomeScreen();
        this.resetRoom();
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

    showHomeScreen() {
        this.homeScreen.classList.add('active');
        this.roomScreen.classList.remove('active');
    }

    showRoomScreen() {
        this.homeScreen.classList.remove('active');
        this.roomScreen.classList.add('active');
        this.currentRoomIdSpan.textContent = this.currentRoom;
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

    resetRoom() {
        this.currentRoom = null;
        this.isHost = false;
        this.roomIdInput.value = '';
        this.videoUrlInput.value = '';
        this.userCountSpan.textContent = '1';
        this.hostIndicator.classList.add('hidden');
        this.noVideoMessage.style.display = 'block';
        
        if (this.player) {
            this.player.destroy();
            this.player = null;
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
