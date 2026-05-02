const mongoose = require("mongoose");

/** Кеш з’єднання між cold start у serverless (Vercel тощо). */
const cache = typeof global !== "undefined" ? global : {};
const mongoCache = cache.__lutiMongo || {};
if (!cache.__lutiMongo) {
  cache.__lutiMongo = mongoCache;
}
mongoCache.promise ||= null;

/**
 * Підключення до MongoDB. Повторні виклики під час роботи процесу no-op після першого успіху.
 * @returns {Promise<typeof mongoose>}
 */
async function connectMongo(uri) {
  const u = uri || process.env.MONGODB_URI;
  if (!u || typeof u !== "string" || !u.trim()) {
    throw new Error("MONGODB_URI не заданий");
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (!mongoCache.promise) {
    mongoCache.promise = mongoose.connect(u.trim(), {
      maxPoolSize: 10,
    });
  }
  await mongoCache.promise;
  return mongoose;
}

module.exports = { connectMongo };
