// server/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

// Allow requests from anywhere (Render + Vercel + localhost)
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// In-memory rooms
// rooms = { roomName: { users: {socketId: username}, messages: [{username,text,time}] } }
const rooms = {};

app.get("/", (req, res) => {
  res.send("ChatLive backend is running 🚀");
});

io.on("connection", (socket) => {
  console.log("✅ New client connected:", socket.id);

  // ====== SET USERNAME ======
  socket.on("set_username", (username) => {
    socket.username = username;
    console.log("set_username:", username, "for", socket.id);
  });

  // ====== JOIN OR CREATE ROOM ======
  socket.on("join_room", (roomName, callback) => {
    if (!roomName) return;

    console.log("➡️ join_room:", roomName, "from", socket.id);

    // Create room if doesn't exist
    if (!rooms[roomName]) {
      rooms[roomName] = { users: {}, messages: [] };
    }

    // Leave all previous rooms except own socket room
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
    io.emit("rooms_updated", Object.keys(rooms));
  });

  // ====== GET ROOM LIST ======
  socket.on("get_rooms", (callback) => {
    const list = Object.keys(rooms);
    if (typeof callback === "function") {
      callback(list);
    }
  });

  // ====== SEND MESSAGE ======
  socket.on("send_message", ({ roomName, text }) => {
    if (!roomName || !rooms[roomName]) return;
    if (!text || !text.trim()) return;

    const msg = {
      username: socket.username || "Anonymous",
      text: text.trim(),
      time: new Date().toLocaleTimeString(),
    };

    rooms[roomName].messages.push(msg);
    io.to(roomName).emit("receive_message", msg);
  });

  // ====== DELETE ROOM ======
  socket.on("delete_room", (roomName, callback) => {
    console.log("🗑 delete_room requested for:", roomName);

    if (!roomName || !rooms[roomName]) {
      console.log("🗑 delete_room failed – room not found");
      if (typeof callback === "function") callback(false);
      return;
    }

    // Make all users leave that room
    const socketIds = Object.keys(rooms[roomName].users || {});
    socketIds.forEach((id) => {
      const s = io.sockets.sockets.get(id);
      if (s) {
        s.leave(roomName);
      }
    });

    // Delete the room
    delete rooms[roomName];
    console.log("✅ Room deleted. Remaining rooms:", Object.keys(rooms));

    // Notify everyone of updated room list
    io.emit("rooms_updated", Object.keys(rooms));

    if (typeof callback === "function") callback(true);
  });

  // ====== DISCONNECT ======
  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);

    // Remove user from any rooms they were in
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
  console.log("🔥 ChatLive backend running on port", PORT);
});