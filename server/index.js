

const express = require("express");
const cors = require("cors");
const { createServer } = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });


app.use(cors({
  origin: '*', // Allow requests from the React app
}));


// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Basic route for the root URL
app.get("/", (req, res) => {
  res.send("Welcome to the Socket.IO server!");
});

let users = [];

// Function to broadcast the list of users
const updateUsers = () => {
  io.emit("users", users);
};

const baseURL = "https://songlist.s3.eu-north-1.amazonaws.com/";

io.on("connection", (socket) => {
  // Add new user on connection
  users.push(socket.id);
  updateUsers();

  console.log(`User connected: ${socket.id}`);

  socket.on("select_song", (selectedSong) => {
    // Construct the URL for the selected song
    const songUrl = `${baseURL}${encodeURIComponent(selectedSong)}`;

    // Broadcast the URL to all connected users
    io.emit("song_url", songUrl);

    console.log(`Song URL sent: ${songUrl}`);
  });



  socket.on("request_current_server_time",()=>{
    const now_time=new Date().getTime();
    io.emit('current_time_server',now_time);
  })

  




  socket.on("request_time_to_play", () => {
    const current_time = new Date().getTime();
    const delayed_time = current_time + 3000;

    // Emit the play time to all users
    io.emit("time_to_play_at", delayed_time);

    console.log(`${current_time} is the current time`);
    console.log(`${delayed_time} is the time sent to the client`);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    // Remove user from the list
    users = users.filter((id) => id !== socket.id);
    updateUsers();

    console.log(`User disconnected: ${socket.id}`);
  });
});

httpServer.listen(5000, '0.0.0.0' ,() => {
  console.log("Server started at port 5000");
});







