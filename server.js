const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// Папка public для статичних файлів
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});