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
            window.location.href = `/room.html?id=${data.roomId}`;
        });

        this.socket.on('room-joined', (data) => {
            window.location.href = `/room.html?id=${data.roomId}`;
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
        } else {
            alert('Please enter a room ID');
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new HomePage();
});