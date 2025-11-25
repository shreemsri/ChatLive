// client/src/socket.js
import { io } from "socket.io-client";

// Hard-coded Render backend URL
const BACKEND_URL = "https://chatlive-1.onrender.com";

const socket = io(BACKEND_URL, {
  transports: ["polling"], // disable websocket to avoid Render proxy issues
  upgrade: false,
});

console.log("🔌 Connecting to:", BACKEND_URL);

socket.on("connect", () => {
  console.log("✅ Socket connected:", socket.id);
});

socket.on("connect_error", (err) => {
  console.error("❌ Socket connection error:", err.message);
});

export default socket;