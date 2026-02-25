// client/src/App.js
import React, { useState, useEffect, useRef } from "react";
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

  // store room passwords locally
  const [roomPasswords, setRoomPasswords] = useState(() => {
    try {
      const stored = localStorage.getItem("roomPasswords");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // ---------- CHAT ----------
  const [currentRoom, setCurrentRoom] = useState("");
  const [rooms, setRooms] = useState([]);
  const [roomInput, setRoomInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [messageText, setMessageText] = useState("");

  const [typingUser, setTypingUser] = useState("");
  const typingTimeoutRef = useRef(null);

  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

  // Save roomPasswords
  useEffect(() => {
    try {
      localStorage.setItem("roomPasswords", JSON.stringify(roomPasswords));
    } catch {}
  }, [roomPasswords]);

  // If socket reconnects, re-send username
  useEffect(() => {
    const onConnect = () => {
      const saved = localStorage.getItem("username");
      if (saved) {
        socket.emit("set_username", saved);
        socket.emit("get_rooms", (list) => setRooms(list || []));
      }
    };
    socket.on("connect", onConnect);

    if (username) socket.emit("set_username", username);

    return () => {
      socket.off("connect", onConnect);
    };
  }, [username]);

  // theme effect
  useEffect(() => {
    if (theme === "dark") document.body.classList.add("dark-mode");
    else document.body.classList.remove("dark-mode");
    localStorage.setItem("theme", theme);
  }, [theme]);

  // socket listeners
  useEffect(() => {
    const onReceive = (msg) => setMessages((prev) => [...prev, msg]);
    const onRoomUsers = (u) => setUsers(u || []);
    const onUserTyping = (n) => setTypingUser(n);
    const onUserStopTyping = () => setTypingUser("");
    const onRoomsUpdated = (list) => setRooms(list || []);

    socket.on("receive_message", onReceive);
    socket.on("room_users", onRoomUsers);
    socket.on("user_typing", onUserTyping);

    // ❌ BUG FIXED HERE
    socket.on("user_stop_typing", onUserStopTyping);

    socket.on("rooms_updated", onRoomsUpdated);

    return () => {
      socket.off("receive_message", onReceive);
      socket.off("room_users", onRoomUsers);
      socket.off("user_typing", onUserTyping);
      socket.off("user_stop_typing", onUserStopTyping);
      socket.off("rooms_updated", onRoomsUpdated);
    };
  }, []);

  // fetch rooms
  useEffect(() => {
    socket.emit("get_rooms", (roomList) => setRooms(roomList || []));
  }, []);

  // ---------- FIXED TIMESTAMP FORMATTER ----------
  const formatTime = (raw) => {
    if (!raw) return "";
    const d = new Date(raw);
    if (isNaN(d)) return "";
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ---------- AUTH HANDLERS ----------
  const handleRegister = async () => {
    try {
      if (!email || !password) return alert("Please enter email and password");
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
      if (!email || !password) return alert("Please enter email and password");
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
  const askForPassword = (roomName, message) => {
    const input = window.prompt(
      message ||
        `Enter password for room "${roomName}".\nIf this is a new room, this password will be set.`
    );
    if (!input) return null;
    return input.trim();
  };

  const joinRoom = (roomName, forceAskPassword = false) => {
    if (!roomName) return;

    let pwd = roomPasswords[roomName];

    if (!pwd || forceAskPassword) {
      const entered = askForPassword(roomName);
      if (!entered) return;
      pwd = entered;
      setRoomPasswords((prev) => ({ ...prev, [roomName]: pwd }));
    }

    socket.emit("join_room", { roomName, password: pwd }, (data = {}) => {
      if (!data) return alert("No response from server.");

      if (data.ok === false) {
        alert(data.message || "Unable to join room.");
        if (data.message?.toLowerCase().includes("wrong")) {
          setRoomPasswords((prev) => {
            const copy = { ...prev };
            delete copy[roomName];
            return copy;
          });
        }
        return;
      }

      setCurrentRoom(roomName);
      setMessages(data.messages || []);
      setUsers(data.users || []);
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

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("stop_typing", currentRoom);
    }, 800);
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

  // ---------- MAIN UI ----------
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
                onClick={() => {
                  if (!roomInput.trim()) return;
                  joinRoom(roomInput.trim());
                  setRoomInput("");
                }}
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
                className={`room-pill ${currentRoom === room ? "room-pill-active" : ""}`}
              >
                <button className="room-pill-main" onClick={() => joinRoom(room)}>
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
          <header className="chat-header">
            <div className="chat-header-left">
              <h2 className="room-title">{currentRoom || "No Room Selected"}</h2>
              <p className="room-subtitle">
                {currentRoom
                  ? "Chat in real-time with anyone in this room."
                  : "Choose a room or create a new one to start chatting."}
              </p>
            </div>

            <div className="chat-header-right">
              <button
                className="theme-toggle"
                onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
              >
                {theme === "light" ? "🌙" : "☀️"}
              </button>

              <span className="user-chip">Hi, {username}</span>
            </div>
          </header>

          <section className="chat-content">
            <div className="messages-column">
              {currentRoom ? (
                messages.length ? (
                  messages.map((msg, index) => {
                    const isMe =
                      msg.username === username ||
                      msg.username === auth.currentUser?.email;

                    const displayTime = formatTime(msg.time);

                    return (
                      <div key={index} className={`message-row ${isMe ? "me" : "them"}`}>
                        <div className="message-bubble">
                          <div className="message-meta">
                            <span className="message-user">
                              {isMe ? "You" : msg.username || "Anonymous"}
                            </span>
                            <span className="message-time">{displayTime}</span>
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
                    Join a room to see who's online.
                  </p>
                )}
              </div>
            </aside>
          </section>

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