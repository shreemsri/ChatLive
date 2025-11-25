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
  // ========= AUTH STATE =========
  const [username, setUsername] = useState(
    localStorage.getItem("username") || ""
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ========= CHAT STATE =========
  const [currentRoom, setCurrentRoom] = useState("");
  const [rooms, setRooms] = useState([]);
  const [roomInput, setRoomInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [messageText, setMessageText] = useState("");

  // typing indicator
  const [typingUser, setTypingUser] = useState("");
  const [typingTimeout, setTypingTimeout] = useState(null);

  // theme
  const [theme, setTheme] = useState(
    localStorage.getItem("theme") || "light"
  );

  // ========= THEME EFFECT =========
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

  // ========= SOCKET LISTENERS =========
  useEffect(() => {
    socket.on("receive_message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("room_users", (usersList) => {
      setUsers(usersList);
    });

    socket.on("user_typing", (name) => {
      setTypingUser(name);
    });

    socket.on("user_stop_typing", () => {
      setTypingUser("");
    });

    socket.on("rooms_updated", (roomList) => {
      setRooms(roomList);
    });

    return () => {
      socket.off("receive_message");
      socket.off("room_users");
      socket.off("user_typing");
      socket.off("user_stop_typing");
      socket.off("rooms_updated");
    };
  }, []);

  // get existing rooms initially
  useEffect(() => {
    socket.emit("get_rooms", (roomList) => {
      setRooms(roomList || []);
    });
  }, []);

  // ========= AUTH HANDLERS =========
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
      console.error("Signout error:", e);
    }
    setUsername("");
    setCurrentRoom("");
    setMessages([]);
    setUsers([]);
    localStorage.removeItem("username");
  };

  // ========= ROOM & MESSAGE HANDLERS =========
  const joinRoom = (roomName) => {
    if (!roomName) return;

    console.log("➡️ joinRoom:", roomName);

    socket.emit("join_room", roomName, ({ messages, users }) => {
      setCurrentRoom(roomName);
      setMessages(messages || []);
      setUsers(users || []);
    });
  };

  const handleCreateOrJoinRoom = () => {
    if (!roomInput.trim()) return;
    joinRoom(roomInput.trim());
    setRoomInput("");
  };

  const handleDeleteRoom = (roomName) => {
    if (!roomName) return;

    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${roomName}"?`
    );
    if (!confirmDelete) return;

    console.log("🗑 Sending delete_room for:", roomName);

    socket.emit("delete_room", roomName, (success) => {
      if (success) {
        console.log("✅ Room deleted:", roomName);
        setRooms((prev) => prev.filter((r) => r !== roomName));
        if (currentRoom === roomName) {
          setCurrentRoom("");
          setMessages([]);
          setUsers([]);
        }
      } else {
        console.log("❌ Room deletion failed");
        alert("Failed to delete room.");
      }
    });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageText.trim() || !currentRoom) return;

    socket.emit("send_message", {
      roomName: currentRoom,
      text: messageText.trim(),
    });

    socket.emit("stop_typing", currentRoom);
    setMessageText("");
  };

  const handleTyping = (value) => {
    setMessageText(value);
    if (!currentRoom) return;

    socket.emit("typing", currentRoom);

    if (typingTimeout) clearTimeout(typingTimeout);
    const timeout = setTimeout(() => {
      socket.emit("stop_typing", currentRoom);
    }, 800);
    setTypingTimeout(timeout);
  };

  // helper for time display (server sends ISO string)
  const formatTime = (isoString) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    return d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // ========= LOGIN SCREEN UI =========
  if (!username) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1 className="logo-text">ChatLive</h1>
          <p className="auth-subtitle">Realtime rooms with Firebase login</p>

          <input
            className="auth-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="auth-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button className="auth-btn primary" onClick={handleLogin}>
            Login
          </button>
          <button className="auth-btn ghost" onClick={handleRegister}>
            Register
          </button>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <button className="auth-btn google" onClick={handleGoogleLogin}>
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  // ========= MAIN CHAT UI =========
  return (
    <div className="app-shell">
      <div className="app-gradient" />

      <div className="app-inner">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <h2 className="sidebar-title">Rooms</h2>
            <button className="logout-chip" onClick={handleLogout}>
              LOGOUT
            </button>
          </div>

          <div className="sidebar-card">
            <label className="field-label">Room name…</label>
            <div className="room-input-row">
              <input
                className="room-input"
                type="text"
                placeholder="Room name..."
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
              />
              <button
                className="room-create-btn"
                onClick={handleCreateOrJoinRoom}
              >
                Create / Join
              </button>
            </div>

            <div className="room-list">
              {rooms.length === 0 && (
                <p className="room-empty">No rooms yet. Create one!</p>
              )}
              {rooms.map((room) => (
                <div
                  key={room}
                  className={`room-pill ${
                    currentRoom === room ? "room-pill-active" : ""
                  }`}
                >
                  <div
                    className="room-pill-main"
                    onClick={() => joinRoom(room)}
                  >
                    <span className="room-status-dot" />
                    <span className="room-name-text">{room}</span>
                  </div>
                  <button
                    className="room-delete"
                    onClick={() => handleDeleteRoom(room)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* MAIN CHAT COLUMN */}
        <main className="chat-main-shell">
          {/* Header */}
          <header className="chat-header">
            <div className="chat-room-title">
              {currentRoom || "No Room Selected"}
            </div>

            <div className="chat-header-right">
              <button className="theme-toggle-pill" onClick={toggleTheme}>
                {theme === "light" ? "🌙" : "☀️"}
              </button>

              <div className="user-pill">
                <span className="user-pill-text">Hi, {username}</span>
              </div>
            </div>
          </header>

          <section className="chat-content">
            {/* messages */}
            <div className="messages-panel">
              {!currentRoom && (
                <p className="empty-state-text">
                  Choose a room or create a new one to start chatting.
                </p>
              )}

              {currentRoom && messages.length === 0 && (
                <p className="empty-state-text">
                  No messages yet. Say hi 👋
                </p>
              )}

              {messages.map((msg, idx) => {
                const isMe = msg.username === username;
                return (
                  <div
                    key={idx}
                    className={`bubble-row ${isMe ? "bubble-row-me" : ""}`}
                  >
                    {!isMe && (
                      <span className="bubble-username">{msg.username}</span>
                    )}
                    <div className="bubble">
                      <div className="bubble-text">{msg.text}</div>
                      <div className="bubble-meta">
                        <span>{isMe ? "You" : ""}</span>
                        <span>{formatTime(msg.time)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {typingUser && currentRoom && (
                <p className="typing-indicator">
                  {typingUser} is typing…
                </p>
              )}
            </div>

            {/* users */}
            <div className="users-panel">
              <h3 className="users-title">USERS</h3>
              {!currentRoom && (
                <p className="users-empty">Join a room to see users.</p>
              )}
              {currentRoom && users.length === 0 && (
                <p className="users-empty">No users yet.</p>
              )}
              {users.map((u, i) => (
                <div key={i} className="user-chip">
                  {u}
                </div>
              ))}
            </div>
          </section>

          {/* input bar */}
          <form className="input-bar" onSubmit={handleSendMessage}>
            <input
              className="input-field"
              type="text"
              placeholder={
                currentRoom ? "Type here..." : "Join a room to start chatting"
              }
              value={messageText}
              onChange={(e) => handleTyping(e.target.value)}
              disabled={!currentRoom}
            />
            <button
              className="send-btn"
              type="submit"
              disabled={!currentRoom || !messageText.trim()}
            >
              Send
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}

export default App;