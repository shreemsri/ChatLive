// src/App.js
import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";
import "./App.css";

import { auth, googleProvider } from "./firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";

// 👇 change ONLY THIS for local/dev/prod
const socket = io("https://chatlive-1.onrender.com", {
  transports: ["websocket", "polling"],
});

function App() {
  // ==== AUTH ====
  const [username, setUsername] = useState(localStorage.getItem("username") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ==== CHAT STATE ====
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [typingUser, setTypingUser] = useState("");
  const [typingTimeout, setTypingTimeout] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

  // ==== THEME EFFECT ====
  useEffect(() => {
    if (theme === "dark") document.body.classList.add("dark-mode");
    else document.body.classList.remove("dark-mode");

    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === "light" ? "dark" : "light"));

  // ==== SOCKET LISTENERS ====
  useEffect(() => {
    socket.on("receive_message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("room_users", (list) => setUsers(list));

    socket.on("rooms_updated", (list) => setRooms(list));

    socket.on("user_typing", (name) => setTypingUser(name));
    socket.on("user_stop_typing", () => setTypingUser(""));

    return () => {
      socket.off("receive_message");
      socket.off("room_users");
      socket.off("rooms_updated");
      socket.off("user_typing");
      socket.off("user_stop_typing");
    };
  }, []);

  // === FETCH ROOMS FROM SERVER ===
  useEffect(() => {
    socket.emit("get_rooms", (list) => setRooms(list));
  }, []);

  // ==== AUTH HANDLERS ====
  const handleRegister = async () => {
    if (!email || !password) return alert("Enter details!");

    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const userEmail = userCred.user.email;
      setUsername(userEmail);
      socket.emit("set_username", userEmail);
      localStorage.setItem("username", userEmail);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) return alert("Enter details!");

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const userEmail = userCred.user.email;
      setUsername(userEmail);
      socket.emit("set_username", userEmail);
      localStorage.setItem("username", userEmail);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const userEmail = result.user.email;
      setUsername(userEmail);
      socket.emit("set_username", userEmail);
      localStorage.setItem("username", userEmail);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setUsername("");
    setCurrentRoom("");
    setMessages([]);
    localStorage.removeItem("username");
  };

  // ==== ROOM LOGIC ====
  const joinRoom = (room) => {
    if (!room) return;

    socket.emit("join_room", room, ({ messages, users }) => {
      setCurrentRoom(room);
      setMessages(messages);
      setUsers(users);
    });
  };

  const createOrJoinRoom = () => {
    if (!roomInput.trim()) return;
    joinRoom(roomInput.trim());
    setRoomInput("");
  };

  const deleteRoom = (room) => {
    if (!window.confirm(`Delete room "${room}"?`)) return;

    socket.emit("delete_room", room, (success) => {
      if (success) {
        if (currentRoom === room) {
          setCurrentRoom("");
          setMessages([]);
        }
        socket.emit("get_rooms", (list) => setRooms(list));
      }
    });
  };

  // ==== MESSAGES ====
  const sendMessage = (e) => {
    e.preventDefault();
    if (!messageText.trim() || !currentRoom) return;

    socket.emit("send_message", { roomName: currentRoom, text: messageText });
    socket.emit("stop_typing", currentRoom);
    setMessageText("");
  };

  const typingHandler = (value) => {
    setMessageText(value);
    socket.emit("typing", currentRoom);

    if (typingTimeout) clearTimeout(typingTimeout);

    const timeout = setTimeout(() => {
      socket.emit("stop_typing", currentRoom);
    }, 600);

    setTypingTimeout(timeout);
  };

  // ==== LOGIN PAGE ====
  if (!username) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h2>Login</h2>

          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />

          <button onClick={handleLogin}>Login</button>
          <button onClick={handleRegister}>Register</button>

          <p>OR</p>

          <button style={{ background: "#4285f4", color: "white" }} onClick={handleGoogleLogin}>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // ==== MAIN CHAT UI ====
  return (
    <div className="app-container">
      <div className="chat-shell">
        {/* SIDEBAR */}
        <div className="sidebar">
          <div className="sidebar-header">
            <h2>Rooms</h2>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>

          <div className="room-create">
            <input placeholder="Room name..." value={roomInput} onChange={(e) => setRoomInput(e.target.value)} />
            <button onClick={createOrJoinRoom}>Create / Join</button>
          </div>

          <div className="room-list">
            {rooms.map((room) => (
              <div key={room} className={`room-item ${room === currentRoom ? "active-room" : ""}`} onClick={() => joinRoom(room)}>
                {room}
                <button className="delete-room-btn" onClick={(e) => { e.stopPropagation(); deleteRoom(room); }}>✖</button>
              </div>
            ))}
          </div>
        </div>

        {/* CHAT */}
        <div className="chat-section">
          <div className="chat-header">
            <h2>{currentRoom || "No Room Selected"}</h2>

            <div className="chat-header-right">
              <button className="theme-toggle" onClick={toggleTheme}>
                {theme === "light" ? "🌙" : "☀️"}
              </button>
              <span className="username-badge">Hi, {username}</span>
            </div>
          </div>

          <div className="chat-main">
            <div className="messages-container">
              {messages.map((msg, i) => {
                const mine = msg.username === username;
                return (
                  <div key={i} className={`message ${mine ? "my-message" : "other-message"}`}>
                    <div className="message-meta">
                      <span className="message-user">{mine ? "You" : msg.username}</span>
                      <span className="message-time">{msg.time}</span>
                    </div>
                    <div className="message-text">{msg.text}</div>
                  </div>
                );
              })}

              {typingUser && <p className="typing-indicator">{typingUser} is typing…</p>}
            </div>

            <div className="users-container">
              <h3>Users</h3>
              {users.map((u, i) => (
                <div key={i} className="user-item">{u}</div>
              ))}
            </div>
          </div>

          <form className="message-input-area" onSubmit={sendMessage}>
            <input value={messageText} onChange={(e) => typingHandler(e.target.value)} placeholder="Type here..." disabled={!currentRoom} />
            <button disabled={!currentRoom}>Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;