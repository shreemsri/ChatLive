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

// ------------------ In-memory users only ----------------
const rooms = {}; // DB handles room + messages

// ------------------ Health Route ------------------------
app.get("/", (req, res) => {
  res.send("ChatLive backend with MongoDB + DisplayName running ✅");
});

// ==================================================================
//                          SOCKET EVENTS
// ==================================================================
io.on("connection", (socket) => {
  console.log("⚡ New client connected:", socket.id);

  // ------------------ SET USER / DISPLAY NAME ------------------
  socket.on("set_username", ({ email, displayName }) => {
    socket.email = email;
    socket.displayName = displayName || email.split("@")[0];

    console.log(`🧑 User Set → ${socket.displayName} (${email})`);
  });

  // ------------------ TYPING INDICATORS ------------------
  socket.on("typing", (roomName) => {
    if (roomName)
      io.to(roomName).emit("user_typing", socket.displayName);
  });

  socket.on("stop_typing", (roomName) => {
    if (roomName)
      io.to(roomName).emit("user_stop_typing");
  });

  // ------------------ JOIN / CREATE ROOM ------------------
  socket.on("join_room", async ({ roomName, password }, callback) => {
    if (!roomName || !password)
      return callback({ ok: false, message: "Room name and password required." });

    const username = socket.displayName;

    // Check / Create room in DB
    let room = await Room.findOne({ name: roomName });

    if (!room) {
      room = await Room.create({
        name: roomName,
        password,
        createdBy: username,
      });
      console.log("🆕 Room Created:", roomName);
    } else {
      if (room.password !== password)
        return callback({ ok: false, message: "Wrong password." });
    }

    // Create room memory structure if needed
    if (!rooms[roomName]) rooms[roomName] = { users: {} };

    // Remove user from all previous rooms
    for (const r of Object.keys(rooms)) {
      if (r !== roomName && rooms[r].users[username]) {
        delete rooms[r].users[username];
        io.to(r).emit("room_users", Object.keys(rooms[r].users));
      }
    }

    // Join new room
    socket.join(roomName);
    rooms[roomName].users[username] = true;

    // Load message history
    const dbMessages = await Message.find({ roomName }).sort({ createdAt: 1 });
    const formatted = dbMessages.map((m) => ({
      id: m._id,
      username: m.username,
      text: m.text,
      time: m.createdAt,
      reactions: m.reactions || {},
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

  // ------------------ GET ROOMS LIST ------------------
  socket.on("get_rooms", async (callback) => {
    const list = await Room.find().distinct("name");
    callback(list);
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
      id: msg._id,
      username: msg.username,
      text: msg.text,
      time: msg.createdAt,
      reactions: msg.reactions || {},
    });
  });

  // ==================================================================
  //                         MESSAGE REACTIONS (NEW)
  // ==================================================================
  socket.on("add_reaction", async ({ messageId, reaction }) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg) return;

      const user = socket.displayName;

      if (!msg.reactions[reaction]) msg.reactions[reaction] = [];

      // Toggle reaction
      if (msg.reactions[reaction].includes(user)) {
        msg.reactions[reaction] = msg.reactions[reaction].filter(
          (u) => u !== user
        );
      } else {
        msg.reactions[reaction].push(user);
      }

      await msg.save();

      io.to(msg.roomName).emit("reaction_updated", {
        messageId,
        reactions: msg.reactions,
      });
    } catch (err) {
      console.log("❌ Reaction Error:", err);
    }
  });

  // ------------------ DELETE ROOM ------------------
  socket.on("delete_room", async ({ roomName, password }, callback) => {
    const room = await Room.findOne({ name: roomName });

    if (!room)
      return callback({ ok: false, message: "Room does not exist." });

    if (room.password !== password)
      return callback({ ok: false, message: "Wrong password." });

    await Room.deleteOne({ name: roomName });
    await Message.deleteMany({ roomName });

    delete rooms[roomName];

    const list = await Room.find().distinct("name");
    io.emit("rooms_updated", list);

    callback({ ok: true });
  });

  // ------------------ DISCONNECT ------------------
  socket.on("disconnect", () => {
    const username = socket.displayName;
    console.log(`❌ Disconnected → ${username}`);

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

server.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);