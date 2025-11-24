import { io } from "socket.io-client";

const socket = io("https://chatlive-server.onrender.com", {
  transports: ["websocket"],
});

export default socket;