const mongoose = require("mongoose");

const clubBirthdaySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 120 },
    /** YYYY-MM-DD */
    date: { type: String, required: true },
  },
  { timestamps: true }
);

clubBirthdaySchema.index({ date: 1 });

module.exports =
  mongoose.models.ClubBirthday || mongoose.model("ClubBirthday", clubBirthdaySchema);
