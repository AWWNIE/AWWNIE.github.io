# YouTube Sync Rooms

A real-time synchronized YouTube video sharing application that allows users to create private rooms and watch videos together in perfect sync.

## Features

- Create private rooms with unique IDs
- Join existing rooms using room codes
- Real-time synchronized video playback
- Host controls for video management
- Professional dark theme interface
- Responsive design for all devices

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Real-time Communication**: Socket.IO
- **Video Player**: YouTube IFrame API
- **Deployment**: Railway

## Local Development

1. Clone or download the project files
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm start
   ```
4. Open your browser and navigate to `http://localhost:3000`

## Deployment on Railway

1. Create a new project on [Railway](https://railway.app)
2. Connect your GitHub repository or upload the project files
3. Railway will automatically detect the Node.js project and deploy it
4. The application will be available at your Railway-provided URL

## How to Use

1. **Creating a Room**: Click "Create New Room" to generate a unique room ID
2. **Joining a Room**: Enter a room ID and click "Join Room"
3. **Loading Videos**: Paste any YouTube URL and click "Load Video"
4. **Synchronized Playback**: All users in the room will see the same video state

## Project Structure

```
youtube-sync-app/
├── public/
│   ├── index.html      # Main HTML file
│   ├── style.css       # Dark theme styles
│   └── app.js          # Client-side JavaScript
├── server.js           # Express server with Socket.IO
├── package.json        # Project dependencies
└── railway.json        # Railway deployment config
```

## Room Management

- Rooms are automatically created and destroyed
- Host privileges transfer to the next user if the original host leaves
- Rooms are deleted when all users leave
- Each room maintains its own video state and user list

## Video Synchronization

The application maintains perfect sync by:
- Tracking video state (play/pause/seek) in real-time
- Broadcasting state changes to all room members
- Compensating for network latency
- Preventing sync conflicts with update flags

## Browser Compatibility

- Chrome/Chromium (recommended)
- Firefox
- Safari
- Edge

Requires modern browser support for WebSockets and ES6 features.