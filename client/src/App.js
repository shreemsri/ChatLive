// src/App.js
import React, { useState, useEffect } from "react";
import socket from "./socket";
import "./App.css";

import { auth, googleProvider } from "./firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";

function App() {
  // ==== AUTH STATE ====
  const [username, setUsername] = useState(
    localStorage.getItem("username") || ""
  ); // store email as username
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ==== CHAT STATE ====
  const [currentRoom, setCurrentRoom] = useState("");
  const [rooms, setRooms] = useState([]);
  const [roomInput, setRoomInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [theme, setTheme] = useState(
    localStorage.getItem("theme") || "light"
  );

  // ==== THEME EFFECT ====
  useEffect(() => {
    if (theme === "dark") {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  // ==== SOCKET LISTENERS ====
  useEffect(() => {
    socket.on("receive_message", (msg) => {
      console.log("📩 receive_message:", msg);
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("room_users", (usersList) => {
      console.log("👥 room_users:", usersList);
      setUsers(usersList);
    });

    socket.on("rooms_updated", (roomList) => {
      console.log("📂 rooms_updated:", roomList);
      setRooms(roomList);
    });

    return () => {
      socket.off("receive_message");
      socket.off("room_users");
      socket.off("rooms_updated");
    };
  }, []);

  // Fetch existing rooms
  const fetchRooms = () => {
    socket.emit("get_rooms", (roomList) => {
      console.log("📂 get_rooms callback:", roomList);
      setRooms(roomList);
    });
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  // ==== AUTH HANDLERS ====
  const handleRegister = async () => {
    try {
      if (!email || !password) {
        alert("Please enter email and password");
        return;
      }

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const userEmail = userCredential.user.email;

      setUsername(userEmail);
      localStorage.setItem("username", userEmail);
      socket.emit("set_username", userEmail);

      alert("Registered & logged in as " + userEmail);
    } catch (err) {
      console.error("Register error:", err);
      alert(err.code + " - " + err.message);
    }
  };

  const handleLogin = async () => {
    try {
      if (!email || !password) {
        alert("Please enter email and password");
        return;
      }

      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const userEmail = userCredential.user.email;

      setUsername(userEmail);
      localStorage.setItem("username", userEmail);
      socket.emit("set_username", userEmail);

      alert("Logged in as " + userEmail);
    } catch (err) {
      console.error("Login error:", err);
      alert(err.code + " - " + err.message);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const userEmail = result.user.email;

      setUsername(userEmail);
      localStorage.setItem("username", userEmail);
      socket.emit("set_username", userEmail);

      alert("Logged in with Google as " + userEmail);
    } catch (err) {
      console.error("Google login error:", err);
      alert(err.code + " - " + err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Signout error (ignored):", e);
    }
    setUsername("");
    setCurrentRoom("");
    setMessages([]);
    setUsers([]);
    localStorage.removeItem("username");
  };

  // ==== ROOM / MESSAGE HANDLERS ====
  const joinRoom = (roomName) => {
    if (!roomName) return;

    console.log("➡️ joinRoom:", roomName);

    socket.emit("join_room", roomName, ({ messages, users }) => {
      console.log("✅ join_room callback:", { messages, users });
      setCurrentRoom(roomName);
      setMessages(messages);
      setUsers(users);
      fetchRooms();
    });
  };

  const handleCreateOrJoinRoom = () => {
    if (!roomInput.trim()) return;
    joinRoom(roomInput.trim());
    setRoomInput("");
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageText.trim() || !currentRoom) return;

    const payload = {
      roomName: currentRoom,
      text: messageText.trim(),
    };

    console.log("📤 sending message:", payload);

    socket.emit("send_message", payload);

    setMessageText("");
  };

  // ==== LOGIN SCREEN ====
  if (!username) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h2>Login</h2>

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button onClick={handleLogin}>Login</button>
          <button onClick={handleRegister}>Register</button>

          <p>OR</p>

          <button
            style={{ background: "#4285f4", color: "white" }}
            onClick={handleGoogleLogin}
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // ==== MAIN CHAT UI ====
  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>Rooms</h2>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>

        <div className="room-create">
          <input
            type="text"
            placeholder="Enter room name"
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
          />
          <button onClick={handleCreateOrJoinRoom}>Create / Join</button>
        </div>

        <div className="room-list">
          {rooms.length === 0 && <p>No rooms yet. Create one!</p>}
          {rooms.map((room) => (
            <div
              key={room}
              className={`room-item ${
                currentRoom === room ? "active-room" : ""
              }`}
              onClick={() => joinRoom(room)}
            >
              {room}
            </div>
          ))}
        </div>
      </div>

      {/* Chat Section */}
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
          {/* Messages */}
          <div className="messages-container">
            {currentRoom ? (
              messages.length ? (
                messages.map((msg, i) => (
                  <div key={i} className="message">
                    <div className="message-meta">
                      <span className="message-user">{msg.username}</span>
                      <span className="message-time">{msg.time}</span>
                    </div>
                    <div className="message-text">{msg.text}</div>
                  </div>
                ))
              ) : (
                <p className="no-messages">No messages yet. Say hi! 👋</p>
              )
            ) : (
              <p className="no-room-selected">
                Choose a room or create a new one to start chatting.
              </p>
            )}
          </div>

          {/* Users */}
          <div className="users-container">
            <h3>Online in Room</h3>
            {currentRoom ? (
              users.length ? (
                users.map((u, i) => (
                  <div key={i} className="user-item">
                    {u}
                  </div>
                ))
              ) : (
                <p>No users in this room.</p>
              )
            ) : (
              <p>Join a room to see users.</p>
            )}
          </div>
        </div>

        {/* Message input */}
        <form className="message-input-area" onSubmit={handleSendMessage}>
          <input
            type="text"
            placeholder={
              currentRoom ? "Type a message..." : "Join a room to chat"
            }
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            disabled={!currentRoom}
          />
          <button type="submit" disabled={!currentRoom}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;