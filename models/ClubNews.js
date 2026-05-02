const mongoose = require("mongoose");

const clubNewsSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, maxlength: 200 },
    content: { type: String, required: true, maxlength: 10000 },
    /** Текст дати як на сайті (uk-UA), як у колишньому JSON */
    date: { type: String, required: true },
  },
  { timestamps: true }
);

clubNewsSchema.index({ createdAt: -1 });

module.exports =
  mongoose.models.ClubNews || mongoose.model("ClubNews", clubNewsSchema);
