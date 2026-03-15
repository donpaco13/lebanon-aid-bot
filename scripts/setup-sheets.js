#!/usr/bin/env node
// scripts/setup-sheets.js
// Creates all required Google Sheets tabs with correct headers.
// Run once after creating the Google Spreadsheet.
//
// Usage:
//   GOOGLE_SHEETS_ID=xxx GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx GOOGLE_PRIVATE_KEY='xxx' node scripts/setup-sheets.js

'use strict';

const { google } = require('googleapis');

const SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

if (!SHEETS_ID || !SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
  console.error('Missing required env vars: GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY');
  process.exit(1);
}

// Tab definitions: name -> headers in order
const TABS = {
  shelters: [
    'id', 'name_ar', 'zone', 'zone_normalized', 'address_ar',
    'lat', 'lng', 'capacity', 'available_spots', 'status',
    'verified_at', 'source', 'auto_scraped', 'needs_review', 'scraped_source',
  ],
  evacuations: [
    'id', 'zone', 'zone_normalized', 'status', 'direction_ar',
    'source', 'issued_at', 'expires_at', 'verified_at',
    'auto_scraped', 'needs_review', 'scraped_source',
  ],
  medical: [
    'id', 'name_ar', 'zone', 'zone_normalized', 'address_ar',
    'lat', 'lng', 'type', 'status', 'last_verified_at',
    'disclaimer', 'auto_scraped', 'needs_review', 'scraped_source',
  ],
  aid_requests: [
    'id', 'ticket_number', 'name', 'phone', 'phone_full',
    'zone', 'need_type', 'details', 'status',
    'created_at', 'assigned_to', 'notified_at',
  ],
  volunteers: [
    'id', 'name', 'phone', 'org', 'zone',
    'on_duty', 'shift_start', 'shift_end', 'language',
  ],
  registration_info: [
    'step', 'text_ar', 'link', 'documents_ar',
  ],
};

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: SERVICE_ACCOUNT_EMAIL, private_key: PRIVATE_KEY },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Fetch current spreadsheet metadata
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEETS_ID });
  const existingTabs = new Map(
    meta.data.sheets.map(s => [s.properties.title, s.properties.sheetId])
  );

  console.log('Existing tabs:', [...existingTabs.keys()].join(', ') || '(none)');

  const requests = [];

  for (const [tabName, headers] of Object.entries(TABS)) {
    if (!existingTabs.has(tabName)) {
      // Create new tab
      requests.push({
        addSheet: {
          properties: { title: tabName },
        },
      });
      console.log(`  + Will create tab: ${tabName}`);
    } else {
      console.log(`  ✓ Tab exists: ${tabName}`);
    }
  }

  // Create missing tabs
  if (requests.length > 0) {
    const batchRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEETS_ID,
      requestBody: { requests },
    });
    console.log(`\nCreated ${requests.length} tab(s).`);

    // Re-fetch metadata to get new sheet IDs
    const updatedMeta = await sheets.spreadsheets.get({ spreadsheetId: SHEETS_ID });
    for (const s of updatedMeta.data.sheets) {
      existingTabs.set(s.properties.title, s.properties.sheetId);
    }
  }

  // Write headers to every tab
  console.log('\nWriting headers...');
  for (const [tabName, headers] of Object.entries(TABS)) {
    // Check if header row already exists
    const current = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: `${tabName}!1:1`,
    });

    const existingHeaders = current.data.values?.[0] || [];
    const headersMatch =
      existingHeaders.length === headers.length &&
      headers.every((h, i) => h === existingHeaders[i]);

    if (headersMatch) {
      console.log(`  ✓ Headers OK: ${tabName}`);
      continue;
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
    console.log(`  + Headers written: ${tabName} (${headers.length} columns)`);
  }

  // Freeze header row and bold it for all tabs
  console.log('\nFormatting header rows...');
  const formatRequests = [];
  for (const [tabName] of Object.entries(TABS)) {
    const sheetId = existingTabs.get(tabName);
    if (sheetId === undefined) continue;

    formatRequests.push(
      // Freeze row 1
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: { frozenRowCount: 1 },
          },
          fields: 'gridProperties.frozenRowCount',
        },
      },
      // Bold header row
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: 'userEnteredFormat.textFormat.bold',
        },
      }
    );
  }

  if (formatRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEETS_ID,
      requestBody: { requests: formatRequests },
    });
    console.log('  ✓ Headers frozen and bolded.');
  }

  console.log('\nSetup complete. Google Sheet is ready.');
  console.log(`Sheet URL: https://docs.google.com/spreadsheets/d/${SHEETS_ID}`);
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
