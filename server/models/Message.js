// server/models/Message.js
const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    text: { type: String, required: true },
    roomName: { type: String, required: true },

    // ❤️ 👍 😆  → stored as: { "❤️": ["user1"], "👍": ["user2"] }
    reactions: {
      type: Map,
      of: [String],
      default: {},
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", MessageSchema);