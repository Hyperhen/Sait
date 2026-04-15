const express = require("express");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
const cors = require("cors");

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Файл для збереження всіх реєстрацій
const REGISTRATIONS_FILE = path.join(__dirname, 'registrations.json');

// Ініціалізація файлу реєстрацій
function initRegistrationsFile() {
  if (!fs.existsSync(REGISTRATIONS_FILE)) {
    fs.writeFileSync(REGISTRATIONS_FILE, JSON.stringify([], null, 2));
  }
}

// Функція для збереження реєстрацій у файл
function saveRegistration(name, email, phone, age, experience, message) {
  try {
    const registrations = JSON.parse(fs.readFileSync(REGISTRATIONS_FILE, 'utf8'));
    registrations.push({
      name,
      email,
      phone,
      age,
      experience,
      message,
      timestamp: new Date().toLocaleString('uk-UA')
    });
    fs.writeFileSync(REGISTRATIONS_FILE, JSON.stringify(registrations, null, 2));
    console.log('Реєстрація збережена у файл:', { name, email, phone, age, experience });
  } catch (error) {
    console.error('Помилка збереження реєстрації:', error);
  }
}

// Налаштування nodemailer (потрібно налаштувати ваші облікові дані Gmail)
// Для Gmail потрібно:
// 1. Увімкнути двофакторну аутентифікацію
// 2. Створити app password: https://support.google.com/accounts/answer/185833
// 3. Використати app password замість звичайного пароля
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'volleyclubluti@gmail.com', // Ваша Gmail адреса
    pass: 'fjbmowfzfptqjdgn' // App password від Gmail (замініть на ваш)
  }
});

// Endpoint для відправки email про реєстрацію
app.post('/send-registration-email', async (req, res) => {
  const { name, email, phone, age, experience, message } = req.body;
  
  console.log('Отримано запит на реєстрацію:', { name, email, phone, age, experience });

  // Збережемо дані у файл
  saveRegistration(name, email, phone, age, experience, message);

  // Відправимо email
  const mailOptions = {
    from: 'volleyclubluti@gmail.com',
    to: 'volleyclubluti@gmail.com',
    subject: '✅ Нова реєстрація на сайті Волейбольний клуб Люті',
    html: `
      <div style="font-family: Arial, sans-serif; direction: ltr;">
        <h2 style="color: #1f77d4;">📋 Нова реєстрація!</h2>
        <p><strong>Ім'я:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Телефон:</strong> ${phone || 'Не вказано'}</p>
        <p><strong>Вік:</strong> ${age}</p>
        <p><strong>Досвід:</strong> ${experience}</p>
        <p><strong>Повідомлення:</strong> ${message || 'Немає'}</p>
        <p><strong>Дата реєстрації:</strong> ${new Date().toLocaleString('uk-UA')}</p>
        <hr/>
        <p style="font-size: 12px; color: #666;">Автоматичне повідомлення з сайту волейбольного клубу "Люті"</p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email відправлено успішно:', info.messageId);
    res.json({ 
      success: true, 
      message: 'Спасибі за реєстрацію! Дані збережені.' 
    });
  } catch (error) {
    console.error('Помилка відправки email:', error);
    // Навіть якщо email не відправився, дані вже збережені у файлі
    res.json({ 
      success: true, 
      message: 'Реєстрація збережена (email могла не відправитися, але дані в безпеці)'
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  // Ініціалізуємо файл реєстрацій при старті сервера
  initRegistrationsFile();
  
  console.log(`\n🏐 Сервер запущено на http://localhost:${PORT}`);
  console.log(`📧 Всі реєстрації збережуються у файл: ${REGISTRATIONS_FILE}`);
  console.log(`📋 Дані в лайві також відправляються на email: volleyclubluti@gmail.com`);
  console.log('\n📨 Для тестування email перейдіть до http://localhost:3000/test-email\n');
});

// Тестовий endpoint для перевірки email
app.get('/test-email', async (req, res) => {
  try {
    const info = await transporter.sendMail({
      from: 'volleyclubluti@gmail.com',
      to: 'volleyclubluti@gmail.com',
      subject: 'Тестовий email від сайту',
      html: '<h2>Тестовий email працює!</h2><p>Якщо ви отримали цей email, значить налаштування правильні.</p>'
    });
    res.send('<h1>✅ Email відправлено успішно!</h1><p>Перевірте вашу пошту volleyclubluti@gmail.com</p><p>Message ID: ' + info.messageId + '</p>');
  } catch (error) {
    res.send('<h1>❌ Помилка відправки email:</h1><pre>' + error.message + '</pre><p>Перевірте налаштування app password у server.js</p>');
  }
});

// Endpoint для перегляду всіх реєстрацій
app.get('/registrations', (req, res) => {
  try {
    const registrations = JSON.parse(fs.readFileSync(REGISTRATIONS_FILE, 'utf8'));
    res.json({
      total: registrations.length,
      registrations: registrations
    });
  } catch (error) {
    res.status(500).json({ error: 'Помилка читання файлу реєстрацій' });
  }
});
