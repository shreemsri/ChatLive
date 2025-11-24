// client/src/socket.js
import { io } from "socket.io-client";

// Use Render in production, localhost in dev
const URL =
  process.env.NODE_ENV === "production"
    ? "https://chatlive-1.onrender.com"
    : "http://localhost:5001";

console.log("🔌 Connecting to:", URL);

const socket = io(URL, {
  // Force HTTP long-polling only from browser
  transports: ["polling"],
  upgrade: false,          // <– do NOT try WebSocket
  withCredentials: true,
});

socket.on("connect", () => {
  console.log("✅ Socket connected:", socket.id);
});

socket.on("connect_error", (err) => {
  console.error("❌ Socket connection error:", err.message);
});

export default socket;