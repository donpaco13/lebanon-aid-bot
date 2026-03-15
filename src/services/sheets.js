// src/services/sheets.js
const { google } = require('googleapis');
const { withRetry } = require('../utils/retry');

let sheetsClient = null;

function getClient() {
  if (sheetsClient) return sheetsClient;
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

async function fetchSheet(tabName) {
  return withRetry(async () => {
    const client = getClient();
    const res = await client.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: `${tabName}!A:Z`,
    });
    const rows = res.data.values;
    if (!rows || rows.length < 2) return [];

    const headers = rows[0];
    const needsReviewIndex = headers.indexOf('needs_review');

    return rows.slice(1)
      .filter(row => {
        if (needsReviewIndex === -1) return true;
        const val = (row[needsReviewIndex] || '').toUpperCase();
        return val !== 'TRUE';
      })
      .map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      });
  });
}

async function appendRow(tabName, data) {
  return withRetry(async () => {
    const client = getClient();
    const headerRes = await client.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: `${tabName}!1:1`,
    });
    const headers = headerRes.data.values?.[0] || [];
    const row = headers.map(h => data[h] || '');

    await client.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: `${tabName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
  });
}

module.exports = { fetchSheet, appendRow };
