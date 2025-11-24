import { io } from "socket.io-client";

const URL =
  process.env.NODE_ENV === "production"
    ? "https://chatlive-server.onrender.com"
    : "http://localhost:5001";

console.log("🔌 Connecting to:", URL);

const socket = io(URL, {
  transports: ["polling"],
  withCredentials: true,
});

socket.on("connect", () => {
  console.log("✅ Socket connected:", socket.id);
});

socket.on("connect_error", (err) => {
  console.error("❌ Socket connection error:", err.message);
});

export default socket;