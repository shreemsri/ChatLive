import { io } from "socket.io-client";

const socket = io("https://chatlive-op54.onrender.com", {
  transports: ["websocket"],
});

export default socket;