// server/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// In-memory rooms:
// rooms = { roomName: { users: { socketId: username }, messages: [{ username, text, time }] } }
const rooms = {};

app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

io.on("connection", (socket) => {
  console.log("✅ Client connected:", socket.id);

  // ===== Set username for this socket =====
  socket.on("set_username", (username) => {
    socket.username = username;
    console.log("👤 Username set:", username, "for", socket.id);
  });

  // ===== Join or create room =====
  socket.on("join_room", (roomName, callback) => {
    if (!roomName) return;
    console.log("📥 join_room:", roomName, "from", socket.id);

    // Create room if it doesn't exist
    if (!rooms[roomName]) {
      rooms[roomName] = { users: {}, messages: [] };
    }

    // Leave previous rooms (except its own id)
    for (const r of socket.rooms) {
      if (r !== socket.id) {
        socket.leave(r);
        if (rooms[r] && rooms[r].users[socket.id]) {
          delete rooms[r].users[socket.id];
          io.to(r).emit("room_users", Object.values(rooms[r].users));
        }
      }
    }

    // Join new room
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

    // send updated room list to everyone
    io.emit("rooms_updated", Object.keys(rooms));
  });

  // ===== Get list of rooms =====
  socket.on("get_rooms", (callback) => {
    const list = Object.keys(rooms);
    if (typeof callback === "function") {
      callback(list);
    }
  });

  // ===== Handle chat messages =====
  socket.on("send_message", ({ roomName, text }) => {
    if (!roomName || !text || !rooms[roomName]) return;

    const msg = {
      username: socket.username || "Anonymous",
      text,
      time: new Date().toLocaleTimeString(),
    };

    rooms[roomName].messages.push(msg);
    io.to(roomName).emit("receive_message", msg);
  });

  // ===== Delete room =====
  socket.on("delete_room", (roomName, callback) => {
    console.log("🗑️ delete_room requested for:", roomName);

    if (!roomName || !rooms[roomName]) {
      console.log("⚠️ Room not found:", roomName);
      if (typeof callback === "function") callback(false);
      return;
    }

    delete rooms[roomName];
    const updated = Object.keys(rooms);
    console.log("📂 Rooms after delete:", updated);

    io.emit("rooms_updated", updated);

    if (typeof callback === "function") callback(true);
  });

  // ===== Clean up on disconnect =====
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

const PORT = 5001; // IMPORTANT: must match client/src/socket.js
server.listen(PORT, () => {
  console.log("🔥 Server running on port", PORT);
});