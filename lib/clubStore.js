const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const mongoose = require("mongoose");
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

const MONGO_ID_HEX_RE = /^[a-f\d]{24}$/i;
/** Файловий режим зберігає `crypto.randomUUID()` — стандартний UUID. */
const FILE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Рядковий BSON ObjectId або UUID v4 (файловий режим). */
function parseEntityId(raw) {
  if (!raw || typeof raw !== "string") return "";
  try {
    return decodeURIComponent(raw.trim());
  } catch {
    return raw.trim();
  }
}

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

/** Додає `id`, щоб працював DELETE без Mongo. Перезаписує файл лише коли є зміни. */
function normalizeNewsFs() {
  let list = readClubNewsFs();
  let changed = false;
  list = list
    .filter((row) => row && typeof row.title === "string" && typeof row.content === "string" && typeof row.date === "string")
    .map((row) => {
      if (!row.id) changed = true;
      return {
        ...row,
        id: row.id || crypto.randomUUID(),
      };
    });
  if (changed) writeClubNewsFs(list);
  return list;
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

function normalizeBirthdaysFs() {
  let list = readBirthdaysFs();
  let changed = false;
  list = list
    .filter((row) => row && typeof row.name === "string" && typeof row.date === "string")
    .map((row) => {
      if (!row.id) changed = true;
      return {
        ...row,
        id: row.id || crypto.randomUUID(),
      };
    });
  if (changed) writeBirthdaysFs(list);
  return list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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

/* ----- Mongo / файли: операції ----- */

/** Новіші першись: у Mongo `_id:-1`; у файлі порядок після prepend (unshift на початок масиву). */
async function getClubNewsWithIds() {
  if (useMongo()) {
    await mongoReady();
    const docs = await ClubNews.find().sort({ _id: -1 }).lean();
    return docs.map((d) => ({
      id: String(d._id),
      title: d.title,
      content: d.content,
      date: d.date,
    }));
  }
  return normalizeNewsFs();
}

async function getClubNewsPublic() {
  const rows = await getClubNewsWithIds();
  return rows.map(({ title, content, date }) => ({ title, content, date }));
}

async function prependClubNews(item) {
  if (useMongo()) {
    await mongoReady();
    await ClubNews.create(item);
    return;
  }
  const list = normalizeNewsFs();
  list.unshift({
    id: crypto.randomUUID(),
    title: item.title,
    content: item.content,
    date: item.date,
  });
  writeClubNewsFs(list);
}

async function deleteClubNewsById(rawId) {
  const id = parseEntityId(rawId);
  if (!id) return { ok: false, reason: "bad_id" };

  if (useMongo()) {
    if (!MONGO_ID_HEX_RE.test(id)) return { ok: false, reason: "bad_id" };
    await mongoReady();
    const r = await ClubNews.deleteOne({ _id: id });
    if (r.deletedCount !== 1) return { ok: false, reason: "not_found" };
    return { ok: true };
  }

  if (!FILE_UUID_RE.test(id)) return { ok: false, reason: "bad_id" };

  const list = normalizeNewsFs();
  const next = list.filter((row) => row.id !== id);
  if (next.length === list.length) return { ok: false, reason: "not_found" };
  writeClubNewsFs(next);
  return { ok: true };
}

async function getBirthdaysWithIdsSorted() {
  if (useMongo()) {
    await mongoReady();
    const docs = await ClubBirthday.find().sort({ date: 1 }).lean();
    return docs.map((d) => ({
      id: String(d._id),
      name: d.name,
      date: d.date,
    }));
  }
  return normalizeBirthdaysFs();
}

async function appendClubBirthday(record) {
  if (useMongo()) {
    await mongoReady();
    await ClubBirthday.create(record);
    return;
  }
  const list = normalizeBirthdaysFs();
  list.push({
    id: crypto.randomUUID(),
    name: record.name,
    date: record.date,
  });
  list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  writeBirthdaysFs(list);
}

async function deleteClubBirthdayById(rawId) {
  const id = parseEntityId(rawId);
  if (!id) return { ok: false, reason: "bad_id" };

  if (useMongo()) {
    if (!MONGO_ID_HEX_RE.test(id)) return { ok: false, reason: "bad_id" };
    await mongoReady();
    const r = await ClubBirthday.deleteOne({ _id: id });
    if (r.deletedCount !== 1) return { ok: false, reason: "not_found" };
    return { ok: true };
  }

  if (!FILE_UUID_RE.test(id)) return { ok: false, reason: "bad_id" };

  const list = normalizeBirthdaysFs();
  const next = list.filter((row) => row.id !== id);
  if (next.length === list.length) return { ok: false, reason: "not_found" };
  writeBirthdaysFs(next);
  return { ok: true };
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
  parseEntityId,
  getClubNewsPublic,
  getClubNewsWithIds,
  prependClubNews,
  deleteClubNewsById,
  getBirthdaysWithIdsSorted,
  appendClubBirthday,
  deleteClubBirthdayById,
  saveRegistrationRow,
  listRegistrations,
  DATA_DIR,
  REGISTRATIONS_PATH,
  CLUB_NEWS_FILE,
  CLUB_BIRTHDAYS_FILE,
};
