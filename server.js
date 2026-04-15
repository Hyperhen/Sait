const express = require("express");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = 3000;

// 🤖 Telegram конфіг
const TELEGRAM_TOKEN = "8684951773:AAEmE0sVMDY6vgwUU29vmwZn1KOGwhL8aM8";
const TELEGRAM_CHAT_ID = "8042196846";

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Файл для збереження реєстрацій
const REGISTRATIONS_FILE = path.join(__dirname, 'registrations.json');

function initRegistrationsFile() {
  if (!fs.existsSync(REGISTRATIONS_FILE)) {
    fs.writeFileSync(REGISTRATIONS_FILE, JSON.stringify([], null, 2));
  }
}

function saveRegistration(name, telegram, phone, age, experience, message) {
  try {
    const registrations = JSON.parse(fs.readFileSync(REGISTRATIONS_FILE, 'utf8'));
    registrations.push({
      name,
      telegram,
      phone,
      age,
      experience,
      message,
      timestamp: new Date().toLocaleString('uk-UA')
    });
    fs.writeFileSync(REGISTRATIONS_FILE, JSON.stringify(registrations, null, 2));
    console.log('✅ Реєстрація збережена:', { name, telegram });
  } catch (error) {
    console.error('❌ Помилка збереження:', error);
  }
}

// 📱 Функція для Telegram
async function sendTelegramMessage(name, telegram, phone, age, experience, message) {
  try {
    const telegramMessage = `
📋 <b>Нова реєстрація!</b>

👤 <b>Ім'я:</b> ${name}
📱 <b>Телеграм:</b> ${telegram || 'Не вказано'}
☎️ <b>Телефон:</b> ${phone || 'Не вказано'}
🎂 <b>Вік:</b> ${age}
⚽ <b>Досвід:</b> ${experience || 'Не вказано'}
💬 <b>Повідомлення:</b> ${message || 'Немає'}

📅 <b>Дата:</b> ${new Date().toLocaleString('uk-UA')}
    `;

    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: telegramMessage,
        parse_mode: 'HTML'
      }
    );

    console.log('✅ Telegram повідомлення відправлено!');
  } catch (error) {
    console.error('❌ Помилка Telegram:', error.message);
  }
}

// Email налаштування
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'volleyclubluti@gmail.com',
    pass: 'fjbmowfzfptqjdgn'
  }
});

// Endpoint для реєстрації
app.post('/send-registration-email', async (req, res) => {
  const { name, telegram, phone, age, experience, message } = req.body;
  
  console.log('📥 Нова реєстрація:', { name, telegram });

  saveRegistration(name, telegram, phone, age, experience, message);
  await sendTelegramMessage(name, telegram, phone, age, experience, message);

  const mailOptions = {
    from: 'volleyclubluti@gmail.com',
    to: 'volleyclubluti@gmail.com',
    subject: '✅ Нова реєстрація - Волейбольний клуб Люті',
    html: `
      <div style="font-family: Arial, sans-serif;">
        <h2 style="color: #1f77d4;">📋 Нова реєстрація!</h2>
        <p><strong>Ім'я:</strong> ${name}</p>
        <p><strong>Телеграм:</strong> ${telegram || 'Не вказано'}</p>
        <p><strong>Телефон:</strong> ${phone || 'Не вказано'}</p>
        <p><strong>Вік:</strong> ${age}</p>
        <p><strong>Досвід:</strong> ${experience}</p>
        <p><strong>Повідомлення:</strong> ${message || 'Немає'}</p>
        <p><strong>Дата:</strong> ${new Date().toLocaleString('uk-UA')}</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Спасибі за реєстрацію!' });
  } catch (error) {
    console.error('❌ Помилка Email:', error);
    res.json({ success: true, message: 'Реєстрація збережена' });
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
      { name: "experience", label: "Досвід гри", type: "text", required: false }
    ],
    submitUrl: "/send-registration-email"
  });
});

app.post("/api/join", (req, res) => {
  console.log("👤 Новий користувач:", req.body);
  const { name, telegram, phone, age, experience, message } = req.body;
  saveRegistration(name, telegram, phone, age, experience, message);
  res.json({ success: true, message: "Успішно!" });
});

app.listen(PORT, "0.0.0.0", () => {
  initRegistrationsFile();
  console.log(`\n🏐 Сервер запущено на http://localhost:${PORT}`);
  console.log(`📱 Telegram бот активний!`);
});

app.get('/registrations', (req, res) => {
  try {
    const registrations = JSON.parse(fs.readFileSync(REGISTRATIONS_FILE, 'utf8'));
    res.json({ total: registrations.length, registrations });
  } catch (error) {
    res.status(500).json({ error: 'Помилка читання файлу' });
  }
});
