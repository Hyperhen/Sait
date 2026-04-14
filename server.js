const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// Папка public для статичних файлів
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// Папка public для статичних файлів
"public")));

// Дані для вступу
const joinData = {
  title: "Вступ",
  fields: [
    { name: "firstName", label: "Ім'я", type: "text", required: true },
    { name: "lastName", label: "Прізвище", type: "text", required: true },
    { name: "telegram", label: "telegram", type: "telegram", required: true },
    { name: "instagram", label: "instagram", type: "instagram", required: true },
    { name: "phone", label: "Телефон", type: "tel", required: true },
    { name: "password", label: "Пароль", type: "password", required: true }
  ],
  submitUrl: "/api/join"
};

// API маршрут для отримання даних вступу
app.get("/api/join-data", (req, res) => {
  res.json(joinData);
});

// API маршрут для обробки вступу
app.post("/api/join", express.json(), (req, res) => {
  console.log("Новий користувач:", req.body);
  res.json({ success: true, message: "Успішно!" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
