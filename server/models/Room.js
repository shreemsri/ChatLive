import mongoose from "mongoose";

const RoomSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  description: { type: String, default: "" }, // NEW FIELD
});

module.exports = mongoose.model("Room", RoomSchema);