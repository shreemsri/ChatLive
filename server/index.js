// server/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "https://chat-live-gold.vercel.app",
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  })
);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.get("/", (req, res) => {
  res.send("ChatLive backend is running ✅");
});

// Store rooms:
// rooms = { roomName: { users: {username:true}, messages: [] } }
const rooms = {};

io.on("connection", (socket) => {
  console.log("✅ New client:", socket.id);

  socket.on("set_username", (username) => {
    socket.username = username;
  });

  socket.on("typing", (roomName) => {
    if (!roomName) return;
    io.to(roomName).emit("user_typing", socket.username || "Someone");
  });

  socket.on("stop_typing", (roomName) => {
    if (!roomName) return;
    io.to(roomName).emit("user_stop_typing");
  });

  socket.on("join_room", (roomName, callback) => {
    if (!roomName) return;

    const username = socket.username || "Anonymous";

    if (!rooms[roomName]) rooms[roomName] = { users: {}, messages: [] };

    // Remove user from all rooms first
    for (const rName of Object.keys(rooms)) {
      if (rooms[rName].users[username]) {
        delete rooms[rName].users[username];
        io.to(rName).emit("room_users", Object.keys(rooms[rName].users));
      }
    }

    socket.join(roomName);

    rooms[roomName].users[username] = true;

    const data = {
      messages: rooms[roomName].messages,
      users: Object.keys(rooms[roomName].users),
    };

    if (callback) callback(data);

    io.to(roomName).emit("room_users", data.users);
  });

  socket.on("get_rooms", (callback) => {
    if (callback) callback(Object.keys(rooms));
  });

  socket.on("send_message", ({ roomName, text }) => {
    if (!roomName || !rooms[roomName] || !text) return;

    const msg = {
      username: socket.username || "Anonymous",
      text: text.trim(),
      time: new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    rooms[roomName].messages.push(msg);
    io.to(roomName).emit("receive_message", msg);
  });

  // Correct delete room
  socket.on("delete_room", (roomName, callback) => {
    if (!rooms[roomName]) return callback(false);

    delete rooms[roomName];

    io.emit("rooms_updated", Object.keys(rooms));

    if (callback) callback(true);
  });

  socket.on("disconnect", () => {
    const username = socket.username || "Anonymous";

    for (const roomName of Object.keys(rooms)) {
      if (rooms[roomName]?.users?.[username]) {
        delete rooms[roomName].users[username];
        io.to(roomName).emit(
          "room_users",
          Object.keys(rooms[roomName].users)
        );
      }
    }

    console.log(`❌ User left: ${username}`);
  });
}); // <-- THIS WAS MISSING

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`🔥 Server running on port ${PORT}`));