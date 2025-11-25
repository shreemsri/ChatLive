// client/src/App.js
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
  // ---------- AUTH ----------
  const [username, setUsername] = useState(
    localStorage.getItem("username") || ""
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ---------- CHAT ----------
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

  // ---------- THEME EFFECT ----------
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

  // ---------- SOCKET LISTENERS ----------
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

  // fetch rooms once
  useEffect(() => {
    socket.emit("get_rooms", (roomList) => setRooms(roomList));
  }, []);

  // ---------- AUTH HANDLERS ----------
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

  // ---------- ROOM / MESSAGE HANDLERS ----------
  const joinRoom = (roomName) => {
    if (!roomName) return;

    console.log("➡️ joinRoom:", roomName);

    socket.emit("join_room", roomName, ({ messages, users }) => {
      console.log("✅ join_room callback:", { messages, users });
      setCurrentRoom(roomName);
      setMessages(messages);
      setUsers(users);
      socket.emit("get_rooms", (roomList) => setRooms(roomList));
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
      `Are you sure you want to delete "${roomName}" for everyone?`
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

  // ---------- LOGIN SCREEN ----------
  if (!username) {
    return (
      <div className="login-wrapper">
        <div className="login-card glass">
          <h1 className="login-title">ChatLive</h1>
          <p className="login-subtitle">Realtime rooms with your friends</p>

          <input
            type="email"
            placeholder="Email"
            className="login-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            className="login-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button className="primary-btn" onClick={handleLogin}>
            Login
          </button>
          <button className="ghost-btn" onClick={handleRegister}>
            Register
          </button>

          <div className="login-divider">
            <span>OR</span>
          </div>

          <button className="google-btn" onClick={handleGoogleLogin}>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // ---------- MAIN CHAT UI ----------
  return (
    <div className={`app-shell ${theme === "dark" ? "dark-theme" : ""}`}>
      <div className="app-inner">
        {/* SIDEBAR */}
        <aside className="sidebar glass">
          <div className="sidebar-header">
            <h2 className="app-logo">ChatLive</h2>
            <button className="logout-chip" onClick={handleLogout}>
              LOGOUT
            </button>
          </div>

          <div className="sidebar-room-input">
            <label className="field-label">Room name...</label>
            <div className="room-input-row">
              <input
                type="text"
                className="room-input"
                placeholder="Room name..."
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
              />
              <button
                className="primary-btn small"
                onClick={handleCreateOrJoinRoom}
              >
                Create / Join
              </button>
            </div>
          </div>

          <div className="sidebar-rooms-list">
            {rooms.length === 0 && (
              <p className="empty-text">No rooms yet. Create one!</p>
            )}
            {rooms.map((room) => (
              <div
                key={room}
                className={`room-pill ${
                  currentRoom === room ? "room-pill-active" : ""
                }`}
              >
                <button
                  className="room-pill-main"
                  onClick={() => joinRoom(room)}
                >
                  <span className="room-status-dot" />
                  <span className="room-pill-name">{room}</span>
                </button>
                <button
                  className="room-pill-delete"
                  onClick={() => handleDeleteRoom(room)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* MAIN PANEL */}
        <main className="chat-panel glass">
          {/* top header */}
          <header className="chat-header">
            <div className="chat-header-left">
              <h2 className="room-title">
                {currentRoom || "No Room Selected"}
              </h2>
              <p className="room-subtitle">
                {currentRoom
                  ? "Chat in real-time with anyone in this room."
                  : "Choose a room or create a new one to start chatting."}
              </p>
            </div>

            <div className="chat-header-right">
              <button
                className="theme-toggle"
                onClick={toggleTheme}
                title="Toggle theme"
              >
                {theme === "light" ? "🌙" : "☀️"}
              </button>
              <span className="user-chip">Hi, {username}</span>
            </div>
          </header>

          {/* middle area */}
          <section className="chat-content">
            <div className="messages-column">
              {currentRoom ? (
  messages.length ? (
    messages.map((msg, index) => {
      const isMe =
        msg.username === username ||
        msg.username === "You" ||
        msg.username === auth.currentUser?.email;

      // ✅ Format time nicely in local timezone
      const displayTime = msg.time
        ? new Date(msg.time).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";

      return (
        <div
          key={index}
          className={`message-row ${isMe ? "me" : "them"}`}
        >
          <div className="message-bubble">
            <div className="message-meta">
              <span className="message-user">
                {isMe ? "You" : msg.username}
              </span>
              {displayTime && (
                <span className="message-time">{displayTime}</span>
              )}
            </div>
            <div className="message-text">{msg.text}</div>
          </div>
        </div>
      );
    })
  ) : (
    <p className="no-messages">No messages yet. Say hi! 👋</p>
  )
) : (
  <p className="no-room-selected">
    Choose a room or create a new one to start chatting.
  </p>
)}

              {typingUser && currentRoom && (
                <p className="typing-indicator">
                  {typingUser === username ? "You" : typingUser} is typing…
                </p>
              )}
            </div>

            {/* users */}
            <aside className="users-column">
              <h3 className="users-title">USERS</h3>
              <div className="users-list">
                {currentRoom ? (
                  users.length ? (
                    users.map((u, i) => (
                      <div key={i} className="user-pill">
                        {u}
                      </div>
                    ))
                  ) : (
                    <p className="empty-text small">
                      No users in this room yet.
                    </p>
                  )
                ) : (
                  <p className="empty-text small">
                    Join a room to see who&apos;s online.
                  </p>
                )}
              </div>
            </aside>
          </section>

          {/* bottom input */}
          <form className="chat-input-row" onSubmit={handleSendMessage}>
            <input
              type="text"
              className="chat-input"
              placeholder={
                currentRoom ? "Type here..." : "Join a room to start chatting"
              }
              value={messageText}
              onChange={(e) => handleTyping(e.target.value)}
              disabled={!currentRoom}
            />
            <button
              type="submit"
              className="primary-btn pill"
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