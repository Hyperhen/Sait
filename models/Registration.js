const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    telegram: String,
    phone: String,
    age: mongoose.Schema.Types.Mixed,
    experience: String,
    message: String,
    timestamp: { type: String, required: true },
  },
  { timestamps: true }
);

registrationSchema.index({ createdAt: -1 });

module.exports =
  mongoose.models.Registration ||
  mongoose.model("Registration", registrationSchema);
