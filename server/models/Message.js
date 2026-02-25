const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  roomName: { type: String, required: true },
  username: { type: String, required: true },
  text: { type: String, required: true },
  time: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Message", MessageSchema);