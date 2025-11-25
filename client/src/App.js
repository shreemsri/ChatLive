// src/App.js
import React, { useState, useEffect } from "react";
import "./App.css";
import socket from "./socket";

import { auth, googleProvider } from "./firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";

function App() {
  // ===== AUTH STATE =====
  const [username, setUsername] = useState(
    localStorage.getItem("username") || ""
  ); // we store email as username
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ===== CHAT STATE =====
  const [rooms, setRooms] = useState([]);
  const [roomInput, setRoomInput] = useState("");
  const [currentRoom, setCurrentRoom] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [messageText, setMessageText] = useState("");

  // ===== THEME =====
  const [theme, setTheme] = useState(
    localStorage.getItem("theme") || "light"
  );

  // Apply theme to body
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

  // When username changes, let server know
  useEffect(() => {
    if (username) {
      socket.emit("set_username", username);
    }
  }, [username]);

  // ===== SOCKET LISTENERS =====
  useEffect(() => {
    const handleReceiveMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    const handleRoomUsers = (usersList) => {
      setUsers(usersList || []);
    };

    const handleRoomsUpdated = (roomList) => {
      setRooms(roomList || []);
    };

    socket.on("receive_message", handleReceiveMessage);
    socket.on("room_users", handleRoomUsers);
    socket.on("rooms_updated", handleRoomsUpdated);

    return () => {
      socket.off("receive_message", handleReceiveMessage);
      socket.off("room_users", handleRoomUsers);
      socket.off("rooms_updated", handleRoomsUpdated);
    };
  }, []);

  // Fetch existing rooms list from server
  const fetchRooms = () => {
    socket.emit("get_rooms", (roomList) => {
      setRooms(roomList || []);
    });
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  // ===== AUTH HANDLERS =====
  const handleRegister = async () => {
    try {
      if (!email || !password) {
        alert("Please enter email and password");
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const userEmail = cred.user.email;

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

      const cred = await signInWithEmailAndPassword(auth, email, password);
      const userEmail = cred.user.email;

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

  // ===== ROOM / MESSAGE HANDLERS =====
  const joinRoom = (roomName) => {
    if (!roomName) return;

    console.log("➡️ joinRoom:", roomName);
    socket.emit("join_room", roomName, ({ messages, users }) => {
      console.log("✅ join_room callback:", { messages, users });
      setCurrentRoom(roomName);
      setMessages(messages || []);
      setUsers(users || []);
      fetchRooms();
    });
  };

  const handleCreateOrJoinRoom = () => {
    const name = roomInput.trim();
    if (!name) return;
    joinRoom(name);
    setRoomInput("");
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageText.trim() || !currentRoom) return;

    socket.emit("send_message", {
      roomName: currentRoom,
      text: messageText.trim(),
    });

    setMessageText("");
  };

  const handleDeleteRoom = () => {
    if (!currentRoom) return;

    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${currentRoom}" for everyone?`
    );
    if (!confirmDelete) return;

    console.log("🗑 Sending delete_room for:", currentRoom);

    socket.emit("delete_room", currentRoom, (success) => {
      if (success) {
        console.log("✅ Room deleted on server");
        setRooms((prev) => prev.filter((r) => r !== currentRoom));
        setCurrentRoom("");
        setMessages([]);
        setUsers([]);
      } else {
        console.log("❌ Room deletion failed");
        alert("Failed to delete room.");
      }
    });
  };

  // ===== LOGIN SCREEN =====
  if (!username) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <h1 className="app-title">ChatLive</h1>
          <p className="app-subtitle">Sign in to start chatting</p>

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
          <button className="auth-btn secondary" onClick={handleRegister}>
            Register
          </button>

          <div className="auth-separator">
            <span>OR</span>
          </div>

          <button className="auth-btn google" onClick={handleGoogleLogin}>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // ===== MAIN CHAT UI =====
  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-title">Rooms</div>
          <button className="logout-pill" onClick={handleLogout}>
            Logout
          </button>
        </div>

        <div className="room-input-card">
          <input
            className="room-input"
            type="text"
            placeholder="Room name..."
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
          />
          <button className="room-create-btn" onClick={handleCreateOrJoinRoom}>
            Create / Join
          </button>
        </div>

        <div className="room-list">
          {rooms.length === 0 && (
            <p className="no-rooms">No rooms yet. Create one!</p>
          )}
          {rooms.map((room) => (
            <button
              key={room}
              className={`room-pill ${
                currentRoom === room ? "room-pill-active" : ""
              }`}
              onClick={() => joinRoom(room)}
            >
              <span className="room-status-dot" />
              <span className="room-name">{room}</span>
              {currentRoom === room && (
                <span
                  className="room-delete-x"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteRoom();
                  }}
                >
                  ✕
                </span>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <main className="chat-layout">
        {/* Header */}
        <header className="chat-header">
          <div className="chat-room-name">
            {currentRoom || "No Room Selected"}
          </div>

          <div className="chat-header-right">
            <button className="theme-toggle-btn" onClick={toggleTheme}>
              {theme === "light" ? "🌙" : "☀️"}
            </button>

            <div className="user-pill">
              <span className="user-pill-label">Hi,</span>
              <span className="user-pill-email">{username}</span>
            </div>
          </div>
        </header>

        <section className="chat-main-section">
          {/* Messages */}
          <div className="messages-panel">
            <div className="messages-scroll">
              {currentRoom ? (
                messages.length ? (
                  messages.map((msg, i) => {
                    const isMe = msg.username === username;
                    return (
                      <div
                        key={i}
                        className={`message-row ${isMe ? "me" : "other"}`}
                      >
                        <div className="message-bubble">
                          <div className="message-text">{msg.text}</div>
                          <div className="message-meta">
                            <span className="message-user">
                              {isMe ? "You" : msg.username || "Anonymous"}
                            </span>
                            <span className="message-time">{msg.time}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="placeholder-text">
                    No messages yet. Say hi! 👋
                  </p>
                )
              ) : (
                <p className="placeholder-text">
                  Choose a room or create a new one to start chatting.
                </p>
              )}
            </div>
          </div>

          {/* Users */}
          <aside className="users-panel">
            <h3 className="users-title">Users</h3>
            <div className="users-list">
              {currentRoom ? (
                users.length ? (
                  users.map((u, i) => (
                    <div key={i} className="user-tag">
                      {u}
                    </div>
                  ))
                ) : (
                  <p className="placeholder-text small">
                    No users in this room.
                  </p>
                )
              ) : (
                <p className="placeholder-text small">
                  Join a room to see users.
                </p>
              )}
            </div>
          </aside>
        </section>

        {/* Message input */}
        <form className="chat-input-bar" onSubmit={handleSendMessage}>
          <input
            className="chat-input"
            type="text"
            placeholder={
              currentRoom ? "Type here..." : "Join a room to start chatting"
            }
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            disabled={!currentRoom}
          />
          <button
            className="chat-send-btn"
            type="submit"
            disabled={!currentRoom || !messageText.trim()}
          >
            Send
          </button>
        </form>
      </main>
    </div>
  );
}

export default App;