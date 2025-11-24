// client/src/socket.js
import { io } from "socket.io-client";

// Use Render in production, localhost in development
const URL =
  process.env.NODE_ENV === "production"
    ? "https://chatlive-1.onrender.com"
    : "http://localhost:5001";

console.log("🔌 Connecting to:", URL);

const socket = io(URL, {
  // IMPORTANT: force HTTP long-polling only in production.
  // This avoids WebSocket upgrade issues on free hosts like Render.
  transports: ["polling"],
  upgrade: false,
  withCredentials: false,
});

socket.on("connect", () => {
  console.log("✅ Socket connected:", socket.id);
});

socket.on("connect_error", (err) => {
  console.error("❌ Socket connection error:", err.message);
});

export default socket;