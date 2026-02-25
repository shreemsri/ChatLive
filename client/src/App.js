import React, { useState, useEffect, useRef } from "react";
import socket from "./socket";
import "./App.css";

import ReactionPicker from "./ReactionPicker";

import { auth, googleProvider } from "./firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";

function App() {
  // ================= AUTH =================
  const [username, setUsername] = useState(localStorage.getItem("username") || "");
  const [displayName, setDisplayName] = useState(localStorage.getItem("displayName") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ================= ROOM PASSWORDS =================
  const [roomPasswords, setRoomPasswords] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("roomPasswords")) || {};
    } catch {
      return {};
    }
  });

  // ================= CHAT =================
  const [currentRoom, setCurrentRoom] = useState("");
  const [rooms, setRooms] = useState([]);
  const [roomInput, setRoomInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [messageText, setMessageText] = useState("");

  const [typingUser, setTypingUser] = useState("");
  const typingTimeoutRef = useRef(null);

  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

  // Which message has reaction picker open
  const [openReactionPicker, setOpenReactionPicker] = useState(null);

  // ================= PERSIST PASSWORDS =================
  useEffect(() => {
    localStorage.setItem("roomPasswords", JSON.stringify(roomPasswords));
  }, [roomPasswords]);

  // ================= SOCKET RECONNECT =================
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

  // ================= THEME =================
  useEffect(() => {
    document.body.classList.toggle("dark-mode", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  // ================= SOCKET LISTENERS =================
  useEffect(() => {
    const onReceive = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    const onRoomUsers = (u) => setUsers(u || []);

    const onTyping = (name) => setTypingUser(name);

    const onStopTyping = () => setTypingUser("");

    const onRooms = (list) => setRooms(list || []);

    const onReactionUpdate = ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId ? { ...m, reactions } : m
        )
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

  // Load rooms on load
  useEffect(() => {
    socket.emit("get_rooms", (list) => setRooms(list || []));
  }, []);

  // ================= UTILS =================
  const formatTime = (raw) => {
    if (!raw) return "";
    const d = new Date(raw);
    if (isNaN(d)) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // ================= AUTH HELPERS =================
  const loginSuccess = (email, dName) => {
    setUsername(email);
    setDisplayName(dName);
    localStorage.setItem("username", email);
    localStorage.setItem("displayName", dName);

    socket.emit("set_username", { email, displayName: dName });
  };

  const handleRegister = async () => {
    if (!email || !password) return alert("Enter email + password");

    try {
      const u = await createUserWithEmailAndPassword(auth, email, password);
      const mail = u.user.email;
      loginSuccess(mail, mail.split("@")[0]);
    } catch (e) {
      alert(e.message);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) return alert("Enter email + password");

    try {
      const u = await signInWithEmailAndPassword(auth, email, password);
      const mail = u.user.email;
      loginSuccess(mail, mail.split("@")[0]);
    } catch (e) {
      alert(e.message);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const r = await signInWithPopup(auth, googleProvider);
      const mail = r.user.email;
      const dName = r.user.displayName || mail.split("@")[0];
      loginSuccess(mail, dName);
    } catch (e) {
      alert(e.message);
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

  // ================= ROOMS =================
  const askForPassword = (roomName) =>
    window.prompt(`Enter password for "${roomName}"`);

  const joinRoom = (roomName, forceAsk = false) => {
    let pwd = roomPasswords[roomName];

    if (!pwd || forceAsk) {
      const entered = askForPassword(roomName);
      if (!entered) return;
      pwd = entered;

      setRoomPasswords((prev) => ({ ...prev, [roomName]: pwd }));
    }

    socket.emit("join_room", { roomName, password: pwd }, (data) => {
      if (!data.ok) {
        alert(data.message);
        return;
      }

      setCurrentRoom(roomName);
      setMessages(data.messages || []);
      setUsers(data.users || []);
      setOpenReactionPicker(null);
    });
  };

  const handleDeleteRoom = (r) => {
    const pwd = window.prompt(`Password to delete "${r}"`);
    if (!pwd) return;

    socket.emit("delete_room", { roomName: r, password: pwd }, (res) => {
      if (!res.ok) return alert(res.message);

      if (currentRoom === r) {
        setCurrentRoom("");
        setMessages([]);
        setUsers([]);
      }

      setRooms((old) => old.filter((x) => x !== r));
    });
  };

  // ================= TYPING =================
  const handleTyping = (value) => {
    setMessageText(value);

    if (!currentRoom) return;

    socket.emit("typing", displayName);

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("stop_typing");
    }, 700);
  };

  // ================= SEND MESSAGE =================
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageText.trim() || !currentRoom) return;

    socket.emit("send_message", {
      roomName: currentRoom,
      text: messageText.trim(),
    });

    setMessageText("");
    setOpenReactionPicker(null);
  };

  // ================= REACTIONS =================
  const addReaction = (id, emoji) => {
    socket.emit("add_reaction", { messageId: id, reaction: emoji });
  };

  // ================= LOGIN SCREEN =================
  if (!username || !displayName) {
    return (
      <div className="login-wrapper">
        <div className="login-card glass">
          <h1 className="login-title">ChatLive</h1>

          <input
            type="email"
            className="login-input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            className="login-input"
            placeholder="Password"
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

  // ================= MAIN UI =================
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
            {rooms.map((room) => (
              <div
                key={room}
                className={`room-pill ${currentRoom === room ? "room-pill-active" : ""}`}
              >
                <button className="room-pill-main" onClick={() => joinRoom(room)}>
                  {room}
                </button>
                <button className="room-pill-delete" onClick={() => handleDeleteRoom(room)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* CHAT PANEL */}
        <main className="chat-panel glass">

          <header className="chat-header">
            <h2>{currentRoom || "No Room Selected"}</h2>

            <div className="chat-header-right">
              <button
                className="theme-toggle"
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              >
                {theme === "light" ? "🌙" : "☀️"}
              </button>
              <span className="user-chip">Hi, {displayName}</span>
            </div>
          </header>

          {/* CHAT CONTENT */}
          <section className="chat-content">

            {/* MESSAGES */}
            <div className="messages-column">
              {currentRoom ? (
                messages.map((msg) => {
                  const isMe = msg.username === displayName;

                  return (
                    <div key={msg._id} className={`message-row ${isMe ? "me" : "them"}`}>
                      <div className="message-bubble">

                        <div className="message-meta">
                          <span className="message-user">
                            {isMe ? "You" : msg.username}
                          </span>
                          <span className="message-time">{formatTime(msg.time)}</span>
                        </div>

                        <div className="message-text">{msg.text}</div>

                        {/* REACTION COUNTS */}
                        <div className="reactions-bar">
                          {msg.reactions &&
                            Object.keys(msg.reactions).map((emoji) => (
                              <span key={emoji} className="reaction-count">
                                {emoji} {msg.reactions[emoji].length}
                              </span>
                            ))}
                        </div>

                        {/* REACTION PICKER BUTTON */}
                        <button
                          className="reaction-trigger"
                          onClick={() =>
                            setOpenReactionPicker(
                              openReactionPicker === msg._id ? null : msg._id
                            )
                          }
                        >
                          😀
                        </button>

                        {openReactionPicker === msg._id && (
                          <ReactionPicker
                            onSelect={(emoji) => {
                              addReaction(msg._id, emoji);
                              setOpenReactionPicker(null);
                            }}
                          />
                        )}

                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="no-room-selected">Join a room first.</p>
              )}

              {typingUser && (
                <p className="typing-indicator">{typingUser} is typing…</p>
              )}

            </div>

            {/* USERS */}
            <aside className="users-column">
              <h3>USERS</h3>
              {users.map((u, i) => (
                <div key={i} className="user-pill">{u}</div>
              ))}
            </aside>

          </section>

          {/* INPUT BAR */}
          <form className="chat-input-row" onSubmit={handleSendMessage}>
            <input
              type="text"
              className="chat-input"
              value={messageText}
              placeholder="Type here..."
              onChange={(e) => handleTyping(e.target.value)}
              disabled={!currentRoom}
            />

            <button className="primary-btn pill" type="submit">
              Send
            </button>
          </form>

        </main>

      </div>
    </div>
  );
}

export default App;