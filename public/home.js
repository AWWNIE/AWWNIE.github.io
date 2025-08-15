class HomePage {
    constructor() {
        this.socket = io();
        this.initializeElements();
        this.setupEventListeners();
        this.setupSocketListeners();
    }

    initializeElements() {
        this.createRoomBtn = document.getElementById('create-room-btn');
        this.joinRoomBtn = document.getElementById('join-room-btn');
        this.roomIdInput = document.getElementById('room-id-input');
        this.notificationContainer = document.getElementById('notification-container');
    }

    // Simple notification system for home page
    showNotification(title, message, type = 'info', duration = 5000) {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] ${type.toUpperCase()}: ${title} - ${message}`;
        console.log(logMessage);
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <button class="notification-close">&times;</button>
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        `;
        
        this.notificationContainer.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        const hideTimeout = setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
        
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            clearTimeout(hideTimeout);
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        });
        
        return notification;
    }

    setupEventListeners() {
        this.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        
        this.roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
    }

    setupSocketListeners() {
        this.socket.on('room-created', (data) => {
            this.showNotification('Room Created', `Room ${data.roomId} created successfully`, 'success', 2000);
            setTimeout(() => {
                window.location.href = `/room.html?id=${data.roomId}`;
            }, 1000);
        });

        this.socket.on('room-joined', (data) => {
            this.showNotification('Joining Room', `Entering room ${data.roomId}...`, 'success', 2000);
            setTimeout(() => {
                window.location.href = `/room.html?id=${data.roomId}`;
            }, 1000);
        });

        this.socket.on('error', (message) => {
            this.showNotification('Error', message, 'error');
        });
    }

    createRoom() {
        this.showNotification('Creating Room', 'Setting up your new room...', 'info', 3000);
        this.socket.emit('create-room');
    }

    joinRoom() {
        const roomId = this.roomIdInput.value.trim();
        if (roomId) {
            this.showNotification('Joining Room', `Attempting to join room ${roomId}...`, 'info', 3000);
            this.socket.emit('join-room', roomId);
        } else {
            this.showNotification('Invalid Input', 'Please enter a room ID', 'warning');
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new HomePage();
});