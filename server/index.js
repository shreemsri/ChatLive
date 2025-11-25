// server/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

// ✅ Allow both local dev + deployed frontend
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

io.engine.on("connection_error", (err) => {
  console.log(
    "🔥 Socket error:",
    err.req?.headers?.origin,
    err.code,
    err.message
  );
});

// Simple health route
app.get("/", (req, res) => {
  res.send("ChatLive backend is running ✅");
});

/**
 * rooms = {
 *   roomName: {
 *     password: "plain-text-password",   // demo only, not secure
 *     users: { [username]: true },
 *     messages: [{ username, text, time }]
 *   }
 * }
 */
const rooms = {};

io.on("connection", (socket) => {
  console.log("✅ New client:", socket.id);

  // --- Username for this socket ---
  socket.on("set_username", (username) => {
    socket.username = username;
    console.log("set_username:", username, "for", socket.id);
  });

  // --- Typing indicator ---
  socket.on("typing", (roomName) => {
    if (!roomName) return;
    io.to(roomName).emit("user_typing", socket.username || "Someone");
  });

  socket.on("stop_typing", (roomName) => {
    if (!roomName) return;
    io.to(roomName).emit("user_stop_typing");
  });

  // --- JOIN / CREATE ROOM WITH PASSWORD ---
  socket.on("join_room", (payload, callback) => {
    const { roomName, password } = payload || {};

    if (!roomName || !password) {
      callback &&
        callback({
          ok: false,
          message: "Room name and password are required.",
        });
      return;
    }

    const username = socket.username || "Anonymous";
    console.log("➡️ join_room:", roomName, "from", username, socket.id);

    const existing = rooms[roomName];

    if (!existing) {
      // New room – set password
      rooms[roomName] = {
        password,
        users: {},
        messages: [],
      };
      console.log("🆕 Created room:", roomName);
    } else {
      // Existing room – verify password
      if (existing.password !== password) {
        console.log("❌ Wrong password for room:", roomName);
        callback &&
          callback({
            ok: false,
            message: "Wrong password for this room.",
          });
        return;
      }
    }

    // Remove this user from all other rooms (by username)
    for (const rName of Object.keys(rooms)) {
      if (rName === roomName) continue;
      if (rooms[rName].users[username]) {
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
    io.to(roomName).emit("room_users", data.users);
  });

  // --- List rooms ---
  socket.on("get_rooms", (callback) => {
    const list = Object.keys(rooms);
    callback && callback(list);
  });

  // --- Send message ---
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

  // --- DELETE ROOM (REQUIRE PASSWORD) ---
  socket.on("delete_room", (payload, callback) => {
    const { roomName, password } = payload || {};
    console.log("🗑 delete_room requested:", roomName);

    if (!roomName || !password || !rooms[roomName]) {
      callback &&
        callback({
          ok: false,
          message: "Room not found or missing password.",
        });
      return;
    }

    if (rooms[roomName].password !== password) {
      console.log("❌ Wrong password when deleting room:", roomName);
      callback &&
        callback({
          ok: false,
          message: "Wrong password. Cannot delete room.",
        });
      return;
    }

    // Actually delete the room
    delete rooms[roomName];

    // Notify all clients to refresh rooms list
    io.emit("rooms_updated", Object.keys(rooms));

    callback && callback({ ok: true });
  });

  // --- Disconnect ---
  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
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
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`🔥 Server listening on port ${PORT}`);
});