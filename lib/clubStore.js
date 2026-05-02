const path = require("path");
const fs = require("fs");
const { connectMongo } = require("./mongo");
const ClubNews = require("../models/ClubNews");
const ClubBirthday = require("../models/ClubBirthday");
const Registration = require("../models/Registration");

const DATA_DIR = path.resolve(
  typeof process.env.DATA_DIR === "string" && process.env.DATA_DIR.trim() !== ""
    ? process.env.DATA_DIR.trim()
    : path.join(__dirname, "..", "data")
);
const REGISTRATIONS_PATH = path.resolve(
  typeof process.env.REGISTRATIONS_FILE === "string" && process.env.REGISTRATIONS_FILE.trim() !== ""
    ? process.env.REGISTRATIONS_FILE.trim()
    : path.join(__dirname, "..", "registrations.json")
);

const CLUB_NEWS_FILE = path.join(DATA_DIR, "club-news.json");
const CLUB_BIRTHDAYS_FILE = path.join(DATA_DIR, "birthdays.json");

function useMongo() {
  const u = process.env.MONGODB_URI;
  return Boolean(u && String(u).trim());
}

async function mongoReady() {
  await connectMongo();
}

/* ----- Файловий режим ----- */

function readClubNewsFs() {
  try {
    const arr = JSON.parse(fs.readFileSync(CLUB_NEWS_FILE, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeClubNewsFs(list) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(CLUB_NEWS_FILE, JSON.stringify(list, null, 2), "utf8");
}

function readBirthdaysFs() {
  try {
    const arr = JSON.parse(fs.readFileSync(CLUB_BIRTHDAYS_FILE, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeBirthdaysFs(list) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(CLUB_BIRTHDAYS_FILE, JSON.stringify(list, null, 2), "utf8");
}

function appendRegistrationFs(row) {
  if (!fs.existsSync(path.dirname(REGISTRATIONS_PATH))) {
    fs.mkdirSync(path.dirname(REGISTRATIONS_PATH), { recursive: true });
  }
  let list = [];
  try {
    if (fs.existsSync(REGISTRATIONS_PATH)) {
      list = JSON.parse(fs.readFileSync(REGISTRATIONS_PATH, "utf8"));
    }
    if (!Array.isArray(list)) list = [];
  } catch {
    list = [];
  }
  list.push(row);
  fs.writeFileSync(REGISTRATIONS_PATH, JSON.stringify(list, null, 2), "utf8");
}

function listRegistrationsFs() {
  try {
    if (!fs.existsSync(REGISTRATIONS_PATH)) return [];
    const raw = fs.readFileSync(REGISTRATIONS_PATH, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/* ----- Mongo ----- */

async function getClubNews() {
  if (useMongo()) {
    await mongoReady();
    const docs = await ClubNews.find().sort({ _id: -1 }).lean();
    return docs.map((d) => ({ title: d.title, content: d.content, date: d.date }));
  }
  return readClubNewsFs();
}

async function prependClubNews(item) {
  if (useMongo()) {
    await mongoReady();
    await ClubNews.create(item);
    return;
  }
  const list = readClubNewsFs();
  list.unshift(item);
  writeClubNewsFs(list);
}

async function getBirthdaysSorted() {
  if (useMongo()) {
    await mongoReady();
    const docs = await ClubBirthday.find().sort({ date: 1 }).lean();
    return docs.map((d) => ({ name: d.name, date: d.date }));
  }
  const list = readBirthdaysFs();
  return [...list].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

async function appendClubBirthday(record) {
  if (useMongo()) {
    await mongoReady();
    await ClubBirthday.create(record);
    return;
  }
  const list = readBirthdaysFs();
  list.push(record);
  list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  writeBirthdaysFs(list);
}

async function saveRegistrationRow(row) {
  if (useMongo()) {
    await mongoReady();
    await Registration.create(row);
    return;
  }
  appendRegistrationFs(row);
}

async function listRegistrations() {
  if (useMongo()) {
    await mongoReady();
    const docs = await Registration.find().sort({ _id: -1 }).lean();
    return docs.map((d) => ({
      name: d.name,
      telegram: d.telegram,
      phone: d.phone,
      age: d.age,
      experience: d.experience,
      message: d.message,
      timestamp: d.timestamp,
    }));
  }
  return listRegistrationsFs();
}

module.exports = {
  useMongo,
  getClubNews,
  prependClubNews,
  getBirthdaysSorted,
  appendClubBirthday,
  saveRegistrationRow,
  listRegistrations,
  DATA_DIR,
  REGISTRATIONS_PATH,
  CLUB_NEWS_FILE,
  CLUB_BIRTHDAYS_FILE,
};
