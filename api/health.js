// api/health.js
const express = require('express');
const { kv } = require('@vercel/kv');
const sheets = require('../src/services/sheets');

const app = express();

app.get('/api/health', async (req, res) => {
  const checks = {};
  let degraded = false;

  // KV check
  try {
    await kv.ping();
    checks.kv = 'ok';
  } catch {
    checks.kv = 'error';
    degraded = true;
  }

  // Sheets check (fetch a small known tab)
  try {
    await sheets.fetchSheet('volunteers');
    checks.sheets = 'ok';
  } catch {
    checks.sheets = 'error';
    degraded = true;
  }

  // Twilio env vars check (no live call — just verify credentials are configured)
  const hasAccountSid = !!process.env.TWILIO_ACCOUNT_SID;
  const hasAuthToken = !!process.env.TWILIO_AUTH_TOKEN;
  if (hasAccountSid && hasAuthToken) {
    checks.twilio_env = 'ok';
  } else {
    checks.twilio_env = 'error';
    degraded = true;
  }

  const status = degraded ? 'degraded' : 'ok';
  return res.status(degraded ? 503 : 200).json({
    status,
    checks,
    timestamp: new Date().toISOString(),
  });
});

module.exports = app;
