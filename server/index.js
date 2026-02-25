require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");

// Mongo Models
const Message = require("./models/Message");
const Room = require("./models/Room");

// ------------------ MongoDB Connection ------------------
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("📌 MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ------------------ Express + CORS -----------------------
const app = express();

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://chat-live-gold.vercel.app",
];

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  })
);

const server = http.createServer(app);

// ------------------ Socket.IO Setup ---------------------
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// In-memory users only (DB handles rooms/messages)
const rooms = {};

// ------------------ Health Check ------------------------
app.get("/", (req, res) => {
  res.send("ChatLive backend with MongoDB + DisplayName running ✅");
});

// ------------------ SOCKET EVENTS -----------------------
io.on("connection", (socket) => {
  console.log("⚡ New client connected:", socket.id);

  // ------------------ SET USERNAME / DISPLAY NAME ------------------
  socket.on("set_username", ({ email, displayName }) => {
    socket.email = email;
    socket.displayName = displayName || email.split("@")[0];

    console.log(`🧑 Username set → ${socket.displayName} (${email})`);
  });

  // ------------------ TYPING INDICATORS ------------------
  socket.on("typing", (roomName) => {
    if (roomName) {
      io.to(roomName).emit("user_typing", socket.displayName);
    }
  });

  socket.on("stop_typing", (roomName) => {
    if (roomName) {
      io.to(roomName).emit("user_stop_typing");
    }
  });

  // ------------------ JOIN or CREATE ROOM ------------------
  socket.on("join_room", async ({ roomName, password }, callback) => {
    if (!roomName || !password) {
      return callback({
        ok: false,
        message: "Room name and password required.",
      });
    }

    const username = socket.displayName;

    // Look up room in DB
    let room = await Room.findOne({ name: roomName });

    // Create new room
    if (!room) {
      room = await Room.create({
        name: roomName,
        password,
        createdBy: username,
      });
      console.log("🆕 Room created:", roomName);
    } else {
      // Validate password
      if (room.password !== password) {
        return callback({ ok: false, message: "Wrong password." });
      }
    }

    // Initialize memory room
    if (!rooms[roomName]) rooms[roomName] = { users: {} };

    // Remove user from other rooms
    for (const r of Object.keys(rooms)) {
      if (r !== roomName && rooms[r].users[username]) {
        delete rooms[r].users[username];
        io.to(r).emit("room_users", Object.keys(rooms[r].users));
      }
    }

    // Join room
    socket.join(roomName);
    rooms[roomName].users[username] = true;

    // Load message history from DB
    const dbMessages = await Message.find({ roomName }).sort({ createdAt: 1 });

    const formatted = dbMessages.map((m) => ({
      username: m.username,
      text: m.text,
      time: m.createdAt,
    }));

    callback({
      ok: true,
      messages: formatted,
      users: Object.keys(rooms[roomName].users),
      createdBy: room.createdBy,
    });

    io.to(roomName).emit("room_users", Object.keys(rooms[roomName].users));

    // Update room list for all clients
    const allRooms = await Room.find().distinct("name");
    io.emit("rooms_updated", allRooms);
  });

  // ------------------ GET ALL ROOMS ------------------
  socket.on("get_rooms", async (callback) => {
    const roomsList = await Room.find().distinct("name");
    callback(roomsList);
  });

  // ------------------ SEND MESSAGE ------------------
  socket.on("send_message", async ({ roomName, text }) => {
    if (!roomName || !text?.trim()) return;

    const msg = await Message.create({
      username: socket.displayName,
      text: text.trim(),
      roomName,
    });

    io.to(roomName).emit("receive_message", {
      username: msg.username,
      text: msg.text,
      time: msg.createdAt,
    });
  });

  // ------------------ DELETE ROOM ------------------
  socket.on("delete_room", async ({ roomName, password }, callback) => {
    const room = await Room.findOne({ name: roomName });
    if (!room) {
      return callback({ ok: false, message: "Room does not exist." });
    }

    if (room.password !== password) {
      return callback({ ok: false, message: "Wrong password." });
    }

    await Room.deleteOne({ name: roomName });
    await Message.deleteMany({ roomName });

    delete rooms[roomName];

    const updated = await Room.find().distinct("name");
    io.emit("rooms_updated", updated);

    callback({ ok: true });
  });

  // ------------------ DISCONNECT ------------------
  socket.on("disconnect", () => {
    const username = socket.displayName;
    console.log(`❌ User disconnected: ${username}`);

    for (const r of Object.keys(rooms)) {
      if (rooms[r].users[username]) {
        delete rooms[r].users[username];
        io.to(r).emit("room_users", Object.keys(rooms[r].users));
      }
    }
  });
});

// ------------------ START SERVER ------------------------
const PORT = process.env.PORT || 5001;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});