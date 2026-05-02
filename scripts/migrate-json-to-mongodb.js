#!/usr/bin/env node
/**
 * Одноразовий імпорт існуючих JSON у MongoDB.
 *
 * Перед першим запуском: MONGODB_URI у .env
 *
 * npm run migrate:mongo [-- --force]
 *   --force  імпортувати навіть якщо в колекції вже є документи
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { connectMongo } = require("../lib/mongo");
const ClubNews = require("../models/ClubNews");
const ClubBirthday = require("../models/ClubBirthday");
const Registration = require("../models/Registration");

const root = path.join(__dirname, "..");
const FORCE = process.argv.includes("--force");

const defaultNews = path.join(root, "data", "club-news.json");
const defaultBirthdays = path.join(root, "data", "birthdays.json");
const defaultRegs = path.join(root, "registrations.json");

function readJsonArray(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ Файлу немає, пропуск: ${label} (${filePath})`);
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error(`❌ Не прочитати ${filePath}:`, e.message);
    return [];
  }
}

async function importIfEmpty(Model, docs, label) {
  const n = await Model.estimatedDocumentCount();
  if (n > 0 && !FORCE) {
    console.log(`↪️ ${label}: у базі вже є ${n} записів — пропуск (додайте --force для повторного імпорту)`);
    return 0;
  }
  if (docs.length === 0) {
    console.log(`— ${label}: даних немає`);
    return 0;
  }
  await Model.insertMany(docs);
  console.log(`✅ ${label}: імпортовано ${docs.length}`);
  return docs.length;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri || !String(uri).trim()) {
    console.error("❌ Задайте MONGODB_URI у .env");
    process.exit(1);
  }

  await connectMongo(uri);

  const newsRaw = readJsonArray(defaultNews, "Новини");
  const birthdaysRaw = readJsonArray(defaultBirthdays, "Дні народження");
  const regsRaw = readJsonArray(defaultRegs, "Реєстрації");

  const newsDocs = newsRaw
    .filter((x) => x && typeof x.title === "string" && typeof x.content === "string" && typeof x.date === "string")
    .map((x) => ({ title: x.title, content: x.content, date: x.date }));

  const birthDocs = birthdaysRaw
    .filter((x) => x && typeof x.name === "string" && typeof x.date === "string")
    .map((x) => ({ name: x.name.trim(), date: x.date.trim() }));

  const regDocs = regsRaw
    .filter((x) => x && typeof x.name === "string")
    .map((x) => ({
      name: x.name,
      telegram: x.telegram || "",
      phone: x.phone || "",
      age: x.age,
      experience: x.experience || "",
      message: x.message || "",
      timestamp: typeof x.timestamp === "string" ? x.timestamp : new Date().toLocaleString("uk-UA"),
    }));

  await importIfEmpty(ClubNews, newsDocs, "ClubNews");
  await importIfEmpty(ClubBirthday, birthDocs, "ClubBirthday");
  await importIfEmpty(Registration, regDocs, "Registration");

  await mongoose.disconnect();
  console.log("Готово.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
