// src/utils/logger.js
// Minimal structured logger — wraps console.* with level + timestamp.
// Replace with pino/winston if volume grows.

function log(level, msg, meta = {}) {
  const entry = { level, ts: new Date().toISOString(), msg, ...meta };
  // In production Vercel captures stdout as structured logs
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

module.exports = {
  info:  (msg, meta) => log('info',  msg, meta),
  warn:  (msg, meta) => log('warn',  msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};
