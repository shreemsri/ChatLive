// server/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

// Simple test route
app.get("/", (req, res) => {
  res.send("ChatLive backend is running ✅");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://chat-live-gold.vercel.app",
    ],
    methods: ["GET", "POST"],
  },
});

// In-memory rooms
// rooms = { roomName: { users: {socketId: username}, messages: [{username,text,time}] } }
const rooms = {};

io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);

  // Store username on the socket
  socket.on("set_username", (username) => {
    socket.username = username;
    console.log("👤 set_username:", username, "for", socket.id);
  });

  // Join or create a room
  socket.on("join_room", (roomName, callback) => {
    if (!roomName) return;
    console.log("➡️ join_room:", roomName, "from", socket.id);

    if (!rooms[roomName]) {
      rooms[roomName] = { users: {}, messages: [] };
    }

    // Leave previous rooms (except own socket id)
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

    console.log("✅ join_room callback data:", data);

    if (typeof callback === "function") {
      callback(data);
    }

    // Broadcast updated user list
    io.to(roomName).emit("room_users", data.users);

    // Broadcast updated room list to all clients
    io.emit("rooms_updated", Object.keys(rooms));
  });

  // Return list of rooms
  socket.on("get_rooms", (callback) => {
    const list = Object.keys(rooms);
    console.log("📂 get_rooms from", socket.id, "=>", list);
    if (typeof callback === "function") {
      callback(list);
    }
  });

  // Handle chat messages
  socket.on("send_message", ({ roomName, text }) => {
    console.log("💬 send_message received:", { roomName, text, from: socket.id });

    if (!roomName || !rooms[roomName]) {
      console.log("⚠️ send_message: invalid room", roomName);
      return;
    }

    const msg = {
      username: socket.username || "Anonymous",
      text,
      time: new Date().toLocaleTimeString(),
    };

    rooms[roomName].messages.push(msg);
    console.log("📤 Broadcasting message to room:", roomName, msg);

    io.to(roomName).emit("receive_message", msg);
  });

  // Delete a room (optional feature)
  socket.on("delete_room", (roomName, callback) => {
    console.log("🧨 delete_room requested:", roomName);

    if (!rooms[roomName]) {
      if (callback) callback(false);
      return;
    }

    // Remove all users from that room
    const socketIds = Object.keys(rooms[roomName].users);
    socketIds.forEach((sid) => {
      const s = io.sockets.sockets.get(sid);
      if (s) {
        s.leave(roomName);
      }
    });

    delete rooms[roomName];

    // Notify all clients
    const list = Object.keys(rooms);
    io.emit("rooms_updated", list);

    if (callback) callback(true);
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);

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
  console.log("🔥 Server running on port", PORT);
});