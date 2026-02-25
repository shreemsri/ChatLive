const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    text: { type: String, required: true },
    roomName: { type: String, required: true },

    // NEW:
    reactions: {
      type: Object,
      default: {}, // { "👍": ["userA", "userB"], "❤️": [...] }
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", MessageSchema);