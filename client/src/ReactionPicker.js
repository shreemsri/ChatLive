import React from "react";
import "./ReactionPicker.css";

export default function ReactionPicker({ onSelect }) {
  const reactions = ["👍", "❤️", "😂", "🔥", "😢", "🤯"];

  return (
    <div className="reaction-picker">
      {reactions.map((r) => (
        <button key={r} className="reaction-option" onClick={() => onSelect(r)}>
          {r}
        </button>
      ))}
    </div>
  );
}