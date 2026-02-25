// client/src/ReactionPicker.jsx
import React from "react";
import "./ReactionPicker.css";

export default function ReactionPicker({ onSelect }) {
  const reactions = ["👍", "❤️", "😂", "🔥", "😮", "😢"];

  return (
    <div className="reaction-picker-container">
      {reactions.map((emoji) => (
        <button
          key={emoji}
          className="reaction-picker-btn"
          onClick={() => onSelect(emoji)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}