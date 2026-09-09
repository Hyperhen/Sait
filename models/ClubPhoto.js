const mongoose = require("mongoose");

const ClubPhotoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      maxlength: 200,
    },
    description: {
      type: String,
      maxlength: 1000,
      default: "",
    },
    imageUrl: {
      type: String,
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.ClubPhoto || mongoose.model("ClubPhoto", ClubPhotoSchema);
