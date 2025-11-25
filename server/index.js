// server/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

// Allowed frontend origins
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://chat-live-gold.vercel.app",
];

// Express CORS
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  })
);

const server = http.createServer(app);

// Socket.io CORS
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Debug socket errors
io.engine.on("connection_error", (err) => {
  console.log(
    "🔥 Socket error:",
    err.req?.headers?.origin,
    err.code,
    err.message
  );
});

// Health check
app.get("/", (req, res) => {
  res.send("ChatLive backend is running ✅");
});

/**
 * rooms structure:
 * {
 *   roomName: {
 *     password: "plain-text-password",
 *     users: { username: true },
 *     messages: [{ username, text, time }]
 *   }
 * }
 */
const rooms = {};

io.on("connection", (socket) => {
  console.log("✅ New client:", socket.id);

  // Set username
  socket.on("set_username", (username) => {
    socket.username = username;
    console.log("set_username:", username, "for", socket.id);
  });

  // Typing indicators
  socket.on("typing", (roomName) => {
    if (!roomName) return;
    io.to(roomName).emit("user_typing", socket.username || "Someone");
  });

  socket.on("stop_typing", (roomName) => {
    if (!roomName) return;
    io.to(roomName).emit("user_stop_typing");
  });

  // JOIN / CREATE ROOM (with password)
  socket.on("join_room", (payload, callback) => {
    const { roomName, password } = payload || {};

    if (!roomName || !password) {
      callback &&
        callback({ ok: false, message: "Room name and password are required." });
      return;
    }

    const username = socket.username || "Anonymous";
    console.log(`➡️ join_room: ${roomName} from ${username}`);

    const existingRoom = rooms[roomName];
    let createdNew = false;

    if (!existingRoom) {
      // Create new room
      rooms[roomName] = {
        password,
        users: {},
        messages: [],
      };
      createdNew = true;
      console.log("🆕 Room created:", roomName);
    } else {
      // Wrong password
      if (existingRoom.password !== password) {
        callback &&
          callback({ ok: false, message: "Wrong password for this room." });
        return;
      }
    }

    // Remove user from all other rooms
    for (const rName of Object.keys(rooms)) {
      if (rName !== roomName && rooms[rName].users[username]) {
        delete rooms[rName].users[username];
        io.to(rName).emit("room_users", Object.keys(rooms[rName].users));
      }
    }

    // Join room
    socket.join(roomName);
    rooms[roomName].users[username] = true;

    const data = {
      ok: true,
      messages: rooms[roomName].messages,
      users: Object.keys(rooms[roomName].users),
    };

    callback && callback(data);

    // Notify users
    io.to(roomName).emit("room_users", data.users);

    // Refresh room list globally if new room created
    if (createdNew) io.emit("rooms_updated", Object.keys(rooms));
  });

  // List rooms
  socket.on("get_rooms", (callback) => {
    callback && callback(Object.keys(rooms));
  });

  // Send message
  socket.on("send_message", ({ roomName, text }) => {
    if (!roomName || !rooms[roomName] || !text) return;

    const msg = {
      username: socket.username || "Anonymous",
      text: text.trim(),
      time: new Date().toISOString(), // ISO timestamp
    };

    rooms[roomName].messages.push(msg);
    io.to(roomName).emit("receive_message", msg);
  });

  // DELETE ROOM (with password)
  socket.on("delete_room", (payload, callback) => {
    const { roomName, password } = payload || {};

    console.log("🗑 delete_room:", roomName);

    if (!roomName || !password || !rooms[roomName]) {
      callback &&
        callback({ ok: false, message: "Room not found or missing password." });
      return;
    }

    // Wrong password
    if (rooms[roomName].password !== password) {
      callback &&
        callback({ ok: false, message: "Wrong password. Cannot delete room." });
      return;
    }

    delete rooms[roomName];

    io.emit("rooms_updated", Object.keys(rooms));
    callback && callback({ ok: true });
  });

  // Disconnect cleanup
  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);

    const username = socket.username || "Anonymous";

    for (const roomName of Object.keys(rooms)) {
      if (rooms[roomName].users[username]) {
        delete rooms[roomName].users[username];
        io.to(roomName).emit(
          "room_users",
          Object.keys(rooms[roomName].users)
        );
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`🔥 Server listening on port ${PORT}`);
});