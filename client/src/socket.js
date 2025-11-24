// client/src/socket.js
import { io } from "socket.io-client";

// 🔴 NO env variable, NO condition – just hard-coded Render URL
const socket = io("https://chatlive-1.onrender.com", {
  transports: ["polling"],
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