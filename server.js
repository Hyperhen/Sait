require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const cors = require("cors");
const axios = require("axios");
const session = require("express-session");
const FileStoreSession = require("session-file-store")(session);
const rateLimit = require("express-rate-limit");

const app = express();

const TRUST_PROXY_ENABLED =
  process.env.TRUST_PROXY === "1" || /^true$/i.test(process.env.TRUST_PROXY || "");

/** Якщо Node за nginx/Caddy/load balancer із HTTPS — часто потрібно для коректної поведінки запитів. */
if (TRUST_PROXY_ENABLED) {
  app.set("trust proxy", 1);
}

const SESSION_STORE_DIR = path.resolve(
  typeof process.env.SESSION_STORE_PATH === "string" && process.env.SESSION_STORE_PATH.trim() !== ""
    ? process.env.SESSION_STORE_PATH.trim()
    : path.join(__dirname, ".sessions")
);

function ensureSessionStoreDir() {
  if (!fs.existsSync(SESSION_STORE_DIR)) {
    fs.mkdirSync(SESSION_STORE_DIR, { recursive: true });
  }
}

const PORT = Number.parseInt(process.env.PORT || "", 10) || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";

const DATA_DIR = path.join(__dirname, "data");
const CLUB_NEWS_FILE = path.join(DATA_DIR, "club-news.json");
const CLUB_BIRTHDAYS_FILE = path.join(DATA_DIR, "birthdays.json");

const SESSION_SECRET = process.env.SESSION_SECRET || (IS_PROD ? "" : "__dev-session-secret-change-in-env__");
const CLUB_ADMIN_PASSWORD = process.env.CLUB_ADMIN_PASSWORD || "";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const SMTP_USER = process.env.SMTP_USER || process.env.GMAIL_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "";
const SMTP_SERVICE = process.env.SMTP_SERVICE || "gmail";
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER || "";
const MAIL_TO = process.env.MAIL_TO || MAIL_FROM || "";

function createMailTransporter() {
  if (!SMTP_USER || !SMTP_PASS) {
    return null;
  }
  return nodemailer.createTransport({
    service: SMTP_SERVICE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

const mailTransporter = createMailTransporter();

/** SHA-256 fixed-length buffers for timing-safe password compare (does not weaken short passwords). */
function passwordDigest(plainText) {
  return crypto.createHash("sha256").update(String(plainText), "utf8").digest();
}

function passwordsEqual(inputPlain, storedPlain) {
  if (!storedPlain || String(storedPlain).length === 0) return false;
  try {
    const a = passwordDigest(inputPlain);
    const b = passwordDigest(storedPlain);
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function initClubDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CLUB_NEWS_FILE)) {
    fs.writeFileSync(CLUB_NEWS_FILE, JSON.stringify([], null, 2), "utf8");
  }
  if (!fs.existsSync(CLUB_BIRTHDAYS_FILE)) {
    fs.writeFileSync(CLUB_BIRTHDAYS_FILE, JSON.stringify([], null, 2), "utf8");
  }
}

function readClubNews() {
  try {
    const arr = JSON.parse(fs.readFileSync(CLUB_NEWS_FILE, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeClubNews(list) {
  fs.writeFileSync(CLUB_NEWS_FILE, JSON.stringify(list, null, 2), "utf8");
}

function readClubBirthdays() {
  try {
    const arr = JSON.parse(fs.readFileSync(CLUB_BIRTHDAYS_FILE, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeClubBirthdays(list) {
  fs.writeFileSync(CLUB_BIRTHDAYS_FILE, JSON.stringify(list, null, 2), "utf8");
}

function birthdayEntryValid(name, dateStr) {
  if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 120) {
    return false;
  }
  if (typeof dateStr !== "string" || dateStr.length < 8 || dateStr.length > 32) {
    return false;
  }
  const t = Date.parse(dateStr);
  return Number.isFinite(t);
}

/** YYYY-MM-DD for “today” in the server/JVM-local calendar (надійний розрахунок: TZ=Europe/Kyiv у systemd/Docker). */
function isoCalendarToday(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addCalendarDaysIso(isoDay, addDays) {
  const parts = isoDay.split("-").map(Number);
  const yy = parts[0];
  const mm = parts[1];
  const dd = parts[2];
  const x = new Date(yy, mm - 1, dd + addDays);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** Повернути календарний MM-DD цього року (29 лют для невисокостного року → останній день лютого). */
function normalizeAnniversaryThisYear(year, month, day) {
  const t = new Date(year, month - 1, day);
  if (t.getMonth() === month - 1) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const lastFeb = new Date(year, month, 0);
  return `${year}-${String(month).padStart(2, "0")}-${String(lastFeb.getDate()).padStart(2, "0")}`;
}

function nextBirthdayIsoFrom(birthIsoYmd, fromIsoDay) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthIsoYmd);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const fromYear = Number(fromIsoDay.slice(0, 4));
  let cand = normalizeAnniversaryThisYear(fromYear, month, day);
  if (cand < fromIsoDay) cand = normalizeAnniversaryThisYear(fromYear + 1, month, day);
  return cand;
}

/** Публічний сайт: лише збіг наступної дати святкування у вікні [сьогодні … +6 днів]. */
function filterBirthdaysPublicWindow(allEntries, now = new Date()) {
  const fromIso = isoCalendarToday(now);
  const allowed = new Set();
  for (let i = 0; i < 7; i += 1) {
    allowed.add(addCalendarDaysIso(fromIso, i));
  }

  const out = [];
  for (let i = 0; i < allEntries.length; i += 1) {
    const row = allEntries[i];
    if (!row || typeof row.date !== "string") continue;
    const next = nextBirthdayIsoFrom(row.date, fromIso);
    if (next && allowed.has(next)) out.push(row);
  }
  out.sort((a, b) => nextBirthdayIsoFrom(a.date, fromIso).localeCompare(nextBirthdayIsoFrom(b.date, fromIso)));
  return out;
}

if (IS_PROD && (!SESSION_SECRET || SESSION_SECRET.includes("__dev-session-secret"))) {
  console.error("❌ У production потрібен надійний SESSION_SECRET у .env");
  process.exit(1);
}

ensureSessionStoreDir();

/**
 * Файлове сховище сесій спільне для усіх воркерів процесу (PM2 cluster, кілька реплік на одній машині).
 * Інакше логін на одному воркері, POST на іншому → 401 «немає сесії».
 */
const adminSessionStore = new FileStoreSession({
  path: SESSION_STORE_DIR,
  ttl: 14 * 24 * 3600,
  retries: 0,
  logFn() {},
});

app.use(cors());
app.use(express.json({ limit: "128kb" }));
app.use(
  session({
    name: "luti.bo",
    secret: SESSION_SECRET || "__dev-session-secret-change-in-env__",
    store: adminSessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PROD,
    },
  })
);

/** Limit brute-force on login: per IP within a time window */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PROD ? 12 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res /* , _next, _options */) => {
    res.status(429).json({
      error: "Забагато спроб входу з цієї мережі. Спробуйте через ~15 хв.",
    });
  },
});

function requireBoSession(req, res, next) {
  if (req.session && req.session.bo === true) return next();
  res.status(401).json({ error: "Unauthorized" });
}

const REGISTRATIONS_FILE = path.join(__dirname, "registrations.json");

function initRegistrationsFile() {
  if (!fs.existsSync(REGISTRATIONS_FILE)) {
    fs.writeFileSync(REGISTRATIONS_FILE, JSON.stringify([], null, 2));
  }
}

function saveRegistration(name, telegram, phone, age, experience, message) {
  try {
    const registrations = JSON.parse(fs.readFileSync(REGISTRATIONS_FILE, "utf8"));
    registrations.push({
      name,
      telegram,
      phone,
      age,
      experience,
      message,
      timestamp: new Date().toLocaleString("uk-UA"),
    });
    fs.writeFileSync(REGISTRATIONS_FILE, JSON.stringify(registrations, null, 2));
    console.log("✅ Реєстрація збережена:", { name, telegram });
  } catch (error) {
    console.error("❌ Помилка збереження:", error);
  }
}

async function sendTelegramMessage(name, telegram, phone, age, experience, message) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("⚠️ Telegram не налаштовано: введіть TELEGRAM_TOKEN і TELEGRAM_CHAT_ID у .env");
    return;
  }

  const telegramMessage = `
📋 <b>Нова реєстрація!</b>

👤 <b>Ім'я:</b> ${name}
📱 <b>Телеграм:</b> ${telegram || "Не вказано"}
☎️ <b>Телефон:</b> ${phone || "Не вказано"}
🎂 <b>Вік:</b> ${age}
⚽ <b>Досвід:</b> ${experience || "Не вказано"}
💬 <b>Повідомлення:</b> ${message || "Немає"}

📅 <b>Дата:</b> ${new Date().toLocaleString("uk-UA")}
    `;

  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: telegramMessage,
      parse_mode: "HTML",
    });
    console.log("✅ Telegram повідомлення відправлено!");
  } catch (error) {
    const msg = error && error.message ? error.message : String(error);
    console.error("❌ Помилка Telegram:", msg);
  }
}

app.post("/send-registration-email", async (req, res) => {
  const { name, telegram, phone, age, experience, message } = req.body;

  console.log("📥 Нова реєстрація:", { name, telegram });

  saveRegistration(name, telegram, phone, age, experience, message);
  await sendTelegramMessage(name, telegram, phone, age, experience, message);

  if (!mailTransporter || !MAIL_FROM || !MAIL_TO) {
    console.warn("⚠️ Email не налаштовано: задайте SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_TO у .env");
    return res.json({ success: true, message: "Реєстрація збережена" });
  }

  const mailOptions = {
    from: MAIL_FROM,
    to: MAIL_TO,
    subject: "✅ Нова реєстрація - Волейбольний клуб Люті",
    html: `
      <div style="font-family: Arial, sans-serif;">
        <h2 style="color: #1f77d4;">📋 Нова реєстрація!</h2>
        <p><strong>Ім'я:</strong> ${name}</p>
        <p><strong>Телеграм:</strong> ${telegram || "Не вказано"}</p>
        <p><strong>Телефон:</strong> ${phone || "Не вказано"}</p>
        <p><strong>Вік:</strong> ${age}</p>
        <p><strong>Досвід:</strong> ${experience}</p>
        <p><strong>Повідомлення:</strong> ${message || "Немає"}</p>
        <p><strong>Дата:</strong> ${new Date().toLocaleString("uk-UA")}</p>
      </div>
    `,
  };

  try {
    await mailTransporter.sendMail(mailOptions);
    res.json({ success: true, message: "Спасибі за реєстрацію!" });
  } catch (error) {
    console.error("❌ Помилка Email:", error);
    res.json({ success: true, message: "Реєстрація збережена" });
  }
});

app.get("/api/join-data", (req, res) => {
  res.json({
    title: "Вступ",
    fields: [
      { name: "firstName", label: "Ім'я", type: "text", required: true },
      { name: "lastName", label: "Прізвище", type: "text", required: true },
      { name: "telegram", label: "Телеграм (@username)", type: "text", required: true },
      { name: "phone", label: "Телефон", type: "tel", required: true },
      { name: "age", label: "Вік", type: "number", required: true },
      { name: "experience", label: "Досвід гри", type: "text", required: false },
    ],
    submitUrl: "/send-registration-email",
  });
});

app.post("/api/join", (req, res) => {
  console.log("👤 Новий користувач:", req.body);
  const { name, telegram, phone, age, experience, message } = req.body;
  saveRegistration(name, telegram, phone, age, experience, message);
  res.json({ success: true, message: "Успішно!" });
});

app.get("/registrations", (req, res) => {
  try {
    const registrations = JSON.parse(fs.readFileSync(REGISTRATIONS_FILE, "utf8"));
    res.json({ total: registrations.length, registrations });
  } catch (error) {
    res.status(500).json({ error: "Помилка читання файлу" });
  }
});

app.get("/api/news", (_req, res) => {
  res.json({ news: readClubNews() });
});

app.get("/api/birthdays", (_req, res) => {
  res.json({ birthdays: filterBirthdaysPublicWindow(readClubBirthdays()) });
});

app.get("/api/bo/birthdays", requireBoSession, (_req, res) => {
  const list = readClubBirthdays();
  list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  res.json({ birthdays: list });
});

app.get("/api/bo/session", (req, res) => {
  const authenticated = Boolean(req.session && req.session.bo);
  res.json({ authenticated });
});

app.post("/api/bo/login", loginLimiter, (req, res) => {
  if (!CLUB_ADMIN_PASSWORD) {
    console.warn("⚠️ CLUB_ADMIN_PASSWORD не заданий — вхід у приховану адмін-панель вимкнено");
    return res.status(503).json({
      error: "Пароль адмін-панелі не налаштований на сервері (перевірте .env).",
    });
  }

  const { password } = req.body || {};
  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "Вкажіть пароль." });
  }

  if (!passwordsEqual(password, CLUB_ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "Невірний пароль." });
  }

  req.session.bo = true;
  req.session.save((err) => {
    if (err) {
      console.error("❌ session save:", err);
      return res.status(500).json({ error: "Не вдалося зберегти сесію." });
    }
    res.json({ ok: true });
  });
});

app.post("/api/bo/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("❌ session destroy:", err);
      return res.status(500).json({ error: "Не вдалося завершити сесію." });
    }
    res.clearCookie("luti.bo", { path: "/", httpOnly: true, sameSite: "lax", secure: IS_PROD });
    res.json({ ok: true });
  });
});

app.post("/api/bo/news", requireBoSession, (req, res) => {
  const { title, content } = req.body || {};
  if (typeof title !== "string" || title.trim().length < 1 || title.length > 200) {
    return res.status(400).json({ error: "Заголовок: 1–200 символів." });
  }
  if (typeof content !== "string" || content.trim().length < 1 || content.length > 10000) {
    return res.status(400).json({ error: "Текст: 1–10000 символів." });
  }
  const list = readClubNews();
  list.unshift({
    title: title.trim(),
    content: content.trim(),
    date: new Date().toLocaleString("uk-UA"),
  });
  writeClubNews(list);
  res.json({ ok: true });
});

app.post("/api/bo/birthdays", requireBoSession, (req, res) => {
  const { name, date } = req.body || {};
  if (!birthdayEntryValid(name, date)) {
    return res.status(400).json({ error: "Некоректні імʼя або дата." });
  }
  const list = readClubBirthdays();
  list.push({ name: name.trim(), date });
  list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  writeClubBirthdays(list);
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, "0.0.0.0", () => {
  initRegistrationsFile();
  initClubDataFiles();
  console.log(`\n🏐 Сервер запущено на http://localhost:${PORT}`);
  if (TRUST_PROXY_ENABLED) {
    console.log(`   Trust proxy: увімкнено (TRUST_PROXY)`);
  }
  console.log(`   Сесії адмін-панелі (файли): ${SESSION_STORE_DIR}`);
  console.log(`   Прихована адмін-панель: задайте CLUB_ADMIN_PASSWORD і SESSION_SECRET у .env`);
  if (!CLUB_ADMIN_PASSWORD) {
    console.log("⚠️ CLUB_ADMIN_PASSWORD порожній — редагування контенту з панелі недоступне");
  }
  if (TELEGRAM_TOKEN && TELEGRAM_CHAT_ID) {
    console.log("📱 Telegram бот: налаштовано");
  } else {
    console.log("📱 Telegram: не налаштовано (.env)");
  }
  if (mailTransporter && MAIL_FROM && MAIL_TO) {
    console.log("✉️ Email: налаштовано");
  } else {
    console.log("✉️ Email: не налаштовано (.env)");
  }
});
