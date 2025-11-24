// client/src/socket.js
import { io } from "socket.io-client";

// Hard-coded Render backend URL
const socket = io("https://chatlive-1.onrender.com", {
  transports: ["polling"],  // more reliable on Render free tier
  upgrade: false,
});

console.log("🔌 Connecting to:", "https://chatlive-1.onrender.com");

socket.on("connect", () => {
  console.log("✅ Socket connected:", socket.id);
});

socket.on("connect_error", (err) => {
  console.error("❌ Socket connection error:", err.message);
});

export default socket;