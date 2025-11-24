// server/index.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();

// Allow your Vercel frontend + local dev
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://chat-live-gold.vercel.app",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://chat-live-gold.vercel.app",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["polling", "websocket"], // let server support both
  pingTimeout: 60000,
});

// In-memory rooms: { roomName: { users: {socketId: username}, messages: [] } }
const rooms = {};

app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

io.on("connection", (socket) => {
  console.log("✅ Client connected:", socket.id);

  // Username from client
  socket.on("set_username", (username) => {
    socket.username = username;
    console.log("👤 set_username:", username);
  });

  // Join / create room
  socket.on("join_room", (roomName, callback) => {
    if (!roomName) return;
    console.log("📥 join_room:", roomName, "from", socket.id);

    if (!rooms[roomName]) {
      rooms[roomName] = { users: {}, messages: [] };
    }

    // Leave all other rooms except own id
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
    io.emit("rooms_updated", Object.keys(rooms));
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
    if (!roomName || !rooms[roomName] || !text?.trim()) return;

    const msg = {
      username: socket.username || "Anonymous",
      text: text.trim(),
      time: new Date().toLocaleTimeString(),
    };

    rooms[roomName].messages.push(msg);
    io.to(roomName).emit("receive_message", msg);
  });

  // Delete room
  socket.on("delete_room", (roomName, callback) => {
    console.log("🗑 delete_room:", roomName);
    if (!roomName || !rooms[roomName]) {
      if (typeof callback === "function") callback(false);
      return;
    }

    delete rooms[roomName];
    io.emit("rooms_updated", Object.keys(rooms));
    if (typeof callback === "function") callback(true);
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
    for (const [roomName, room] of Object.entries(rooms)) {
      if (room.users[socket.id]) {
        delete room.users[socket.id];
        io.to(roomName).emit("room_users", Object.values(room.users));
      }
    }
  });
});

// Optional debug
io.engine.on("connection_error", (err) => {
  console.log("⚠️ engine connection error:", err.code, err.message);
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log("🔥 Server running on port", PORT);
});