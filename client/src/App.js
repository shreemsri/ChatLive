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
  const [username, setUsername] = useState(localStorage.getItem("username") || "");
  const [displayName, setDisplayName] = useState(localStorage.getItem("displayName") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // store passwords
  const [roomPasswords, setRoomPasswords] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("roomPasswords")) || {};
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

  // ---------- PERSIST ----------
  useEffect(() => {
    localStorage.setItem("roomPasswords", JSON.stringify(roomPasswords));
  }, [roomPasswords]);

  // ---------- SOCKET RECONNECT ----------
  useEffect(() => {
    const onConnect = () => {
      if (username && displayName) {
        socket.emit("set_username", { email: username, displayName });
        socket.emit("get_rooms", (list) => setRooms(list || []));
      }
    };
    socket.on("connect", onConnect);

    if (username && displayName) {
      socket.emit("set_username", { email: username, displayName });
    }

    return () => socket.off("connect", onConnect);
  }, [username, displayName]);

  // ---------- THEME ----------
  useEffect(() => {
    document.body.classList.toggle("dark-mode", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  // ---------- SOCKET LISTENERS ----------
  useEffect(() => {
    const onReceive = (msg) => setMessages((prev) => [...prev, msg]);
    const onRoomUsers = (u) => setUsers(u || []);
    const onTyping = (n) => setTypingUser(n);
    const onStopTyping = () => setTypingUser("");
    const onRooms = (list) => setRooms(list || []);
    const onReactionUpdate = ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
      );
    };

    socket.on("receive_message", onReceive);
    socket.on("room_users", onRoomUsers);
    socket.on("user_typing", onTyping);
    socket.on("user_stop_typing", onStopTyping);
    socket.on("rooms_updated", onRooms);
    socket.on("reaction_updated", onReactionUpdate);

    return () => {
      socket.off("receive_message", onReceive);
      socket.off("room_users", onRoomUsers);
      socket.off("user_typing", onTyping);
      socket.off("user_stop_typing", onStopTyping);
      socket.off("rooms_updated", onRooms);
      socket.off("reaction_updated", onReactionUpdate);
    };
  }, []);

  // rooms fetch on load
  useEffect(() => {
    socket.emit("get_rooms", (list) => setRooms(list || []));
  }, []);

  // ---------- TIME FORMATTER ----------
  const formatTime = (raw) => {
    if (!raw) return "";
    const d = new Date(raw);
    if (isNaN(d)) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // ==============================================================
  //                      AUTH HANDLERS
  // ==============================================================

  const loginSuccess = (email, displayName) => {
    setUsername(email);
    setDisplayName(displayName);
    localStorage.setItem("username", email);
    localStorage.setItem("displayName", displayName);

    socket.emit("set_username", { email, displayName });
  };

  const handleRegister = async () => {
    if (!email || !password) return alert("Enter email + password");

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const emailUser = userCredential.user.email;
      const name = emailUser.split("@")[0];
      loginSuccess(emailUser, name);
      alert("Registered & logged in");
    } catch (err) {
      alert(err.message);
      console.error(err);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) return alert("Enter email + password");

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const emailUser = userCredential.user.email;
      const name = emailUser.split("@")[0];
      loginSuccess(emailUser, name);
      alert("Logged in");
    } catch (err) {
      alert(err.message);
      console.error(err);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const emailUser = result.user.email;
      const name = result.user.displayName || emailUser.split("@")[0];
      loginSuccess(emailUser, name);
      alert("Logged in with Google");
    } catch (err) {
      alert(err.message);
      console.error(err);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);

    setUsername("");
    setDisplayName("");
    setCurrentRoom("");
    setMessages([]);
    setUsers([]);

    localStorage.removeItem("username");
    localStorage.removeItem("displayName");
  };

  // ==============================================================
  //                      ROOM ACTIONS
  // ==============================================================

  const askForPassword = (roomName) =>
    window.prompt(`Enter password for "${roomName}"`);

  const joinRoom = (roomName, forceAsk = false) => {
    if (!roomName) return;

    let pwd = roomPasswords[roomName];

    if (!pwd || forceAsk) {
      const entered = askForPassword(roomName);
      if (!entered) return;
      pwd = entered;
      setRoomPasswords((prev) => ({ ...prev, [roomName]: pwd }));
    }

    socket.emit("join_room", { roomName, password: pwd }, (data = {}) => {
      if (!data.ok) {
        alert(data.message || "Cannot join room");
        if (data.message?.toLowerCase().includes("wrong")) {
          setRoomPasswords((p) => {
            const c = { ...p };
            delete c[roomName];
            return c;
          });
        }
        return;
      }

      setCurrentRoom(roomName);
      setMessages(data.messages || []);
      setUsers(data.users || []);
    });
  };

  const handleDeleteRoom = (roomName) => {
    const pwd = window.prompt(`Enter password to delete "${roomName}"`);
    if (!pwd) return;

    socket.emit("delete_room", { roomName, password: pwd }, (res) => {
      if (!res.ok) return alert(res.message);

      if (currentRoom === roomName) {
        setCurrentRoom("");
        setMessages([]);
        setUsers([]);
      }

      setRooms((prev) => prev.filter((r) => r !== roomName));
    });
  };

  // ==============================================================
  //                      SEND + TYPING
  // ==============================================================

  const handleTyping = (value) => {
    setMessageText(value);

    if (!currentRoom) return;

    socket.emit("typing", currentRoom);

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("stop_typing", currentRoom);
    }, 800);
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

  // ==============================================================
  //                      REACTIONS
  // ==============================================================

  const addReaction = (messageId, reaction) => {
    socket.emit("add_reaction", { messageId, reaction });
  };

  // ==============================================================
  //                      LOGIN PAGE
  // ==============================================================

  if (!username || !displayName) {
    return (
      <div className="login-wrapper">
        <div className="login-card glass">
          <h1 className="login-title">ChatLive</h1>

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

          <button className="primary-btn" onClick={handleLogin}>Login</button>
          <button className="ghost-btn" onClick={handleRegister}>Register</button>

          <div className="login-divider"><span>OR</span></div>

          <button className="google-btn" onClick={handleGoogleLogin}>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // ==============================================================
  //                      MAIN UI
  // ==============================================================

  return (
    <div className={`app-shell ${theme === "dark" ? "dark-theme" : ""}`}>
      <div className="app-inner">

        {/* SIDEBAR */}
        <aside className="sidebar glass">
          <div className="sidebar-header">
            <h2 className="app-logo">ChatLive</h2>
            <button className="logout-chip" onClick={handleLogout}>LOGOUT</button>
          </div>

          <div className="sidebar-room-input">
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
              Join
            </button>
          </div>

          <div className="sidebar-rooms-list">
            {rooms.map((r) => (
              <div key={r} className={`room-pill ${currentRoom === r ? "room-pill-active" : ""}`}>
                <button className="room-pill-main" onClick={() => joinRoom(r)}>
                  {r}
                </button>
                <button className="room-pill-delete" onClick={() => handleDeleteRoom(r)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* MAIN CHAT */}
        <main className="chat-panel glass">

          <header className="chat-header">
            <h2>{currentRoom || "No Room Selected"}</h2>
            <div className="chat-header-right">
              <button className="theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
                {theme === "light" ? "🌙" : "☀️"}
              </button>
              <span className="user-chip">Hi, {displayName}</span>
            </div>
          </header>

          <section className="chat-content">

            {/* MESSAGES */}
            <div className="messages-column">
              {currentRoom ? (
                messages.length ? (
                  messages.map((msg) => {
                    const isMe = msg.username === displayName;

                    return (
                      <div key={msg.id} className={`message-row ${isMe ? "me" : "them"}`}>
                        <div className="message-bubble">
                          <div className="message-meta">
                            <span className="message-user">{isMe ? "You" : msg.username}</span>
                            <span className="message-time">{formatTime(msg.time)}</span>
                          </div>

                          <div className="message-text">{msg.text}</div>

                          {/* REACTIONS */}
                          <div className="reactions-row">
                            {["👍", "❤️", "😂", "🔥"].map((r) => (
                              <button
                                key={r}
                                className="reaction-btn"
                                onClick={() => addReaction(msg.id, r)}
                              >
                                {r} {msg.reactions?.[r]?.length || ""}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="no-messages">No messages yet.</p>
                )
              ) : (
                <p className="no-room-selected">Join a room first.</p>
              )}

              {typingUser && <p className="typing-indicator">{typingUser} is typing…</p>}
            </div>

            {/* USERS */}
            <aside className="users-column">
              <h3>USERS</h3>
              {users.map((u, i) => (
                <div key={i} className="user-pill">{u}</div>
              ))}
            </aside>
          </section>

          {/* INPUT */}
          <form className="chat-input-row" onSubmit={handleSendMessage}>
            <input
              type="text"
              className="chat-input"
              placeholder="Type here..."
              value={messageText}
              onChange={(e) => handleTyping(e.target.value)}
              disabled={!currentRoom}
            />

            <button className="primary-btn pill" type="submit">Send</button>
          </form>

        </main>
      </div>
    </div>
  );
}

export default App;