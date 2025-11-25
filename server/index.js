// server/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

// ✅ Allow both local dev + deployed frontend
const allowedOrigins = [
  "http://localhost:3000",
  "https://chat-live-gold.vercel.app",
];

// Express CORS (for normal HTTP requests)
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  })
);

const server = http.createServer(app);

// Socket.io CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Simple health route
app.get("/", (req, res) => {
  res.send("ChatLive backend is running ✅");
});

// In-memory rooms
// rooms = { roomName: { users: {socketId: username}, messages: [] } }
const rooms = {};

io.on("connection", (socket) => {
  console.log("✅ New client:", socket.id);

  // Set username
  socket.on("set_username", (username) => {
    socket.username = username;
    console.log("set_username:", username, "for", socket.id);
  });

  // Typing indicator
  socket.on("typing", (roomName) => {
    if (!roomName) return;
    io.to(roomName).emit("user_typing", socket.username || "Someone");
  });

  socket.on("stop_typing", (roomName) => {
    if (!roomName) return;
    io.to(roomName).emit("user_stop_typing");
  });

  // Join / create room
  socket.on("join_room", (roomName, callback) => {
    if (!roomName) return;
    console.log("➡️ join_room:", roomName, "from", socket.id);

    if (!rooms[roomName]) {
      rooms[roomName] = { users: {}, messages: [] };
    }

    // leave other rooms
    for (const r of socket.rooms) {
      if (r !== socket.id) {
        socket.leave(r);
        if (rooms[r] && rooms[r].users[socket.id]) {
          delete rooms[r].users[socket.id];
          io.to(r).emit("room_users", Object.values(rooms[r].users));
        }
      }
    }

    socket.join(roomName);
    rooms[roomName].users[socket.id] = socket.username || "Anonymous";

    const data = {
      messages: rooms[roomName].messages,
      users: Object.values(rooms[roomName].users),
    };

    if (typeof callback === "function") {
      callback(data);
    }

    io.to(roomName).emit("room_users", data.users);
  });

  // List rooms
  socket.on("get_rooms", (callback) => {
    const list = Object.keys(rooms);
    if (typeof callback === "function") {
      callback(list);
    }
  });

  // Send message
  socket.on("send_message", ({ roomName, text }) => {
    if (!roomName || !rooms[roomName]) return;

    const msg = {
      username: socket.username || "Anonymous",
      text,
      time: new Date().toISOString(), // store ISO
    };

    rooms[roomName].messages.push(msg);
    io.to(roomName).emit("receive_message", msg);
  });

  // Delete room
  socket.on("delete_room", (roomName, callback) => {
    console.log("🗑 delete_room:", roomName);
    if (!rooms[roomName]) {
      if (callback) callback(false);
      return;
    }

    const socketIds = Object.keys(rooms[roomName].users);
    socketIds.forEach((sid) => {
      const s = io.sockets.sockets.get(sid);
      if (s) s.leave(roomName);
    });

    delete rooms[roomName];

    io.emit("rooms_updated", Object.keys(rooms));
    if (callback) callback(true);
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
    for (const roomName of Object.keys(rooms)) {
      if (rooms[roomName].users[socket.id]) {
        delete rooms[roomName].users[socket.id];
        io.to(roomName).emit(
          "room_users",
          Object.values(rooms[roomName].users)
        );
      }
    }
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`🔥 Server listening on port ${PORT}`);
});