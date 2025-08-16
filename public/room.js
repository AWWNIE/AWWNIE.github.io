class YouTubeSyncApp {
    constructor() {
        this.socket = io({
            // Stable reconnection settings
            reconnection: true,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 5000,
            maxReconnectionAttempts: 5,
            timeout: 20000,
            forceNew: false,
            transports: ['websocket', 'polling'],
            autoConnect: true
        });
        this.player = null;
        this.playerReady = false;
        this.apiReady = false;
        this.creatingPlayer = false;
        this.currentRoom = this.getRoomIdFromUrl();
        this.isHost = false;
        this.isUpdatingFromRemote = false;
        this.pendingVideoId = null;
        this.pendingVideoState = null;
        this.lastKnownTime = 0;
        this.seekCheckInterval = null;
        this.syncRetryCount = 0;
        this.lastSyncTime = 0;
        this.syncThrottleMs = 1000; // Minimum time between sync events
        
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
        
        // Handle window resize to adjust player size
        window.addEventListener('resize', () => {
            if (this.player && this.playerReady) {
                const newHeight = this.getPlayerHeight();
                const playerElement = document.getElementById('player');
                if (playerElement) {
                    playerElement.style.height = newHeight + 'px';
                }
            }
        });
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
        this.goLiveBtn = document.getElementById('go-live-btn');
        this.connectionStatus = document.getElementById('connection-status');
        this.hostIndicator = document.getElementById('host-indicator');
        this.noVideoMessage = document.getElementById('no-video-message');
        this.inviteUrl = document.getElementById('invite-url');
        this.copyLinkBtn = document.getElementById('copy-link-btn');
        this.queueCount = document.getElementById('queue-count');
        this.queueList = document.getElementById('queue-list');
        this.emptyQueueMessage = document.getElementById('empty-queue-message');
        this.notificationContainer = document.getElementById('notification-container');
    }

    setupEventListeners() {
        this.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
        this.loadVideoBtn.addEventListener('click', () => this.loadVideo());
        this.addToQueueBtn.addEventListener('click', () => this.addToQueue());
        this.playNextBtn.addEventListener('click', () => this.playNext());
        this.goLiveBtn.addEventListener('click', () => this.goLive());
        this.copyLinkBtn.addEventListener('click', () => this.copyInviteLink());
        
        this.videoUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.loadVideo();
        });
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            this.connectionStatus.textContent = 'Connected';
            this.connectionStatus.style.color = '#4caf50';
            this.notifySuccess('Connected', 'Successfully connected to the server');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected from server:', reason);
            this.connectionStatus.textContent = 'Disconnected';
            this.connectionStatus.style.color = '#f44336';
            this.notifyWarning('Disconnected', `Connection lost: ${reason}`);
        });

        this.socket.on('reconnect', () => {
            console.log('Reconnected to server');
            this.connectionStatus.textContent = 'Connected';
            this.connectionStatus.style.color = '#4caf50';
            this.notifySuccess('Reconnected', 'Connection restored successfully');
            
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
            
            const hostStatus = data.isHost ? 'as host' : 'as viewer';
            this.notifySuccess('Room Joined', `Joined room ${data.roomId} ${hostStatus}`);
            
            if (data.currentVideo) {
                this.loadYouTubeVideo(data.currentVideo);
                this.notifyInfo('Video Loaded', 'Loading current room video');
                
                // Only sync state if video is actually playing
                if (data.videoState && data.videoState.isPlaying) {
                    setTimeout(() => {
                        this.syncVideoState(data.videoState);
                    }, 3000);
                } else {
                    this.notifyInfo('Video Ready', 'Video loaded - waiting for host to start playback');
                }
            }
            
            if (data.queue) {
                this.updateQueue(data.queue);
                if (data.queue.length > 0) {
                    this.notifyInfo('Queue Updated', `${data.queue.length} video(s) in queue`);
                }
            }
        });

        this.socket.on('error', (message) => {
            console.error('Socket error:', message);
            
            if (message.includes('Room not found')) {
                console.log('Room not found - attempting to rejoin');
                this.notifyWarning('Reconnecting', 'Room connection lost, attempting to rejoin...');
                
                // Attempt to rejoin the room after a short delay
                setTimeout(() => {
                    if (this.currentRoom) {
                        console.log('Rejoining room:', this.currentRoom);
                        this.socket.emit('join-room', this.currentRoom);
                    }
                }, 1000);
            } else {
                this.notifyError('Room Error', message);
            }
        });

        this.socket.on('video-loaded', (data) => {
            this.loadYouTubeVideo(data.videoId);
            this.hideGoLiveButton(); // Hide until we detect if it's live
            this.notifyInfo('Video Changed', 'A new video has been loaded');
            
            // Don't sync video state for fresh video loads - let them play naturally
            // Video state sync will happen through play/pause/seek events instead
        });

        this.socket.on('video-play', (data) => {
            console.log('Received video-play event:', data);
            
            // Ignore our own events to prevent loops
            if (data.senderId === this.socket.id) {
                console.log('Ignoring own video-play event');
                return;
            }
            
            // Throttle sync events to prevent spam
            const now = Date.now();
            if (now - this.lastSyncTime < this.syncThrottleMs) {
                console.log('Throttling play sync event - too soon since last sync');
                return;
            }
            this.lastSyncTime = now;
            
            const beforeState = this.player ? this.player.getPlayerState() : 'no player';
            console.log('Processing remote play event - current state before:', beforeState);
            
            this.handleRemotePlay(data);
            this.notifyInfo('Video Playing', 'Video playback started');
        });

        this.socket.on('video-pause', (data) => {
            console.log('Received video-pause event from', data.senderId, 'at time', data.currentTime, 'my ID:', this.socket.id);
            
            // Ignore our own events to prevent loops
            if (data.senderId === this.socket.id) {
                console.log('Ignoring own video-pause event');
                return;
            }
            
            // Allow pause events to go through immediately (they're important)
            const beforeState = this.player ? this.player.getPlayerState() : 'no player';
            console.log('Processing remote pause event - current state before:', beforeState);
            
            this.handleRemotePause(data);
            this.notifyInfo('Video Paused', 'Video playback paused');
        });

        this.socket.on('video-seek', (data) => {
            console.log('Received video-seek event:', data);
            
            // Ignore our own events to prevent loops
            if (data.senderId === this.socket.id) {
                console.log('Ignoring own video-seek event');
                return;
            }
            
            // Throttle seek events more aggressively
            const now = Date.now();
            if (now - this.lastSyncTime < this.syncThrottleMs) {
                console.log('Throttling seek sync event - too soon since last sync');
                return;
            }
            this.lastSyncTime = now;
            
            this.handleRemoteSeek(data);
            const time = Math.floor(data.currentTime);
            this.notifyInfo('Video Seeking', `Synced to ${this.formatTime(time)}`);
        });

        this.socket.on('user-count-updated', (data) => {
            console.log('User count updated:', data.userCount);
            const previousCount = parseInt(this.userCountSpan.textContent) || 0;
            this.userCountSpan.textContent = data.userCount;
            
            if (data.userCount > previousCount) {
                this.notifySuccess('User Joined', `Someone joined the room (${data.userCount} users online)`);
            } else if (data.userCount < previousCount) {
                this.notifyInfo('User Left', `Someone left the room (${data.userCount} users online)`);
            }
        });

        this.socket.on('host-changed', (data) => {
            this.isHost = data.isHost;
            this.updateHostIndicator();
            if (data.isHost) {
                this.notifySuccess('Host Status', 'You are now the host');
            }
        });

        this.socket.on('queue-updated', (data) => {
            const previousCount = this.queueCount ? parseInt(this.queueCount.textContent) : 0;
            const newCount = data.queue ? data.queue.length : 0;
            
            this.updateQueue(data.queue || []);
            
            // Provide specific feedback based on queue changes
            if (newCount > previousCount) {
                this.notifySuccess('Video Added', `Queue now has ${newCount} video(s)`);
            } else if (newCount < previousCount) {
                this.notifyInfo('Video Removed', `Queue now has ${newCount} video(s)`);
            } else if (newCount === 0) {
                this.notifyInfo('Queue Empty', 'All videos have been removed from queue');
            }
        });
    }

    getRoomIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
    }

    getPlayerHeight() {
        const screenWidth = window.innerWidth;
        
        if (screenWidth >= 1200) {
            // Desktop: much larger player to be the main focus
            return '800';
        } else if (screenWidth >= 768) {
            // Tablet
            return '500';
        } else if (screenWidth >= 480) {
            // Mobile
            return '315';
        } else {
            // Small mobile
            return '250';
        }
    }

    // Notification System
    showNotification(title, message, type = 'info', duration = 5000) {
        // Log to console with timestamp
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] ${type.toUpperCase()}: ${title} - ${message}`;
        console.log(logMessage);
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <button class="notification-close">&times;</button>
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        `;
        
        // Add to container
        this.notificationContainer.appendChild(notification);
        
        // Show with animation
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // Auto-hide after duration
        const hideTimeout = setTimeout(() => {
            this.hideNotification(notification);
        }, duration);
        
        // Close button functionality
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            clearTimeout(hideTimeout);
            this.hideNotification(notification);
        });
        
        // Click to dismiss
        notification.addEventListener('click', () => {
            clearTimeout(hideTimeout);
            this.hideNotification(notification);
        });
        
        return notification;
    }
    
    hideNotification(notification) {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }
    
    // Convenience methods for different notification types
    notifySuccess(title, message, duration = 4000) {
        return this.showNotification(title, message, 'success', duration);
    }
    
    notifyInfo(title, message, duration = 5000) {
        return this.showNotification(title, message, 'info', duration);
    }
    
    notifyWarning(title, message, duration = 6000) {
        return this.showNotification(title, message, 'warning', duration);
    }
    
    notifyError(title, message, duration = 8000) {
        return this.showNotification(title, message, 'error', duration);
    }
    
    // Helper method to format time
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    syncVideoState(data) {
        if (!data) {
            console.log('No video state data to sync');
            return;
        }
        
        if (!this.player || !this.playerReady) {
            console.log('Player not ready for sync, storing state for later');
            this.pendingVideoState = data;
            return;
        }
        
        console.log('Syncing video state:', data);
        this.isUpdatingFromRemote = true;
        
        try {
            const timeDiff = Date.now() - data.lastUpdate;
            let targetTime = data.currentTime;
            
            // Only adjust for time drift if video is playing
            if (data.isPlaying) {
                targetTime += (timeDiff / 1000);
            }
            
            // Seek to the target time
            this.player.seekTo(targetTime, true);
            
            // Handle play/pause state with retry logic
            const syncPlayState = () => {
                try {
                    const currentState = this.player.getPlayerState();
                    
                    if (data.isPlaying && currentState !== YT.PlayerState.PLAYING) {
                        this.player.playVideo();
                        console.log('Started playback for sync');
                    } else if (!data.isPlaying && currentState === YT.PlayerState.PLAYING) {
                        this.player.pauseVideo();
                        console.log('Paused playback for sync');
                    }
                } catch (error) {
                    console.error('Error syncing play state:', error);
                }
            };
            
            // Initial sync after seeking
            setTimeout(syncPlayState, 300);
            
            // Verify sync worked after a delay
            setTimeout(() => {
                try {
                    const currentTime = this.player.getCurrentTime();
                    const currentState = this.player.getPlayerState();
                    const expectedPlaying = data.isPlaying;
                    const actualPlaying = currentState === YT.PlayerState.PLAYING;
                    
                    console.log('Sync verification:', {
                        expectedTime: targetTime,
                        actualTime: currentTime,
                        timeDiff: Math.abs(currentTime - targetTime),
                        expectedPlaying,
                        actualPlaying
                    });
                    
                    // Retry if sync failed
                    if (Math.abs(currentTime - targetTime) > 2 || expectedPlaying !== actualPlaying) {
                        console.log('Sync verification failed, retrying...');
                        syncPlayState();
                    }
                } catch (error) {
                    console.error('Error in sync verification:', error);
                }
            }, 1000);
            
        } catch (error) {
            console.error('Error in syncVideoState:', error);
        }
        
        // Clear the remote update flag
        setTimeout(() => {
            this.isUpdatingFromRemote = false;
        }, 500);
    }

    leaveRoom() {
        window.location.href = '/';
    }

    copyInviteLink() {
        this.inviteUrl.select();
        this.inviteUrl.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(this.inviteUrl.value).then(() => {
            this.copyLinkBtn.textContent = 'Copied!';
            this.notifySuccess('Link Copied', 'Invite link copied to clipboard');
            setTimeout(() => {
                this.copyLinkBtn.textContent = 'Copy Link';
            }, 2000);
        }).catch(() => {
            this.notifyError('Copy Failed', 'Failed to copy link to clipboard');
        });
    }

    async addToQueue() {
        const url = this.videoUrlInput.value.trim();
        const videoId = this.extractVideoId(url);
        
        if (!videoId) {
            this.notifyError('Invalid URL', 'Please enter a valid YouTube URL');
            return;
        }

        // Check if we're in a room
        if (!this.currentRoom) {
            this.notifyError('No Room', 'You must be in a room to add videos to queue');
            return;
        }
        
        try {
            this.notifyInfo('Adding to Queue', 'Fetching video information...');
            const title = await this.getVideoTitle(videoId);
            
            // Send to server and wait for confirmation via queue-updated event
            this.socket.emit('add-to-queue', { videoId, title });
            this.videoUrlInput.value = '';
            // Note: Success notification will come from queue-updated event
            
        } catch (error) {
            console.error('Error adding to queue:', error);
            this.notifyError('Queue Error', 'Failed to add video to queue');
        }
    }

    playNext() {
        this.socket.emit('play-next');
        this.notifyInfo('Playing Next', 'Loading next video from queue');
    }

    removeFromQueue(itemId) {
        if (!this.currentRoom) {
            this.notifyError('No Room', 'You must be in a room to remove videos');
            return;
        }
        
        if (!itemId) {
            this.notifyError('Invalid Item', 'Cannot remove invalid queue item');
            return;
        }
        
        this.socket.emit('remove-from-queue', { itemId });
        // Note: Success notification will come from queue-updated event
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
                    <button class="btn danger" data-item-id="${item.id}">Remove</button>
                </div>
            `;
            
            // Add event listener to the remove button
            const removeBtn = queueItem.querySelector('.btn.danger');
            removeBtn.addEventListener('click', () => {
                this.removeFromQueue(item.id);
            });
            
            this.queueList.appendChild(queueItem);
        });
    }

    async loadVideo() {
        const url = this.videoUrlInput.value.trim();
        const videoId = this.extractVideoId(url);
        
        if (videoId) {
            this.notifyInfo('Loading Video', 'Preparing to load video...');
            // Ensure player is initialized before loading video
            await this.initializePlayer();
            this.socket.emit('load-video', { videoId });
            this.videoUrlInput.value = '';
            this.notifySuccess('Video Loading', 'Video sent to all users in the room');
            
            // Auto-play regular videos after a delay
            setTimeout(() => {
                this.autoPlayNewVideo();
            }, 3000);
        } else {
            this.notifyError('Invalid URL', 'Please enter a valid YouTube URL');
        }
    }

    autoPlayNewVideo() {
        try {
            if (!this.player || !this.playerReady) {
                console.log('Player not ready for autoplay');
                return;
            }
            
            const playerState = this.player.getPlayerState();
            console.log('Auto-play check - player state:', playerState);
            
            // Auto-play if the video is cued/paused (any user can initiate)
            if (playerState === YT.PlayerState.CUED || playerState === YT.PlayerState.PAUSED) {
                console.log('Auto-playing new video');
                this.player.playVideo();
                
                // Emit play event to sync with other users
                setTimeout(() => {
                    const currentTime = this.player.getCurrentTime();
                    this.socket.emit('video-play', { currentTime });
                }, 500);
            }
        } catch (error) {
            console.error('Error in autoPlayNewVideo:', error);
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
            
            // Clear the updating flag after a short delay to allow user interactions
            setTimeout(() => {
                this.isUpdatingFromRemote = false;
                console.log('Cleared isUpdatingFromRemote after video load');
            }, 2000);
            
            // Check if this is a live stream and sync to live time
            this.checkAndSyncLiveStream(videoId);
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

    async checkAndSyncLiveStream(videoId) {
        try {
            // Wait longer for video to fully load before checking if it's live
            setTimeout(async () => {
                if (!this.player || !this.playerReady) return;
                
                // Check if this is a live stream using YouTube Data API
                const isLive = await this.isVideoLive(videoId);
                
                if (isLive) {
                    console.log('Live stream detected, waiting for video to be ready...');
                    this.showGoLiveButton();
                    this.notifyInfo('Live Stream', 'Live stream detected');
                    
                    // Wait for the video to be in a good state before syncing
                    this.waitForVideoReadyThenSync(3000);
                } else {
                    // For regular videos, check if we can detect live status from player
                    setTimeout(() => {
                        this.checkPlayerForLiveStream();
                    }, 3000);
                }
            }, 2000);
        } catch (error) {
            console.error('Error checking live stream:', error);
        }
    }

    async isVideoLive(videoId) {
        try {
            const API_KEY = 'AIzaSyA7TDHt3oyVHW78Dk-f7WTPXPjZwdEEU98';
            const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${API_KEY}&part=snippet,liveStreamingDetails`);
            
            if (response.ok) {
                const data = await response.json();
                console.log('YouTube API response:', data);
                
                if (data.items && data.items.length > 0) {
                    const video = data.items[0];
                    const liveBroadcastContent = video.snippet.liveBroadcastContent;
                    const liveDetails = video.liveStreamingDetails;
                    
                    console.log('Video details:', {
                        liveBroadcastContent,
                        liveDetails,
                        hasActualStart: liveDetails?.actualStartTime,
                        hasActualEnd: liveDetails?.actualEndTime
                    });
                    
                    // Check multiple conditions for live status
                    const isLive = liveBroadcastContent === 'live' || 
                                  (liveDetails && 
                                   liveDetails.actualStartTime && 
                                   !liveDetails.actualEndTime);
                    
                    console.log('API Live check result:', isLive, liveBroadcastContent);
                    return isLive;
                } else {
                    console.log('No video items found in API response');
                }
            } else {
                console.log('API request failed:', response.status, response.statusText);
            }
        } catch (error) {
            console.log('YouTube API live check failed:', error);
        }
        
        return false;
    }

    checkPlayerForLiveStream() {
        try {
            if (!this.player || !this.playerReady) return;
            
            const duration = this.player.getDuration();
            const currentTime = this.player.getCurrentTime();
            
            // Live streams often have duration of 0 or very close to current time
            if (duration === 0 || (duration > 0 && Math.abs(duration - currentTime) < 30)) {
                console.log('Live stream detected via player (duration:', duration, 'current:', currentTime, ')');
                this.showGoLiveButton();
                this.notifyInfo('Live Stream', 'Live stream detected');
                
                // Wait for the video to be in a good state before syncing
                this.waitForVideoReadyThenSync(2000);
            }
        } catch (error) {
            console.error('Error checking player for live stream:', error);
        }
    }

    waitForVideoReadyThenSync(delay = 3000) {
        setTimeout(() => {
            try {
                if (!this.player || !this.playerReady) {
                    console.log('Player not ready for live sync, retrying...');
                    this.waitForVideoReadyThenSync(1000);
                    return;
                }
                
                const playerState = this.player.getPlayerState();
                const duration = this.player.getDuration();
                
                console.log('Checking video readiness for live sync. State:', playerState, 'Duration:', duration);
                
                // Wait for video to be in a good state (not unstarted, not buffering)
                if (playerState === YT.PlayerState.UNSTARTED || 
                    playerState === YT.PlayerState.BUFFERING ||
                    duration === undefined) {
                    console.log('Video not ready yet, waiting longer...');
                    this.waitForVideoReadyThenSync(1000);
                    return;
                }
                
                console.log('Video ready, syncing to live time now');
                this.syncToLiveTime(true); // true = autoplay after sync
                this.notifySuccess('Live Stream', 'Synced to current live time');
                
            } catch (error) {
                console.error('Error waiting for video ready:', error);
                // Retry once more
                setTimeout(() => this.syncToLiveTime(true), 1000);
            }
        }, delay);
    }

    syncToLiveTime(autoplay = false) {
        try {
            if (!this.player || !this.playerReady) return;
            
            const duration = this.player.getDuration();
            let targetTime;
            
            if (duration === 0) {
                // For live streams with duration 0, seek to a very high number to get live edge
                console.log('Seeking to live edge (duration 0)');
                targetTime = 99999999;
                this.player.seekTo(targetTime, true);
            } else if (duration > 0) {
                // For live streams with known duration, seek near the end
                targetTime = Math.max(0, duration - 5); // 5 seconds from live edge
                console.log('Seeking to live time:', targetTime, 'of', duration);
                this.player.seekTo(targetTime, true);
            }
            
            // Auto-play after seeking if requested
            if (autoplay) {
                setTimeout(() => {
                    try {
                        console.log('Auto-playing after live sync');
                        this.player.playVideo();
                        
                        // Emit play event to sync with other users
                        setTimeout(() => {
                            const currentTime = this.player.getCurrentTime();
                            this.socket.emit('video-play', { currentTime });
                        }, 500);
                    } catch (error) {
                        console.error('Error auto-playing after live sync:', error);
                    }
                }, 1000);
            }
            
            // Emit the live sync to other users in the room (anyone can initiate live sync)
            setTimeout(() => {
                const currentTime = this.player.getCurrentTime();
                this.socket.emit('video-seek', { currentTime });
            }, 500);
        } catch (error) {
            console.error('Error syncing to live time:', error);
        }
    }

    showGoLiveButton() {
        if (this.goLiveBtn) {
            this.goLiveBtn.style.display = 'inline-block';
        }
    }

    hideGoLiveButton() {
        if (this.goLiveBtn) {
            this.goLiveBtn.style.display = 'none';
        }
    }

    goLive() {
        console.log('Manual go live requested');
        this.syncToLiveTime(true); // true = autoplay
        this.notifySuccess('Live Sync', 'Synced to current live time');
    }

    handleRemotePlay(data) {
        if (!this.player || !this.playerReady) {
            console.log('Cannot handle remote play - player not ready');
            return;
        }

        console.log('Handling remote play:', data);
        
        // Temporarily block local events
        this.isUpdatingFromRemote = true;
        
        try {
            const currentTime = this.player.getCurrentTime();
            const timeDiff = Date.now() - data.lastUpdate;
            let targetTime = data.currentTime + (timeDiff / 1000);
            const timeDifference = Math.abs(currentTime - targetTime);
            
            console.log('Play sync - current:', currentTime, 'target:', targetTime, 'diff:', timeDifference);
            
            // Only seek if time difference is significant (>2 seconds)
            if (timeDifference > 2) {
                console.log('Seeking due to significant time difference');
                this.player.seekTo(targetTime, true);
            } else {
                console.log('Skipping seek - time difference too small');
            }
            
            // Just play the video without aggressive retry
            const currentState = this.player.getPlayerState();
            if (currentState !== YT.PlayerState.PLAYING) {
                console.log('Starting playback');
                this.player.playVideo();
            } else {
                console.log('Video already playing');
            }
            
        } catch (error) {
            console.error('Error handling remote play:', error);
        }

        // Unblock quickly
        setTimeout(() => {
            this.isUpdatingFromRemote = false;
        }, 200);
    }

    handleRemotePause(data) {
        if (!this.player || !this.playerReady) {
            console.log('Cannot handle remote pause - player not ready');
            return;
        }

        console.log('Handling remote pause at time:', data.currentTime);
        
        // Temporarily block local events
        this.isUpdatingFromRemote = true;
        
        try {
            const currentTime = this.player.getCurrentTime();
            const timeDifference = Math.abs(currentTime - data.currentTime);
            
            console.log('Pause sync - current:', currentTime, 'target:', data.currentTime, 'diff:', timeDifference);
            
            // Only seek if time difference is significant (>1 second for pause)
            if (timeDifference > 1) {
                console.log('Seeking to pause position due to time difference');
                this.player.seekTo(data.currentTime, true);
            } else {
                console.log('Skipping seek - already close to pause position');
            }
            
            // Simple pause without retry loops
            const currentState = this.player.getPlayerState();
            if (currentState === YT.PlayerState.PLAYING) {
                console.log('Pausing video');
                this.player.pauseVideo();
            } else {
                console.log('Video already paused or in state:', currentState);
            }
            
        } catch (error) {
            console.error('Error handling remote pause:', error);
        }

        // Unblock quickly
        setTimeout(() => {
            this.isUpdatingFromRemote = false;
            console.log('Cleared isUpdatingFromRemote after pause sync');
        }, 200);
    }

    handleRemoteSeek(data) {
        if (!this.player || !this.playerReady) {
            console.log('Cannot handle remote seek - player not ready');
            return;
        }

        console.log('Handling remote seek:', data);
        
        // Temporarily block local events
        this.isUpdatingFromRemote = true;
        
        try {
            this.player.seekTo(data.currentTime, true);
            console.log('Seeked to:', data.currentTime);
            
        } catch (error) {
            console.error('Error handling remote seek:', error);
        }

        // Unblock after delay
        setTimeout(() => {
            this.isUpdatingFromRemote = false;
        }, 300);
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
                            
                            this.notifySuccess('Player Ready', 'YouTube player initialized successfully');
                            
                            // Start seek detection
                            this.startSeekDetection();
                            
                            // Load pending video if any
                            if (this.pendingVideoId) {
                                console.log('Loading pending video:', this.pendingVideoId);
                                this.isUpdatingFromRemote = true;
                                const videoId = this.pendingVideoId;
                                this.player.loadVideoById(videoId);
                                this.pendingVideoId = null;
                                this.noVideoMessage.style.display = 'none';
                                this.notifyInfo('Loading Video', 'Loading queued video');
                                
                                // Clear the updating flag after a short delay to allow user interactions
                                setTimeout(() => {
                                    this.isUpdatingFromRemote = false;
                                    console.log('Cleared isUpdatingFromRemote after pending video load');
                                }, 2000);
                                
                                // Check for live stream and sync
                                this.checkAndSyncLiveStream(videoId);
                                
                                // Apply pending video state after video loads
                                if (this.pendingVideoState) {
                                    setTimeout(() => {
                                        this.syncVideoState(this.pendingVideoState);
                                        this.pendingVideoState = null;
                                    }, 3000);
                                }
                            }
                            
                            resolve();
                        },
                        'onStateChange': (event) => this.onPlayerStateChange(event),
                        'onError': (event) => {
                            console.error('YouTube player error:', event.data);
                            this.creatingPlayer = false;
                            const errorMessages = {
                                2: 'Invalid video ID',
                                5: 'Video not supported in HTML5',
                                100: 'Video not found or private',
                                101: 'Video not allowed to be embedded',
                                150: 'Video not allowed to be embedded'
                            };
                            const errorMsg = errorMessages[event.data] || `Player error: ${event.data}`;
                            this.notifyError('Video Error', errorMsg);
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
                
                // Only check for seeks when video is playing or paused (not buffering)
                if (playerState === YT.PlayerState.BUFFERING || 
                    playerState === YT.PlayerState.CUED || 
                    playerState === YT.PlayerState.UNSTARTED) {
                    this.lastKnownTime = currentTime;
                    return;
                }
                
                if (this.lastKnownTime > 0) {
                    // For playing videos, expect time to advance
                    let expectedTime = this.lastKnownTime;
                    if (playerState === YT.PlayerState.PLAYING) {
                        expectedTime += 1;
                    }
                    
                    const timeDiff = Math.abs(currentTime - expectedTime);
                    
                    // If time is off by more than 2 seconds, user probably seeked
                    if (timeDiff > 2) {
                        console.log('Manual seek detected:', this.lastKnownTime, '->', currentTime, 'diff:', timeDiff);
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
        const currentTime = this.player ? this.player.getCurrentTime() : 0;
        console.log('Player state changed:', event.data, 'at time:', currentTime, 'isUpdatingFromRemote:', this.isUpdatingFromRemote);
        
        // Only ignore state changes if we're actively processing a remote sync
        // Don't ignore normal user interactions after the sync delay has passed
        if (this.isUpdatingFromRemote) {
            console.log('Ignoring state change - currently syncing from remote');
            return;
        }
        
        switch (event.data) {
            case YT.PlayerState.PLAYING:
                console.log('Local user started playback - emitting video-play event');
                this.socket.emit('video-play', { currentTime });
                break;
            case YT.PlayerState.PAUSED:
                console.log('Local user paused video - emitting video-pause event at time:', currentTime);
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
                console.log('Video buffering at time:', currentTime);
                break;
            case YT.PlayerState.CUED:
                console.log('Video cued');
                break;
            case YT.PlayerState.UNSTARTED:
                console.log('Video unstarted');
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