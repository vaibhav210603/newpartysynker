const express = require("express");
const cors = require("cors");
const { createServer } = require("http");
const { Server } = require("socket.io");
const path = require("path");
const ntpClient = require('ntp-client');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { 
  cors: { 
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// NTP server configuration - use multiple servers for redundancy
const NTP_SERVERS = [
  { host: 'pool.ntp.org', port: 123 },
  { host: 'time.google.com', port: 123 },
  { host: 'time.windows.com', port: 123 }
];

// Environment variables
const PORT = process.env.PORT || 5000;
const BASE_URL = process.env.BASE_URL || "https://songlist.s3.eu-north-1.amazonaws.com/";

app.use(cors({
  origin: process.env.CLIENT_URL || "*",
  credentials: true
}));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Basic route for the root URL
app.get("/", (req, res) => {
  res.send("Welcome to the Socket.IO server!");
});

let users = [];
let isPlaying = false;
let currentPlayTime = null;
let currentSongUrl = null;
let playbackStartTime = null;

// Function to broadcast the list of users
const updateUsers = () => {
  io.emit("users", users);
};

// Function to get NTP time with fallback and retry
const getNTPTime = async (retryCount = 0) => {
  const maxRetries = 3;
  
  if (retryCount >= maxRetries) {
    console.warn('All NTP servers failed, falling back to system time');
    return Date.now();
  }

  // Try each NTP server in sequence
  for (const server of NTP_SERVERS) {
    try {
      const time = await new Promise((resolve, reject) => {
        ntpClient.getNetworkTime(server.host, server.port, (err, date) => {
          if (err) {
            reject(err);
          } else {
            resolve(date.getTime());
          }
        });
      });
      return time;
    } catch (error) {
      console.error(`Error getting time from ${server.host}:`, error);
      // Continue to next server
    }
  }

  // If all servers failed, retry with exponential backoff
  if (retryCount < maxRetries) {
    const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
    await new Promise(resolve => setTimeout(resolve, delay));
    return getNTPTime(retryCount + 1);
  }

  // Fallback to system time if all retries fail
  return Date.now();
};

// Function to start countdown
const startCountdown = async (targetTime) => {
  const now = await getNTPTime();
  const timeUntilPlay = targetTime - now;
  
  // Send countdown updates every 100ms
  const countdownInterval = setInterval(async () => {
    const currentTime = await getNTPTime();
    const remainingTime = targetTime - currentTime;
    
    if (remainingTime <= 0) {
      clearInterval(countdownInterval);
      playbackStartTime = await getNTPTime();
      io.emit('play_now', { 
        startTime: playbackStartTime, 
        songUrl: currentSongUrl,
        serverTime: playbackStartTime // Send server time for client calibration
      });
      isPlaying = false;
      currentPlayTime = null;
    } else {
      io.emit('countdown', remainingTime);
    }
  }, 100);
};

io.on("connection", (socket) => {
  // Add new user on connection
  users.push(socket.id);
  updateUsers();

  console.log(`User connected: ${socket.id}`);

  // If there's an active playback session, send the current play time to the new user
  if (isPlaying && currentPlayTime) {
    socket.emit('time_to_play_at', currentPlayTime);
  }

  socket.on("select_song", (selectedSong) => {
    // Construct the URL for the selected song
    const songUrl = `${BASE_URL}${encodeURIComponent(selectedSong)}`;
    currentSongUrl = songUrl;

    // Broadcast the URL to all connected users
    io.emit("song_url", songUrl);

    console.log(`Song URL sent: ${songUrl}`);
  });

  socket.on("request_current_server_time", async () => {
    try {
      const serverTime = await getNTPTime();
      // Send response only to the requesting socket
      socket.emit('current_time_server', serverTime);
      console.log(`Time response sent to ${socket.id}: ${serverTime}`);
    } catch (error) {
      console.error('Error handling time request:', error);
      // Send fallback time if there's an error
      socket.emit('current_time_server', Date.now());
    }
  });

  socket.on("request_time_to_play", async () => {
    try {
      if (isPlaying) {
        // If already playing, send the current play time
        socket.emit('time_to_play_at', currentPlayTime);
        return;
      }

      const currentTime = await getNTPTime();
      const delayedTime = currentTime + 3000; // 3 seconds delay
      
      isPlaying = true;
      currentPlayTime = delayedTime;

      // Emit the play time to all users
      io.emit("time_to_play_at", delayedTime);
      
      // Start countdown
      startCountdown(delayedTime);

      console.log(`Current NTP time: ${currentTime}`);
      console.log(`Scheduled play time: ${delayedTime}`);
    } catch (error) {
      console.error('Error handling play request:', error);
      // Fallback to system time if there's an error
      const currentTime = Date.now();
      const delayedTime = currentTime + 3000;
      io.emit("time_to_play_at", delayedTime);
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    // Remove user from the list
    users = users.filter((id) => id !== socket.id);
    updateUsers();

    console.log(`User disconnected: ${socket.id}`);
  });
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server started at port ${PORT}`);
});







